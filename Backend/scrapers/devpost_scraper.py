"""
devpost_scraper.py — Scrape hackathon listings from Devpost.

Devpost has a free, public JSON API at:
  https://devpost.com/api/hackathons?status[]=upcoming&status[]=open&page=N

This returns ~9 hackathons per page with full metadata.
No authentication required. No Cloudflare blocking.
"""

import logging
import re
import time
from datetime import datetime
from typing import Optional

import requests
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type, before_sleep_log

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────
DEVPOST_API = "https://devpost.com/api/hackathons"
MAX_PAGES = 20         # 20 pages × ~9 per page = ~180 hackathons
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
    Parse Devpost date strings like 'Jul 31 - Oct 01, 2026' into
    (deadline_display, deadline_iso).
    Returns the END date as the deadline.
    """
    if not date_str:
        return "TBA", ""

    # Try to extract the end date from "MMM DD - MMM DD, YYYY"
    match = re.search(r'(\w{3}\s+\d{1,2}),?\s*(\d{4})\s*$', date_str)
    if match:
        month_day = match.group(1)
        year = match.group(2)
        try:
            dt = datetime.strptime(f"{month_day} {year}", "%b %d %Y")
            return dt.strftime("%d %b %Y"), dt.strftime("%Y-%m-%d")
        except ValueError:
            pass

    # Fallback: try full end portion "Oct 01, 2026"
    parts = date_str.split(" - ")
    if len(parts) == 2:
        end_part = parts[1].strip()
        for fmt in ("%b %d, %Y", "%B %d, %Y", "%d %b %Y"):
            try:
                dt = datetime.strptime(end_part, fmt)
                return dt.strftime("%d %b %Y"), dt.strftime("%Y-%m-%d")
            except ValueError:
                continue

    return "TBA", ""


def _extract_prize(prize_html: str) -> str:
    """Extract prize amount from HTML like '$<span>740,000</span>'."""
    if not prize_html:
        return ""
    # Strip HTML tags
    clean = re.sub(r'<[^>]+>', '', prize_html)
    return clean.strip()


def _parse_hackathon(item: dict) -> Optional[dict]:
    """Parse a single Devpost API hackathon item."""
    title = item.get("title", "").strip()
    url = item.get("url", "").strip()

    if not title or not url:
        return None

    # Location
    loc_data = item.get("displayed_location", {})
    location = loc_data.get("location", "") if isinstance(loc_data, dict) else ""
    mode = "Online" if "online" in location.lower() else "Offline"

    # Tags/themes
    themes = item.get("themes", [])
    tags = [t.get("name", "") for t in themes if t.get("name")]

    # Dates
    date_str = item.get("submission_period_dates", "")
    deadline, deadline_iso = _parse_date(date_str)

    # Status
    open_state = item.get("open_state", "")
    time_left = item.get("time_left_to_submission", "")
    now_iso = datetime.utcnow().strftime("%Y-%m-%d")

    if open_state == "ended" or (deadline_iso and deadline_iso < now_iso):
        status = "Ended"
    else:
        status = "Open"

    # Prize
    prize = _extract_prize(item.get("prize_amount", ""))

    # Organization
    org = item.get("organization_name", "")

    return {
        "title":        title,
        "deadline":     deadline,
        "deadline_iso": deadline_iso,
        "status":       status,
        "mode":         mode,
        "tags":         tags,
        "link":         url,
        "source":       "Devpost",
        "location":     location,
        "prize":        prize,
        "organization": org,
        "registrations": item.get("registrations_count", 0),
        "desc":         f"{time_left}. Organized by {org}." if org else time_left,
        "tagline":      "",
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
def _fetch_page(session: requests.Session, params: dict) -> dict:
    """Fetch a single Devpost API page with exponential-backoff retries."""
    resp = session.get(DEVPOST_API, params=params, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def scrape_devpost() -> list[dict]:
    """
    Return a list of normalised hackathon dicts from Devpost.
    Fetches multiple pages from their public JSON API.
    Returns [] on failure (never raises).
    """
    logger.info("Devpost scraper started.")
    session = _get_session()
    all_results: list[dict] = []

    for page in range(1, 51):
        try:
            params = {
                "status[]": ["upcoming", "open"],
                "page": page,
            }
            logger.info("Devpost API: fetching page %d/50…", page)
            data = _fetch_page(session, params)

            hackathons = data.get("hackathons", [])
            if not hackathons:
                logger.info("Devpost API: no more hackathons on page %d.", page)
                break

            for item in hackathons:
                parsed = _parse_hackathon(item)
                if parsed:
                    all_results.append(parsed)

            logger.info("Devpost API: page %d returned %d hackathons.", page, len(hackathons))

            # Be polite
            if page < MAX_PAGES:
                time.sleep(0.5)

        except requests.exceptions.RequestException as e:
            logger.warning("Devpost API: page %d failed after retries: %s", page, e)
            break
        except Exception:
            logger.warning("Devpost API: unexpected error on page %d", page, exc_info=True)
            break

    logger.info("Devpost scraper: %d total hackathons collected.", len(all_results))
    print(f"[DEBUG] scrape_devpost() total: {len(all_results)} hackathon(s).")
    return all_results


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
    results = scrape_devpost()
    if results:
        print(f"\n{len(results)} hackathons found:\n")
        for h in results:
            print(f"  * {h['title']}")
            print(f"    {h['deadline']} | {h['mode']} | {', '.join(h['tags']) or 'no tags'}")
            if h.get("prize"):
                print(f"    💰 {h['prize']}")
            print(f"    {h['link']}\n")
    else:
        print("No hackathons found.")
