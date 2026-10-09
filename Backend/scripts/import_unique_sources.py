"""
import_unique_sources.py — Import curated hackathons from data/unique_sources.json into MongoDB.

Run once from the Backend/ directory:
    python scripts/import_unique_sources.py

- Skips duplicates (matched by link URL)
- Geocodes offline events automatically
- Tags all entries with source="Unique Sources"
"""

import json
import logging
import sys
import os
from datetime import datetime, timezone
from pathlib import Path

# Add Backend root to path so we can import db and scrapers
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from db.mongo_client import get_collection
from scrapers.geocoder import geocode
from filters.keyword_filter import classify_hackathon

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "unique_sources.json"

SKIP_LOCATION_TERMS = {"online", "virtual", "remote", "tba", "multiple cities, india"}


def should_geocode(location: str) -> bool:
    if not location:
        return False
    return location.lower().strip() not in SKIP_LOCATION_TERMS


def run():
    logger.info("Loading curated hackathons from %s", DATA_FILE)
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        hackathons = json.load(f)

    collection = get_collection()
    now_iso = datetime.now(timezone.utc).isoformat()

    inserted = 0
    updated = 0
    skipped = 0
    geocoded = 0

    from ingestion import ensure_indexes, ingest_batch
    from db.job_leases import JobLease
    if collection is None:
        raise RuntimeError('Database unavailable')
    ensure_indexes(collection.database)
    for h in hackathons:
        h['source'] = h.get('source') or 'Unique Sources'
        h['deadline_kind'] = 'registration'
        classify_hackathon(h)
    with JobLease(collection.database.job_leases) as lease:
        result = ingest_batch(collection, hackathons, lease=lease, authority=3)
    inserted, updated, skipped = result['new'], result['updated'], result['rejected']

    logger.info("Done! Inserted=%d  Updated=%d  Skipped=%d  Geocoded=%d", inserted, updated, skipped, geocoded)


if __name__ == "__main__":
    run()
