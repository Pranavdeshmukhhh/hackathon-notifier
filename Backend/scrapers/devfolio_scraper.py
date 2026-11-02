"""
devfolio_scraper.py — Scrape open hackathon listings from Devfolio.

Flow:
  1. GET https://devfolio.co/hackathons
  2. Parse HTML with BeautifulSoup using a persistent requests.Session
  3. For each hackathon, call the detail API to fetch location/description
  4. Yield normalised dicts: {title, deadline, mode, tags, link, source,
     location, desc, tagline, scraped_at}

A single requests.Session is reused across retries to avoid repeated
TCP/TLS handshakes.
"""

import json
import logging
import re
import time
from datetime import datetime, timezone
from typing import Optional

import requests
from bs4 import BeautifulSoup
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type, before_sleep_log

from .geocoder import geocode

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────
DEVFOLIO_URL    = "https://devfolio.co/hackathons"
DEVFOLIO_DETAIL = "https://api.devfolio.co/api/hackathons/{slug}"
MAX_RETRIES     = 3
RETRY_DELAY_S   = 3
REQUEST_TIMEOUT = 15
DETAIL_TIMEOUT  = 8

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

# Module-level session — reused across calls for connection keep-alive
_session: Optional[requests.Session] = None


def _get_session() -> requests.Session:
    global _session
    if _session is None:
        _session = requests.Session()
        _session.headers.update(_HEADERS)
    return _session


# ── Internal helpers ──────────────────────────────────────────────────────────

@retry(
    stop=stop_after_attempt(MAX_RETRIES),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    retry=retry_if_exception_type(requests.exceptions.RequestException),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)
def _fetch_page_inner(session: requests.Session, url: str) -> str:
    """Fetch page HTML; tenacity handles retries with exponential backoff."""
    resp = session.get(url, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    return resp.text


def _fetch_page(url: str) -> Optional[str]:
    """Download page HTML with exponential-backoff retries. Returns None on failure."""
    session = _get_session()
    try:
        html = _fetch_page_inner(session, url)
        logger.info("Devfolio fetch OK")
        return html
    except Exception:
        logger.error("Devfolio: all %d attempts failed.", MAX_RETRIES)
        return None


def _fetch_detail(slug: str) -> dict:
    """
    Call the Devfolio detail API for a single hackathon to fetch
    location, description, tagline, and prize info.
    Returns a dict with the extra fields (empty strings on failure).
    """
    result = {"location": "", "desc": "", "tagline": "", "prize": ""}

    if not slug:
        return result

    session = _get_session()
    url = DEVFOLIO_DETAIL.format(slug=slug)
    try:
        resp = session.get(
            url,
            timeout=DETAIL_TIMEOUT,
            headers={"Accept": "application/json"},
        )
        if resp.status_code != 200:
            return result

        data = resp.json()
        # The response may be nested under "data" or flat
        hackathon = data.get("data", data) if isinstance(data, dict) else {}
        if not isinstance(hackathon, dict):
            return result

        result["location"] = (
            hackathon.get("location", "")
            or hackathon.get("city", "")
            or ""
        )
        result["desc"] = (
            hackathon.get("desc", "")
            or hackathon.get("description", "")
            or ""
        )
        result["tagline"] = hackathon.get("tagline", "") or ""
        result["prize"] = (
            hackathon.get("prize", "")
            or hackathon.get("prize_amount", "")
            or ""
        )
        settings=hackathon.get('settings') or hackathon.get('hackathon_setting') or {}
        if not isinstance(settings,dict):settings={}
        registration_end=settings.get('reg_ends_at')
        result.update(event_start=hackathon.get('starts_at'),event_end=hackathon.get('ends_at'),
            registration_opens_at=settings.get('reg_starts_at'),source_event_id=hackathon.get('uuid'),
            source_updated_at=hackathon.get('updated_at'))
        if registration_end:
            result['registration_deadline']={'at':registration_end}
            result['deadline_kind']='registration'
        organizer=hackathon.get('organizer')
        result['organizer']=organizer.get('name') if isinstance(organizer,dict) else organizer
        # Truncate very long descriptions to save DB/network bandwidth
        if result["desc"] and len(result["desc"]) > 500:
            result["desc"] = result["desc"][:497] + "…"

    except requests.exceptions.Timeout:
        logger.debug("Devfolio detail timeout for slug=%s", slug)
    except Exception:
        logger.debug("Devfolio detail error for slug=%s", slug, exc_info=True)

    return result


def _extract_slug(link: str) -> str:
    """Extract the hackathon slug from a Devfolio URL."""
    # e.g. "https://devfolio.co/hackathons/code-relay" -> "code-relay"
    # or   "https://code-relay.devfolio.co" -> "code-relay"
    if not link:
        return ""
    # Pattern 1: /hackathons/<slug>
    match = re.search(r"/hackathons/([^/?#]+)", link)
    if match:
        return match.group(1)
    # Pattern 2: <slug>.devfolio.co
    match = re.search(r"https?://([^.]+)\.devfolio\.co", link)
    if match:
        slug = match.group(1)
        if slug not in ("www", "api", "devfolio"):
            return slug
    return ""


def _parse_card(card) -> Optional[dict]:
    """Extract structured data from a single hackathon card element."""
    try:
        # ── Title + Link ──────────────────────────────────────────────────────
        anchor = card.select_one("a.Link__LinkBase-sc-c569441e-0")
        if not anchor:
            # Fallback: any anchor that wraps an h3
            anchor = next(
                (a for a in card.find_all("a", recursive=True) if a.find("h3")),
                None,
            )
        if not anchor:
            return None

        h3 = anchor.find("h3")
        title = (h3 or anchor).get_text(strip=True)
        if not title:
            return None

        link: str = anchor.get("href", "")
        if link and not link.startswith("http"):
            link = f"https://devfolio.co{link}"

        # ── Themes / Tags ─────────────────────────────────────────────────────
        tags = [
            p.get_text(strip=True)
            for p in card.select("div.TsCKF p")
            if p.get_text(strip=True).upper() != "THEME"
        ]

        # ── Mode + Deadline ───────────────────────────────────────────────────
        mode, deadline = "Unknown", ""
        status = ""  # Open, Ended, etc.
        for p in card.select("div.kvhgSq p"):
            text = p.get_text(strip=True)
            upper = text.upper()
            if upper in ("ONLINE", "OFFLINE"):
                mode = text.capitalize()
            elif upper in ("OPEN", "ENDED"):
                status = text.capitalize()
            elif upper.startswith("STARTS") or upper.startswith("ENDS"):
                deadline = text

        # Parse "Starts DD/MM/YY" into a proper ISO date string
        deadline_iso = ""
        if deadline:
            match = re.search(r"(\d{1,2})/(\d{1,2})/(\d{2,4})", deadline)
            if match:
                day, month, year = match.groups()
                yr = int(year)
                if yr < 100:
                    yr += 2000
                try:
                    dt = datetime(yr, int(month), int(day))
                    deadline_iso = dt.strftime("%Y-%m-%d")
                    deadline = dt.strftime("%d %b %Y")  # e.g. "11 Sep 2026"
                except ValueError:
                    pass

        if not deadline and status == "Ended":
            deadline = "Ended"

        return {
            "title":        title,
            "deadline":     "TBA",
            "deadline_kind": "unknown",
            "deadline_iso": None,  # Card date meaning is not confirmed
            "status":       status or ("Ended" if deadline == "Ended" else "Open"),
            "mode":         mode,
            "tags":         tags,
            "link":         link,
            "source":       "Devfolio",
            "scraped_at":   datetime.now(timezone.utc).replace(tzinfo=None).isoformat() + "Z",
        }

    except Exception:
        logger.warning("Error parsing Devfolio card", exc_info=True)
        return None


def _parse_next_data(html: str) -> list[dict]:
    """Extract hackathons directly from Next.js dehydratedState JSON in HTML."""
    results = []
    match = re.search(r'id="__NEXT_DATA__"[^>]*>(.*?)</script>', html)
    if not match:
        return []
    try:
        data = json.loads(match.group(1))
        queries = data.get("props", {}).get("pageProps", {}).get("dehydratedState", {}).get("queries", [])
        for q in queries:
            state_data = q.get("state", {}).get("data")
            if not isinstance(state_data, dict):
                continue
            for category in ("open_hackathons", "upcoming_hackathons", "featured_hackathons"):
                items = state_data.get(category) or []
                for item in items:
                    try:
                        if not isinstance(item, dict):
                            continue
                        name = (item.get("name") or "").strip()
                        slug = (item.get("slug") or "").strip()
                        if not name or not slug:
                            continue

                        link = f"https://{slug}.devfolio.co"

                        themes = item.get("themes") or []
                        tags = []
                        for t in themes:
                            if isinstance(t, dict):
                                t_name = t.get("name") or t.get("theme", {}).get("name")
                                if t_name:
                                    tags.append(str(t_name).strip())

                        is_online = item.get("is_online")
                        mode = "Online" if is_online is True else "Offline" if is_online is False else "Unknown"

                        settings = item.get("settings") or item.get("hackathon_setting") or {}
                        raw_ends = settings.get("reg_ends_at") or ""
                        deadline = "TBA"
                        deadline_iso = ""
                        status = "Unknown"

                        if raw_ends:
                            try:
                                clean_iso = str(raw_ends).replace("Z", "+00:00")
                                dt = datetime.fromisoformat(clean_iso)
                                deadline = dt.strftime("%d %b %Y")
                                deadline_iso = dt.strftime("%Y-%m-%d")
                                today_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d")
                                if deadline_iso < today_iso:
                                    status = "Ended"
                            except Exception:
                                deadline = str(raw_ends)[:10]
                                deadline_iso = str(raw_ends)[:10]

                        participants = item.get("participants_count") or 0

                        doc = {
                            "title":               name,
                            "deadline":            deadline,
                            "deadline_kind": "registration",
                            "registration_deadline": {"at":raw_ends} if raw_ends else None,
                            "registration_opens_at": settings.get("reg_starts_at"),
                            "event_start": item.get("starts_at"),
                            "event_end": item.get("ends_at"),
                            "organizer": item.get("organizer"),
                            "source_event_id": item.get("uuid"),
        "source_updated_at": item.get("updatedAt") or item.get("updated_at"),
                            "deadline_iso":        deadline_iso,
                            "status":              status,
                            "mode":                mode,
                            "tags":                tags,
                            "link":                link,
                            "source":              "Devfolio",
                            "total_registrations": int(participants) if participants else 0,
                            "scraped_at":          datetime.now(timezone.utc).replace(tzinfo=None).isoformat() + "Z",
                            "location":            item.get("location") or "",
                            "desc":                "",
                            "tagline":             "",
                            "prize":               "",
                        }
                        results.append(doc)
                    except (ValueError,TypeError,AttributeError,OverflowError):
                        continue
    except Exception as e:
        logger.warning("Error parsing Devfolio __NEXT_DATA__: %s", e)
    return results


def _confirmed_empty_feed(html):
    match=re.search(r'id="__NEXT_DATA__"[^>]*>(.*?)</script>',html)
    if not match:return False
    try:
        queries=json.loads(match.group(1))['props']['pageProps']['dehydratedState']['queries']
        feeds=[q.get('state',{}).get('data') for q in queries if isinstance(q,dict)]
        lists=[feed[key] for feed in feeds if isinstance(feed,dict) for key in ('open_hackathons','upcoming_hackathons','featured_hackathons') if key in feed]
        return bool(lists) and all(isinstance(items,list) and not items for items in lists)
    except (ValueError,TypeError,KeyError,AttributeError):return False


# ── Public API ────────────────────────────────────────────────────────────────

def scrape_devfolio() -> list[dict]:
    """
    Return a list of normalised hackathon dicts from Devfolio.
    Extracts from Next.js hydration payload (primary) or parses HTML cards (fallback).
    Enriches each hackathon with detail API data (location, desc, tagline).
    Returns [] on any failure (never raises).
    """
    logger.info("Devfolio scraper started.")

    html = _fetch_page(DEVFOLIO_URL)
    if not html:
        return []

    # 1. Primary: Extract from Next.js __NEXT_DATA__
    results = _parse_next_data(html)

    # 2. Fallback: Parse HTML cards if __NEXT_DATA__ produced nothing
    if not results and _confirmed_empty_feed(html):
        return []
    if not results:
        soup  = BeautifulSoup(html, "html.parser")
        cards = soup.find_all("div", class_=lambda c: c and "CompactHackathonCard" in c)
        if not cards:
            logger.warning("Devfolio: no hackathon cards found — HTML structure may have changed.")
            return []
        logger.info("Devfolio: %d cards found, parsing…", len(cards))
        results = [d for card in cards if (d := _parse_card(card)) and d["title"]]

    logger.info("Devfolio: %d hackathons extracted, enriching with detail API…", len(results))

    # ── Enrich with detail API ────────────────────────────────────────────────
    enriched_count = 0
    for hackathon in results:
        slug = _extract_slug(hackathon.get("link", ""))
        if slug:
            detail = _fetch_detail(slug)
            hackathon["location"] = detail["location"]
            
            if hackathon["location"]:
                lat, lng = geocode(hackathon["location"])
                if lat is not None and lng is not None:
                    hackathon["lat"] = lat
                    hackathon["lng"] = lng
            
            hackathon["desc"] = detail["desc"]
            hackathon["tagline"] = detail["tagline"]
            hackathon["prize"] = detail["prize"]
            for field in ('registration_deadline','registration_opens_at','deadline_kind','event_start','event_end','organizer','source_event_id','source_updated_at'):
                if detail.get(field):hackathon[field]=detail[field]
            if any(detail.values()):
                enriched_count += 1
            # Small delay to be polite to the API
            time.sleep(0.3)
        else:
            hackathon.setdefault("location", "")
            hackathon.setdefault("desc", "")
            hackathon.setdefault("tagline", "")
            hackathon.setdefault("prize", "")

    logger.info("Devfolio: %d/%d hackathons enriched via detail API.", enriched_count, len(results))
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
    results = scrape_devfolio()
    if results:
        print(f"\n{len(results)} hackathons found:\n")
        for h in results:
            print(f"  • {h['title']}")
            print(f"    {h['deadline']} | {h['mode']} | {', '.join(h['tags']) or 'no tags'}")
            loc = h.get('location', '')
            if loc:
                print(f"    📍 {loc}")
            desc = h.get('desc', '')
            if desc:
                print(f"    {desc[:80]}…" if len(desc) > 80 else f"    {desc}")
            print(f"    {h['link']}\n")
        sys.exit(0)
    else:
        print("No hackathons found — check logs.")
        sys.exit(1)
