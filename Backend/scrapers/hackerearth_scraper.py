"""
hackerearth_scraper.py — Scrape hackathon/challenge listings from HackerEarth.

HackerEarth has a public JSON endpoint used by their Chrome extension:
  https://www.hackerearth.com/chrome-extension/events/

This returns all current and upcoming hackathons with full metadata.
No authentication required. No Cloudflare blocking.
"""

import logging
import re
from datetime import datetime
from typing import Optional

import requests
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type, before_sleep_log

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────
HACKEREARTH_API = "https://www.hackerearth.com/chrome-extension/events/"
REQUEST_TIMEOUT = 12

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
}

_session: Optional[requests.Session] = None


def _get_session() -> requests.Session:
    global _session
    if _session is None:
        _session = requests.Session()
        _session.headers.update(_HEADERS)
    return _session


def _parse_date(date_str: str) -> tuple[str, str]:
    """
    Parse HackerEarth date strings like 'Sep 27, 2026' into
    (deadline_display, deadline_iso).
    """
    if not date_str:
        return "TBA", ""

    # Try common formats
    for fmt in ("%b %d, %Y", "%B %d, %Y", "%d %b %Y", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(date_str.strip(), fmt)
            return dt.strftime("%d %b %Y"), dt.strftime("%Y-%m-%d")
        except ValueError:
            continue

    return "TBA", ""


def _parse_event(item: dict) -> Optional[dict]:
    """Parse a single HackerEarth event into a normalised hackathon dict."""
    title = item.get("title", "").strip()
    url = item.get("url", "").strip()

    if not title or not url:
        return None

    # Deadline from end_date
    end_date = item.get("end_date", "")
    deadline, deadline_iso = _parse_date(end_date)

    # Status
    status_raw = item.get("status", "").upper()
    now_iso = datetime.utcnow().strftime("%Y-%m-%d")

    if status_raw == "ENDED" or (deadline_iso and deadline_iso < now_iso):
        status = "Ended"
    elif status_raw == "UPCOMING":
        status = "Upcoming"
    else:
        status = "Open"

    # Mode — HackerEarth hackathons are typically online
    mode = "Online"

    # Tags from challenge_type
    tags = []
    challenge_type = item.get("challenge_type", "")
    if challenge_type:
        tags.append(challenge_type)

    # College flag
    is_college = item.get("college", False)
    if is_college:
        tags.append("College")

    # Description
    desc = item.get("description", "").strip()
    if desc and len(desc) > 500:
        desc = desc[:497] + "…"

    return {
        "title":        title,
        "deadline":     deadline,
        "deadline_iso": deadline_iso,
        "status":       status,
        "mode":         mode,
        "tags":         tags,
        "link":         url,
        "source":       "HackerEarth",
        "location":     "",
        "desc":         desc,
        "tagline":      "",
        "prize":        "",
        "scraped_at":   datetime.utcnow().isoformat() + "Z",
    }


# ── Retry wrapper ─────────────────────────────────────────────────────────────
@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=15),
    retry=retry_if_exception_type(requests.exceptions.RequestException),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)
def _fetch_events(session: requests.Session) -> list:
    """Fetch HackerEarth events with exponential-backoff retries."""
    resp = session.get(HACKEREARTH_API, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    events = data.get("response", []) if isinstance(data, dict) else data
    if not isinstance(events, list):
        raise ValueError("HackerEarth API: unexpected response format.")
    return events


def scrape_hackerearth() -> list[dict]:
    """
    Return a list of normalised hackathon dicts from HackerEarth.
    Uses their public Chrome extension events API.
    Returns [] on failure (never raises).
    """
    logger.info("HackerEarth scraper started.")
    session = _get_session()

    try:
        logger.info("HackerEarth API: fetching events…")
        events = _fetch_events(session)

        results = []
        for item in events:
            # Only include HackerEarth's own events
            if not item.get("is_hackerearth", True):
                continue

            parsed = _parse_event(item)
            if parsed and parsed["status"] != "Ended":
                results.append(parsed)

        logger.info("HackerEarth scraper: %d hackathons collected.", len(results))
        print(f"[DEBUG] scrape_hackerearth() total: {len(results)} hackathon(s).")
        return results

    except requests.exceptions.RequestException as e:
        logger.warning("HackerEarth API failed after retries: %s", e)
        return []
    except Exception:
        logger.warning("HackerEarth API: unexpected error", exc_info=True)
        return []


# ── Self-test ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        stream=sys.stdout,
    )
    results = scrape_hackerearth()
    if results:
        print(f"\n{len(results)} hackathons found:\n")
        for h in results:
            print(f"  * {h['title']}")
            print(f"    {h['deadline']} | {h['mode']} | {', '.join(h['tags']) or 'no tags'}")
            print(f"    {h['link']}\n")
    else:
        print("No hackathons found.")
