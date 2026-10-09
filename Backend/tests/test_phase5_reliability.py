"""Behavioral regression tests for the Phase 5 data and delivery boundaries."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock
import json

from bson import ObjectId
from fastapi.testclient import TestClient
import mongomock
import pytest

import api
from db.job_leases import JobLease, LeaseBusy, LeaseLost
from event_normalization import canonical_url, normalize_observation, parse_date, lifecycle_values
from ingestion import IngestionService, ensure_indexes, resolve_event
from notifier.delivery_worker import process_deliveries, expand_intents
from scripts.migrate_phase5 import migrate


@pytest.fixture
def database(monkeypatch):
    monkeypatch.setenv("PHASE5_WRITE_TRANSACTIONS", "false")
    monkeypatch.setenv("ENVIRONMENT", "development")
    db = mongomock.MongoClient(tz_aware=True).phase5_restore_test
    ensure_indexes(db)
    return db


def event(**changes):
    return {"title": "Sample student hackathon", "link": "https://example.com/event", "source": "Sample platform",
            "mode": "In-person", "deadline_kind": "registration", "deadline_iso": "2099-10-20", "status": "Open", **changes}


def ingest(db, raw=None, **kwargs):
    with JobLease(db.job_leases) as lease:
        return IngestionService(db.hackathons, lease=lease, notify=kwargs.pop("notify", False)).ingest(raw or event(), **kwargs)


def test_canonical_urls_preserve_event_identity_and_only_strip_tracking():
    assert canonical_url("https://EXAMPLE.com:443/Event?id=2&utm_source=campus#edition") == "https://example.com/Event?id=2#edition"
    assert canonical_url("https://example.com/Event?id=3") != canonical_url("https://example.com/Event?id=2")
    assert canonical_url("https://example.com/Event") != canonical_url("https://example.com/event")


@pytest.mark.parametrize("value", ["2026-02-30", "10–12 October 2026", "01/02/2026", "10 October", "TBA"])
def test_ambiguous_or_invalid_dates_remain_unknown(value):
    assert parse_date(value) is None


def test_source_date_meaning_and_timestamp_precision():
    unknown = normalize_observation(event(deadline_kind="event"))
    assert unknown["deadline_iso"] is None
    assert unknown["event_end"] == "2099-10-20"
    exact = normalize_observation(event(registration_deadline="2099-10-20T01:30:00+05:30"))
    assert exact["deadline_iso"] == "2099-10-19"
    assert exact["registration_deadline"]["precision"] == "timestamp"
    assert exact["registration_deadline"]["at"] == "2099-10-19T20:00:00+00:00"


@pytest.mark.parametrize("text", [
    "Hackathon dates: 10 October 2026", "Registration deadline: 2026-02-30",
    "Registration deadline: 10–12 October 2026", "Registration deadline: 10 October 2026 - 12 October 2026",
    "Apply by: 01/02/2026", "Registration closes: 10 October",
    "Registration closes: 10 October 2026 Registration deadline: 12 October 2026",
])
def test_discovery_adapters_do_not_turn_ranges_or_ambiguous_text_into_registration_dates(text):
    from scrapers.instagram_scraper import _extract_dates_from_text
    from scrapers.web_discovery_scraper import _scan_for_dates
    assert _extract_dates_from_text(text) == (None, None)
    assert _scan_for_dates(text) == (None, None)


def test_discovery_registration_label_accepts_one_valid_date():
    from event_normalization import extract_registration_date
    assert extract_registration_date("Event starts: 12 October 2026\nRegistration closes: 10th October 2026") == ("2026-10-10", "2026-10-10")


def test_source_html_is_inert_and_fields_are_not_invented():
    normalized = normalize_observation(event(mode="unknown", organizer=None, desc="<p>Build <b>tools</b>.</p><script>bad()</script>"))
    assert normalized["desc"] == "Build tools."
    assert "mode" not in normalized and "organizer" not in normalized
    assert "lat" not in normalized


def test_sparse_and_lower_quality_observations_preserve_facts_and_id(database):
    first = ingest(database, event(organizer="Campus club", eligibility="Students", prize="Equipment", desc="Detailed brief"), authority=3, protected_fields={"organizer"})
    updated = ingest(database, event(organizer="Guessed organizer", eligibility=None, desc="TBA"), authority=1)
    assert updated["data"]["_id"] == first["data"]["_id"]
    assert updated["data"]["organizer"] == "Campus club"
    assert updated["data"]["eligibility"] == "Students"
    assert updated["data"]["desc"] == "Detailed brief"
    assert updated["data"]["revision"] == first["data"]["revision"]
    assert database.hackathons.count_documents({}) == 1


def test_unknown_deadline_cannot_erase_a_supported_registration_date(database):
    ingest(database, event(), authority=2)
    saved = ingest(database, event(deadline_kind="event", deadline_iso="2099-11-20"), authority=1)["data"]
    assert saved["deadline_kind"] == "registration"
    assert saved["deadline_iso"] == "2099-10-20"
    assert saved["registration_deadline"]["precision"] == "date"


def test_generation_invalidates_an_existing_api_cache(database, monkeypatch):
    ingest(database, event())
    monkeypatch.setattr(api, "get_collection", lambda name="hackathons": database[name])
    monkeypatch.setattr(api, "_generation_checked_at", 0)
    monkeypatch.setattr(api, "_last_generation", None)
    api._cache.clear()
    with TestClient(api.app) as client:
        first = client.get("/api/hackathons")
        assert first.json()["data"][0]["title"] == "Sample student hackathon"
        ingest(database, event(title="Updated source title"))
        monkeypatch.setattr(api, "_generation_checked_at", 0)
        updated = client.get("/api/hackathons", headers={"If-None-Match": first.headers["etag"]})
    assert updated.status_code == 200
    assert updated.json()["data"][0]["title"] == "Updated source title"
    assert updated.headers["etag"] != first.headers["etag"]
    api._cache.clear()


def test_administrator_can_clear_an_optional_fact_without_reopening_cancelled_event(database):
    ingest(database, event(prize="Equipment", status="Cancelled"), authority=3, protected_fields={"prize"})
    saved = ingest(database, event(prize=None), authority=3, clear_fields={"prize"})["data"]
    assert saved["prize"] is None
    assert saved["registration_state"] == "cancelled"


def test_tracking_links_and_stable_source_ids_deduplicate_without_title_merging(database):
    first = ingest(database, event(source_event_id="one", link="https://example.com/event?utm_source=a"))
    same = ingest(database, event(source_event_id="one", link="https://example.com/new-address"))
    another = ingest(database, event(source_event_id="two", link="https://example.com/different"))
    assert same["data"]["_id"] == first["data"]["_id"]
    assert another["data"]["_id"] != first["data"]["_id"]
    assert database.hackathons.count_documents({}) == 2


def test_conflicting_source_and_url_identity_requires_review(database):
    ingest(database, event(source_event_id="one"))
    ingest(database, event(source_event_id="two", link="https://example.com/two"))
    with pytest.raises(ValueError, match="Conflicting"):
        ingest(database, event(source_event_id="one", link="https://example.com/two"))


def test_cancelled_record_does_not_reopen_from_future_date(database):
    ingest(database, event(status="Cancelled"))
    saved = ingest(database, event(status="Open", deadline_iso="2099-11-20"))["data"]
    assert saved["registration_state"] == "cancelled"
    assert saved["is_past"] is True


def test_owned_lease_excludes_overlap_and_stale_owner_cannot_publish(database):
    clock = [datetime.now(timezone.utc)]
    old = JobLease(database.job_leases, ttl=10, now=lambda: clock[0]).acquire()
    with pytest.raises(LeaseBusy):
        JobLease(database.job_leases, now=lambda: clock[0]).acquire()
    clock[0] += timedelta(seconds=11)
    new = JobLease(database.job_leases, now=lambda: clock[0]).acquire()
    assert new.token > old.token
    with pytest.raises(LeaseLost):
        old.publish(lambda _: database.hackathons.insert_one(event()))
    assert database.hackathons.count_documents({}) == 0


def test_production_publication_requires_transactions(database, monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    with JobLease(database.job_leases) as lease:
        with pytest.raises(RuntimeError, match="transactional"):
            IngestionService(database.hackathons, lease=lease).ingest(event())


def test_routine_maintenance_retains_expired_ids(database):
    from lifecycle import run_lifecycle_sweep
    saved = ingest(database, event(deadline_iso="2020-01-01"))["data"]
    run_lifecycle_sweep(database.hackathons, revalidate=False)
    assert resolve_event(database.hackathons, str(saved["_id"]))["is_past"] is True
    assert database.hackathons.count_documents({}) == 1


def test_delivery_records_each_recipient_and_restart_never_replays_sent(database, monkeypatch):
    monkeypatch.setattr("notifier.telegram_bot.TELEGRAM_CHAT_ID", "")
    database.subscribers.insert_many([{"chat_id": "one", "is_active": True}, {"chat_id": "two", "is_active": True}])
    saved = ingest(database, event(is_top_college=True), notify=True)["data"]
    calls = []
    def sender(delivery):
        calls.append(delivery["chat_id"])
        return {"state": "sent", "message_id": 123} if delivery["chat_id"] == "two" else {"state": "uncertain", "reason": "timeout"}
    summary = process_deliveries(database, sender=sender, pace=False)
    assert summary["sent"] == 1 and summary["uncertain"] == 1
    assert sorted(calls) == ["one", "two"]
    process_deliveries(database, sender=sender, pace=False)
    assert len(calls) == 2
    assert database.notification_deliveries.find_one({"chat_id": "two"})["message_id"] == 123
    assert database.hackathons.find_one({"_id": saved["_id"]})["_notification_intents"] == []


def test_partial_fanout_is_idempotent_and_opt_out_cancels_pending(database, monkeypatch):
    monkeypatch.setattr("notifier.telegram_bot.TELEGRAM_CHAT_ID", "")
    database.subscribers.insert_one({"chat_id": "one", "is_active": True})
    ingest(database, event(is_internship=True), notify=True)
    with JobLease(database.job_leases, name="telegram-delivery") as lease:
        expand_intents(database, lease)
        expand_intents(database, lease)
    assert database.notification_deliveries.count_documents({}) == 1
    database.subscribers.update_one({"chat_id": "one"}, {"$set": {"is_active": False}})
    sender = Mock(side_effect=AssertionError("Must not send after opt-out"))
    assert process_deliveries(database, sender=sender, pace=False)["failed"] == 1
    sender.assert_not_called()


def test_crashed_send_is_uncertain_instead_of_replayed(database, monkeypatch):
    monkeypatch.setattr("notifier.telegram_bot.TELEGRAM_CHAT_ID", "")
    database.notification_deliveries.insert_one({"delivery_key": "old", "state": "sending", "claimed_until": datetime.now(timezone.utc) - timedelta(minutes=1)})
    sender = Mock()
    process_deliveries(database, sender=sender, pace=False)
    assert database.notification_deliveries.find_one({"delivery_key": "old"})["state"] == "uncertain"
    sender.assert_not_called()


def test_migration_is_report_only_resumable_and_reversible(database):
    original = event(deadline_kind="unknown", notified=True)
    original.pop("deadline_kind")
    database.hackathons.insert_one(original)
    before = deepcopy(database.hackathons.find_one({}))
    report = migrate(database)
    assert report["uncertain_dates"] == [str(before["_id"])]
    assert database.hackathons.find_one({}) == before
    migrate(database, apply=True)
    after = database.hackathons.find_one({})
    assert after["deadline_iso"] is None
    assert "_notification_intents" not in after
    assert migrate(database, apply=True)["changed"] == 0
    migrate(database, apply=True, rollback=True)
    assert database.hackathons.find_one({}) == before


def test_migration_collisions_require_review_and_aliases_keep_detail_links(database, monkeypatch):
    first = database.hackathons.insert_one(event()).inserted_id
    second = database.hackathons.insert_one(event(link="https://example.com/event?utm_source=campus")).inserted_id
    with pytest.raises(ValueError, match="alias"):
        migrate(database, apply=True)
    migrate(database, apply=True, approved_aliases={str(second): str(first)})
    assert resolve_event(database.hackathons, str(second))["_id"] == first
    monkeypatch.setattr(api, "get_collection", lambda name="hackathons": database[name])
    with TestClient(api.app) as client:
        response = client.get("/api/hackathons/" + str(second))
    assert response.status_code == 200
    assert response.json()["data"]["_id"] == str(second)
    assert "_phase5_backup" not in response.json()["data"]


def test_migration_apply_cannot_target_production():
    with pytest.raises(ValueError, match="isolated"):
        migrate(mongomock.MongoClient().hackathon_tracker, apply=True)


def test_migration_preserves_known_source_identity_across_a_changed_url(database):
    key = database.hackathons.insert_one(event(source_event_id="stable-id")).inserted_id
    migrate(database, apply=True)
    saved = ingest(database, event(source_event_id="stable-id", link="https://example.com/new-address"))["data"]
    assert saved["_id"] == key and database.hackathons.count_documents({}) == 1


def test_reviewed_source_identity_alias_preserves_old_urls_and_detail_ids(database):
    retained = database.hackathons.insert_one(event(source_event_id="stable-id")).inserted_id
    old = database.hackathons.insert_one(event(source_event_id="stable-id", link="https://example.com/old-url")).inserted_id
    with pytest.raises(ValueError, match="alias"):
        migrate(database, apply=True)
    migrate(database, apply=True, approved_aliases={str(old): str(retained)})
    assert resolve_event(database.hackathons, str(old))["_id"] == retained
    # A later generic observation using the prior URL still reaches that event.
    assert ingest(database, event(link="https://example.com/old-url"))["data"]["_id"] == retained
    assert database.hackathons.count_documents({"publication_state": {"$ne": "suppressed"}}) == 1


def test_partial_scan_outcomes_and_dry_run_have_no_side_effects(database, monkeypatch):
    import run_scan
    monkeypatch.setattr(run_scan, "get_collection", lambda name="hackathons": database[name])
    monkeypatch.setattr(run_scan, "batch_verify", lambda docs, **_: docs)
    def collect():
        return [event()], {"Sample": {"found": 1, "status": "ok"}, "Broken": {"found": 0, "status": "error", "error": "Timeout"}}
    report = run_scan.execute_scan(dry_run=True, scraper_runner=collect)
    assert report["status"] == "partial"
    assert database.hackathons.count_documents({}) == 0
    assert database.scan_history.count_documents({}) == 0
    report = run_scan.execute_scan(scraper_runner=collect)
    assert report["status"] == "partial"
    assert database.hackathons.count_documents({}) == 1
    assert database.scan_history.count_documents({}) == 1


def test_public_scan_telemetry_never_exposes_stored_exception(database, monkeypatch):
    database.scan_history.insert_one({"timestamp": 1, "status": "partial", "error": "secret token", "sources": {"Source": {"found": 0, "status": "error", "error": "mongodb://secret"}}})
    monkeypatch.setattr(api, "get_collection", lambda name="hackathons": database[name])
    with TestClient(api.app) as client:
        response = client.get("/api/scan-status")
    assert "secret" not in response.text


def test_geocoding_is_optional_and_uses_exact_location(database, monkeypatch):
    from scrapers import geocoder
    monkeypatch.setattr("db.mongo_client.get_collection", lambda name="hackathons": database[name])
    sender = Mock()
    monkeypatch.setattr(geocoder.requests, "get", sender)
    assert geocoder.geocode("Example campus") == (None, None)
    sender.assert_not_called()
    monkeypatch.setenv("ENABLE_GEOCODING", "true")
    sender.return_value.status_code = 200
    sender.return_value.json.return_value = [{"lat": "18.5", "lon": "73.8"}]
    assert geocoder.geocode("Example campus") == (18.5, 73.8)
    assert geocoder.geocode("Example campus") == (18.5, 73.8)
    sender.assert_called_once()
    assert sender.call_args.kwargs["params"]["q"] == "Example campus"


def test_cleared_deadline_remains_unknown_after_a_later_sparse_observation(database):
    ingest(database, event(), authority=3)
    cleared = ingest(database, event(), authority=3, clear_fields={"deadline_iso", "registration_deadline"})["data"]
    assert cleared["deadline"] == "TBA" and cleared["deadline_iso"] is None
    later = ingest(database, event(deadline_kind="unknown"))["data"]
    assert later["registration_deadline"]["precision"] == "unknown"


def test_ingestion_does_not_restore_consumed_intents_or_erase_delivery_success(database, monkeypatch):
    first = ingest(database, event(is_top_college=True), notify=True)["data"]
    original_update = database.hackathons.update_one
    def concurrent_delivery(query, mutation, **kwargs):
        if "revision" in query:
            original_update({"_id": first["_id"]}, {"$set": {"notified": True}, "$pull": {"_notification_intents": {"key": first["_notification_intents"][0]["key"]}}})
        return original_update(query, mutation, **kwargs)
    monkeypatch.setattr(database.hackathons, "update_one", concurrent_delivery)
    ingest(database, event(is_top_college=True, desc="Updated brief"), notify=True)
    stored = database.hackathons.find_one({"_id": first["_id"]})
    assert stored["notified"] is True and stored["_notification_intents"] == []


def test_pending_notice_uses_corrected_facts_and_does_not_send_an_extra_deadline_notice(database, monkeypatch):
    monkeypatch.setattr("notifier.telegram_bot.TELEGRAM_CHAT_ID", "")
    database.subscribers.insert_one({"chat_id": "one", "is_active": True})
    ingest(database, event(is_top_college=True), notify=True)
    ingest(database, event(is_top_college=True, deadline_iso="2099-11-20"), notify=True)
    sender = Mock(return_value={"state": "sent", "message_id": 123})
    process_deliveries(database, sender=sender, pace=False)
    sender.assert_called_once()
    assert sender.call_args.args[0]["event"]["deadline_iso"] == "2099-11-20"
    ingest(database, event(is_top_college=True, deadline_iso="2099-12-20"), notify=True)
    process_deliveries(database, sender=sender, pace=False)
    assert sender.call_count == 2
    assert sender.call_args.args[0]["kind"] == "deadline"


def test_fanout_does_not_send_old_discoveries_to_new_subscribers(database, monkeypatch):
    monkeypatch.setattr("notifier.telegram_bot.TELEGRAM_CHAT_ID", "")
    ingest(database, event(is_top_college=True), notify=True)
    database.subscribers.insert_one({"chat_id": "late", "is_active": True, "subscribed_at": (datetime.now(timezone.utc) + timedelta(seconds=1)).timestamp()})
    sender = Mock()
    process_deliveries(database, sender=sender, pace=False)
    sender.assert_not_called()


def test_rate_limit_pauses_all_recipients_across_worker_restarts(database, monkeypatch):
    monkeypatch.setattr("notifier.telegram_bot.TELEGRAM_CHAT_ID", "")
    database.subscribers.insert_many([{"chat_id": "one", "is_active": True}, {"chat_id": "two", "is_active": True}])
    ingest(database, event(is_top_college=True), notify=True)
    sender = Mock(return_value={"state": "pending", "retry_after": 120, "reason": "rate_limited"})
    process_deliveries(database, sender=sender, pace=False)
    process_deliveries(database, sender=sender, pace=False)
    sender.assert_called_once()


def test_health_alerts_are_durable_and_once_per_failure_episode(database, monkeypatch):
    import run_scan
    monkeypatch.setattr("notifier.telegram_bot.TELEGRAM_CHAT_ID", "admin")
    stats = {"Source": {"status": "empty_unconfirmed", "found": 0}}
    for n in range(2):
        database.scan_history.insert_one({"timestamp": n, "sources": stats})
    summary = {"run_at": "2099-01-01T00:00:00+00:00", "sources": stats}
    run_scan.queue_health_warnings(database, summary)
    run_scan.queue_health_warnings(database, summary)
    assert database.notification_deliveries.count_documents({"kind": "health"}) == 1
    database.scan_history.insert_one({"timestamp": 2, "sources": stats})
    run_scan.queue_health_warnings(database, {**summary, "run_at": "2099-01-02T00:00:00+00:00"})
    assert database.notification_deliveries.count_documents({"kind": "health"}) == 1
    assert process_deliveries(database, sender=lambda _: {"state": "sent", "message_id": 1}, pace=False)["sent"] == 1


def test_migration_handles_three_collisions_and_both_retained_url_orders(database):
    ids = [database.hackathons.insert_one(event(link=url)).inserted_id for url in (
        "https://example.com/event?utm_source=a", "https://example.com/event", "https://example.com/event?utm_source=b")]
    migrate(database, apply=True, approved_aliases={str(ids[1]): str(ids[0]), str(ids[2]): str(ids[0])})
    assert all(resolve_event(database.hackathons, str(key))["_id"] == ids[0] for key in ids)
    migrate(database, apply=True, rollback=True)
    assert database.hackathons.find_one({"_id": ids[0]})["link"].endswith("utm_source=a")
    assert database.hackathons.find_one({"_id": ids[1]})["link"] == "https://example.com/event"


def test_rollback_refuses_to_erase_post_migration_changes(database):
    database.hackathons.insert_one(event())
    migrate(database, apply=True)
    ingest(database, event(desc="Updated after migration"))
    with pytest.raises(ValueError, match="unchanged"):
        migrate(database, apply=True, rollback=True)
    assert database.hackathons.find_one({})["desc"] == "Updated after migration"


def test_production_indexes_refuse_unmigrated_data(database, monkeypatch):
    database.hackathons.insert_one(event())
    monkeypatch.setenv("ENVIRONMENT", "production")
    with pytest.raises(RuntimeError, match="restored clone"):
        ensure_indexes(database)


def test_administrator_gets_busy_response_before_a_manual_scrape(database, monkeypatch):
    monkeypatch.setenv("ADMIN_SECRET", "test-secret")
    monkeypatch.setattr(api, "get_collection", lambda name="hackathons": database[name])
    sender = Mock(side_effect=AssertionError("An overlapping scrape must never start"))
    monkeypatch.setattr("scrapers.source_runner.bounded_scrape", sender)
    with JobLease(database.job_leases):
        with TestClient(api.app) as client:
            response = client.post("/api/scanner/instagram", json={}, headers={"X-Admin-Secret": "test-secret"})
    assert response.status_code == 409
    sender.assert_not_called()


def test_source_process_budget_is_enforced_and_child_is_reaped():
    import multiprocessing
    from scrapers.source_runner import bounded_scrape, SourceFailure
    before = {child.pid for child in multiprocessing.active_children()}
    with pytest.raises(SourceFailure, match="source_timeout"):
        bounded_scrape("time", "sleep", {"secs": 60}, timeout=0.2)
    assert {child.pid for child in multiprocessing.active_children()} == before
    assert bounded_scrape("json", "loads", {"s": "[]"}, timeout=10).source_status == "empty_unconfirmed"
    with pytest.raises(SourceFailure, match="ValueError"):
        bounded_scrape("json", "loads", {"s": json.dumps([{}] * 2001)}, timeout=10)


def test_dry_run_disables_enrichment_in_every_source_process(monkeypatch):
    import run_scan
    calls = []
    def collector(module, function, **kwargs):
        calls.append(kwargs)
        return []
    monkeypatch.setattr("scrapers.source_runner.bounded_scrape", collector)
    run_scan.run_all_scrapers(dry_run=True)
    assert len(calls) == 8 and all(call["allow_enrichment"] is False for call in calls)


def test_scan_archives_across_multiple_maintenance_batches_without_deleting(database, monkeypatch):
    import run_scan
    database.hackathons.insert_many([event(link=f"https://example.com/old/{n}", schema_version=5,
                                         _identity_keys=[f"url:https://example.com/old/{n}"], deadline_iso="2020-01-01") for n in range(121)])
    monkeypatch.setattr(run_scan, "get_collection", lambda name="hackathons": database[name])
    report = run_scan.execute_scan(scraper_runner=lambda: ([], {"Sample": {"found": 0, "status": "zero_results"}}))
    assert report["status"] == "success" and report["archived"] == 121
    assert database.hackathons.count_documents({"archived": True}) == 121
    assert database.hackathons.count_documents({}) == 121


def test_worker_payload_keeps_valid_html_and_both_registration_and_app_links(monkeypatch):
    from notifier.delivery_worker import send_delivery
    monkeypatch.setattr("notifier.telegram_bot.TELEGRAM_BOT_TOKEN", "test-token")
    response = Mock(status_code=200)
    response.json.return_value = {"ok": True, "result": {"message_id": 12}}
    post = Mock(return_value=response)
    monkeypatch.setattr("notifier.delivery_worker.requests.post", post)
    result = send_delivery({"kind": "new", "chat_id": "one", "event": event(title="<" * 500, tags=["<b>theme</b>"] * 40, prize="&" * 1000)})
    assert result["state"] == "sent" and result["message_id"] == 12
    payload = post.call_args.kwargs["json"]
    assert len(payload["text"]) < 4096
    assert "#&lt;b&gt;theme&lt;/b&gt;" in payload["text"]
    buttons = payload["reply_markup"]["inline_keyboard"]
    assert buttons[0][0]["url"] == "https://example.com/event"
    assert buttons[1][0]["text"] == "View in web app"
