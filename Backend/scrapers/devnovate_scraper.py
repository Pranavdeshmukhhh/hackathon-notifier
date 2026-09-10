"""
devnovate_scraper.py — Scraper for devnovate.co/events

Fetches hackathon/event listings from Devnovate's public events page
and normalises them into the same schema as other scrapers.

Schema output per item:
    title, deadline, deadline_iso, status, mode, tags, link,
    source="Devnovate", location, prize, organization,
    total_registrations, scraped_at
"""

import logging
import time
import random
from datetime import datetime, timezone
from urllib.parse import urljoin

from curl_cffi import requests
from bs4 import BeautifulSoup
from tenacity import retry, stop_after_attempt, wait_exponential, before_sleep_log

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────
DEVNOVATE_BASE    = "https://devnovate.co"
DEVNOVATE_EVENTS  = "https://devnovate.co/events"
REQUEST_TIMEOUT   = 20

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://devnovate.co/",
}

_session = None


def _get_session() -> requests.Session:
    global _session
    if _session is None:
        _session = requests.Session(impersonate="chrome110")
        _session.headers.update(_HEADERS)
    return _session


# ── Date parsing ──────────────────────────────────────────────────────────────

def _parse_date(raw: str) -> tuple[str, str]:
    """
    Try several date formats. Returns (human_readable, iso_date).
    Falls back to ('TBA', '') if parsing fails.
    """
    if not raw:
        return "TBA", ""

    raw = raw.strip()
    formats = [
        "%B %d, %Y",       # January 15, 2025
        "%b %d, %Y",       # Jan 15, 2025
        "%d %B %Y",        # 15 January 2025
        "%d %b %Y",        # 15 Jan 2025
        "%Y-%m-%d",        # 2025-01-15
        "%d/%m/%Y",        # 15/01/2025
        "%m/%d/%Y",        # 01/15/2025
        "%B %d %Y",        # January 15 2025
        "%b %d %Y",        # Jan 15 2025
    ]

    for fmt in formats:
        try:
            dt = datetime.strptime(raw, fmt)
            return dt.strftime("%d %b %Y"), dt.strftime("%Y-%m-%d")
        except ValueError:
            continue

    # Try extracting numbers from "Ends: 15 Jan 2025" style strings
    import re
    m = re.search(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", raw)
    if m:
        try:
            dt = datetime.strptime(f"{m.group(1)} {m.group(2)} {m.group(3)}", "%d %b %Y")
            return dt.strftime("%d %b %Y"), dt.strftime("%Y-%m-%d")
        except ValueError:
            pass

    return raw[:20], ""  # return raw text capped at 20 chars


# ── HTML Parsing ──────────────────────────────────────────────────────────────

def _parse_event_cards(html: str) -> list[dict]:
    """
    Parse the raw HTML of devnovate.co/events and extract event data.
    Handles different card structures Devnovate may use.
    """
    soup = BeautifulSoup(html, "html.parser")
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    results = []

    # --- Strategy 1: Look for <a> cards with event-like structure ---
    # Devnovate uses React, so cards are rendered as divs/articles inside anchor tags
    candidate_selectors = [
        "a[href*='/events/']",
        "a[href*='/hackathon']",
        "div[class*='event'] a",
        "div[class*='card'] a",
        "article a",
    ]

    event_links = []
    for sel in candidate_selectors:
        found = soup.select(sel)
        if found:
            event_links.extend(found)
            break

    # If we found anchor-based cards, parse each one
    for anchor in event_links:
        href = anchor.get("href", "")
        if not href:
            continue
        link = href if href.startswith("http") else urljoin(DEVNOVATE_BASE, href)

        # Skip non-event links
        if "/events" not in link and "/hackathon" not in link:
            continue

        # Extract text content from card
        text_blocks = [t.strip() for t in anchor.stripped_strings if t.strip()]
        if not text_blocks:
            continue

        title = text_blocks[0] if text_blocks else ""
        if not title or len(title) < 3:
            continue

        # Look for date pattern in card text
        import re
        deadline = "TBA"
        deadline_iso = ""
        for block in text_blocks[1:]:
            if re.search(r"\d{4}", block) or re.search(r"[A-Za-z]+ \d+", block):
                deadline, deadline_iso = _parse_date(block)
                if deadline != "TBA":
                    break

        # Mode detection
        card_text = " ".join(text_blocks).lower()
        if "online" in card_text:
            mode = "Online"
        elif "offline" in card_text or "in-person" in card_text or "hybrid" in card_text:
            mode = "Offline"
        else:
            mode = "Unknown"

        # Prize detection
        prize = ""
        prize_match = re.search(r"[₹$€£]\s*[\d,]+(?:[kKlL])?|[\d,]+\+?\s*(?:USD|INR|prize|reward)", " ".join(text_blocks), re.IGNORECASE)
        if prize_match:
            prize = prize_match.group(0).strip()

        # Tags — look for small tag-like spans inside the card
        tags = []
        for tag_el in anchor.select("span[class*='tag'], span[class*='chip'], span[class*='badge'], div[class*='tag']"):
            tag_text = tag_el.get_text(strip=True)
            if tag_text and len(tag_text) < 30 and tag_text.lower() not in ("online", "offline", "open", "closed"):
                tags.append(tag_text)

        # Location
        location = ""
        for block in text_blocks:
            if re.search(r"mumbai|delhi|bangalore|bengaluru|chennai|hyderabad|pune|kolkata|india|iit|nit|bits", block, re.IGNORECASE):
                location = block
                break
        if mode == "Online":
            location = "Online"

        # Status
        status = "Open"
        if deadline_iso and deadline_iso < now_iso:
            status = "Ended"

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
            "organization":        "",
            "total_registrations": 0,
            "scraped_at":          datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        results.append(doc)

    # --- Strategy 2: JSON-LD / script tags for structured data ---
    if not results:
        import json
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string or "")
                items = data if isinstance(data, list) else [data]
                for item in items:
                    if item.get("@type") not in ("Event", "Hackathon"):
                        continue
                    title = item.get("name", "")
                    link  = item.get("url", "")
                    if not title or not link:
                        continue
                    raw_date = item.get("endDate") or item.get("startDate") or ""
                    deadline, deadline_iso = _parse_date(raw_date[:10] if raw_date else "")
                    location_obj = item.get("location", {})
                    location = ""
                    if isinstance(location_obj, dict):
                        loc_name = location_obj.get("name", "")
                        address = location_obj.get("address", {})
                        if isinstance(address, dict):
                            location = address.get("addressLocality", "") or loc_name
                        else:
                            location = loc_name or str(address)
                    mode = "Online" if "online" in str(location_obj).lower() else "Unknown"
                    status = "Open"
                    if deadline_iso and deadline_iso < now_iso:
                        status = "Ended"
                    results.append({
                        "title":               title,
                        "deadline":            deadline,
                        "deadline_iso":        deadline_iso,
                        "status":              status,
                        "mode":                mode,
                        "tags":                [],
                        "link":                link,
                        "source":              "Devnovate",
                        "location":            location,
                        "prize":               "",
                        "organization":        item.get("organizer", {}).get("name", "") if isinstance(item.get("organizer"), dict) else "",
                        "total_registrations": 0,
                        "scraped_at":          datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                    })
            except (json.JSONDecodeError, AttributeError):
                continue

    # Deduplicate by link
    seen = set()
    unique = []
    for doc in results:
        lnk = doc.get("link", "")
        if lnk and lnk not in seen:
            seen.add(lnk)
            unique.append(doc)

    return unique


# ── HTTP fetch with retry ─────────────────────────────────────────────────────

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)
def _fetch_page(url: str) -> str:
    """Fetch a page and return its HTML body."""
    session = _get_session()
    resp = session.get(url, timeout=REQUEST_TIMEOUT)
    if resp.status_code != 200:
        raise RuntimeError(f"Devnovate returned HTTP {resp.status_code} for {url}")
    return resp.text


def _fetch_all_events() -> list[dict]:
    """Fetch and parse the devnovate events page (with optional pagination)."""
    all_items: dict[str, dict] = {}

    try:
        html = _fetch_page(DEVNOVATE_EVENTS)
        items = _parse_event_cards(html)
        for item in items:
            all_items[item["link"]] = item
        logger.info("Devnovate: page 1 — %d events parsed.", len(items))
    except Exception as e:
        logger.warning("Devnovate: failed to fetch main page: %s", e)
        return []

    # Try paginated pages (page=2, 3, ...) until we get an empty response
    page = 2
    max_pages = 10
    while page <= max_pages:
        url = f"{DEVNOVATE_EVENTS}?page={page}"
        try:
            time.sleep(random.uniform(1.5, 3.0))
            html = _fetch_page(url)
            items = _parse_event_cards(html)
            if not items:
                logger.info("Devnovate: no more events on page %d — stopping.", page)
                break
            for item in items:
                all_items[item["link"]] = item
            logger.info("Devnovate: page %d — %d new events.", page, len(items))
            page += 1
        except Exception as e:
            logger.warning("Devnovate: page %d fetch failed: %s", page, e)
            break

    return list(all_items.values())


# ── Public API ────────────────────────────────────────────────────────────────

def scrape_devnovate() -> list[dict]:
    """
    Return a list of normalised hackathon dicts from Devnovate.co.
    Follows the same schema as other scrapers in this project.
    """
    logger.info("Devnovate scraper started.")
    results = _fetch_all_events()

    if results:
        logger.info("Devnovate scraper complete: %d event(s) found.", len(results))
        print(f"[DEBUG] scrape_devnovate() total: {len(results)} event(s).")
    else:
        logger.warning("Devnovate scraper returned 0 results — page structure may have changed.")
        print("[DEBUG] scrape_devnovate() total: 0 events.")

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
            print(f"    {h['deadline']} | {h['mode']} | {h['link']}\n")
    else:
        print("No Devnovate events found.")
