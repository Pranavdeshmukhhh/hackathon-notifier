"""Read-only BSON export and isolated restore tools; never logs credentials."""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sys

from bson import BSON, decode_file_iter, json_util
from dotenv import load_dotenv
from pymongo import MongoClient

ROOT = Path(__file__).resolve().parents[2]


def export_database(database, output: Path) -> dict:
    output.mkdir(parents=True, exist_ok=False)
    manifest = {"database": database.name, "created_at": datetime.now(timezone.utc).isoformat(),
                "consistency": "Logical export; pause writers for a consistent recovery point", "collections": []}
    for index, info in enumerate(database.list_collections()):
        if info.get("type") == "view":
            raise RuntimeError("Views require a database-native snapshot")
        name = info["name"]
        filename = f"collection-{index:04d}.bson"
        count = 0
        digest = hashlib.sha256()
        with (output / filename).open("xb") as handle:
            for doc in database[name].find({}).batch_size(250):
                encoded = BSON.encode(doc)
                handle.write(encoded)
                digest.update(encoded)
                count += 1
        manifest["collections"].append({"name": name, "file": filename, "count": count,
            "sha256": digest.hexdigest(), "options": info.get("options", {}),
            "indexes": list(database[name].list_indexes())})
    (output / "manifest.json").write_text(json_util.dumps(manifest, indent=2), encoding="utf-8")
    verify_backup(output)
    return manifest


def verify_backup(output: Path) -> dict:
    manifest = json_util.loads((output / "manifest.json").read_text(encoding="utf-8"))
    for entry in manifest["collections"]:
        path = output / entry["file"]
        if path.resolve().parent != output.resolve() or path.suffix != ".bson":
            raise ValueError("Invalid backup path")
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(65_536), b""):
                digest.update(chunk)
        if digest.hexdigest() != entry["sha256"]:
            raise ValueError("Backup checksum mismatch")
        with path.open("rb") as handle:
            if sum(1 for _ in decode_file_iter(handle)) != entry["count"]:
                raise ValueError("Backup document count mismatch")
    return manifest


def restore_database(database, output: Path) -> None:
    """Only restore into a new, empty database with the explicit recovery prefix."""
    if not database.name.startswith("phase0_restore_") or database.list_collection_names():
        raise ValueError("Restore requires an empty phase0_restore_ database")
    manifest = verify_backup(output)
    for entry in manifest["collections"]:
        collection = database.create_collection(entry["name"], **entry.get("options", {}))
        with (output / entry["file"]).open("rb") as handle:
            batch = []
            for doc in decode_file_iter(handle):
                batch.append(doc)
                if len(batch) == 250:
                    collection.insert_many(batch)
                    batch = []
            if batch:
                collection.insert_many(batch)
        for specification in entry["indexes"]:
            if specification["name"] != "_id_":
                options = {key: value for key, value in specification.items() if key not in {"key", "v", "ns"}}
                collection.create_index(list(specification["key"].items()), **options)
        if collection.count_documents({}) != entry["count"]:
            raise ValueError("Restore document count mismatch")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("export", "verify", "restore"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--database", default="hackathon_tracker")
    args = parser.parse_args()
    load_dotenv(ROOT / "Backend" / ".env")
    try:
        if args.action == "verify":
            manifest = verify_backup(args.output)
        else:
            variable = "STAGING_MONGO_URI" if args.action == "restore" else "MONGO_URI"
            uri = os.getenv(variable, "")
            if not uri:
                raise ValueError(f"{variable} is not configured")
            with MongoClient(uri, serverSelectionTimeoutMS=5000, connectTimeoutMS=5000, socketTimeoutMS=10000) as client:
                if args.action == "export":
                    manifest = export_database(client[args.database], args.output)
                else:
                    restore_database(client[args.database], args.output)
                    manifest = verify_backup(args.output)
        print(json.dumps({"action": args.action, "success": True,
                          "collections": len(manifest["collections"]),
                          "documents": sum(entry["count"] for entry in manifest["collections"])}))
        return 0
    except Exception as exc:
        print(f"Backup operation failed ({type(exc).__name__}); no credentials are printed.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
