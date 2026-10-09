"""MongoDB ownership leases, with heartbeat and fencing for scan publication."""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import os
import threading
import uuid

from pymongo import ReadPreference, ReturnDocument
from pymongo.errors import DuplicateKeyError
from pymongo.read_concern import ReadConcern
from pymongo.write_concern import WriteConcern


class LeaseBusy(RuntimeError):
    pass


class LeaseLost(RuntimeError):
    pass


class JobLease:
    def __init__(self, collection, name="event-ingestion", ttl=120, now=None):
        self.collection = collection
        self.name = name
        self.ttl = ttl
        self.now = now or (lambda: datetime.now(timezone.utc))
        self.owner = uuid.uuid4().hex
        self.token = None
        self._stop = threading.Event()
        self._thread = None
        self._lost = False

    def acquire(self):
        now = self.now()
        try:
            doc = self.collection.find_one_and_update(
                {"_id": self.name, "$or": [{"expires_at": {"$lte": now}}, {"owner": self.owner}]},
                {"$set": {"owner": self.owner, "expires_at": now + timedelta(seconds=self.ttl)}, "$inc": {"token": 1}},
                upsert=True, return_document=ReturnDocument.AFTER,
            )
        except DuplicateKeyError as exc:
            raise LeaseBusy("An ingestion job already owns the lease") from exc
        if not doc:
            raise LeaseBusy("An ingestion job already owns the lease")
        self.token = doc["token"]
        return self

    def _filter(self):
        return {"_id": self.name, "owner": self.owner, "token": self.token, "expires_at": {"$gt": self.now()}}

    def assert_owned(self):
        if self._lost or self.token is None or not self.collection.find_one(self._filter(), {"_id": 1}):
            raise LeaseLost("Ingestion ownership lost")

    def heartbeat(self):
        result = self.collection.update_one(self._filter(), {"$set": {"expires_at": self.now() + timedelta(seconds=self.ttl)}})
        if not result.matched_count:
            self._lost = True
            raise LeaseLost("Ingestion ownership lost")

    def _renew(self):
        while not self._stop.wait(self.ttl / 3):
            try:
                self.heartbeat()
            except Exception:
                self._lost = True
                return

    def __enter__(self):
        self.acquire()
        self._thread = threading.Thread(target=self._renew, daemon=True, name="ingestion-heartbeat")
        self._thread.start()
        return self

    def __exit__(self, *_):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2)
        self.collection.update_one({"_id": self.name, "owner": self.owner, "token": self.token}, {"$set": {"expires_at": self.now(), "owner": None}})

    def publish(self, callback):
        """Production publication fails closed unless replica-set transactions are enabled.

        The lease write and event mutation share a transaction, so a paused former
        owner cannot publish after takeover. Standalone development uses ownership
        checks and revision CAS, not a distributed transaction guarantee.
        """
        self.assert_owned()
        transactions = os.getenv("PHASE5_WRITE_TRANSACTIONS", "false").lower() == "true"
        production = os.getenv("ENVIRONMENT", "").lower() == "production" or os.getenv("RENDER", "").lower() == "true"
        if production and not transactions:
            raise RuntimeError("Production ingestion requires transactional publication")
        if not transactions:
            return callback(None)
        with self.collection.database.client.start_session() as session:
            def commit(active_session):
                result = self.collection.update_one(self._filter(), {"$inc": {"publications": 1}}, session=active_session)
                if not result.matched_count:
                    raise LeaseLost("Ingestion ownership lost")
                return callback(active_session)
            return session.with_transaction(commit, read_concern=ReadConcern("snapshot"),
                                            write_concern=WriteConcern("majority"), read_preference=ReadPreference.PRIMARY,
                                            max_commit_time_ms=10000)


@contextmanager
def ingestion_lease(database):
    with JobLease(database.job_leases) as lease:
        yield lease
