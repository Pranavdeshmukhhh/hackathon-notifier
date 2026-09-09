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
    skipped = 0
    geocoded = 0

    for h in hackathons:
        link = h.get("link", "").strip()
        if not link:
            logger.warning("Skipping entry with no link: %s", h.get("title"))
            skipped += 1
            continue

        # Check for duplicate
        existing = collection.find_one({"link": link})
        if existing:
            logger.info("Skipping duplicate: %s", h.get("title"))
            skipped += 1
            continue

        # Geocode offline events
        location = h.get("location", "")
        mode = h.get("mode", "").lower()
        if mode == "offline" and should_geocode(location):
            lat, lng = geocode(location)
            if lat and lng:
                h["lat"] = lat
                h["lng"] = lng
                geocoded += 1
                logger.info("Geocoded '%s' → (%s, %s)", location, lat, lng)
            else:
                logger.warning("Could not geocode: '%s'", location)

        # Add metadata
        h["scraped_at"] = now_iso
        h["source"] = "Unique Sources"

        collection.insert_one(h)
        inserted += 1
        logger.info("Inserted: %s", h.get("title"))

    logger.info("Done! Inserted=%d  Skipped(duplicates)=%d  Geocoded=%d", inserted, skipped, geocoded)


if __name__ == "__main__":
    run()
