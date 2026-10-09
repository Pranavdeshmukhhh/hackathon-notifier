"""Opt-in tests against a fresh, loopback-only MongoDB replica set."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import os
import uuid

from bson import ObjectId
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError
import pytest

from db.job_leases import JobLease, LeaseBusy, LeaseLost
from ingestion import IngestionService, ensure_indexes
from scripts.backup_database import export_database, restore_database
from scripts.migrate_phase5 import migrate


@pytest.fixture
def real_database(monkeypatch):
    uri = os.getenv("PHASE5_INTEGRATION_URI")
    if not uri:
        pytest.skip("Set PHASE5_INTEGRATION_URI to the isolated replica set")
    if not uri.startswith("mongodb://127.0.0.1:27019/"):
        pytest.fail("Integration tests require the isolated loopback replica set on port 27019")
    client = MongoClient(uri, serverSelectionTimeoutMS=5000, tz_aware=True)
    client.admin.command("ping")
    monkeypatch.setenv("PHASE5_WRITE_TRANSACTIONS", "true")
    monkeypatch.setenv("ENVIRONMENT", "production")
    database = client["phase5_restore_" + uuid.uuid4().hex]
    ensure_indexes(database)
    try:
        yield database
    finally:
        assert database.name.startswith("phase5_restore_")
        client.drop_database(database.name)
        client.close()


def sample(**fields):
    return {"title": "Sample campus event", "link": "https://example.com/event", "source": "Sample", "source_event_id": "one", "deadline_kind": "registration", "deadline_iso": "2099-10-20", "status": "Open", **fields}


def test_real_lease_has_one_owner_under_contention(real_database):
    def claim(_):
        try:
            return JobLease(real_database.job_leases).acquire()
        except LeaseBusy:
            return None
    with ThreadPoolExecutor(max_workers=6) as executor:
        owners = list(executor.map(claim, range(12)))
    assert sum(owner is not None for owner in owners) == 1


def test_real_unique_multikey_identity_and_transactional_update(real_database):
    with JobLease(real_database.job_leases) as lease:
        service = IngestionService(real_database.hackathons, lease=lease, notify=True)
        first = service.ingest(sample(is_top_college=True))["data"]
        changed = service.ingest(sample(link="https://example.com/new-url", is_top_college=True, desc="A supplied brief"))["data"]
    assert changed["_id"] == first["_id"]
    assert real_database.hackathons.count_documents({}) == 1
    assert len(changed["_notification_intents"]) == 1
    with pytest.raises(DuplicateKeyError):
        real_database.hackathons.insert_one({"link": "https://example.com/other", "_identity_keys": [first["_identity_keys"][0]]})


def test_transaction_rolls_back_event_intent_and_generation(real_database, monkeypatch):
    import ingestion
    def fail(*args, **kwargs):
        raise RuntimeError("Simulated crash before commit")
    monkeypatch.setattr(ingestion, "bump_generation", fail)
    with JobLease(real_database.job_leases) as lease:
        with pytest.raises(RuntimeError, match="Simulated"):
            IngestionService(real_database.hackathons, lease=lease, notify=True).ingest(sample(is_top_college=True))
    assert real_database.hackathons.count_documents({}) == 0
    assert real_database.dataset_state.count_documents({}) == 0


def test_former_owner_cannot_publish_after_real_takeover(real_database):
    old = JobLease(real_database.job_leases).acquire()
    real_database.job_leases.update_one({"_id": old.name}, {"$set": {"expires_at": datetime.now(timezone.utc) - timedelta(seconds=1)}})
    new = JobLease(real_database.job_leases).acquire()
    with pytest.raises(LeaseLost):
        IngestionService(real_database.hackathons, lease=old).ingest(sample())
    assert real_database.hackathons.count_documents({}) == 0
    assert new.token > old.token


def test_real_backup_restore_migration_and_rollback_preserve_ids_indexes(real_database, tmp_path):
    original = sample(deadline_kind="unknown")
    real_database.hackathons.insert_one(original)
    before = real_database.hackathons.find_one({})
    output = tmp_path / "phase5-backup"
    export_database(real_database, output)
    clone_name = "phase0_restore_" + uuid.uuid4().hex
    clone = real_database.client[clone_name]
    try:
        restore_database(clone, output)
        assert clone.hackathons.find_one({}) == before
        migrate(clone, apply=True)
        assert clone.hackathons.find_one({})["deadline_iso"] is None
        migrate(clone, apply=True, rollback=True)
        assert clone.hackathons.find_one({}) == before
        assert clone.hackathons.index_information()["link_1"]["unique"]
    finally:
        assert clone_name.startswith("phase0_restore_")
        real_database.client.drop_database(clone_name)
