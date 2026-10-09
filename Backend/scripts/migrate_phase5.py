"""Report-only by default. Applying is restricted to an isolated restored database."""
import argparse
from copy import deepcopy
import json
import hashlib
import os
from pathlib import Path
import sys

from bson import BSON, ObjectId, json_util
from pymongo import MongoClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from event_normalization import canonical_url, normalize_observation
from ingestion import ensure_indexes, bump_generation, _identity_keys


def _digest(document):
    payload = {key: value for key, value in document.items() if key != "_phase5_migration_digest"}
    return hashlib.sha256(json_util.dumps(payload, sort_keys=True).encode()).hexdigest()


def migrate(database, *, apply=False, approved_aliases=None, rollback=False):
    if apply and not database.name.startswith(("phase0_restore_", "phase5_restore_")):
        raise ValueError("Apply requires an isolated restored database")
    collection = database.hackathons
    aliases = approved_aliases or {}
    report = {"documents": 0, "collisions": [], "uncertain_dates": [], "invalid_records": [], "changed": 0}
    identities = {}
    source_identities = {}
    plans = []
    for doc in collection.find({}):
        report["documents"] += 1
        if rollback:
            if doc.get("_phase5_backup"):
                if doc.get("_phase5_migration_digest") != _digest(doc):
                    raise ValueError("Rollback requires an unchanged migration clone; restore the backup instead")
                plans.append((doc, doc["_phase5_backup"]))
            continue
        if doc.get("schema_version") == 5:
            if doc.get("publication_state") != "suppressed":
                try:
                    identities[canonical_url(doc["link"])] = doc["_id"]
                except ValueError:
                    report["invalid_records"].append(str(doc["_id"]))
                for key in doc.get("_identity_keys", []):
                    if key.startswith("source:"):
                        source_identities[key] = doc["_id"]
            continue
        try:
            canonical = canonical_url(doc.get("link"))
        except (ValueError, UnicodeError):
            report["invalid_records"].append(str(doc["_id"]))
            continue
        if canonical in identities:
            report["collisions"].append([str(identities[canonical]), str(doc["_id"])])
        identities[canonical] = doc["_id"]
        trusted_date = doc.get("deadline_kind") == "registration" or str(doc.get("source", "")).lower().startswith(("community", "unique sources"))
        raw = deepcopy(doc)
        raw["deadline_kind"] = "registration" if trusted_date else "unknown"
        if not trusted_date and (doc.get("deadline_iso") or doc.get("deadline") not in (None, "", "TBA")):
            report["uncertain_dates"].append(str(doc["_id"]))
        try:
            normalized = normalize_observation(raw, authority=1)
        except ValueError:
            report["invalid_records"].append(str(doc["_id"]))
            continue
        updates = {key: value for key, value in normalized.items() if not key.startswith("_")}
        keys = _identity_keys(normalized)
        for key in keys:
            if key.startswith("source:"):
                if key in source_identities:
                    report["collisions"].append([str(source_identities[key]), str(doc["_id"])])
                source_identities[key] = doc["_id"]
        updates.update(schema_version=5, revision=doc.get("revision", 0), _identity_keys=keys)
        curated = str(doc.get("source", "")).lower().startswith(("community", "unique sources"))
        updates["_field_meta"] = {key: {"authority": 3 if curated else 1, "source": doc.get("source"), "observed_at": ""}
                                  for key in updates if not key.startswith("_")}
        updates["_phase5_backup"] = deepcopy(doc)
        plans.append((doc, updates))
    if apply:
        if report["invalid_records"]:
            raise ValueError("Invalid records must be corrected before applying")
        for pair in report["collisions"]:
            if aliases.get(pair[0], pair[0]) != aliases.get(pair[1], pair[1]):
                raise ValueError("Canonical collisions require an explicit alias mapping")
        for old, target in aliases.items():
            if old == target or not collection.find_one({"_id": ObjectId(old)}) or not collection.find_one({"_id": ObjectId(target)}):
                raise ValueError("Invalid reviewed alias")
            if target in aliases:
                raise ValueError("Alias chains are not permitted")
            old_doc = collection.find_one({"_id": ObjectId(old)})
            target_doc = collection.find_one({"_id": ObjectId(target)})
            original = old_doc.get("_phase5_backup", old_doc)
            old_keys = set(_identity_keys(normalize_observation(original)))
            target_keys = set(target_doc.get("_identity_keys", [])) | set(_identity_keys(normalize_observation(target_doc)))
            if not old_keys & target_keys:
                raise ValueError("Reviewed aliases must share a canonical URL or a known source identity")
            if old_doc.get("schema_version") == 5 and not database.event_aliases.find_one({"_id": ObjectId(old), "target_id": ObjectId(target)}):
                raise ValueError("Retain the already migrated record when resolving a collision")
            planned_target = next((updates for doc, updates in plans if str(doc["_id"]) == target), None)
            if planned_target is not None:
                planned_target["_identity_keys"] = list(dict.fromkeys(planned_target["_identity_keys"] + sorted(old_keys)))
                if len(planned_target["_identity_keys"]) > 100:
                    raise ValueError("Event identity history requires review")
            elif not old_keys <= target_keys:
                raise ValueError("Review the migrated target's identity history before adding this alias")
        # Validate every resulting BSON document before the first write.
        plans.sort(key=lambda plan: (plan[0].get("publication_state") == "suppressed") if rollback else (str(plan[0]["_id"]) not in aliases))
        for doc, updates in plans:
            if rollback:
                continue
            if str(doc["_id"]) in aliases:
                updates["publication_state"] = "suppressed"
                updates["link"] = "phase5-alias:" + str(doc["_id"])
                updates["_identity_keys"] = ["alias:" + str(doc["_id"])]
            merged = {**doc, **updates}
            updates["_phase5_migration_digest"] = _digest(merged)
            if len(BSON.encode({**merged, "_phase5_migration_digest": updates["_phase5_migration_digest"]})) > 16_000_000:
                raise ValueError("Record too large for reversible migration; review it first")
        for doc, updates in plans:
            if rollback:
                collection.replace_one({"_id": doc["_id"]}, updates)
                database.event_aliases.delete_one({"_id": doc["_id"]})
            else:
                if str(doc["_id"]) in aliases:
                    database.event_aliases.update_one({"_id": doc["_id"]}, {"$set": {"target_id": ObjectId(aliases[str(doc["_id"])])}}, upsert=True)
                collection.update_one({"_id": doc["_id"], "schema_version": {"$ne": 5}}, {"$set": updates})
            report["changed"] += 1
        if not rollback:
            ensure_indexes(database)
        bump_generation(database)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--rollback", action="store_true")
    parser.add_argument("--aliases", type=Path, help="Reviewed JSON mapping of old IDs to retained IDs")
    args = parser.parse_args()
    uri = os.getenv("STAGING_MONGO_URI")
    if not uri:
        parser.error("Set STAGING_MONGO_URI explicitly; credentials are never loaded from .env")
    with MongoClient(uri, serverSelectionTimeoutMS=5000) as client:
        report = migrate(client[args.database], apply=args.apply, rollback=args.rollback,
                         approved_aliases=json.loads(args.aliases.read_text(encoding="utf-8")) if args.aliases else None)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
