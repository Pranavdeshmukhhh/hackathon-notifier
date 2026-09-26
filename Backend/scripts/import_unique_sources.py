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

    for h in hackathons:
        link = h.get("link", "").strip()
        if not link:
            logger.warning("Skipping entry with no link: %s", h.get("title"))
            skipped += 1
            continue

        # Geocode offline events if lat/lng missing
        location = h.get("location", "")
        mode = h.get("mode", "").lower()
        if mode == "offline" and should_geocode(location) and (not h.get("lat") or not h.get("lng")):
            lat, lng = geocode(location)
            if lat and lng:
                h["lat"] = lat
                h["lng"] = lng
                geocoded += 1
                logger.info("Geocoded '%s' → (%s, %s)", location, lat, lng)
            else:
                logger.warning("Could not geocode: '%s'", location)

        # Add metadata and classification
        h["scraped_at"] = h.get("scraped_at") or now_iso
        h["source"] = h.get("source") or "Unique Sources"
        classify_hackathon(h)

        res = collection.update_one({"link": link}, {"$set": h}, upsert=True)
        if res.upserted_id:
            inserted += 1
            logger.info("Inserted: %s", h.get("title"))
        else:
            updated += 1
            logger.info("Updated existing: %s", h.get("title"))

    logger.info("Done! Inserted=%d  Updated=%d  Skipped=%d  Geocoded=%d", inserted, updated, skipped, geocoded)


if __name__ == "__main__":
    run()
