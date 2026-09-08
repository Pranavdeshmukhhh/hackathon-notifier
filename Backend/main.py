"""
main.py — Hackathon Notification Bot orchestrator.

Pipeline:
  1. Connect to MongoDB
  2. Scrape Devfolio + Unstop CONCURRENTLY (ThreadPoolExecutor)
  3. Classify ALL results with college/internship metadata
  4. Dedup against DB, insert new entries (with metadata)
  5. Filter for notification-worthy items (top college / internship)
  6. Send Telegram batch notification for filtered items

Run manually:    python -m main          (from Backend/ directory)
Run as cron:     python Backend/main.py  (from project root)
"""

import logging
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pymongo.errors import DuplicateKeyError
from geopy.geocoders import Nominatim

from db.mongo_client import get_collection
from filters.keyword_filter import classify_all, filter_hackathons, is_duplicate
from notifier.telegram_bot import send_batch, start_polling
from scrapers.devfolio_scraper import scrape_devfolio
from scrapers.unstop_scraper import scrape_unstop
from scrapers.devpost_scraper import scrape_devpost
from scrapers.hackerearth_scraper import scrape_hackerearth

# ── Logging — configured ONCE here, all other modules use getLogger(__name__) ─
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
# Force UTF-8 on Windows so emoji / special chars don't crash the StreamHandler
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

logger = logging.getLogger(__name__)


# ── Scraping ──────────────────────────────────────────────────────────────────

def _run_scrapers() -> list[dict]:
    """
    Run all scrapers CONCURRENTLY.

    Sources:
      - Devfolio  (HTML scraping)
      - Unstop    (API + HTML fallback — may be blocked by Cloudflare)
      - Devpost   (free public JSON API — very reliable)
      - HackerEarth (Chrome extension events API — very reliable)
    """
    scrapers = {
        "Devfolio":     scrape_devfolio,
        "Unstop":       scrape_unstop,
        "Devpost":      scrape_devpost,
        "HackerEarth":  scrape_hackerearth,
    }
    combined: list[dict] = []

    with ThreadPoolExecutor(max_workers=4, thread_name_prefix="scraper") as pool:
        futures = {pool.submit(fn): name for name, fn in scrapers.items()}
        for future in as_completed(futures):
            name = futures[future]
            try:
                results = future.result()
                logger.info("%s returned %d hackathons.", name, len(results))
                combined.extend(results)
            except Exception:
                logger.exception("%s scraper raised an unhandled exception.", name)

    return combined


# ── Geocoding ─────────────────────────────────────────────────────────────────
import ssl
import geopy.geocoders
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
geopy.geocoders.options.default_ssl_context = ctx

geolocator = Nominatim(user_agent="hackathon-notifier")
_location_cache = {}

def _geocode_locations(hackathons: list[dict]):
    """
    Enriches hackathon dicts with lat/lng by geocoding the 'location' field.
    Obeys Nominatim 1 request/sec rate limit.
    """
    logger.info("Geocoding %d hackathons...", len(hackathons))
    count_new = 0
    for h in hackathons:
        loc = h.get("location")
        if not loc or h.get("mode", "").lower() == "online":
            continue
        
        # Unstop usually provides "City, State". Geocoding just the city often works better.
        query = str(loc).split(",")[0].strip()
        if not query:
            continue
            
        if query in _location_cache:
            coords = _location_cache[query]
            if coords:
                h["lat"] = coords[0]
                h["lng"] = coords[1]
            continue
            
        try:
            logger.info("Geocoding new location: %s", query)
            geo = geolocator.geocode(query, timeout=10)
            if geo:
                _location_cache[query] = (geo.latitude, geo.longitude)
                h["lat"] = geo.latitude
                h["lng"] = geo.longitude
            else:
                _location_cache[query] = None
            count_new += 1
            time.sleep(1.1)  # Strictly obey rate limits
        except Exception as e:
            logger.error("Geocoding failed for %s: %s", query, e)
            _location_cache[query] = None
            time.sleep(1.1)
    
    logger.info("Geocoded %d new unique locations.", count_new)


# ── Pipeline ──────────────────────────────────────────────────────────────────

def run_pipeline() -> int:
    logger.info("=" * 60)
    logger.info("Hackathon Notification Bot starting…")
    logger.info("=" * 60)

    # ── Step 1: DB connection ─────────────────────────────────────────────────
    collection = get_collection()
    if collection is None:
        logger.error("Cannot connect to MongoDB — aborting.")
        return 0

    # ── Step 2: Concurrent scraping ───────────────────────────────────────────
    logger.info("Launching scrapers concurrently…")
    all_hackathons = _run_scrapers()

    if not all_hackathons:
        logger.info("No hackathons scraped from any source.")
        return 0

    logger.info("Total scraped (before classification): %d", len(all_hackathons))

    # ── Step 2.5: Geocode Locations ───────────────────────────────────────────
    _geocode_locations(all_hackathons)

    # ── Step 3: Classify ALL hackathons with metadata ─────────────────────────
    classify_all(all_hackathons)

    # ── Step 4: Dedup + DB insert (all classified hackathons go into DB) ──────
    new_hackathons: list[dict] = []
    for hackathon in all_hackathons:
        link = hackathon.get("link", "")

        if is_duplicate(link, collection):
            continue    # Already seen — skip silently

        try:
            collection.insert_one(hackathon)
            new_hackathons.append(hackathon)
            logger.info("New: %s", hackathon.get("title", link))
        except DuplicateKeyError:
            # Race condition: another run inserted it between check and insert
            logger.debug("Race-condition duplicate skipped: %s", link)
        except Exception:
            logger.exception("DB insert failed for: %s", link)

    # ── Step 5: Filter new hackathons for notification-worthy items ────────────
    notify_list = [
        h for h in new_hackathons
        if h.get("is_top_college") or h.get("is_internship")
    ]

    logger.info(
        "New hackathons: %d total, %d notification-worthy (top_college/internship).",
        len(new_hackathons), len(notify_list),
    )

    # ── Step 6: Telegram notifications ────────────────────────────────────────
    sent_count = 0
    if notify_list:
        logger.info("Sending %d Telegram notification(s)…", len(notify_list))
        result = send_batch(notify_list)
        sent_count = result["sent"]
        logger.info(
            "Notifications: %d sent, %d failed.",
            sent_count, result["failed"],
        )
    else:
        logger.info("No notification-worthy hackathons — all up-to-date.")

    logger.info("Pipeline run complete.")
    return sent_count


def main():
    logger.info("Starting background services...")
    
    # Start Telegram bot polling in a daemon thread
    polling_thread = threading.Thread(target=start_polling, daemon=True)
    polling_thread.start()
    
    logger.info("Entering scheduled scraping loop (runs every 4 hours)...")
    while True:
        try:
            logger.info("Running scheduled scrape pipeline...")
            run_pipeline()
        except Exception as e:
            logger.exception("Scraping pipeline failed (e.g. no internet). Will retry next cycle.")
        
        # Wait 5 minutes
        logger.info("Sleeping for 5 minutes...")
        time.sleep(5 * 60)


if __name__ == "__main__":
    main()
