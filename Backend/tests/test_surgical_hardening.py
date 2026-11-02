"""Deterministic reproductions; no live services, scraping or notifications."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from threading import Barrier
from unittest.mock import Mock
import mongomock
import pytest
from fastapi.testclient import TestClient
import api
import run_scan
from event_repository import EventRepository

NOW=datetime(2026,11,2,tzinfo=timezone.utc)
def event(**extra):
    return {'title':'IIT Delhi Fixture','source':'Fixture','link':'https://example.com/fixture',
            'organizer':'Fixture University','mode':'Online','event_start':'2099-02-01',
            'registration_deadline':{'date':'2099-01-01'},**extra}

@pytest.fixture
def scan(monkeypatch, notification_db):
    db=notification_db
    monkeypatch.setattr(run_scan,'get_collection',lambda name='hackathons':db[name])
    monkeypatch.setattr(run_scan,'run_lifecycle_sweep',lambda *a,**kw:{'archived':0})
    monkeypatch.setattr(run_scan,'run_all_scrapers',lambda:([event()],{'Fixture':{'status':'ok','found':1}}))
    monkeypatch.setattr(run_scan,'send_warning_alert',Mock())
    return db

def test_failed_delivery_is_not_marked_sent_and_is_retried(scan,monkeypatch):
    from notifier import telegram_bot as bot
    from notifier.outbox import DeliveryResult
    monkeypatch.setattr(bot, 'TELEGRAM_BOT_TOKEN', 'test-token')
    monkeypatch.setattr(bot, 'TELEGRAM_CHAT_ID', 'admin')
    send=Mock(side_effect=[DeliveryResult(retryable=True, code='timeout'), DeliveryResult(delivered=True)])
    monkeypatch.setattr(bot,'_telegram_attempt',send)
    assert run_scan.execute_scan()['success'] is False
    assert scan.hackathons.find_one()['notified'] is False
    scan.notification_outbox.update_many({}, {'$set': {'next_attempt_at': NOW}})
    assert run_scan.execute_scan()['success'] is True
    assert scan.hackathons.find_one()['notified'] is True
    assert send.call_count==2

def test_failure_monitor_does_not_count_current_run_twice(scan,monkeypatch):
    monkeypatch.setattr(run_scan,'run_all_scrapers',lambda:([],{'Fixture':{'status':'error','found':0}}))
    for _ in range(2):assert run_scan.execute_scan()['success'] is False
    run_scan.send_warning_alert.assert_not_called()
    run_scan.execute_scan()
    run_scan.send_warning_alert.assert_called_once()

def test_telemetry_failure_is_not_reported_success(scan,monkeypatch):
    monkeypatch.setattr(run_scan,'send_batch',lambda *a:{'sent':1,'fully_sent_links':[event()['link']]})
    monkeypatch.setattr(scan.scan_history,'insert_one',Mock(side_effect=RuntimeError('fixture outage')))
    assert run_scan.execute_scan()['success'] is False

@pytest.mark.parametrize('reports,expected',[
    ({'A':{'status':'zero_results','found':0}},True),
    ({'A':{'status':'error','found':0}},False),
])
def test_empty_and_failed_runs_are_distinct(scan,monkeypatch,reports,expected):
    monkeypatch.setattr(run_scan,'run_all_scrapers',lambda:([],reports))
    assert run_scan.execute_scan()['success'] is expected

@pytest.mark.parametrize('outage',[None,RuntimeError('fixture database failure')])
def test_scan_status_database_failure_is_not_idle(monkeypatch,outage):
    def collection(*a):
        if isinstance(outage,Exception):raise outage
        return outage
    monkeypatch.setattr(api,'get_collection',collection)
    with TestClient(api.app) as client:
        response=client.get('/api/scan-status')
    assert response.status_code==503

def test_ingestion_does_not_undo_concurrent_notification(monkeypatch):
    col=mongomock.MongoClient().race.events
    repo=EventRepository(col);stored,_,_=repo.ingest(event(),now=NOW)
    update=col.update_one
    def concurrent(query,mutation,*args,**kwargs):
        update({'_id':stored['_id']},{'$set':{'notified':True,'notified_at':'fixture-delivered'}})
        return update(query,mutation,*args,**kwargs)
    monkeypatch.setattr(col,'update_one',concurrent)
    repo.ingest(event(desc='New facts'),now=NOW)
    assert col.find_one()['notified'] is True
    assert col.find_one()['notified_at']=='fixture-delivered'

def test_same_timestamp_updates_retry_on_concurrent_revision(monkeypatch):
    col=mongomock.MongoClient().race.events
    repo=EventRepository(col);stored,_,_=repo.ingest(event(),now=NOW)
    update=col.update_one; raced=False
    def concurrent(query,mutation,*args,**kwargs):
        nonlocal raced
        if not raced:
            raced=True
            update({'_id':stored['_id']},{'$addToSet':{'url_aliases':'https://mirror.example/event'},'$inc':{'_ingest_revision':1}})
        return update(query,mutation,*args,**kwargs)
    monkeypatch.setattr(col,'update_one',concurrent)
    repo.ingest(event(desc='Updated'),now=NOW)
    assert 'https://mirror.example/event' in col.find_one()['url_aliases']

def test_concurrent_duplicate_inserts_keep_one_identity(monkeypatch):
    col=mongomock.MongoClient().race.events
    col.create_index('link',unique=True)
    repo=EventRepository(col);barrier=Barrier(2);insert=col.insert_one
    def simultaneous(doc,*a,**kw):
        barrier.wait(timeout=5)
        return insert(doc,*a,**kw)
    monkeypatch.setattr(col,'insert_one',simultaneous)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda _:repo.ingest(event(),now=NOW),range(2)))
    assert col.count_documents({})==1
    assert results[0][0]['_id']==results[1][0]['_id']
    assert sum(created for _,created,_ in results)==1

def test_batch_reports_only_links_delivered_to_every_recipient(monkeypatch, notification_db):
    from notifier import telegram_bot as bot
    from notifier.outbox import DeliveryResult
    monkeypatch.setattr(bot,'TELEGRAM_CHAT_ID','admin')
    monkeypatch.setattr(bot,'TELEGRAM_BOT_TOKEN','test-token')
    notification_db.subscribers.insert_one({'chat_id':'subscriber','is_active':True})
    monkeypatch.setattr(bot,'_telegram_attempt',Mock(side_effect=[DeliveryResult(delivered=True),DeliveryResult(code='rejected'),DeliveryResult(delivered=True),DeliveryResult(delivered=True)]))
    monkeypatch.setattr(bot.time,'sleep',lambda _:None)
    result=bot.send_batch([event(),event(link='https://example.com/second')])
    assert result['fully_sent_links']==['https://example.com/second']

def test_duplicate_history_rows_are_one_failure_run(scan):
    bad={'Fixture':{'found':0,'status':'error'}}
    for _ in range(2):scan.scan_history.insert_one({'run_at':'one-run','timestamp':1,'sources':bad})
    run_scan.check_consecutive_failures(scan.scan_history,bad)
    run_scan.send_warning_alert.assert_not_called()

@pytest.mark.parametrize('success,code',[(True,0),(False,1)])
def test_cli_failure_exit_code(monkeypatch,success,code):
    monkeypatch.setattr(run_scan.sys,'argv',['run_scan'])
    monkeypatch.setattr(run_scan,'execute_scan',lambda **kw:{'success':success})
    with pytest.raises(SystemExit) as raised:run_scan.main()
    assert raised.value.code==code

def test_subscriber_lookup_failure_cannot_confirm_full_delivery(monkeypatch, notification_db):
    from notifier import telegram_bot as bot
    monkeypatch.setattr(bot,'TELEGRAM_CHAT_ID','admin')
    monkeypatch.setattr(notification_db.subscribers, 'find', Mock(side_effect=RuntimeError('fixture outage')))
    monkeypatch.setattr(bot,'send_notification',Mock(return_value=True))
    assert bot.send_batch([event()])['fully_sent_links']==[]

def test_failed_deadline_alert_is_not_success(scan,monkeypatch):
    EventRepository(scan.hackathons).ingest(event())
    scan.hackathons.update_one({}, {'$set':{'notified':True}})
    monkeypatch.setattr(run_scan,'run_all_scrapers',lambda:([event(registration_deadline={'date':'2099-01-02'})],{'Fixture':{'status':'ok','found':1}}))
    monkeypatch.setattr(run_scan,'send_deadline_update',Mock(return_value=False))
    assert run_scan.execute_scan()['success'] is False
    run_scan.send_deadline_update.assert_called_once()

@pytest.mark.parametrize('prefix',['/api','/api/v1'])
def test_moderation_cannot_finalize_another_workers_lease(monkeypatch,prefix):
    db=mongomock.MongoClient().moderation
    sid='a'*64;db.community_submissions.insert_one({'_id':sid,'url':event()['link'],'state':'pending'})
    monkeypatch.setenv('ADMIN_SECRET','fixture-secret')
    monkeypatch.setattr(api,'get_collection',lambda name='hackathons':db[name])
    update=db.community_submissions.update_one
    def stolen(query,mutation,*a,**kw):
        if mutation.get('$set',{}).get('state')=='rejected':
            update({'_id':sid},{'$set':{'review_started_at':'another-worker'}})
        return update(query,mutation,*a,**kw)
    monkeypatch.setattr(db.community_submissions,'update_one',stolen)
    api.limiter.reset()
    with TestClient(api.app) as client:
        result=client.post(f'{prefix}/admin/submissions/{sid}/review',json={'decision':'reject'},headers={'X-Admin-Secret':'fixture-secret'})
    assert result.status_code==503
    assert db.community_submissions.find_one()['state']=='reviewing'
    api.limiter.reset()

def test_public_rate_limit_ignores_spoofed_forwarding_and_validates_input(monkeypatch):
    db=mongomock.MongoClient().limits
    monkeypatch.setattr(api,'get_collection',lambda name='hackathons':db[name])
    api.limiter.reset()
    try:
        with TestClient(api.app) as client:
            assert client.post('/api/submissions',json={'url':'http://127.0.0.1/private'}).status_code==400
            responses=[client.post('/api/submissions',json={'url':f'https://example.com/{i}'},headers={'X-Forwarded-For':f'8.8.8.{i}'}) for i in range(6)]
            assert responses[-1].status_code==429
            assert db.community_submissions.count_documents({})<=5
    finally:api.limiter.reset()

def _empty_source_fixture(*args):return []

def _failed_source_fixture():raise RuntimeError('fixture source failure')

def test_scraper_exception_is_distinct_from_empty(monkeypatch):
    names=['scrape_devfolio','scrape_unstop','scrape_devpost','scrape_hackerearth','scrape_devnovate',
           'scan_single_keyword','scrape_instagram_hackathons','run_web_discovery']
    for name in names:monkeypatch.setattr(run_scan,name,_empty_source_fixture)
    monkeypatch.setattr(run_scan,'scrape_devfolio',_failed_source_fixture)
    rows,reports=run_scan.run_all_scrapers()
    assert rows==[]
    assert reports['Devfolio']['status']=='error'
    assert reports['Unstop']['status']=='zero_results'

@pytest.mark.parametrize('empty',[True,False])
def test_missing_history_collection_is_not_success(scan,monkeypatch,empty):
    monkeypatch.setattr(run_scan,'get_collection',lambda name='hackathons':None if name=='scan_history' else scan[name])
    monkeypatch.setattr(run_scan,'send_batch',lambda *a:{'sent':1,'fully_sent_links':[event()['link']]})
    if empty:monkeypatch.setattr(run_scan,'run_all_scrapers',lambda:([],{'Fixture':{'status':'zero_results','found':0}}))
    assert run_scan.execute_scan()['success'] is False

def test_notification_flag_write_failure_is_not_success(scan,monkeypatch):
    from notifier import telegram_bot as bot
    from notifier.outbox import DeliveryResult, Outbox
    monkeypatch.setattr(bot,'TELEGRAM_CHAT_ID','admin')
    monkeypatch.setattr(bot,'TELEGRAM_BOT_TOKEN','test-token')
    monkeypatch.setattr(bot,'_telegram_attempt',Mock(return_value=DeliveryResult(delivered=True)))
    # Fail only the final receipt reconciliation, not ingestion.
    queue=Outbox(scan, admin_chat='admin')
    monkeypatch.setattr('notifier.outbox.Outbox', lambda *a, **kw: queue)
    update=queue.events.update_one
    def fail_flag(query, mutation, *args, **kwargs):
        if mutation.get('$set',{}).get('notified') is True:raise RuntimeError('fixture outage')
        return update(query, mutation, *args, **kwargs)
    monkeypatch.setattr(queue.events,'update_one',fail_flag)
    assert run_scan.execute_scan()['success'] is False

@pytest.mark.parametrize('outage',[None,'query'])
def test_actual_subscriber_lookup_outage_does_not_confirm_delivery(monkeypatch,outage,notification_db):
    from notifier import telegram_bot as bot
    from db import mongo_client
    collection=None if outage is None else Mock()
    if collection is not None:collection.find.side_effect=RuntimeError('fixture query failure')
    if outage is None:
        monkeypatch.setattr(mongo_client, 'get_collection', lambda *a: None)
    else:
        monkeypatch.setattr(notification_db.subscribers,'find',Mock(side_effect=RuntimeError('fixture query failure')))
    monkeypatch.setattr(bot,'TELEGRAM_CHAT_ID','admin')
    monkeypatch.setattr(bot,'send_notification',Mock(return_value=True))
    assert bot.send_batch([event()])['fully_sent_links']==[]
