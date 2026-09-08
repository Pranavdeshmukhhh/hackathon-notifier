import logging
import re
import time
import random
from datetime import datetime
from curl_cffi import requests
from tenacity import retry, stop_after_attempt, wait_exponential, before_sleep_log

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────
UNSTOP_API_BASE = (
    "https://unstop.com/api/public/opportunity/search-result"
    "?opportunity=hackathons&size=100&status=open"
)

_SEARCH_QUERIES = [
    "",                          # generic
    "&searchTerm=college",       # college-affiliated hackathons
    "&searchTerm=internship",    # internship / hiring challenges
]

REQUEST_TIMEOUT = 15

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/605.1.15 (KHTML, like Gecko) "
        "Version/16.1 Safari/605.1.15"
    ),
    "Accept": "application/json",
}

_session = None

def _get_session() -> requests.Session:
    global _session
    if _session is None:
        _session = requests.Session(impersonate="safari15_3")
        _session.headers.update(_HEADERS)
    return _session


# ── Parse API items ───────────────────────────────────────────────────────────

def _parse_api_items(items: list) -> list[dict]:
    """Parse a list of raw API items into normalised hackathon dicts."""
    results = []
    # Use timezone-aware UTC datetime
    from datetime import timezone
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    for item in items:
        title = item.get("title") or item.get("organisation", {}).get("name", "")
        # Unstop returns full URL in seo_url or we can build it
        link = item.get("seo_url", "")
        if not link:
            slug = item.get("public_url", "") or item.get("short_url", "")
            link = f"https://unstop.com/{slug}" if slug else ""
            
        if not title or not link:
            continue

        # Tags from 'filters' or 'tags' array
        tags = [
            t.get("name", "")
            for t in (item.get("filters") or item.get("tags") or [])
            if t.get("name")
        ]

        # Mode
        mode_raw = item.get("region", "") or ""
        if "online" in mode_raw.lower():
            mode = "Online"
        elif "offline" in mode_raw.lower():
            mode = "Offline"
        else:
            mode = "Unknown"

        # Deadline
        raw_deadline = item.get("regnRequirements", {}).get("end_regn_dt") or item.get("end_date") or ""
        deadline = "TBA"
        deadline_iso = ""
        status = "Open"

        if raw_deadline:
            if isinstance(raw_deadline, (int, float)):
                try:
                    ts = float(raw_deadline)
                    if ts > 1e12: ts /= 1000
                    dt = datetime.fromtimestamp(ts, timezone.utc)
                    deadline = dt.strftime("%d %b %Y")
                    deadline_iso = dt.strftime("%Y-%m-%d")
                except Exception:
                    pass
            elif isinstance(raw_deadline, str):
                for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
                    try:
                        dt = datetime.strptime(raw_deadline.split(".")[0].split("+")[0], fmt)
                        deadline = dt.strftime("%d %b %Y")
                        deadline_iso = dt.strftime("%Y-%m-%d")
                        break
                    except ValueError:
                        continue

        if deadline_iso and deadline_iso < now_iso:
            status = "Ended"
            # We no longer skip expired hackathons, so the total count matches user expectations.
            # UI handles displaying them correctly.

        prizes = item.get("prizes", [])
        prize_str = ""
        if prizes and len(prizes) > 0 and prizes[0].get("cash"):
            prize_str = f"₹{prizes[0].get('cash')}"
            
        org = item.get("organisation", {}).get("name", "")

        results.append({
            "title":        title,
            "deadline":     deadline,
            "deadline_iso": deadline_iso,
            "status":       status,
            "mode":         mode,
            "tags":         tags,
            "link":         link,
            "source":       "Unstop",
            "prize":        prize_str,
            "organization": org,
            "scraped_at":   datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        })

    return results


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=15),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)
def _fetch_query(session, url: str) -> tuple[list[dict], int, int]:
    """Fetch a single Unstop API query. Returns (parsed_items, current_page, last_page)."""
    resp = session.get(url, timeout=REQUEST_TIMEOUT)
    if resp.status_code != 200:
        raise RuntimeError(f"Unstop API returned status {resp.status_code}")
    data = resp.json()
    
    pagination_data = data.get("data", {})
    current_page = pagination_data.get("current_page", 1)
    last_page = pagination_data.get("last_page", 1)
    
    items = pagination_data.get("data", [])
    return items, _parse_api_items(items), current_page, last_page


def _fetch_via_api() -> list[dict]:
    session = _get_session()
    all_items = {}

    for query in _SEARCH_QUERIES:
        for page in range(1, 21):  # up to 20 pages (2000 items) per query
            url = f"{UNSTOP_API_BASE}&page={page}{query}"
            try:
                raw_items, parsed, current_page, last_page = _fetch_query(session, url)
                for p in parsed:
                    all_items[p["link"]] = p
                
                logger.info("Unstop: Query '%s' fetched page %d/%d (total unique so far: %d)", query, current_page, last_page, len(all_items))
                
                if current_page >= last_page or not raw_items:
                    break
                    
            except Exception as e:
                logger.warning("Unstop API query '%s' page %d failed after retries: %s", query, page, e)
                break

            time.sleep(random.uniform(1.5, 3.0))  # Be nice to the API

    return list(all_items.values())


# ── Public API ────────────────────────────────────────────────────────────────

def scrape_unstop() -> list[dict]:
    """
    Return a list of normalised hackathon dicts from Unstop.
    """
    logger.info("Unstop scraper started.")

    results = _fetch_via_api()
    if results:
        print(f"[DEBUG] scrape_unstop() total: {len(results)} hackathon(s) from API.")
    else:
        logger.warning("Unstop API returned 0 results. Cloudflare may be blocking requests.")
        print("[DEBUG] scrape_unstop() total: 0 hackathons.")
        
    return results


if __name__ == "__main__":
    import sys
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", stream=sys.stdout)
    results = scrape_unstop()
    if results:
        print(f"\n{len(results)} hackathons found:\n")
        for h in results:
            print(f"  * {h['title']}")
            print(f"    {h['deadline']} | {h['mode']} | {', '.join(h['tags']) or 'no tags'}")
            print(f"    {h['link']}\n")
    else:
        print("No Unstop hackathons found.")
