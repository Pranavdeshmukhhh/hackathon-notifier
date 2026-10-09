"""
run_scan.py — Standalone autonomous scanner and pipeline orchestrator.

Decoupled entry point for automated cron schedules (GitHub Actions / external cron).
Executes all scrapers concurrently, runs multi-signal verification and classification,
performs change detection and deduplication against MongoDB, records notification intents,
and stores telemetry metrics in MongoDB before cleanly exiting.

Usage:
    python -m Backend.run_scan
    python Backend/run_scan.py
    python run_scan.py --dry-run
"""

import argparse
import json
import logging
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

# Ensure Backend directory is in sys.path
_current_dir = Path(__file__).resolve().parent
if str(_current_dir) not in sys.path:
    sys.path.insert(0, str(_current_dir))
_parent_dir = _current_dir.parent
if str(_parent_dir) not in sys.path:
    sys.path.insert(0, str(_parent_dir))

# Load .env
load_dotenv(dotenv_path=_current_dir / ".env")

# ── Logging Configuration ─────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

logger = logging.getLogger("run_scan")

from db.mongo_client import get_collection
from filters.keyword_filter import classify_all
from scrapers.hackathon_verifier import batch_verify
from lifecycle import run_lifecycle_sweep


# ── Concurrent Scrapers Runner ────────────────────────────────────────────────

def run_all_scrapers(dry_run=False) -> tuple[list[dict], dict[str, dict]]:
    """
    Run all scrapers concurrently with ThreadPoolExecutor.
    One failing source will never stop the others.

    Returns:
        (combined_hackathons, source_stats)
    """
    from scrapers.source_runner import bounded_scrape
    def collect(module, function):
        return bounded_scrape(module, function, allow_enrichment=not dry_run)
    scrapers = {
        "Devfolio": lambda: collect("scrapers.devfolio_scraper", "scrape_devfolio"),
        "Unstop": lambda: collect("scrapers.unstop_scraper", "scrape_unstop"),
        "Devpost": lambda: collect("scrapers.devpost_scraper", "scrape_devpost"),
        "HackerEarth": lambda: collect("scrapers.hackerearth_scraper", "scrape_hackerearth"),
        "Devnovate": lambda: collect("scrapers.devnovate_scraper", "scrape_devnovate"),
        "InternetScanner": lambda: collect("scrapers.internet_scanner", "collect_keyword_events"),
        "Instagram": lambda: collect("scrapers.instagram_scraper", "scrape_instagram_hackathons"),
        "WebDiscovery": lambda: collect("scrapers.web_discovery_scraper", "run_web_discovery"),
    }
    combined: list[dict] = []
    source_stats: dict[str, dict] = {}

    with ThreadPoolExecutor(max_workers=8, thread_name_prefix="scan-worker") as pool:
        futures = {pool.submit(fn): name for name, fn in scrapers.items()}
        for future in as_completed(futures):
            name = futures[future]
            try:
                results = future.result()
                count = len(results)
                source_stats[name] = {
                    "found": count,
                    "status": getattr(results, "source_status", "ok" if count > 0 else "empty_unconfirmed"),
                    "error": None,
                }
                logger.info("✓ [%s] scraper returned %d hackathons.", name, count)
                structured = name in {"Devfolio", "Unstop", "Devpost", "HackerEarth", "Devnovate"}
                combined.extend({**item, "_source_authority": 2 if structured else 1} for item in results if isinstance(item, dict))
            except Exception as exc:
                err_msg = type(exc).__name__
                source_stats[name] = {
                    "found": 0,
                    "status": "error",
                    "error": err_msg,
                }
                logger.exception("✗ [%s] scraper raised unhandled exception: %s", name, err_msg)

    return combined, source_stats


def queue_health_warnings(database, summary, session=None):
    """Keep admin health alerts durable; scans never contact Telegram directly."""
    from notifier.telegram_bot import TELEGRAM_CHAT_ID
    import hashlib
    if not TELEGRAM_CHAT_ID:
        return
    kwargs = {"session": session} if session else {}
    past = list(database.scan_history.find({}, **kwargs).sort("timestamp", -1).limit(3))
    for source, info in summary["sources"].items():
        if info.get("status") in {"ok", "zero_results"}:
            continue
        states = [run.get("sources", {}).get(source, {}).get("status") for run in past]
        # Alert once at the third failure in each episode, not every scan.
        if len(states) < 2 or any(state not in {"error", "empty_unconfirmed"} for state in states[:2]):
            continue
        if len(states) == 3 and states[2] in {"error", "empty_unconfirmed"}:
            continue
        key = hashlib.sha256(f"health:{source}:{summary['run_at']}:{TELEGRAM_CHAT_ID}".encode()).hexdigest()
        database.notification_deliveries.update_one({"delivery_key": key}, {"$setOnInsert": {
            "delivery_key": key, "kind": "health", "source": source, "chat_id": str(TELEGRAM_CHAT_ID),
            "state": "pending", "attempts": 0, "created_at": datetime.now(timezone.utc), "next_attempt_at": datetime.now(timezone.utc),
        }}, upsert=True, **kwargs)

# ── Pipeline Execution ────────────────────────────────────────────────────────

def execute_scan(dry_run: bool = False, *, scraper_runner=None) -> dict:
    """Collect isolated observations, then publish under one renewable lease."""
    from db.job_leases import JobLease, LeaseBusy
    from ingestion import ensure_indexes, ingest_batch
    from contextlib import nullcontext

    start = time.monotonic()
    now = datetime.now(timezone.utc)
    collection = None if dry_run else get_collection("hackathons")
    if not dry_run and collection is None:
        return {"success": False, "status": "failed", "error": "Database unavailable"}
    database = collection.database if collection is not None else None
    scope = JobLease(database.job_leases) if database is not None else nullcontext(None)
    try:
        if database is not None:
            ensure_indexes(database)
        with scope as lease:
            raw, stats = scraper_runner() if scraper_runner else run_all_scrapers(dry_run=dry_run)
            # Verification remains deterministic and performs no additional URL requests.
            accepted = batch_verify(raw, check_url=False)
            classify_all(accepted)
            if dry_run:
                from event_normalization import normalize_observation
                new = updated = 0
                rejected = 0
                for item in accepted:
                    try:
                        normalize_observation(item, authority=2)
                        new += 1
                    except ValueError:
                        rejected += 1
            else:
                result = ingest_batch(collection, accepted, lease=lease, authority=2, notify=True)
                new, updated, rejected = result['new'], result['updated'], result['rejected']
                lease.assert_owned()
                # Maintenance retains records and performs no external fetches in the scan transaction.
                maintenance = {"archived": 0}
                from itertools import islice
                identifiers = (doc['_id'] for doc in collection.find({}, {'_id': 1}).batch_size(50))
                while batch_ids := list(islice(identifiers, 50)):
                    report = lease.publish(lambda session: run_lifecycle_sweep(collection, revalidate=False, session=session, ids=batch_ids))
                    maintenance['archived'] += report['archived']
            outcomes = [value.get('status') for value in stats.values()]
            status = 'success' if outcomes and all(v in ('ok', 'zero_results') for v in outcomes) and not rejected else 'partial' if new or updated or len(accepted) > rejected else 'failed'
            summary = {"success": status != 'failed', "status": status, "run_at": now.isoformat(), "timestamp": now.timestamp(),
                       "duration_s": round(time.monotonic() - start, 2), "scraped": len(raw), "accepted": len(accepted),
                       "new": new, "updated": updated, "rejected": rejected, "archived": maintenance["archived"] if not dry_run else 0, "purged": 0,
                       "notified": 0, "sources": stats, "dry_run": dry_run}
            if database is not None:
                def record_run(session):
                    queue_health_warnings(database, summary, session)
                    database.scan_history.insert_one(summary.copy(), **({'session': session} if session else {}))
                lease.publish(record_run)
        # Delivery is a separate durable role. A scan never calls Telegram directly.
        logger.info("RUN_SUMMARY %s", json.dumps(summary))
        return summary
    except LeaseBusy:
        return {"success": False, "status": "busy", "error": "A scan is already running"}
    except Exception:
        logger.exception("Scan failed")
        if database is not None:
            try:
                database.scan_history.insert_one({"success": False, "status": "failed", "run_at": now.isoformat(), "timestamp": now.timestamp(), "sources": {}, "error": "Scan failed"})
            except Exception:
                logger.error("Failed to record scan failure")
        return {"success": False, "status": "failed", "error": "Scan failed"}


def main():
    parser = argparse.ArgumentParser(description="Autonomous Hackathon Scanner CLI")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run scrapers without modifying MongoDB or dispatching Telegram notifications.",
    )
    args = parser.parse_args()

    summary = execute_scan(dry_run=args.dry_run)
    sys.exit(0 if summary.get("success", False) else 1)


if __name__ == "__main__":
    main()
