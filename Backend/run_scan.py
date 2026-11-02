"""
run_scan.py — Standalone autonomous scanner and pipeline orchestrator.

Decoupled entry point for automated cron schedules (GitHub Actions / external cron).
Executes all scrapers concurrently, runs multi-signal verification and classification,
performs change detection and deduplication against MongoDB, sends Telegram notifications,
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
from notifier.telegram_bot import send_batch, send_deadline_update, send_warning_alert
from scrapers.devfolio_scraper import scrape_devfolio
from scrapers.unstop_scraper import scrape_unstop
from scrapers.devpost_scraper import scrape_devpost
from scrapers.hackerearth_scraper import scrape_hackerearth
from scrapers.devnovate_scraper import scrape_devnovate
from scrapers.internet_scanner import scan_single_keyword
from scrapers.instagram_scraper import scrape_instagram_hackathons
from scrapers.web_discovery_scraper import run_web_discovery
from scrapers.hackathon_verifier import batch_verify
from lifecycle import (
    drop_expired,
    filter_dead_links,
    normalize_deadline,
    run_lifecycle_sweep,
)


# ── Concurrent Scrapers Runner ────────────────────────────────────────────────

def _scan_keywords(scanner):
    items=[]
    for keyword in ['iit','iiit','pune','hyderabad','faang']:
        items.extend(scanner(keyword))
    return items


def _source_context():
    import multiprocessing
    return multiprocessing.get_context('spawn')


def run_all_scrapers() -> tuple[list[dict], dict[str, dict]]:
    from functools import partial
    from source_ingestion import CallableSourceAdapter, run_sources
    sources=[('devfolio','Devfolio',scrape_devfolio),('unstop','Unstop',scrape_unstop),
        ('devpost','Devpost',scrape_devpost),('hackerearth','HackerEarth',scrape_hackerearth),
        ('devnovate','Devnovate',scrape_devnovate),('internet_scanner','InternetScanner',partial(_scan_keywords,scan_single_keyword)),
        ('instagram','Instagram',scrape_instagram_hackathons),('web_discovery','WebDiscovery',run_web_discovery)]
    return run_sources([CallableSourceAdapter(*entry) for entry in sources],context=_source_context())


# ── Health & Consecutive Failure Monitor ──────────────────────────────────────

def check_consecutive_failures(history_col, current_stats: dict[str, dict], dry_run: bool = False):
    """
    Check if any source has failed 3 runs in a row.
    Dispatches a Telegram warning alert if detected.
    """
    if dry_run or history_col is None:
        return

    try:
        past_runs = list(history_col.find(
            {"sources": {"$exists": True}},
            {"sources": 1, "run_at": 1}
        ).sort("timestamp", -1).limit(100))
        unique_runs = []
        seen = set()
        for run in past_runs:
            identity = run.get("run_at") or str(run["_id"])
            if identity not in seen:
                seen.add(identity)
                unique_runs.append(run)
            if len(unique_runs) == 2:
                break
        past_runs = unique_runs

        # Combine with current run to analyze last 3 consecutive runs
        runs_to_check = [{"sources": current_stats}] + past_runs
        if len(runs_to_check) < 3:
            return  # Need at least 3 runs of history

        consecutive_bad = []
        for source in current_stats:
            bad_count = 0
            latest_err = None
            for run in runs_to_check:
                s_stat = run.get("sources", {}).get(source, {})
                found = s_stat.get("found", 0)
                status = s_stat.get("status", "error")
                if status not in {"ok", "zero_results", "cancelled"}:
                    bad_count += 1
                    if s_stat.get("error"):
                        latest_err = s_stat.get("error")
                else:
                    break

            if bad_count >= 3:
                consecutive_bad.append((source, latest_err or "0 results returned"))

        if consecutive_bad:
            warning_lines = [
                "⚠️ <b>Scraper Health Warning</b>",
                "The following sources reported errors for 3 consecutive runs:\n",
            ]
            for src, err in consecutive_bad:
                warning_lines.append(f"• <b>{src}</b>: <code>{err[:100]}</code>")
            warning_lines.append(f"\n⏰ Timestamp: <code>{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}</code>")

            msg = "\n".join(warning_lines)
            logger.warning("Consecutive scraper failures detected: %s", consecutive_bad)
            send_warning_alert(msg)

    except Exception as e:
        logger.error("Failed to check consecutive scraper failures: %s", e)


def _save_summary(history_collection, summary, source_stats, dry_run):
    if dry_run:
        return
    try:
        if history_collection is None:
            raise RuntimeError("Scan history unavailable")
        check_consecutive_failures(history_collection, source_stats)
        history_collection.insert_one(summary.copy())
    except Exception:
        summary["success"] = False
        summary["error"] = "Scan telemetry could not be persisted"
        logger.exception("Failed to save run telemetry into scan_history")


# ── Pipeline Execution ────────────────────────────────────────────────────────

def dispatch_pending_notifications(collection):
    """Bounded recovery includes events committed just before an earlier crash."""
    try:
        backlog = list(collection.find({'notified': {'$ne': True}, 'publication_state': 'published',
            '$or': [{'is_top_college': True}, {'is_internship': True}]}).
            sort([('notification_checked_at', 1), ('_id', 1)]).limit(100))
        result = send_batch(backlog)  # Also drains existing intents when backlog is empty.
        if backlog:
            collection.update_many({'_id': {'$in': [h['_id'] for h in backlog]}},
                                   {'$set': {'notification_checked_at': datetime.now(timezone.utc)}})
        confirmed = set(result.get('fully_sent_links', []))
        incomplete = sum(h.get('link') not in confirmed for h in backlog)
        return result.get('sent', 0), incomplete + result.get('errors', 0) + result.get('pending', 0)
    except Exception as exc:
        logger.error('Notification recovery unavailable (%s)', type(exc).__name__)
        return 0, 1


def execute_scan(dry_run: bool = False) -> dict:
    """
    Execute the standalone scan, deduplication, update, and notification pipeline.

    Returns:
        dict: Execution summary telemetry
    """
    t0 = time.time()
    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.replace(tzinfo=None).isoformat() + "Z"
    today_iso = now_utc.strftime("%Y-%m-%d")

    logger.info("=" * 60)
    logger.info("Autonomous scan engine starting%s...", " (DRY RUN)" if dry_run else "")
    logger.info("=" * 60)

    # 1. DB connection
    collection = None if dry_run else get_collection("hackathons")
    history_collection = None if dry_run else get_collection("scan_history")

    if not dry_run and collection is None:
        logger.error("Cannot connect to MongoDB — aborting scan run.")
        return {"success": False, "error": "MongoDB unavailable"}

    # 2. Concurrently run all scrapers
    raw_hackathons, source_stats = run_all_scrapers()
    logger.info("Total raw hackathons collected: %d", len(raw_hackathons))

    sources_ok = bool(source_stats) and all(report.get('status') in {'ok','zero_results'} for report in source_stats.values())
    from source_ingestion import source_freshness
    history=[]
    if history_collection is not None:
        try:history=list(history_collection.find({'sources':{'$exists':True}},{'sources':1,'run_at':1}).sort('timestamp',-1).limit(50))
        except Exception:logger.exception('Source freshness history unavailable')
    source_freshness(source_stats,history)
    if not raw_hackathons:
        if collection is not None:run_lifecycle_sweep(collection,revalidate=False)
        sent, notification_errors = (dispatch_pending_notifications(collection)
                                     if sources_ok and not dry_run else (0, 0))
        logger.info("No hackathons returned from any scraper source.")
        duration = round(time.time() - t0, 1)
        summary = {
            "success": sources_ok and notification_errors == 0,
            "run_at": now_iso,
            "timestamp": time.time(),
            "duration_s": duration,
            "scraped": 0,
            "new": 0,
            "updated": 0,
            "archived": 0,
            "notified": sent,
            "notification_errors": notification_errors,
            "sources": source_stats,
        }
        _save_summary(history_collection, summary, source_stats, dry_run)
        return summary

    # Normalize per record before classification. A malformed source record cannot abort the scan.
    from event_contract import adapt_observation
    verified_hackathons = []
    for raw in raw_hackathons:
        try: verified_hackathons.append(adapt_observation(raw, now=now_utc))
        except (ValueError, TypeError, AttributeError, OverflowError):
            logger.warning("Rejected malformed source observation")
    # Heuristic scores are screening signals, never proof of verification.
    # 4. Classification
    classify_all(verified_hackathons)

    from event_repository import EventRepository
    new_hackathons = []
    updated_hackathons = []
    archived_count = purged_count = ingestion_errors = 0
    if dry_run:
        new_hackathons = verified_hackathons
    else:
        repository = EventRepository(collection, get_collection("event_observations"))
        for h in verified_hackathons:
            try:
                stored, created, changed = repository.ingest(h, now=now_utc)
                if created and stored.get("publication_state") == "published": new_hackathons.append(stored)
                elif stored.get("notified") and stored.get("publication_state") == "published" and ("deadline_iso" in changed or "registration_deadline" in changed):
                    updated_hackathons.append((stored, changed))
            except Exception:
                ingestion_errors += 1
                logger.exception("Could not persist source observation")
        lifecycle_report = run_lifecycle_sweep(collection)
        archived_count = int(lifecycle_report.get("archived", 0))
    # 7. Notifications via Telegram
    sent_count = 0
    notification_errors = 0
    notify_list = [
        h for h in new_hackathons
        if h.get("is_top_college") or h.get("is_internship")
    ]

    logger.info(
        "Scan results: %d new total (%d notification-worthy), %d updated, %d archived.",
        len(new_hackathons), len(notify_list), len(updated_hackathons), archived_count,
    )

    if not dry_run:
        sent_count, notification_errors = dispatch_pending_notifications(collection)

    # Dispatch deadline change notifications
    if updated_hackathons and not dry_run:
        logger.info("Dispatching %d deadline change alerts...", len(updated_hackathons))
        for h, ch_fields in updated_hackathons:
            old_dl, new_dl = ch_fields.get("deadline", ch_fields.get("deadline_iso", ("", "")))
            if new_dl and new_dl >= today_iso:
                if not send_deadline_update(h, old_dl, new_dl):
                    notification_errors += 1

    # 8. Record telemetry in scan_history collection
    duration = round(time.time() - t0, 1)
    summary = {
        "success": sources_ok and ingestion_errors == 0 and notification_errors == 0 and bool(verified_hackathons),
        "rejected_records": len(raw_hackathons)-len(verified_hackathons),
        "ingestion_errors": ingestion_errors,
        "notification_errors": notification_errors,
        "run_at": now_iso,
        "timestamp": time.time(),
        "duration_s": duration,
        "scraped": len(verified_hackathons),
        "new": len(new_hackathons),
        "updated": len(updated_hackathons),
        "archived": archived_count,
        "purged": purged_count,
        "notified": sent_count,
        "sources": source_stats,
    }

    _save_summary(history_collection, summary, source_stats, dry_run)

    logger.info("RUN_SUMMARY %s", json.dumps({
        "scraped": summary["scraped"],
        "new": summary["new"],
        "updated": summary["updated"],
        "archived": summary["archived"],
        "notified": summary["notified"],
        "duration_s": summary["duration_s"],
    }))

    logger.info("Autonomous scan engine finished with success=%s in %.1fs.", summary["success"], duration)
    return summary


def main():
    parser = argparse.ArgumentParser(description="Autonomous Hackathon Scanner CLI")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--dry-run",
        action="store_true",
        help="Run scrapers without modifying MongoDB or dispatching Telegram notifications.",
    )
    mode.add_argument('--notifications-only', action='store_true',
                      help='Recover due outbox work without scraping; exits after a bounded batch.')
    args = parser.parse_args()

    if args.notifications_only:
        collection = get_collection()
        sent, errors = dispatch_pending_notifications(collection) if collection is not None else (0, 1)
        summary = {'success': errors == 0, 'notified': sent, 'notification_errors': errors}
        logger.info('OUTBOX_SUMMARY %s', json.dumps(summary))
    else:
        summary = execute_scan(dry_run=args.dry_run)
    sys.exit(0 if summary.get("success", False) else 1)


if __name__ == "__main__":
    main()
