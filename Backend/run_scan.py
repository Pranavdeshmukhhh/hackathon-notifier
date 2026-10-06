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

def run_all_scrapers() -> tuple[list[dict], dict[str, dict]]:
    """
    Run all scrapers concurrently with ThreadPoolExecutor.
    One failing source will never stop the others.

    Returns:
        (combined_hackathons, source_stats)
    """
    def _run_internet_scanner():
        items = []
        for kw in ["iit", "iiit", "pune", "hyderabad", "faang"]:
            items.extend(scan_single_keyword(kw))
        return items

    scrapers = {
        "Devfolio":        scrape_devfolio,
        "Unstop":          scrape_unstop,
        "Devpost":         scrape_devpost,
        "HackerEarth":     scrape_hackerearth,
        "Devnovate":       scrape_devnovate,
        "InternetScanner": _run_internet_scanner,
        "Instagram":       scrape_instagram_hackathons,
        "WebDiscovery":    run_web_discovery,
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
                    "status": "ok" if count > 0 else "zero_results",
                    "error": None,
                }
                logger.info("✓ [%s] scraper returned %d hackathons.", name, count)
                combined.extend(results)
            except Exception as exc:
                err_msg = str(exc)
                source_stats[name] = {
                    "found": 0,
                    "status": "error",
                    "error": err_msg,
                }
                logger.exception("✗ [%s] scraper raised unhandled exception: %s", name, err_msg)

    return combined, source_stats


# ── Health & Consecutive Failure Monitor ──────────────────────────────────────

def check_consecutive_failures(history_col, current_stats: dict[str, dict], dry_run: bool = False):
    """
    Check if any source has failed or returned 0 results 3 runs in a row.
    Dispatches a Telegram warning alert if detected.
    """
    if dry_run or history_col is None:
        return

    try:
        past_runs = list(history_col.find(
            {"sources": {"$exists": True}},
            {"sources": 1, "run_at": 1}
        ).sort("timestamp", -1).limit(2))

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
                if found == 0 or status == "error":
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
                "The following sources returned 0 results or errors for 3 consecutive runs:\n",
            ]
            for src, err in consecutive_bad:
                warning_lines.append(f"• <b>{src}</b>: <code>{err[:100]}</code>")
            warning_lines.append(f"\n⏰ Timestamp: <code>{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}</code>")

            msg = "\n".join(warning_lines)
            logger.warning("Consecutive scraper failures detected: %s", consecutive_bad)
            send_warning_alert(msg)

    except Exception as e:
        logger.error("Failed to check consecutive scraper failures: %s", e)


# ── Pipeline Execution ────────────────────────────────────────────────────────

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

    if not raw_hackathons:
        logger.info("No hackathons returned from any scraper source.")
        duration = round(time.time() - t0, 1)
        summary = {
            "success": True,
            "run_at": now_iso,
            "timestamp": time.time(),
            "duration_s": duration,
            "scraped": 0,
            "new": 0,
            "updated": 0,
            "archived": 0,
            "notified": 0,
            "sources": source_stats,
        }
        if history_collection is not None:
            history_collection.insert_one(summary)
            check_consecutive_failures(history_collection, source_stats, dry_run=dry_run)
        return summary

    # 3. Multi-signal verification
    logger.info("Running multi-signal verification on %d candidates...", len(raw_hackathons))
    verified_hackathons = batch_verify(raw_hackathons, check_url=False)
    logger.info("Multi-signal verification: %d passed", len(verified_hackathons))

    # 4. Classification
    classify_all(verified_hackathons)

    # 4b. Normalise deadlines (so every source can expire), drop already-ended
    #     events and reject definitively dead links before anything is stored.
    for h in verified_hackathons:
        normalize_deadline(h)
    existing_links: set[str] = set()
    if collection is not None:
        try:
            existing_links = {
                d["link"] for d in collection.find({}, {"link": 1}) if d.get("link")
            }
        except Exception as e:
            logger.warning("Could not load existing links: %s", e)

    # Existing documents still need their last_seen_at / change detection even if
    # they've ended, so only filter *new* candidates.
    fresh = [h for h in verified_hackathons if h.get("link", "").strip() not in existing_links]
    known = [h for h in verified_hackathons if h.get("link", "").strip() in existing_links]
    fresh, expired_skipped = drop_expired(fresh)
    fresh, dead_skipped = filter_dead_links(fresh)
    logger.info(
        "Lifecycle gate: %d new candidates kept, %d already expired, %d dead links rejected.",
        len(fresh), expired_skipped, dead_skipped,
    )
    verified_hackathons = fresh + known

    # 5. Deduplication, Change Detection & DB Upsert
    new_hackathons: list[dict] = []
    updated_hackathons: list[tuple[dict, dict]] = []
    archived_count = 0
    purged_count = 0

    if dry_run:
        new_hackathons = verified_hackathons
        logger.info("[DRY RUN] Would process %d hackathons.", len(new_hackathons))
    else:
        for h in verified_hackathons:
            link = h.get("link", "").strip()
            if not link:
                continue

            try:
                existing = collection.find_one({"link": link})
            except Exception as e:
                logger.warning("MongoDB find failed for %s: %s", link, e)
                continue

            if not existing:
                # Fresh event
                d_iso = h.get("deadline_iso", "")
                if d_iso and d_iso < today_iso:
                    h["status"] = "Ended"
                    h["is_past"] = True
                    h["archived"] = True
                else:
                    h.setdefault("archived", False)
                    h.setdefault("is_past", False)

                h["notified"] = False
                h["created_at"] = now_iso
                h["updated_at"] = now_iso
                h["last_seen_at"] = now_iso

                try:
                    collection.insert_one(h)
                    new_hackathons.append(h)
                    logger.info("New hackathon indexed: %s", h.get("title", link))
                except Exception as e:
                    logger.exception("Failed to insert new hackathon %s: %s", link, e)

            else:
                # Existing event: Change Detection
                changed_fields = {}
                try:
                    collection.update_one(
                        {"_id": existing["_id"]},
                        {"$set": {"last_seen_at": now_iso, "dead_strikes": 0}},
                    )
                except Exception as e:
                    logger.debug("last_seen_at update failed for %s: %s", link, e)
                old_deadline = existing.get("deadline") or ""
                new_deadline = h.get("deadline") or ""
                if new_deadline and new_deadline not in ("TBA", "") and new_deadline != old_deadline:
                    changed_fields["deadline"] = (old_deadline, new_deadline)

                old_iso = existing.get("deadline_iso") or ""
                new_iso = h.get("deadline_iso") or ""
                if new_iso and new_iso != old_iso:
                    changed_fields["deadline_iso"] = (old_iso, new_iso)

                old_prize = existing.get("prize") or ""
                new_prize = h.get("prize") or ""
                if new_prize and new_prize not in ("TBA", "") and new_prize != old_prize:
                    changed_fields["prize"] = (old_prize, new_prize)

                old_mode = existing.get("mode") or ""
                new_mode = h.get("mode") or ""
                if new_mode and new_mode not in ("Unknown", "") and new_mode != old_mode:
                    changed_fields["mode"] = (old_mode, new_mode)

                if changed_fields:
                    update_set = {"updated_at": now_iso}
                    for field, (_, val) in changed_fields.items():
                        update_set[field] = val

                    # If deadline extended to the future, restore status to Open
                    if "deadline_iso" in changed_fields:
                        if changed_fields["deadline_iso"][1] >= today_iso:
                            update_set["archived"] = False
                            update_set["is_past"] = False
                            update_set["status"] = "Open"

                    try:
                        collection.update_one({"_id": existing["_id"]}, {"$set": update_set})
                        logger.info("Updated hackathon %s: %s", link, list(changed_fields.keys()))
                        if existing.get("notified") and ("deadline" in changed_fields or "deadline_iso" in changed_fields):
                            if existing.get("is_top_college") or existing.get("is_internship") or h.get("is_top_college") or h.get("is_internship"):
                                updated_hackathons.append((h, changed_fields))
                    except Exception as e:
                        logger.warning("Failed to update existing hackathon %s: %s", link, e)

        # 6. Lifecycle sweep: backfill dates → archive expired → purge old →
        #    revalidate links (auto-removes dead/expired listings).
        lifecycle_report = run_lifecycle_sweep(collection)
        archived_count = int(lifecycle_report.get("archived", 0))
        purged_count = int(lifecycle_report.get("expired_removed", 0)) + int(
            lifecycle_report.get("stale_removed", 0)
        ) + int(lifecycle_report.get("links", {}).get("removed", 0))
        logger.info("Lifecycle sweep: %s", lifecycle_report)

    # 7. Notifications via Telegram
    sent_count = 0
    notify_list = [
        h for h in new_hackathons
        if h.get("is_top_college") or h.get("is_internship")
    ]

    logger.info(
        "Scan results: %d new total (%d notification-worthy), %d updated, %d archived.",
        len(new_hackathons), len(notify_list), len(updated_hackathons), archived_count,
    )

    if notify_list and not dry_run:
        logger.info("Dispatching %d Telegram notifications...", len(notify_list))
        res = send_batch(notify_list)
        sent_count = res.get("sent", 0)
        logger.info("Notifications sent: %d, failed: %d.", sent_count, res.get("failed", 0))

        # Mark sent items with notified=True to prevent duplicate alerting
        sent_links = [h["link"] for h in notify_list[:sent_count] if h.get("link")]
        if sent_links and collection is not None:
            try:
                collection.update_many(
                    {"link": {"$in": sent_links}},
                    {"$set": {"notified": True, "notified_at": now_iso}}
                )
            except Exception as e:
                logger.warning("Failed to update notified flags in DB: %s", e)

    # Dispatch deadline change notifications
    if updated_hackathons and not dry_run:
        logger.info("Dispatching %d deadline change alerts...", len(updated_hackathons))
        for h, ch_fields in updated_hackathons:
            old_dl, new_dl = ch_fields.get("deadline", ch_fields.get("deadline_iso", ("", "")))
            if new_dl and new_dl >= today_iso:
                send_deadline_update(h, old_dl, new_dl)

    # 8. Record telemetry in scan_history collection
    duration = round(time.time() - t0, 1)
    summary = {
        "success": True,
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

    if history_collection is not None:
        try:
            history_collection.insert_one(summary.copy())
            check_consecutive_failures(history_collection, source_stats, dry_run=dry_run)
        except Exception as e:
            logger.warning("Failed to save run telemetry into scan_history: %s", e)

    logger.info("RUN_SUMMARY %s", json.dumps({
        "scraped": summary["scraped"],
        "new": summary["new"],
        "updated": summary["updated"],
        "archived": summary["archived"],
        "notified": summary["notified"],
        "duration_s": summary["duration_s"],
    }))

    logger.info("Autonomous scan engine finished cleanly in %.1fs.", duration)
    return summary


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
