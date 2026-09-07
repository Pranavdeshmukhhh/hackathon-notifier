"""
unstop_scraper.py — Scrape hackathon listings from Unstop.

Reality check (confirmed via testing):
  Unstop is behind Cloudflare Bot Management — it resets the TLS connection
  for ANY Python requests client, including fully-spoofed browser headers.
  Their robots.txt allows /hackathons/ and /api/public/*, but CF blocks
  non-browser TLS fingerprints before even serving the page.

Strategy:
  • Force IPv4 connections to avoid dual-stack DNS failures.
  • Attempt the public API endpoint first (fast, structured JSON).
  • Run targeted search queries for college + internship hackathons.
  • If the connection is reset / blocked, fall back to the HTML page.
  • If both fail, return [] with a clear warning — the bot continues
    running fine on Devfolio data alone.
  • No sleep at module level or at the top of the function.
    Rate-limiting (2 s) is the caller's (main.py) responsibility.
"""

import logging
import re
import time
import socket
from datetime import datetime
from typing import Optional

import requests
from requests.adapters import HTTPAdapter
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────
UNSTOP_API_BASE = (
    "https://unstop.com/api/public/opportunity/search-result"
    "?opportunity=hackathon&page=1&size=20&sort=deadline&status=open"
)
# Targeted search queries to surface college/internship results
_SEARCH_QUERIES = [
    "",                          # generic (no searchTerm)
    "&searchTerm=college",       # college-affiliated hackathons
    "&searchTerm=internship",    # internship / hiring challenges
]

UNSTOP_HTML_URL = "https://unstop.com/hackathons"
MAX_RETRIES     = 2          # Shorter — CF will block fast, no point retrying much
REQUEST_TIMEOUT = 12

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept":          "application/json, text/html, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer":         "https://unstop.com/hackathons",
    "Origin":          "https://unstop.com",
}


# ── IPv4-only adapter ────────────────────────────────────────────────────────
# Forces connections over IPv4, avoiding dual-stack failures where IPv6
# times out before falling back to IPv4.

class _IPv4HTTPAdapter(HTTPAdapter):
    """HTTPAdapter that forces AF_INET (IPv4) connections."""

    def init_poolmanager(self, *args, **kwargs):
        import urllib3.util.connection
        # Monkey-patch the allowed_gai_family to force IPv4
        self._orig_gai_family = urllib3.util.connection.allowed_gai_family

        def _force_ipv4():
            return socket.AF_INET

        urllib3.util.connection.allowed_gai_family = _force_ipv4
        super().init_poolmanager(*args, **kwargs)


_session: Optional[requests.Session] = None


def _get_session() -> requests.Session:
    global _session
    if _session is None:
        _session = requests.Session()
        _session.headers.update(_HEADERS)
        # Mount IPv4-only adapter for all HTTPS connections
        _session.mount("https://", _IPv4HTTPAdapter())
        _session.mount("http://", _IPv4HTTPAdapter())
    return _session


# ── Parse API items ───────────────────────────────────────────────────────────

def _parse_api_items(items: list) -> list[dict]:
    """Parse a list of raw API items into normalised hackathon dicts."""
    results = []
    now_iso = datetime.utcnow().strftime("%Y-%m-%d")

    for item in items:
        title = item.get("title") or item.get("organisation_info", {}).get("name", "")
        slug  = item.get("slug", "")
        link  = f"https://unstop.com/{slug}" if slug else ""
        if not title or not link:
            continue

        # Tags from 'filters' or 'tags' array
        tags = [
            t.get("name", "")
            for t in (item.get("filters") or item.get("tags") or [])
            if t.get("name")
        ]

        # Mode
        mode_raw = item.get("college_level", "") or ""
        if "online" in mode_raw.lower():
            mode = "Online"
        elif "offline" in mode_raw.lower():
            mode = "Offline"
        else:
            mode = "Unknown"

        # Deadline — try multiple source fields and formats
        raw_deadline = (
            item.get("regnRequirements", {}).get("end_regn_dt")
            or item.get("registration_deadline")
            or item.get("end_date")
            or ""
        )
        deadline = "TBA"
        deadline_iso = ""
        status = "Open"

        if raw_deadline:
            # Try Unix timestamp (seconds or milliseconds)
            try:
                ts = float(raw_deadline)
                if ts > 1e12:   # milliseconds
                    ts /= 1000
                dt = datetime.utcfromtimestamp(ts)
                deadline = dt.strftime("%d %b %Y")
                deadline_iso = dt.strftime("%Y-%m-%d")
            except (ValueError, TypeError, OSError):
                pass

            # Try ISO / common date string formats
            if not deadline_iso and isinstance(raw_deadline, str):
                for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S",
                            "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y",
                            "%b %d, %Y", "%d %b %Y"):
                    try:
                        dt = datetime.strptime(raw_deadline.split(".")[0].split("+")[0], fmt)
                        deadline = dt.strftime("%d %b %Y")
                        deadline_iso = dt.strftime("%Y-%m-%d")
                        break
                    except ValueError:
                        continue

            # Determine status from parsed date
            if deadline_iso and deadline_iso < now_iso:
                status = "Ended"

        results.append({
            "title":        title,
            "deadline":     deadline,
            "deadline_iso": deadline_iso,
            "status":       status,
            "mode":         mode,
            "tags":         tags,
            "link":         link,
            "source":       "Unstop",
            "scraped_at":   datetime.utcnow().isoformat() + "Z",
        })

    return results


# ── API path ──────────────────────────────────────────────────────────────────

def _fetch_via_api() -> list[dict]:
    """
    Hit Unstop's public JSON API with multiple targeted queries.
    Deduplicates results by link.  Returns [] on complete failure.
    """
    session = _get_session()
    seen_links: set[str] = set()
    all_results: list[dict] = []

    for query_suffix in _SEARCH_QUERIES:
        url = UNSTOP_API_BASE + query_suffix
        label = query_suffix or "(generic)"

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                logger.info("Unstop API %s attempt %d/%d…", label, attempt, MAX_RETRIES)
                resp = session.get(url, timeout=REQUEST_TIMEOUT,
                                   headers={"Accept": "application/json"})
                resp.raise_for_status()
                payload = resp.json()

                items = (
                    payload.get("data", {}).get("data")       # nested pagination format
                    or payload.get("data")                     # flat list
                    or []
                )
                if not isinstance(items, list):
                    logger.warning("Unstop API %s: unexpected payload shape — skipping.", label)
                    break

                parsed = _parse_api_items(items)
                new_count = 0
                for h in parsed:
                    if h["link"] not in seen_links:
                        seen_links.add(h["link"])
                        all_results.append(h)
                        new_count += 1

                logger.info("Unstop API %s: %d parsed, %d new.", label, len(parsed), new_count)
                break  # success — move to next query

            except requests.exceptions.ConnectionError:
                logger.warning(
                    "Unstop API %s: connection reset (attempt %d/%d).",
                    label, attempt, MAX_RETRIES,
                )
            except requests.exceptions.Timeout:
                logger.warning("Unstop API %s: timeout (attempt %d/%d).", label, attempt, MAX_RETRIES)
            except Exception:
                logger.warning("Unstop API %s: unexpected error", label, exc_info=True)

            if attempt < MAX_RETRIES:
                time.sleep(2)

    logger.info("Unstop API total: %d unique hackathons from %d queries.", len(all_results), len(_SEARCH_QUERIES))
    print(f"[DEBUG] Unstop API returned {len(all_results)} hackathon(s).")
    return all_results


# ── HTML fallback ─────────────────────────────────────────────────────────────

def _fetch_via_html() -> list[dict]:
    """
    Fall back to scraping the HTML listing page.
    Cloudflare may block this too — returns [] gracefully.
    """
    session = _get_session()
    try:
        logger.info("Unstop HTML fallback: fetching %s…", UNSTOP_HTML_URL)
        resp = session.get(UNSTOP_HTML_URL, timeout=REQUEST_TIMEOUT,
                           headers={"Accept": "text/html"})
        resp.raise_for_status()
    except requests.exceptions.ConnectionError:
        logger.warning("Unstop HTML: connection reset by Cloudflare — skipping.")
        return []
    except Exception:
        logger.warning("Unstop HTML: failed to fetch page", exc_info=True)
        return []

    soup  = BeautifulSoup(resp.text, "html.parser")
    # Unstop uses Angular SSR — hackathon cards are inside elements with
    # class containing 'single-listing' or similar. We try broadly.
    cards = soup.find_all("div", class_=lambda c: c and (
        "listing" in c.lower() or "card" in c.lower() or "hackathon" in c.lower()
    ))
    if not cards:
        cards = soup.find_all("article")

    if not cards:
        logger.warning(
            "Unstop HTML: no cards matched — page is likely rendered client-side."
        )
        return []

    results = []
    for card in cards:
        anchor = card.find("a", href=True)
        if not anchor:
            continue
        link = anchor["href"]
        if not link.startswith("http"):
            link = f"https://unstop.com{link}"

        title_el = card.find(["h2", "h3"])
        title = title_el.get_text(strip=True) if title_el else anchor.get_text(strip=True)
        if not title:
            continue

        body = card.get_text(" ", strip=True).lower()
        mode = "Online" if "online" in body else ("Offline" if "offline" in body else "Unknown")

        results.append({
            "title":        title,
            "deadline":     "TBA",
            "deadline_iso": "",
            "status":       "Open",
            "mode":         mode,
            "tags":         [],
            "link":         link,
            "source":       "Unstop",
            "scraped_at":   datetime.utcnow().isoformat() + "Z",
        })

    logger.info("Unstop HTML fallback: %d hackathons extracted.", len(results))
    print(f"[DEBUG] Unstop HTML fallback returned {len(results)} hackathon(s).")
    return results


# ── Public API ────────────────────────────────────────────────────────────────

def scrape_unstop() -> list[dict]:
    """
    Return a list of normalised hackathon dicts from Unstop.
    Tries the JSON API first (with targeted queries); falls back to HTML scraping.
    Returns [] on complete failure (never raises).

    NOTE: Unstop uses Cloudflare Bot Management.  If both paths return [],
    it means CF is blocking — this is expected in headless environments.
    The rest of the pipeline (Devfolio + filter + notify) is unaffected.
    """
    logger.info("Unstop scraper started.")

    results = _fetch_via_api()
    if results:
        print(f"[DEBUG] scrape_unstop() total: {len(results)} hackathon(s) from API.")
        return results

    logger.info("Unstop API returned nothing — trying HTML fallback…")
    results = _fetch_via_html()
    if not results:
        logger.warning(
            "Unstop: both API and HTML paths returned 0 results. "
            "Cloudflare is likely blocking requests. Continuing without Unstop data."
        )
        print("[DEBUG] scrape_unstop() total: 0 hackathons (Cloudflare block likely).")
    else:
        print(f"[DEBUG] scrape_unstop() total: {len(results)} hackathon(s) from HTML fallback.")
    return results


# ── Self-test ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stdout,
    )
    results = scrape_unstop()
    if results:
        print(f"\n{len(results)} hackathons found:\n")
        for h in results:
            print(f"  * {h['title']}")
            print(f"    {h['deadline']} | {h['mode']} | {', '.join(h['tags']) or 'no tags'}")
            print(f"    {h['link']}\n")
        sys.exit(0)
    else:
        print("No Unstop hackathons found (likely Cloudflare block — this is normal).")
        sys.exit(0)   # Not a fatal error
