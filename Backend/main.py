"""
main.py — Hackathon Notification Bot orchestrator.

Pipeline:
  1. Connect to MongoDB
  2. Scrape Devfolio + Unstop + Devpost + HackerEarth + Devnovate CONCURRENTLY
  3. Classify ALL results with college/internship metadata
  4. Dedup against DB, insert new entries
  5. Filter for notification-worthy items (top college / internship)
  6. Send Telegram batch notification for filtered items

Usage:
  python -m main              # full run — scrape, insert, notify
  python -m main --dry-run    # scrape only — no DB writes, no Telegram

As a Render cron job / GitHub Actions schedule:
  This script runs ONCE and exits. The scheduler (Render or GH Actions)
  is responsible for re-triggering it on a schedule (e.g. every 4 hours).
  This is intentionally NOT a long-running daemon — a one-shot script is
  easier to debug, restart, and reason about at this scale.
"""

import argparse
import json
import logging
import sys
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
from scrapers.devnovate_scraper import scrape_devnovate

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

def _run_scrapers() -> dict:
    """
    Run all scrapers CONCURRENTLY via ThreadPoolExecutor.

    Returns:
        A dict with 'results' (combined list) and 'counts' (per-source dict).
        This separation lets run_pipeline() log exactly how many hackathons
        each source contributed to the RUN_SUMMARY line.
    """
    scrapers = {
        "Devfolio":     scrape_devfolio,
        "Unstop":       scrape_unstop,
        "Devpost":      scrape_devpost,
        "HackerEarth":  scrape_hackerearth,
        "Devnovate":    scrape_devnovate,
    }
    combined: list[dict] = []
    counts: dict[str, int] = {}

    with ThreadPoolExecutor(max_workers=5, thread_name_prefix="scraper") as pool:
        futures = {pool.submit(fn): name for name, fn in scrapers.items()}
        for future in as_completed(futures):
            name = futures[future]
            try:
                results = future.result()
                n = len(results)
                counts[name] = n
                logger.info("%s returned %d hackathons.", name, n)
                combined.extend(results)
            except Exception:
                counts[name] = 0
                logger.exception("%s scraper raised an unhandled exception.", name)

    return {"results": combined, "counts": counts}


# ── Geocoding ─────────────────────────────────────────────────────────────────
import ssl
import certifi
import geopy.geocoders

try:
    ctx = ssl.create_default_context(cafile=certifi.where())
    geopy.geocoders.options.default_ssl_context = ctx
except Exception:
    ctx = ssl.create_default_context()
    geopy.geocoders.options.default_ssl_context = ctx

geolocator = Nominatim(user_agent="hackathon-notifier/1.0")
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

def run_pipeline(dry_run: bool = False) -> int:
    """Run the full scrape → classify → dedup → notify pipeline.

    Args:
        dry_run: If True, skip DB writes and Telegram sends. Useful for
                 testing scraper output without side effects.

    Returns:
        Number of Telegram notifications sent (0 on dry run or no new items).
    """
    t0 = time.time()  # for RUN_SUMMARY duration

    logger.info("=" * 60)
    logger.info("Hackathon pipeline starting%s…", " (DRY RUN)" if dry_run else "")
    logger.info("=" * 60)

    # ── Step 1: DB connection ─────────────────────────────────────────────────
    collection = None if dry_run else get_collection()
    if not dry_run and collection is None:
        logger.error("Cannot connect to MongoDB — aborting.")
        return 0

    # ── Step 2: Concurrent scraping ───────────────────────────────────────────
    logger.info("Launching scrapers concurrently…")
    scrape_output = _run_scrapers()
    all_hackathons = scrape_output["results"]
    source_counts  = scrape_output["counts"]

    if not all_hackathons:
        logger.info("No hackathons scraped from any source.")
        return 0

    logger.info("Total scraped (before classification): %d", len(all_hackathons))

    # ── Step 2.5: Geocode Locations ───────────────────────────────────────────
    if not dry_run:
        _geocode_locations(all_hackathons)

    # ── Step 3: Classify ALL hackathons with metadata ─────────────────────────
    classify_all(all_hackathons)

    # ── Step 4: Dedup + DB insert ─────────────────────────────────────────────
    new_hackathons: list[dict] = []
    if dry_run:
        # In dry-run, treat everything as "new" for reporting but don't insert
        new_hackathons = all_hackathons
        logger.info("[DRY RUN] Skipping DB insert — would have inserted %d items.", len(new_hackathons))
    else:
        for hackathon in all_hackathons:
            link = hackathon.get("link", "")
            if is_duplicate(link, collection):
                continue
            try:
                collection.insert_one(hackathon)
                new_hackathons.append(hackathon)
                logger.info("New: %s", hackathon.get("title", link))
            except DuplicateKeyError:
                logger.debug("Race-condition duplicate skipped: %s", link)
            except Exception:
                logger.exception("DB insert failed for: %s", link)

    # ── Step 5: Filter for notification-worthy items ──────────────────────────
    notify_list = [
        h for h in new_hackathons
        if h.get("is_top_college") or h.get("is_internship")
    ]

    logger.info(
        "New hackathons: %d total, %d notification-worthy.",
        len(new_hackathons), len(notify_list),
    )

    # ── Step 6: Telegram notifications ───────────────────────────────────────
    sent_count = 0
    if notify_list and not dry_run:
        logger.info("Sending %d Telegram notification(s)…", len(notify_list))
        result = send_batch(notify_list)
        sent_count = result["sent"]
        logger.info("Notifications: %d sent, %d failed.", sent_count, result["failed"])
    elif dry_run and notify_list:
        logger.info("[DRY RUN] Would have sent %d Telegram notification(s).", len(notify_list))
    else:
        logger.info("No notification-worthy hackathons — all up-to-date.")

    # ── Structured run summary (one grep-able JSON line per run) ─────────────
    # To extract a history table from Render logs:
    #   grep 'RUN_SUMMARY' app.log | python -c \
    #   "import sys,json;[print(l.split('RUN_SUMMARY')[1]) for l in sys.stdin]"
    duration = round(time.time() - t0, 1)
    logger.info("RUN_SUMMARY %s", json.dumps({
        "dry_run":    dry_run,
        "scraped":    len(all_hackathons),
        "new":        len(new_hackathons),
        "notified":   sent_count,
        "duration_s": duration,
        "sources":    source_counts,
    }))

    logger.info("Pipeline complete in %.1fs.", duration)
    return sent_count


def main():
    """Entry point: parse args and run the pipeline once.

    Design decision: this is a ONE-SHOT script, not a daemon.
    The scheduler (Render Cron Job, GitHub Actions `schedule`, or a simple
    cron on any Linux host) is responsible for re-running it periodically.

    Why not a while loop?
    - A process that runs once and exits is easier to restart after a crash.
    - Memory leaks can't accumulate over days of uptime.
    - The Telegram polling bot runs as a SEPARATE always-on service (see
      unified_server.py / Procfile). Mixing scraping + polling in one loop
      means one crash takes down both.
    """
    parser = argparse.ArgumentParser(description="Hackathon scraper pipeline")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Scrape only: no DB writes, no Telegram sends. Safe for testing.",
    )
    args = parser.parse_args()

    sent = run_pipeline(dry_run=args.dry_run)
    sys.exit(0 if sent >= 0 else 1)


if __name__ == "__main__":
    main()
