"""One write boundary for scans, imports and administrator submissions."""
from copy import deepcopy
import json
import os

from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from event_normalization import lifecycle_values, normalize_observation

PRIVATE_FIELDS = {"_source_event_id", "_authority", "_observed_at"}
IGNORED_CHANGE_FIELDS = {"source", "scraped_at", "verification_confidence", "verified", "discovery_source", "source_account", "instagram_post_url"}


def ensure_indexes(database):
    """Run deliberately during migration/startup, never as part of a public GET."""
    production = os.getenv("ENVIRONMENT", "").lower() == "production" or os.getenv("RENDER", "").lower() == "true"
    if production and database.hackathons.find_one({"schema_version": {"$ne": 5}}, {"_id": 1}):
        raise RuntimeError("Migrate and review a restored clone before enabling production writes")
    database.hackathons.create_index("link", unique=True)
    database.hackathons.create_index("_identity_keys", unique=True, partialFilterExpression={"_identity_keys": {"$exists": True}})
    database.notification_deliveries.create_index("delivery_key", unique=True)
    database.notification_deliveries.create_index([("state", 1), ("next_attempt_at", 1)])
    database.scan_history.create_index([("timestamp", -1)])
    database.event_aliases.create_index("target_id")
    database.subscribers.create_index("chat_id", unique=True)


def _identity_keys(observation):
    keys = ["url:" + observation["link"]]
    if observation.get("_source_event_id") and observation.get("source"):
        keys.insert(0, "source:" + json.dumps([observation["source"].lower(), observation["_source_event_id"]], separators=(",", ":")))
    return keys


def bump_generation(database, session=None):
    kwargs = {"session": session} if session else {}
    database.dataset_state.update_one({"_id": "events"}, {"$inc": {"generation": 1}}, upsert=True, **kwargs)


def resolve_event(collection, event_id, projection=None):
    try:
        key = ObjectId(event_id)
    except Exception:
        return None
    alias = collection.database.event_aliases.find_one({"_id": key})
    target = alias.get("target_id") if alias else key
    return collection.find_one({"_id": {"$in": [target, str(target)]}}, projection)


class IngestionService:
    def __init__(self, collection, *, lease=None, notify=False):
        self.collection = collection
        self.lease = lease
        self.notify = notify

    def ingest(self, raw, *, authority=1, protected_fields=(), clear_fields=(), observed_at=None, field_authorities=None):
        observation = normalize_observation(raw, authority=authority, observed_at=observed_at)
        observation["_field_authorities"] = field_authorities or {}
        if self.lease:
            return self.lease.publish(lambda session: self._write(observation, protected_fields, clear_fields, session))
        raise RuntimeError("Ingestion requires an ownership lease")

    def _write(self, observation, protected_fields, clear_fields, session):
        kwargs = {"session": session} if session else {}
        keys = _identity_keys(observation)
        collection = self.collection
        # Identity conflicts are reported, never resolved by title or silently merged.
        matches = list(collection.find({"$or": [{"_identity_keys": {"$in": keys}}, {"link": observation["link"]}]}, **kwargs).limit(3))
        if len(matches) > 1:
            raise ValueError("Conflicting event identities require review")
        existing = matches[0] if matches else None
        timestamp = observation["_observed_at"]
        for _ in range(5):
            saved = deepcopy(existing) if existing else {"_id": ObjectId(), "created_at": timestamp, "revision": 0, "notified": False}
            metadata = saved.setdefault("_field_meta", {})
            protected = set(saved.get("_protected_fields", []))
            conflicts = saved.get("_conflicts", [])
            changed = {}
            for field, value in observation.items():
                if field == "deadline_kind" and (observation.get("registration_deadline") or {}).get("precision") == "unknown" and (saved.get("registration_deadline") or {}).get("precision") in {"date", "timestamp"}:
                    continue
                if field.startswith("_") or value is None or value == "TBA" or value == []:
                    continue
                if field == "registration_deadline" and value.get("precision") == "unknown":
                    continue
                previous = metadata.get(field, {"authority": 1, "observed_at": saved.get("updated_at", "")})
                field_authority = observation["_field_authorities"].get(field, observation["_authority"])
                differs = saved.get(field) != value
                eligible = field not in protected or field in protected_fields
                eligible = eligible and (field_authority > previous["authority"] or (field_authority == previous["authority"] and timestamp >= previous.get("observed_at", "")))
                # Closure is explicit evidence. A future date alone never reopens it.
                if field == "status" and str(saved.get("status", "")).lower() in {"cancelled", "canceled", "closed", "ended", "finished", "completed"}:
                    eligible = eligible and (str(value).lower() in {"cancelled", "canceled", "closed", "ended", "finished", "completed"} or field_authority >= 3 and field in protected_fields)
                if differs and not eligible:
                    conflicts.append({"field": field, "source": observation.get("source"), "observed_at": timestamp})
                if eligible:
                    if differs:
                        changed[field] = (saved.get(field), value)
                    saved[field] = value
                    metadata[field] = {"authority": field_authority, "source": observation.get("source"), "observed_at": timestamp}
            for field in clear_fields:
                if observation["_authority"] >= 3 or observation["_field_authorities"].get(field) == 3:
                    if field in {"organizer", "eligibility", "prize", "location", "venue", "city", "mode", "min_team_size", "max_team_size", "deadline_iso", "registration_deadline"}:
                        changed[field] = (saved.get(field), None)
                        saved[field] = None
                        metadata[field] = {"authority": 3, "source": observation.get("source"), "observed_at": timestamp}
                        if field in {"deadline_iso", "registration_deadline"}:
                            cleared = {"deadline": "TBA", "deadline_iso": None, "deadline_kind": "unknown",
                                       "registration_deadline": {"date": None, "at": None, "precision": "unknown", "raw": None}}
                            for date_field, empty_value in cleared.items():
                                changed[date_field] = (saved.get(date_field), empty_value)
                                saved[date_field] = empty_value
                                metadata[date_field] = {"authority": 3, "source": observation.get("source"), "observed_at": timestamp}
            protected.update(set(protected_fields) & set(observation))
            saved["_protected_fields"] = sorted(protected)
            saved["_conflicts"] = conflicts[-30:]
            saved["_identity_keys"] = list(dict.fromkeys(saved.get("_identity_keys", []) + keys))
            if len(saved["_identity_keys"]) > 100:
                raise ValueError("Event identity history requires review")
            saved["last_seen_at"] = max(timestamp, saved.get("last_seen_at", ""))
            saved["scraped_at"] = saved["last_seen_at"]
            saved.setdefault("deadline", "TBA")
            saved.setdefault("deadline_iso", None)
            previous_lifecycle = {key: saved.get(key) for key in ("registration_state", "publication_state", "is_past", "archived")}
            saved.update(lifecycle_values(saved))
            for field, previous_value in previous_lifecycle.items():
                if previous_value != saved[field]:
                    changed[field] = (previous_value, saved[field])
            meaningful = {key: pair for key, pair in changed.items() if key not in IGNORED_CHANGE_FIELDS}
            revision = int(saved.get("revision", 0)) + (1 if meaningful or not existing else 0)
            saved["revision"] = revision
            if meaningful or not existing:
                saved["updated_at"] = timestamp
            new_intent = None
            if self.notify and saved["publication_state"] == "published" and not saved["is_past"] and (saved.get("is_top_college") or saved.get("is_internship")):
                kind = "new" if not existing else "deadline" if "deadline_iso" in meaningful else None
                if kind:
                    intents = saved.get("_notification_intents", [])
                    if len(intents) >= 50:
                        raise RuntimeError("Pending notification intents require reconciliation")
                    new_intent = {"key": f"{saved['_id']}:{kind}:{revision}", "kind": kind, "revision": revision, "created_at": timestamp,
                                  "event": {key: saved.get(key) for key in ("title", "link", "deadline", "deadline_iso", "source", "mode", "location", "prize", "tags", "is_top_college", "is_internship")}}
                    intents.append(new_intent)
                    saved["_notification_intents"] = intents
            if self.lease:
                saved["_lease_token"] = self.lease.token
            try:
                if existing:
                    query = {"_id": existing["_id"]}
                    query["revision"] = existing["revision"] if "revision" in existing else {"$exists": False}
                    if "_field_meta" in existing:
                        query["_field_meta"] = existing["_field_meta"]
                    # Delivery owns these fields. Never resurrect a pulled intent or
                    # overwrite a successful send from our earlier event snapshot.
                    update = {key: value for key, value in saved.items() if key not in {"_id", "_notification_intents", "notified", "notified_at", "_phase5_backup"}}
                    mutation = {"$set": update}
                    if new_intent:
                        mutation["$push"] = {"_notification_intents": new_intent}
                    if collection.update_one(query, mutation, **kwargs).matched_count:
                        if meaningful:
                            bump_generation(collection.database, session)
                        return {"data": saved, "is_new": False, "changed": meaningful}
                else:
                    collection.insert_one(saved, **kwargs)
                    bump_generation(collection.database, session)
                    return {"data": saved, "is_new": True, "changed": meaningful}
            except DuplicateKeyError:
                pass
            existing = collection.find_one({"$or": [{"_identity_keys": {"$in": keys}}, {"link": observation["link"]}]}, **kwargs)
        raise RuntimeError("Event changed concurrently; retry ingestion")


def ingest_batch(collection, items, *, lease, authority=1, notify=False):
    service = IngestionService(collection, lease=lease, notify=notify)
    results = []
    rejected = 0
    for item in items:
        try:
            source_authority = item.get("_source_authority", authority) if isinstance(item, dict) else authority
            results.append(service.ingest(item, authority=min(authority, source_authority)))
        except ValueError:
            rejected += 1
    return {"results": results, "new": sum(r["is_new"] for r in results), "updated": sum(bool(r["changed"]) for r in results if not r["is_new"]), "rejected": rejected}
