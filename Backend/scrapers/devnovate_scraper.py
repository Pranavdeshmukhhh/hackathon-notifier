"""
devnovate_scraper.py — Scraper for devnovate.co

Uses Devnovate's real JSON REST API:
    GET https://devnovate.co/api/v1/events

Returns a list of normalised hackathon dicts matching the shared project schema.
"""

import logging
from datetime import datetime, timezone

from curl_cffi import requests
from tenacity import retry, stop_after_attempt, wait_exponential, before_sleep_log

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────
DEVNOVATE_API    = "https://devnovate.co/api/v1/events"
REQUEST_TIMEOUT  = 20

_HEADERS = {
    "Accept":          "application/json, text/plain, */*",
    "Origin":          "https://devnovate.co",
    "Referer":         "https://devnovate.co/events",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/107.0.0.0 Safari/537.36"
    ),
}

_session = None


def _get_session() -> requests.Session:
    global _session
    if _session is None:
        _session = requests.Session(impersonate="chrome107")
        _session.headers.update(_HEADERS)
    return _session


# ── Date helpers ──────────────────────────────────────────────────────────────

def _parse_date(raw: str) -> tuple[str, str]:
    """
    Parse a date string in various formats.
    Returns (human_label, iso_date).  Fallback: ('TBA', '').
    """
    if not raw:
        return "TBA", ""
    raw = raw.strip()

    # ISO-like with time: "2026-10-02T04:44"
    for fmt in (
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M",
        "%Y-%m-%d",
        "%d-%m-%Y",
        "%d/%m/%Y",
    ):
        try:
            dt = datetime.strptime(raw[:len(fmt.replace("%", "XX"))], fmt)
            return dt.strftime("%d %b %Y"), dt.strftime("%Y-%m-%d")
        except ValueError:
            continue

    # Fallback: try with just the date portion
    try:
        dt = datetime.strptime(raw[:10], "%Y-%m-%d")
        return dt.strftime("%d %b %Y"), dt.strftime("%Y-%m-%d")
    except ValueError:
        pass
    try:
        dt = datetime.strptime(raw[:10], "%d-%m-%Y")
        return dt.strftime("%d %b %Y"), dt.strftime("%Y-%m-%d")
    except ValueError:
        pass

    return raw[:20], ""


# ── Item normalisation ────────────────────────────────────────────────────────

def _normalise(item: dict) -> dict | None:
    """Convert one raw Devnovate API item to the project's hackathon schema."""
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    title = (item.get("name") or "").strip()
    if not title:
        return None

    # Build canonical URL from eventName slug
    slug = item.get("eventName") or item.get("hackathon") or ""
    link = f"https://devnovate.co/events/{slug}" if slug else "https://devnovate.co/events"

    # Deadline: prefer registrationDeadline, fall back to endDate
    raw_dl = item.get("registrationDeadline") or item.get("endDate") or ""
    deadline, deadline_iso = _parse_date(raw_dl)

    # Status
    open_status = (item.get("openStatus") or item.get("registrationStatus") or "").upper()
    if open_status in ("CLOSED", "ENDED"):
        status = "Ended"
    elif deadline_iso and deadline_iso < now_iso:
        status = "Ended"
    else:
        status = "Open"

    # Mode
    raw_mode = (item.get("status") or "").upper()
    if raw_mode == "ONLINE":
        mode = "Online"
    elif raw_mode in ("OFFLINE", "IN-PERSON"):
        mode = "Offline"
    elif raw_mode == "HYBRID":
        mode = "Hybrid"
    else:
        mode = "Unknown"

    # Location
    location = (item.get("location") or "").strip()
    if not location and mode == "Online":
        location = "Online"

    # Prize
    prize = (item.get("prizePool") or "").strip()

    # Tags from theme array
    tags = [t.strip() for t in (item.get("theme") or []) if isinstance(t, str) and t.strip()]

    # Additional tag: skillLevel
    skill_level = (item.get("skillLevel") or "").strip()
    if skill_level and skill_level not in ("All Levels",):
        tags.append(skill_level)

    # Team size  e.g. "2-6" or "1-4"
    team_raw = (item.get("teamSize") or "").strip()
    min_team = max_team = None
    if "-" in team_raw:
        parts = team_raw.split("-", 1)
        try:
            min_team = int(parts[0])
            max_team = int(parts[1])
        except ValueError:
            pass
    elif team_raw.isdigit():
        min_team = max_team = int(team_raw)

    # Registrations
    total_regs = item.get("numberOfRegistrations") or 0

    # Organisation
    org = (item.get("organizationName") or "").strip()

    doc = {
        "title":               title,
        "deadline":            deadline,
        "deadline_iso":        deadline_iso,
        "status":              status,
        "mode":                mode,
        "tags":                tags[:8],
        "link":                link,
        "source":              "Devnovate",
        "location":            location,
        "prize":               prize,
        "organization":        org,
        "total_registrations": int(total_regs) if total_regs else 0,
        "scraped_at":          datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    if min_team is not None:
        doc["min_team_size"] = min_team
    if max_team is not None:
        doc["max_team_size"] = max_team

    return doc


# ── HTTP fetch ────────────────────────────────────────────────────────────────

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)
def _fetch_events() -> list:
    session = _get_session()
    resp = session.get(DEVNOVATE_API, timeout=REQUEST_TIMEOUT)
    if resp.status_code != 200:
        raise RuntimeError(f"Devnovate API returned HTTP {resp.status_code}")
    return resp.json()


# ── Public API ────────────────────────────────────────────────────────────────

def scrape_devnovate() -> list[dict]:
    """
    Return a list of normalised hackathon dicts from Devnovate.co.
    Follows the same schema as other scrapers in this project.
    """
    logger.info("Devnovate scraper started.")

    try:
        raw_items = _fetch_events()
    except Exception as e:
        logger.error("Devnovate: API fetch failed: %s", e)
        print("[DEBUG] scrape_devnovate() total: 0 events (fetch error).")
        return []

    if not isinstance(raw_items, list):
        logger.warning("Devnovate: unexpected API response type: %s", type(raw_items))
        print("[DEBUG] scrape_devnovate() total: 0 events (bad response).")
        return []

    results = []
    for item in raw_items:
        try:
            doc = _normalise(item)
            if doc:
                results.append(doc)
        except Exception as e:
            logger.warning("Devnovate: failed to normalise item '%s': %s", item.get("name", "?"), e)

    logger.info("Devnovate scraper complete: %d event(s) found.", len(results))
    print(f"[DEBUG] scrape_devnovate() total: {len(results)} event(s).")
    return results


if __name__ == "__main__":
    import sys
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        stream=sys.stdout,
    )
    results = scrape_devnovate()
    if results:
        print(f"\n{len(results)} Devnovate events found:\n")
        for h in results[:20]:
            print(f"  * {h['title']}")
            print(f"    {h['deadline']} | {h['mode']} | prize: {h['prize'] or 'N/A'}")
            print(f"    {h['link']}\n")
    else:
        print("No Devnovate events found.")
