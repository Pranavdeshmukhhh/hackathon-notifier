"""
lifecycle.py — Hackathon lifecycle management (expiry, archival, purge, link health).

This is the single source of truth for "is this hackathon still alive?".

Responsibilities
----------------
1. ``parse_deadline_iso`` / ``normalize_deadline`` — turn the many messy date
   strings scrapers emit ("Oct 01 - 31, 2026", "31st Oct 2026", ISO, ...) into a
   canonical ``deadline_iso`` (YYYY-MM-DD). Scrapers that never produced an ISO
   date (Devpost, HackerEarth, MLH ...) used to be immortal because the sweep
   only looks at ``deadline_iso``; normalising fixes that at the root.
2. ``archive_expired`` — flag documents whose deadline passed (hidden from the
   "active" feed, still visible in the Lost Opportunities tab).
3. ``purge_expired`` — hard-delete documents that have been expired for longer
   than ``EXPIRED_RETENTION_DAYS`` (and long-stale undated ones). A safety
   guard refuses to delete an implausibly large share of the collection in one
   sweep, so a parsing bug can never wipe the database.
4. ``check_links`` / ``revalidate_links`` — concurrent liveness probes. New
   listings with a definitively dead link are rejected; existing listings that
   keep returning 404/410 are removed after several consecutive failures.

Everything here is pure-python and works against both pymongo and mongomock.
"""

from __future__ import annotations

import logging
import os
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from enum import Enum
from typing import Any, Iterable, Optional
from urllib.parse import urlparse

import requests

logger = logging.getLogger("lifecycle")

# ── Tunables (all overridable through environment variables) ─────────────────


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def retention_days() -> int:
    """Days an expired hackathon stays in the 'Lost opportunities' archive."""
    return max(0, _env_int("EXPIRED_RETENTION_DAYS", 3))


def stale_undated_days() -> int:
    """Days an undated listing may go unseen by every scraper before removal."""
    return max(1, _env_int("STALE_UNDATED_DAYS", 30))


def dead_link_strikes() -> int:
    """Consecutive definitive-dead probes before an existing listing is removed."""
    return max(1, _env_int("DEAD_LINK_STRIKES", 3))


# ── Date parsing ─────────────────────────────────────────────────────────────

_MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}
_MONTH_RE = r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"

_RE_ISO = re.compile(r"(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)")
_RE_MONTH_DAY_YEAR = re.compile(
    rf"\b{_MONTH_RE}\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?(?:\s*,\s*|\s+)(\d{{4}})\b", re.I
)
_RE_DAY_MONTH_YEAR = re.compile(
    rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s+{_MONTH_RE}\.?(?:\s*,\s*|\s+)(\d{{4}})\b", re.I
)
# "Oct 01 - 31, 2026"  → range inside a single month; the END day is the deadline
_RE_SAME_MONTH_RANGE = re.compile(
    rf"\b{_MONTH_RE}\.?\s+(\d{{1,2}})(?:st|nd|rd|th)?\s*(?:[-–—]|to)\s*(\d{{1,2}})(?:st|nd|rd|th)?\s*,?\s+(\d{{4}})\b",
    re.I,
)
_RE_SLASH = re.compile(r"(?<!\d)(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})(?!\d)")


def _safe_date(year: int, month: int, day: int) -> Optional[date]:
    if not (2000 <= year <= 2100):
        return None
    try:
        return date(year, month, day)
    except ValueError:
        return None


def parse_deadline_iso(value: Any) -> Optional[str]:
    """
    Best-effort conversion of an arbitrary deadline string to ``YYYY-MM-DD``.

    When the text contains several dates (a range such as
    "Dec 29, 2026 - Jan 05, 2027") the LATEST one is returned, because the
    latest date is when the opportunity actually ends.
    """
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        d = value.date() if isinstance(value, datetime) else value
        return d.isoformat()

    text = str(value).strip()
    if not text or text.upper() in {"TBA", "TBD", "N/A", "NONE", "NULL", "-"}:
        return None

    found: list[date] = []

    for m in _RE_ISO.finditer(text):
        d = _safe_date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        if d:
            found.append(d)

    for m in _RE_SAME_MONTH_RANGE.finditer(text):
        d = _safe_date(int(m.group(4)), _MONTHS[m.group(1).lower()[:3]], int(m.group(3)))
        if d:
            found.append(d)

    for m in _RE_MONTH_DAY_YEAR.finditer(text):
        d = _safe_date(int(m.group(3)), _MONTHS[m.group(1).lower()[:3]], int(m.group(2)))
        if d:
            found.append(d)

    for m in _RE_DAY_MONTH_YEAR.finditer(text):
        d = _safe_date(int(m.group(3)), _MONTHS[m.group(2).lower()[:3]], int(m.group(1)))
        if d:
            found.append(d)

    if not found:
        # Numeric day-first dates (Indian convention: DD/MM/YYYY)
        for m in _RE_SLASH.finditer(text):
            a, b, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
            d = _safe_date(y, b, a) or _safe_date(y, a, b)
            if d:
                found.append(d)

    return max(found).isoformat() if found else None


def today_iso(now: Optional[datetime] = None) -> str:
    return (now or datetime.now(timezone.utc)).strftime("%Y-%m-%d")


def normalize_deadline(doc: dict) -> dict:
    """Fill ``deadline_iso`` from the human ``deadline`` string when missing/invalid."""
    iso = doc.get("deadline_iso")
    parsed = parse_deadline_iso(iso) if iso else None
    if not parsed:
        parsed = parse_deadline_iso(doc.get("deadline"))
    if parsed:
        doc["deadline_iso"] = parsed
    elif "deadline_iso" not in doc or not doc.get("deadline_iso"):
        doc["deadline_iso"] = None
    return doc


def is_expired(doc: dict, today: Optional[str] = None) -> bool:
    """True when the document's deadline is strictly before ``today``."""
    iso = doc.get("deadline_iso")
    if not iso:
        return False
    return str(iso) < (today or today_iso())


def drop_expired(docs: Iterable[dict], today: Optional[str] = None) -> tuple[list[dict], int]:
    """Normalise deadlines then return (still_alive_docs, number_dropped)."""
    kept: list[dict] = []
    dropped = 0
    t = today or today_iso()
    for d in docs:
        normalize_deadline(d)
        if is_expired(d, t):
            dropped += 1
        else:
            kept.append(d)
    return kept, dropped


def _parse_ts(value: Any) -> Optional[datetime]:
    """Parse the various timestamp shapes stored in Mongo into aware datetimes."""
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value), tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


# ── Link liveness ────────────────────────────────────────────────────────────


class LinkStatus(str, Enum):
    ALIVE = "alive"
    DEAD = "dead"        # definitively gone (404/410/DNS failure)
    UNKNOWN = "unknown"  # blocked / timeout / bot-wall — never penalise


# Hosts that answer 200 (login wall) or block bots; probing them proves nothing.
_UNPROBEABLE_HOSTS = ("instagram.com", "linkedin.com", "facebook.com", "x.com", "twitter.com")

_PROBE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def check_link(url: str, timeout: float = 6.0, session: Optional[requests.Session] = None) -> LinkStatus:
    """Probe a single URL. Conservative: only 404/410/DNS-failure count as DEAD."""
    if not url or not url.lower().startswith(("http://", "https://")):
        return LinkStatus.UNKNOWN
    host = urlparse(url).netloc.lower()
    if any(h in host for h in _UNPROBEABLE_HOSTS):
        return LinkStatus.UNKNOWN

    http = session or requests
    try:
        resp = http.head(url, headers=_PROBE_HEADERS, timeout=timeout, allow_redirects=True)
        if resp.status_code in (403, 405, 429, 501) or resp.status_code >= 500:
            resp = http.get(url, headers=_PROBE_HEADERS, timeout=timeout, allow_redirects=True, stream=True)
            resp.close()
        code = resp.status_code
        if code in (404, 410):
            return LinkStatus.DEAD
        if code < 400:
            return LinkStatus.ALIVE
        return LinkStatus.UNKNOWN
    except requests.exceptions.ConnectionError as exc:
        msg = str(exc).lower()
        if any(s in msg for s in ("name or service not known", "getaddrinfo failed", "nodename nor servname", "failed to resolve", "name resolution")):
            return LinkStatus.DEAD
        return LinkStatus.UNKNOWN
    except Exception:
        return LinkStatus.UNKNOWN


def check_links(urls: Iterable[str], max_workers: int = 12, timeout: float = 6.0) -> dict[str, LinkStatus]:
    """Probe many URLs concurrently. Returns ``{url: LinkStatus}``."""
    unique = list(dict.fromkeys(u for u in urls if u))
    if not unique:
        return {}
    results: dict[str, LinkStatus] = {}
    with requests.Session() as session, ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="linkcheck") as pool:
        for url, status in zip(unique, pool.map(lambda u: check_link(u, timeout, session), unique)):
            results[url] = status
    return results


def filter_dead_links(docs: list[dict], max_workers: int = 12) -> tuple[list[dict], int]:
    """Remove documents whose link is definitively dead. Annotates survivors."""
    statuses = check_links((d.get("link", "") for d in docs), max_workers=max_workers)
    now = datetime.now(timezone.utc).isoformat()
    alive: list[dict] = []
    dead = 0
    for d in docs:
        status = statuses.get(d.get("link", ""), LinkStatus.UNKNOWN)
        if status is LinkStatus.DEAD:
            dead += 1
            logger.info("Rejected dead link: %s", d.get("link"))
            continue
        d["link_status"] = status.value
        d["link_checked_at"] = now
        alive.append(d)
    return alive, dead


# ── Collection sweeps ────────────────────────────────────────────────────────


def archive_expired(collection, today: Optional[str] = None) -> int:
    """Flag every document whose deadline has passed as archived/ended."""
    t = today or today_iso()
    now = datetime.now(timezone.utc).isoformat()
    res = collection.update_many(
        {
            "deadline_iso": {"$lt": t, "$nin": [None, ""], "$exists": True},
            "archived": {"$ne": True},
        },
        {"$set": {"archived": True, "status": "Ended", "is_past": True, "updated_at": now}},
    )
    return int(getattr(res, "modified_count", 0))


def backfill_deadlines(collection, limit: int = 2000) -> int:
    """
    One-time-ish repair: documents stored without ``deadline_iso`` but with a
    parseable ``deadline`` string get their ISO date filled in, so the normal
    archive/purge sweeps can finally see them.
    """
    fixed = 0
    cursor = collection.find(
        {"$or": [{"deadline_iso": None}, {"deadline_iso": ""}, {"deadline_iso": {"$exists": False}}]},
        {"deadline": 1},
    ).limit(limit)
    for doc in list(cursor):
        iso = parse_deadline_iso(doc.get("deadline"))
        if iso:
            collection.update_one({"_id": doc["_id"]}, {"$set": {"deadline_iso": iso}})
            fixed += 1
    return fixed


def _safe_to_delete(n_delete: int, total: int, what: str) -> bool:
    """Refuse mass deletions that look like a bug rather than natural expiry."""
    if n_delete <= 0:
        return False
    if total >= 20 and n_delete > max(25, int(total * 0.6)):
        logger.error(
            "SAFETY GUARD: refusing to purge %d of %d documents (%s). "
            "This looks anomalous — investigate before retrying.",
            n_delete, total, what,
        )
        return False
    return True


def purge_expired(collection, today: Optional[str] = None, retention: Optional[int] = None) -> dict:
    """
    Permanently remove (a) hackathons expired beyond the retention window and
    (b) undated, scraper-sourced listings no scraper has re-confirmed recently.
    """
    now = datetime.now(timezone.utc)
    t = today or today_iso(now)
    keep_days = retention_days() if retention is None else max(0, retention)
    cutoff_iso = (datetime.strptime(t, "%Y-%m-%d").date() - timedelta(days=keep_days)).isoformat()

    total = collection.count_documents({})
    summary = {"expired_removed": 0, "stale_removed": 0, "skipped_by_guard": 0}

    # (a) expired beyond retention
    expired_filter = {"deadline_iso": {"$lt": cutoff_iso, "$nin": [None, ""], "$exists": True}}
    n_expired = collection.count_documents(expired_filter)
    if _safe_to_delete(n_expired, total, "expired"):
        summary["expired_removed"] = int(collection.delete_many(expired_filter).deleted_count)
    elif n_expired:
        summary["skipped_by_guard"] += n_expired

    # (b) stale undated listings (never touch manually listed community entries)
    stale_cutoff = (now - timedelta(days=stale_undated_days())).isoformat()
    stale_ids = []
    for doc in collection.find(
        {"$or": [{"deadline_iso": None}, {"deadline_iso": ""}, {"deadline_iso": {"$exists": False}}]},
        {"last_seen_at": 1, "scraped_at": 1, "created_at": 1, "source": 1},
    ):
        if str(doc.get("source") or "").lower().startswith("community"):
            continue
        seen = _parse_ts(doc.get("last_seen_at") or doc.get("scraped_at") or doc.get("created_at"))
        if seen and seen.isoformat() < stale_cutoff:
            stale_ids.append(doc["_id"])
    if _safe_to_delete(len(stale_ids), total, "stale-undated"):
        summary["stale_removed"] = int(collection.delete_many({"_id": {"$in": stale_ids}}).deleted_count)
    elif stale_ids:
        summary["skipped_by_guard"] += len(stale_ids)

    if summary["expired_removed"] or summary["stale_removed"]:
        logger.info("Purged %d expired + %d stale hackathons.", summary["expired_removed"], summary["stale_removed"])
    return summary


def revalidate_links(collection, batch: int = 60, max_workers: int = 10) -> dict:
    """
    Probe the links of the least-recently-checked active listings. Listings that
    keep coming back definitively dead are deleted after ``DEAD_LINK_STRIKES``
    consecutive failures; healthy ones get their counter reset.
    """
    now = datetime.now(timezone.utc).isoformat()
    docs = list(
        collection.find(
            {"archived": {"$ne": True}},
            {"link": 1, "dead_strikes": 1, "link_checked_at": 1},
        )
        .sort("link_checked_at", 1)
        .limit(batch)
    )
    summary = {"checked": len(docs), "removed": 0, "dead_flagged": 0, "healthy": 0}
    if not docs:
        return summary

    statuses = check_links((d.get("link", "") for d in docs), max_workers=max_workers)
    strikes_limit = dead_link_strikes()
    removable: list = []

    for d in docs:
        status = statuses.get(d.get("link", ""), LinkStatus.UNKNOWN)
        if status is LinkStatus.DEAD:
            strikes = int(d.get("dead_strikes", 0)) + 1
            if strikes >= strikes_limit:
                removable.append(d["_id"])
            else:
                summary["dead_flagged"] += 1
                collection.update_one(
                    {"_id": d["_id"]},
                    {"$set": {"dead_strikes": strikes, "link_status": "dead", "link_checked_at": now}},
                )
        else:
            if status is LinkStatus.ALIVE:
                summary["healthy"] += 1
            collection.update_one(
                {"_id": d["_id"]},
                {"$set": {"dead_strikes": 0, "link_status": status.value, "link_checked_at": now}},
            )

    total = collection.count_documents({})
    if _safe_to_delete(len(removable), total, "dead-links"):
        summary["removed"] = int(collection.delete_many({"_id": {"$in": removable}}).deleted_count)
        logger.info("Removed %d listings with persistently dead links.", summary["removed"])
    return summary


def run_lifecycle_sweep(collection, revalidate: bool = True) -> dict:
    """Full housekeeping pass: backfill → archive → purge → (optional) link health."""
    report: dict[str, Any] = {}
    try:
        report["backfilled"] = backfill_deadlines(collection)
        report["archived"] = archive_expired(collection)
        report.update(purge_expired(collection))
        if revalidate:
            report["links"] = revalidate_links(collection)
    except Exception:  # sweeps must never take the pipeline down
        logger.exception("Lifecycle sweep failed")
        report["error"] = True
    return report
