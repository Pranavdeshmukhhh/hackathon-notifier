"""Offline delivery regressions. Every Telegram request is a test double."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock
from types import SimpleNamespace
from urllib.parse import urlsplit
import os
import uuid

import mongomock
import pytest
import requests
from notifier import telegram_bot as bot
from db import mongo_client

NOW = datetime(2026, 11, 2, tzinfo=timezone.utc)


@pytest.fixture(params=['mock', 'mongo'])
def db(monkeypatch, request):
    if request.param == 'mongo':
        uri = os.getenv('PHASE4_TEST_MONGO')
        if not uri:
            pytest.skip('Disposable loopback Mongo replica set not selected')
        assert urlsplit(uri).hostname == '127.0.0.1' and urlsplit(uri).port == 27028
        from pymongo import MongoClient
        client = MongoClient(uri, tz_aware=True, serverSelectionTimeoutMS=3000)
    else:
        client = mongomock.MongoClient(tz_aware=True)
    db = client['benchmark_phase5_' + uuid.uuid4().hex]
    monkeypatch.setattr(mongo_client, 'get_collection', lambda name='hackathons': db[name])
    monkeypatch.setattr(mongo_client, 'get_subscribers_collection', lambda: db.subscribers)
    monkeypatch.setattr(bot, 'TELEGRAM_BOT_TOKEN', 'test-token')
    monkeypatch.setattr(bot, 'TELEGRAM_CHAT_ID', '')
    monkeypatch.setattr(bot.time, 'sleep', lambda _: None)
    yield db
    client.drop_database(db.name)
    client.close()


def event(db):
    row = {'title': 'Synthetic outbox fixture', 'link': 'https://example.com/outbox',
           'source': 'Fixture', 'publication_state': 'published', 'notified': False,
           'is_top_college': True, 'registration_deadline': {'date': '2099-01-01'}}
    row['_id'] = db.hackathons.insert_one(row).inserted_id
    return row


def response(code=200, **body):
    return Mock(status_code=code, json=Mock(return_value=body or {'ok': True}))


def test_partial_delivery_does_not_resend_successful_recipient(db, monkeypatch):
    h = event(db)
    for cid in ['first', 'second']:
        db.subscribers.insert_one({'chat_id': cid, 'is_active': True, 'preference': 'all'})
    session = Mock()
    session.post.side_effect = [response(), requests.Timeout(), response(), response()]
    monkeypatch.setattr(bot.requests, 'Session', Mock(return_value=Mock(
        __enter__=Mock(return_value=session), __exit__=Mock(return_value=False))))
    assert bot.send_batch([h])['fully_sent_links'] == []
    db.notification_outbox.update_many({'state': 'retryable'}, {'$set': {'next_attempt_at': NOW}})
    assert bot.send_batch([h])['fully_sent_links'] == [h['link']]
    assert session.post.call_count == 3
    recipients = [c.kwargs['json']['chat_id'] for c in session.post.call_args_list]
    assert recipients[0] != recipients[1] and recipients[1] == recipients[2]


@pytest.fixture
def queue(db):
    from notifier.outbox import Outbox
    clock = [NOW]
    queue = Outbox(db, clock=lambda: clock[0], lease_seconds=30, max_attempts=3)
    queue.test_clock = clock
    for cid in ['first', 'second']:
        db.subscribers.insert_one({'chat_id': cid, 'is_active': True, 'preference': 'all'})
    return queue


def ok():
    from notifier.outbox import DeliveryResult
    return DeliveryResult(delivered=True, message_id=123)


def retry(code='timeout', after=None):
    from notifier.outbox import DeliveryResult
    return DeliveryResult(retryable=True, code=code, retry_after=after)


def test_duplicate_enqueue_and_concurrent_workers(db, queue):
    h = event(db)
    with ThreadPoolExecutor(max_workers=8) as pool:
        ids = list(pool.map(lambda _: queue.enqueue(h, ['first', 'second']), range(12)))
    assert len(set(ids)) == 1
    assert db.notification_intents.count_documents({}) == 1
    assert db.notification_outbox.count_documents({}) == 2
    with ThreadPoolExecutor(max_workers=8) as pool:
        jobs = [job for job in pool.map(lambda _: queue.claim(), range(12)) if job]
    assert len(jobs) == 2 and len({j['_id'] for j in jobs}) == 2
    assert all(queue.finish(job, ok()) for job in jobs)
    queue.reconcile()
    assert db.hackathons.find_one()['notified'] is True


def test_crash_before_send_restart_and_stale_ack(db, queue):
    from notifier.outbox import Outbox
    queue.enqueue(event(db), ['first'])
    abandoned = queue.claim()
    assert queue.claim() is None
    queue.test_clock[0] += timedelta(seconds=31)
    restarted = Outbox(db, clock=lambda: queue.test_clock[0], lease_seconds=30, max_attempts=3)
    recovered = restarted.claim()
    assert recovered['attempts'] == 2
    assert not queue.finish(abandoned, ok())
    assert restarted.finish(recovered, ok())
    restarted.reconcile()
    assert db.hackathons.find_one()['notified'] is True


def test_crash_after_send_has_documented_at_least_once_duplicate(db, queue):
    queue.enqueue(event(db), ['first'])
    external_send = Mock(return_value=ok())
    abandoned = queue.claim()
    external_send(abandoned)  # External acknowledgment received; DB acknowledgment lost.
    assert db.notification_outbox.find_one()['state'] == 'processing'
    assert not db.hackathons.find_one()['notified']
    queue.test_clock[0] += timedelta(seconds=31)
    recovered = queue.claim()
    assert queue.finish(recovered, external_send(recovered))
    queue.reconcile()
    assert external_send.call_count == 2
    assert db.notification_outbox.count_documents({}) == 1


def test_backoff_and_maximum_attempts(db, queue):
    queue.enqueue(event(db), ['first'])
    for delay in [2, 4, None]:
        job = queue.claim()
        assert queue.finish(job, retry())
        row = db.notification_outbox.find_one()
        assert row['state'] == ('retryable' if delay else 'failed')
        assert queue.claim() is None
        if delay:
            assert row['next_attempt_at'] == queue.test_clock[0] + timedelta(seconds=delay)
            queue.test_clock[0] += timedelta(seconds=delay)
    assert not db.hackathons.find_one()['notified']


def test_crashes_exhaust_budget_without_fake_delivery(db, queue):
    queue.enqueue(event(db), ['first'])
    for _ in range(3):
        assert queue.claim()
        queue.test_clock[0] += timedelta(seconds=31)
    assert queue.claim() is None
    assert db.notification_outbox.find_one()['state'] == 'failed'
    assert not db.hackathons.find_one()['notified']


def test_429_persists_channel_cooldown_across_restart(db, queue):
    from notifier.outbox import Outbox
    queue.enqueue(event(db), ['first', 'second'])
    job = queue.claim()
    assert queue.finish(job, retry('rate_limited', 120))
    restarted = Outbox(db, clock=lambda: queue.test_clock[0], lease_seconds=30, max_attempts=3)
    assert restarted.claim() is None
    queue.test_clock[0] += timedelta(seconds=120)
    assert restarted.claim()


@pytest.mark.parametrize('change', [
    {'is_active': False}, {'preference': 'internships'},
])
def test_opt_out_and_preference_checked_again_before_send(db, queue, change):
    queue.enqueue(event(db), ['first'])
    db.subscribers.update_one({'chat_id': 'first'}, {'$set': change})
    send = Mock(return_value=ok())
    queue.drain(send, delay=0)
    send.assert_not_called()
    assert db.notification_outbox.find_one()['state'] == 'failed'
    assert not db.hackathons.find_one()['notified']


def test_partial_fanout_repaired_after_enqueue_crash(db, queue, monkeypatch):
    h = event(db)
    original = queue.jobs.update_one
    calls = [0]
    def interrupted(*a, **kw):
        calls[0] += 1
        if calls[0] == 2:
            raise RuntimeError('synthetic DB interruption')
        return original(*a, **kw)
    monkeypatch.setattr(queue.jobs, 'update_one', interrupted)
    with pytest.raises(RuntimeError): queue.enqueue(h, ['first', 'second'])
    assert db.notification_intents.find_one()['state'] == 'planning'
    assert not db.hackathons.find_one()['notified']
    monkeypatch.setattr(queue.jobs, 'update_one', original)
    queue.drain(lambda *_: ok(), delay=0)
    assert db.notification_outbox.count_documents({'state': 'delivered'}) == 2
    assert db.hackathons.find_one()['notified']


def test_delivery_receipts_survive_event_flag_write_failure(db, queue, monkeypatch):
    queue.enqueue(event(db), ['first'])
    original = queue.events.update_one
    monkeypatch.setattr(queue.events, 'update_one', Mock(side_effect=RuntimeError('synthetic outage')))
    with pytest.raises(RuntimeError): queue.drain(lambda *_: ok(), delay=0)
    assert db.notification_outbox.find_one()['state'] == 'delivered'
    monkeypatch.setattr(queue.events, 'update_one', original)
    send = Mock(return_value=ok())
    queue.drain(send, delay=0)
    send.assert_not_called()
    assert db.hackathons.find_one()['notified']


def test_event_versions_ignore_observation_clocks_preserve_old_receipts(db, queue):
    h = event(db)
    first = queue.enqueue(h, ['first'])
    assert queue.enqueue({**h, 'last_seen_at': '2099-01-01', 'scraped_at': '2099-01-02'}, ['second']) == first
    queue.drain(lambda *_: ok(), delay=0)
    changed = {**h, 'deadline': 'Changed deadline'}
    assert queue.enqueue(changed, ['first']) != first
    assert db.notification_intents.count_documents({}) == 2
    assert db.notification_outbox.count_documents({'state': 'delivered'}) == 1


def test_no_incorrect_flag_when_event_changes_during_delivery(db, queue):
    h = event(db)
    queue.enqueue(h, ['first'])
    def send(*_):
        db.hackathons.update_one({'_id': h['_id']}, {'$set': {'deadline': 'Updated'}, '$inc': {'_ingest_revision': 1}})
        return ok()
    queue.drain(send, delay=0)
    assert not db.hackathons.find_one()['notified']


def test_terminal_failure_never_becomes_delivered(db, queue):
    from notifier.outbox import DeliveryResult
    queue.enqueue(event(db), ['first'])
    queue.drain(lambda *_: DeliveryResult(code='forbidden'), delay=0)
    assert db.notification_intents.find_one()['state'] == 'failed'
    assert db.notification_outbox.find_one()['state'] == 'failed'
    assert not db.hackathons.find_one()['notified']


def test_compound_unique_constraint_rejects_second_record(db, queue):
    from pymongo.errors import DuplicateKeyError
    queue.enqueue(event(db), ['first'])
    row = db.notification_outbox.find_one()
    row['_id'] = 'different-primary-key'
    with pytest.raises(DuplicateKeyError): db.notification_outbox.insert_one(row)


def test_unsubscribe_default_admin_is_persistent_even_without_prior_subscription(db, monkeypatch):
    from notifier.outbox import Outbox
    queue = Outbox(db, admin_chat='admin')
    h = event(db)
    assert queue.recipients(h) == ['admin']
    assert mongo_client.remove_subscriber('admin')
    assert queue.recipients(h) == []
    assert mongo_client.add_subscriber('admin')
    assert queue.recipients(h) == ['admin']


def test_missing_token_retains_pending_without_consuming_attempt(db, monkeypatch):
    from notifier.outbox import Outbox
    h = event(db)
    db.subscribers.insert_one({'chat_id': 'first', 'is_active': True})
    monkeypatch.setattr(bot, 'TELEGRAM_BOT_TOKEN', '')
    result = bot.send_batch([h])
    assert result.get('errors') and result['fully_sent_links'] == []
    assert db.notification_outbox.find_one()['attempts'] == 0
    assert db.notification_outbox.find_one()['state'] == 'pending'
    queue = Outbox(db)
    assert queue.finish(queue.claim(), ok())
    assert not db.hackathons.find_one()['notified']
    assert not bot.send_batch([]).get('errors')
    assert db.hackathons.find_one()['notified']  # Reconcile old receipts without credentials.


def test_deadline_notification_is_durable_and_does_not_repeat(db, monkeypatch):
    monkeypatch.setattr(bot, 'TELEGRAM_CHAT_ID', 'admin')
    h = event(db)
    send = Mock(side_effect=[retry(), ok()])
    monkeypatch.setattr(bot, '_telegram_attempt', send)
    assert not bot.send_deadline_update(h, 'old', 'new')
    db.notification_outbox.update_many({}, {'$set': {'next_attempt_at': NOW}})
    # Recover through the ordinary worker; no second deadline observation is needed.
    assert bot.send_batch([])['fully_sent_links'] == [h['link']]
    assert bot.send_deadline_update(h, 'old', 'new')
    assert send.call_count == 2
    assert db.notification_outbox.count_documents({}) == 1
    assert not db.hackathons.find_one()['notified']  # Deadline alerts cannot mark initial delivery.


def test_changed_event_before_send_cancels_stale_version(db, queue):
    h = event(db)
    queue.enqueue(h, ['first'])
    db.hackathons.update_one({'_id': h['_id']}, {'$set': {'deadline': 'Updated'}})
    send = Mock(return_value=ok())
    queue.drain(send, delay=0)
    send.assert_not_called()
    assert db.notification_outbox.find_one()['error_code'] == 'superseded_version'


@pytest.mark.parametrize('code,body,delivered,retryable', [
    (200, {'ok': True}, True, False),
    (200, {'ok': 1}, False, True),
    (200, {'ok': False}, False, True),
    (403, {'ok': False}, False, False),
    (401, {'ok': False}, False, False),
    (400, {'ok': False}, False, False),
    (500, {}, False, True),
    (429, {'parameters': {'retry_after': 120}}, False, True),
    (200, {'ok': False, 'error_code': 429}, False, True),
])
def test_single_attempt_response_classification(code, body, delivered, retryable):
    requester = Mock(post=Mock(return_value=response(code, **body)))
    result = bot._telegram_attempt(requester, {'chat_id': 'synthetic-private'})
    assert result.delivered is delivered and result.retryable is retryable
    assert requester.post.call_count == 1


@pytest.mark.parametrize('value', [None, {}, '120', float('nan'), -1, True])
def test_malformed_retry_after_uses_safe_default(value):
    requester = Mock(post=Mock(return_value=response(429, parameters={'retry_after': value})))
    result = bot._telegram_attempt(requester, {})
    assert result.retryable and result.retry_after == 5


def test_uncertain_network_and_malformed_json_are_not_delivered(caplog):
    for outcome in [requests.Timeout('private-chat private-token'), requests.ConnectionError('private-chat')]:
        result = bot._telegram_attempt(Mock(post=Mock(side_effect=outcome)), {})
        assert not result.delivered and result.retryable
    malformed = response()
    malformed.json.side_effect = ValueError('private-chat')
    result = bot._telegram_attempt(Mock(post=Mock(return_value=malformed)), {})
    assert result.retryable and not result.delivered
    assert 'private-chat' not in caplog.text and 'private-token' not in caplog.text


@pytest.fixture
def handlers(monkeypatch):
    registered = {}
    def register(**options):
        def decorate(fn):
            registered[fn.__name__] = fn
            return fn
        return decorate
    client = Mock()
    client.message_handler.side_effect = register
    client.callback_query_handler.side_effect = register
    monkeypatch.setattr(bot.telebot, 'TeleBot', Mock(return_value=client))
    monkeypatch.setattr(bot, 'TELEGRAM_BOT_TOKEN', 'test-token')
    bot.start_polling()
    return client, registered


def message(text='/start'):
    return SimpleNamespace(text=text, chat=SimpleNamespace(id='first'), message_id=1,
                           from_user=SimpleNamespace(username='synthetic', first_name='Test', last_name=None))


def test_existing_commands_preserve_opt_out_and_settings(notification_db, handlers):
    client, registered = handlers
    registered['handle_start_help'](message())
    assert notification_db.subscribers.find_one()['is_active']
    registered['handle_unsubscribe'](message('/unsubscribe'))
    assert notification_db.subscribers.find_one()['is_active'] is False
    registered['handle_start_help'](message('/help'))
    assert notification_db.subscribers.find_one()['is_active'] is False
    call = SimpleNamespace(id='synthetic-call', data='sub_pref:internships', message=message())
    registered['handle_callbacks'](call)
    subscriber = notification_db.subscribers.find_one()
    assert subscriber['is_active'] and subscriber['preference'] == 'internships'
    client.infinity_polling.assert_called_once()


def test_unsubscribe_failure_does_not_claim_success(notification_db, handlers, monkeypatch):
    client, registered = handlers
    monkeypatch.setattr(mongo_client, 'remove_subscriber', Mock(return_value=False))
    registered['handle_unsubscribe'](message('/unsubscribe'))
    assert 'Error updating' in client.reply_to.call_args.args[1]


def test_failed_old_events_do_not_starve_later_backlog(notification_db, monkeypatch):
    import run_scan
    ids = []
    for i in range(105):
        h = event(notification_db)
        ids.append(h['_id'])
    observed = []
    def batch(rows):
        observed.append([h['_id'] for h in rows])
        return {'sent': 0, 'fully_sent_links': []}
    monkeypatch.setattr(run_scan, 'send_batch', batch)
    run_scan.dispatch_pending_notifications(notification_db.hackathons)
    run_scan.dispatch_pending_notifications(notification_db.hackathons)
    assert len(observed[0]) == len(observed[1]) == 100
    assert len(set(observed[0]) | set(observed[1])) == len(ids)


def test_ingestion_does_not_overwrite_concurrent_notification_metadata(notification_db, monkeypatch):
    from event_repository import EventRepository
    raw = {'title': 'Synthetic notification metadata race', 'source': 'Fixture',
           'link': 'https://example.com/race', 'organizer': 'Synthetic', 'mode': 'Online'}
    col = notification_db.hackathons
    repo = EventRepository(col)
    stored, _, _ = repo.ingest(raw)
    col.update_one({'_id': stored['_id']}, {'$set': {'notified_version': 'old', 'notification_checked_at': NOW}})
    original = col.update_one
    def concurrent(query, mutation, *args, **kwargs):
        original({'_id': stored['_id']}, {'$set': {'notified_version': 'receipt',
                                                 'notification_checked_at': NOW + timedelta(days=1)}})
        return original(query, mutation, *args, **kwargs)
    monkeypatch.setattr(col, 'update_one', concurrent)
    repo.ingest({**raw, 'desc': 'Updated source facts'})
    row = col.find_one()
    assert row['notified_version'] == 'receipt'
    assert row['notification_checked_at'] == NOW + timedelta(days=1)


def test_committed_event_recovered_on_valid_empty_scan(notification_db, monkeypatch):
    import run_scan
    h = event(notification_db)  # Simulate a crash after ingest, before enqueue.
    monkeypatch.setattr(run_scan, 'get_collection', lambda name='hackathons': notification_db[name])
    monkeypatch.setattr(run_scan, 'run_all_scrapers', lambda: ([], {'Fixture': {'status': 'zero_results', 'found': 0}}))
    monkeypatch.setattr(run_scan, 'run_lifecycle_sweep', lambda *a, **kw: {})
    monkeypatch.setattr(bot, 'TELEGRAM_CHAT_ID', 'admin')
    monkeypatch.setattr(bot, 'TELEGRAM_BOT_TOKEN', 'test-token')
    monkeypatch.setattr(bot, '_telegram_attempt', Mock(return_value=ok()))
    summary = run_scan.execute_scan()
    assert summary['success'] and summary['notified'] == 1
    assert notification_db.hackathons.find_one({'_id': h['_id']})['notified']


def test_notification_only_cli_recovers_without_scraping(notification_db, monkeypatch):
    import run_scan
    event(notification_db)
    monkeypatch.setattr(run_scan.sys, 'argv', ['run_scan.py', '--notifications-only'])
    monkeypatch.setattr(run_scan, 'get_collection', lambda name='hackathons': notification_db[name])
    monkeypatch.setattr(run_scan, 'run_all_scrapers', lambda: pytest.fail('Worker cannot scrape'))
    monkeypatch.setattr(bot, 'TELEGRAM_CHAT_ID', 'admin')
    monkeypatch.setattr(bot, 'TELEGRAM_BOT_TOKEN', 'test-token')
    monkeypatch.setattr(bot, '_telegram_attempt', Mock(return_value=ok()))
    with pytest.raises(SystemExit) as result: run_scan.main()
    assert result.value.code == 0 and notification_db.hackathons.find_one()['notified']


def test_lowered_attempt_budget_settles_retryable_work(db, queue):
    from notifier.outbox import Outbox
    queue.enqueue(event(db), ['first'])
    assert queue.finish(queue.claim(), retry())
    restarted = Outbox(db, clock=lambda: NOW, max_attempts=1)
    assert restarted.claim() is None
    assert db.notification_outbox.find_one()['state'] == 'failed'


def test_notification_version_survives_bson_datetime_roundtrip():
    from notifier.outbox import version
    assert version({'deadline': NOW}) == version({'deadline': NOW.replace(tzinfo=None)})
    assert version({'deadline': NOW.replace(microsecond=123456)}) == version({'deadline': NOW.replace(microsecond=123000)})


def test_duplicate_batch_does_not_count_old_receipt_as_new_send(db, monkeypatch):
    h = event(db)
    monkeypatch.setattr(bot, 'TELEGRAM_CHAT_ID', 'admin')
    send = Mock(return_value=ok())
    monkeypatch.setattr(bot, '_telegram_attempt', send)
    assert bot.send_batch([h])['sent'] == 1
    duplicate = bot.send_batch([h])
    assert duplicate['sent'] == 0 and duplicate['failed'] == 0
    assert duplicate['fully_sent_links'] == [h['link']]
    assert send.call_count == 1
