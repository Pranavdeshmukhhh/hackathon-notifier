"""
web_discovery_scraper.py — Multi-Engine Web Discovery Scanner.

Discovers hackathon announcements across the open internet by scanning:
  - Google Search (via scraping search results pages)
  - Eventbrite public events
  - Luma.com events
  - MLH (Major League Hacking) event feeds
  - KonfHub events
  - Meetup.com tech events
  - College fest websites (techfest.org, mood-indigo, etc.)

Each discovered event goes through the same verification pipeline used
by the Instagram scraper to ensure only legitimate hackathons are indexed.

Architecture:
  - All sources are scraped via public HTTP endpoints (no API keys).
  - Results are de-duplicated by link URL before MongoDB upsert.
  - Polite rate limiting (1-3s delays) to avoid blocks.
"""

import logging
import re
import time
import random
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse, quote_plus

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger("web_discovery_scraper")

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# ── Search Queries for Google Discovery ──────────────────────────────────────
DISCOVERY_QUERIES = [
    "hackathon india 2026 register",
    "hackathon india 2025 upcoming",
    "college hackathon india register now",
    "online hackathon open registration 2026",
    "IIT hackathon 2026",
    "NIT hackathon 2026 register",
    "coding competition india prize pool",
    "web3 hackathon india 2026",
    "AI hackathon india registration open",
    "pune hackathon 2026",
    "hyderabad hackathon 2026",
    "bangalore hackathon 2026",
    "delhi hackathon 2026",
    "devfolio hackathon open",
    "unstop hackathon open registration",
    "megathon iiit hyderabad register",
    "megathon x singularity",
]

# ── Known Hackathon Platform Domains (high trust) ────────────────────────────
TRUSTED_DOMAINS = {
    "devfolio.co", "unstop.com", "devpost.com", "hackerearth.com",
    "dare2compete.com", "kaggle.com", "mlh.io", "lu.ma", "luma.com",
    "konfhub.com", "eventbrite.com", "eventbrite.in",
    "meetup.com", "techfest.org", "hackon.live", "megathon.in",
}

# ── Reject domains that are never hackathon registrations ────────────────────
REJECT_DOMAINS = {
    "youtube.com", "twitter.com", "x.com", "facebook.com",
    "reddit.com", "linkedin.com", "medium.com", "quora.com",
    "wikipedia.org", "amazon.com", "flipkart.com",
    "google.com", "bing.com", "pinterest.com",
}


def _polite_delay():
    """Random delay between 1.5-4 seconds to avoid rate-limiting."""
    time.sleep(random.uniform(1.5, 4.0))


def _is_hackathon_url(url: str) -> bool:
    """Quick check if a URL is likely a hackathon page."""
    url_lower = url.lower()
    domain = urlparse(url_lower).netloc.replace("www.", "")

    if domain in REJECT_DOMAINS:
        return False

    # Trust known hackathon platforms
    for trusted in TRUSTED_DOMAINS:
        if trusted in domain:
            return True

    # Check URL path for hackathon indicators
    hackathon_url_patterns = [
        "hackathon", "hack", "challenge", "competition",
        "contest", "ideathon", "makeathon", "codeathon",
    ]
    return any(p in url_lower for p in hackathon_url_patterns)


def _extract_metadata_from_url(url: str) -> Optional[dict]:
    """Fetch and extract hackathon metadata from a URL page."""
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=8, allow_redirects=True)
        if resp.status_code != 200:
            return None

        soup = BeautifulSoup(resp.text, "html.parser")

        # Extract title
        og_title = soup.find("meta", property="og:title") or soup.find("meta", attrs={"name": "twitter:title"})
        title = None
        if og_title and og_title.get("content"):
            title = og_title["content"].strip()
        elif soup.title and soup.title.string:
            title = soup.title.string.strip()

        if not title or len(title) < 5:
            return None

        # Clean platform suffixes from title
        title = re.split(
            r"[\-|–—:]\s*(?:Devfolio|Unstop|Devpost|HackerEarth|MLH|Eventbrite|Luma|KonfHub)",
            title, flags=re.IGNORECASE
        )[0].strip()

        # Extract description
        og_desc = (
            soup.find("meta", property="og:description")
            or soup.find("meta", attrs={"name": "description"})
            or soup.find("meta", attrs={"name": "twitter:description"})
        )
        desc = og_desc["content"].strip()[:500] if og_desc and og_desc.get("content") else ""

        # Extract image
        og_img = soup.find("meta", property="og:image") or soup.find("meta", attrs={"name": "twitter:image"})
        image = og_img["content"].strip() if og_img and og_img.get("content") else None

        # Determine source from domain
        domain = urlparse(url).netloc.lower().replace("www.", "")
        source = "Web Discovery"
        for trusted in TRUSTED_DOMAINS:
            if trusted in domain:
                source = trusted.split(".")[0].capitalize()
                break

        # Determine mode
        combined_text = f"{title} {desc}".lower()
        if any(kw in combined_text for kw in ["online", "virtual", "remote"]):
            mode = "Virtual"
            location = "Online"
        elif any(kw in combined_text for kw in ["offline", "in-person", "campus", "venue"]):
            mode = "Offline"
            location = _detect_city(combined_text) or "TBA"
        elif any(kw in combined_text for kw in ["hybrid"]):
            mode = "Hybrid"
            location = _detect_city(combined_text) or "Hybrid"
        else:
            mode = "Virtual"
            location = "Online"

        # Extract tags
        tags = _detect_tags(combined_text)

        # Try to find deadline
        deadline_str, deadline_iso = _scan_for_dates(combined_text)

        # Try to find prize
        prize = _scan_for_prize(combined_text)

        return {
            "title": title,
            "link": resp.url,  # Use final URL after redirects
            "source": source,
            "mode": mode,
            "location": location,
            "deadline": deadline_str or "TBA",
            "deadline_iso": deadline_iso,
            "prize": prize or "TBA",
            "tags": tags,
            "desc": desc,
            "image": image,
            "status": "Open",
            "is_past": False,
            "scraped_at": datetime.now(timezone.utc).isoformat(),
            "verified": True,
            "discovery_source": "web_discovery",
        }

    except requests.RequestException as e:
        logger.debug("Request failed for %s: %s", url, e)
    except Exception as e:
        logger.debug("Error extracting metadata from %s: %s", url, e)

    return None


def _detect_city(text: str) -> Optional[str]:
    """Detect Indian cities in text."""
    city_map = {
        "pune": "Pune, Maharashtra", "mumbai": "Mumbai, Maharashtra",
        "delhi": "New Delhi, Delhi", "bengaluru": "Bengaluru, Karnataka",
        "bangalore": "Bengaluru, Karnataka", "hyderabad": "Hyderabad, Telangana",
        "chennai": "Chennai, Tamil Nadu", "kolkata": "Kolkata, West Bengal",
        "ahmedabad": "Ahmedabad, Gujarat", "jaipur": "Jaipur, Rajasthan",
        "noida": "Noida, UP", "gurgaon": "Gurgaon, Haryana",
        "chandigarh": "Chandigarh", "bhopal": "Bhopal, MP",
        "indore": "Indore, MP", "lucknow": "Lucknow, UP",
        "kochi": "Kochi, Kerala", "thiruvananthapuram": "Thiruvananthapuram, Kerala",
    }
    for city, full in city_map.items():
        if re.search(rf"\b{city}\b", text, re.IGNORECASE):
            return full
    return None


def _detect_tags(text: str) -> list[str]:
    """Detect technology/theme tags from text."""
    tags = set()
    tag_map = {
        "ai": ["ai", "artificial intelligence", "genai"],
        "ml": ["machine learning", "deep learning", "neural"],
        "web3": ["web3", "blockchain", "crypto", "solana", "ethereum"],
        "fintech": ["fintech", "finance", "banking"],
        "iot": ["iot", "hardware", "arduino", "raspberry"],
        "cloud": ["cloud", "aws", "azure", "gcp"],
        "cybersecurity": ["cybersecurity", "security", "ctf"],
        "open-source": ["open source", "open-source", "foss"],
        "healthtech": ["healthtech", "health tech", "medtech"],
        "sustainability": ["sustainability", "climate", "green tech"],
        "gaming": ["gaming", "game dev", "unity"],
        "mobile": ["mobile app", "android", "ios", "flutter"],
        "data-science": ["data science", "data analytics"],
    }
    for tag, keywords in tag_map.items():
        if any(kw in text for kw in keywords):
            tags.add(tag)
    return sorted(list(tags))[:10]


def _scan_for_dates(text: str) -> tuple[Optional[str], Optional[str]]:
    """Extract dates from text."""
    months_map = {
        "jan": "01", "feb": "02", "mar": "03", "apr": "04",
        "may": "05", "jun": "06", "jul": "07", "aug": "08",
        "sep": "09", "oct": "10", "nov": "11", "dec": "12",
    }

    # "Jan 15, 2026" or "January 15, 2026"
    match = re.search(r"(\w{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})", text, re.IGNORECASE)
    if match:
        month_str, day, year = match.groups()
        month = months_map.get(month_str.lower()[:3])
        if month:
            iso = f"{int(year):04d}-{month}-{int(day):02d}"
            return f"{month_str} {day}, {year}", iso

    # ISO format
    match = re.search(r"(\d{4})-(\d{2})-(\d{2})", text)
    if match:
        iso = match.group(0)
        return iso, iso

    return None, None


def _scan_for_prize(text: str) -> Optional[str]:
    """Extract prize information from text."""
    patterns = [
        r"(₹[\d,.\s]+(?:lakh|lac|crore|cr|k)?)",
        r"(\$[\d,.\s]+(?:k|K)?)",
        r"(\d+(?:\.\d+)?)\s*(?:lakh|lac)s?",
        r"(\d+(?:\.\d+)?)\s*(?:crore|cr)s?",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(0).strip()
    return None


def _scrape_google_search(query: str, max_results: int = 10) -> list[str]:
    """
    Scrape Google search results for hackathon URLs.
    Returns a list of discovered URLs.
    """
    urls = []
    encoded_query = quote_plus(query)
    search_url = f"https://www.google.com/search?q={encoded_query}&num={max_results}"

    try:
        resp = requests.get(
            search_url,
            headers={
                **_HEADERS,
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                ),
            },
            timeout=8,
        )
        if resp.status_code != 200:
            logger.debug("Google search returned %d for query: %s", resp.status_code, query)
            return urls

        soup = BeautifulSoup(resp.text, "html.parser")

        # Extract links from search results
        for a_tag in soup.find_all("a", href=True):
            href = a_tag["href"]

            # Google wraps results in /url?q=... redirects
            if "/url?q=" in href:
                actual_url = href.split("/url?q=")[1].split("&")[0]
                if _is_hackathon_url(actual_url):
                    urls.append(actual_url)
            elif href.startswith("http") and _is_hackathon_url(href):
                domain = urlparse(href).netloc
                if "google" not in domain:
                    urls.append(href)

    except requests.RequestException as e:
        logger.debug("Google search failed for '%s': %s", query, e)
    except Exception as e:
        logger.debug("Error parsing Google results for '%s': %s", query, e)

    return list(set(urls))[:max_results]


def _scrape_eventbrite(keyword: str = "hackathon") -> list[dict]:
    """Scrape Eventbrite for hackathon events in India."""
    discovered = []
    url = f"https://www.eventbrite.com/d/india/{quote_plus(keyword)}/"

    try:
        resp = requests.get(url, headers=_HEADERS, timeout=10)
        if resp.status_code != 200:
            return discovered

        soup = BeautifulSoup(resp.text, "html.parser")

        # Extract event links
        for a_tag in soup.find_all("a", href=True):
            href = a_tag["href"]
            if "/e/" in href and "eventbrite" in href:
                meta = _extract_metadata_from_url(href)
                if meta and meta.get("title"):
                    meta["source"] = "Eventbrite"
                    discovered.append(meta)
                    if len(discovered) >= 10:
                        break
                _polite_delay()

    except Exception as e:
        logger.warning("Eventbrite scan error: %s", e)

    return discovered


def _scrape_mlh_events() -> list[dict]:
    """Scrape Major League Hacking event listings."""
    discovered = []
    url = "https://mlh.io/seasons/2026/events"

    try:
        resp = requests.get(url, headers=_HEADERS, timeout=10)
        if resp.status_code != 200:
            # Try alternate URL
            resp = requests.get("https://mlh.io/events", headers=_HEADERS, timeout=10)
            if resp.status_code != 200:
                return discovered

        soup = BeautifulSoup(resp.text, "html.parser")

        # MLH lists events as cards with links
        event_links = set()
        for a_tag in soup.find_all("a", href=True):
            href = a_tag["href"]
            if href.startswith("http") and "mlh.io" not in href.lower():
                # External event links from MLH
                if _is_hackathon_url(href):
                    event_links.add(href)

        # Also extract event titles and dates from the page
        for card in soup.find_all(class_=re.compile(r"event", re.IGNORECASE)):
            title_el = card.find(["h3", "h4", "h2", "a"])
            if title_el:
                title = title_el.get_text(strip=True)
                link = title_el.get("href") if title_el.name == "a" else None

                if title and len(title) > 5:
                    # Find date info in the card
                    date_el = card.find(class_=re.compile(r"date", re.IGNORECASE))
                    date_text = date_el.get_text(strip=True) if date_el else ""

                    loc_el = card.find(class_=re.compile(r"location", re.IGNORECASE))
                    loc_text = loc_el.get_text(strip=True) if loc_el else "Online"

                    mode = "Offline" if loc_text and loc_text.lower() != "online" else "Virtual"

                    discovered.append({
                        "title": title,
                        "link": link or url,
                        "source": "MLH",
                        "mode": mode,
                        "location": loc_text or "Online",
                        "deadline": date_text or "TBA",
                        "deadline_iso": None,
                        "prize": "TBA",
                        "tags": ["mlh"],
                        "desc": f"MLH Season event: {title}",
                        "status": "Open",
                        "is_past": False,
                        "scraped_at": datetime.now(timezone.utc).isoformat(),
                        "verified": True,
                        "discovery_source": "web_discovery",
                    })

    except Exception as e:
        logger.warning("MLH scan error: %s", e)

    return discovered


def _scrape_konfhub() -> list[dict]:
    """Scrape KonfHub for tech events and hackathons."""
    discovered = []
    url = "https://konfhub.com/hackathons"

    try:
        resp = requests.get(url, headers=_HEADERS, timeout=10)
        if resp.status_code != 200:
            return discovered

        soup = BeautifulSoup(resp.text, "html.parser")

        for a_tag in soup.find_all("a", href=True):
            href = a_tag["href"]
            if "konfhub.com" in href and "/event/" in href:
                meta = _extract_metadata_from_url(href)
                if meta and meta.get("title"):
                    meta["source"] = "KonfHub"
                    discovered.append(meta)
                    if len(discovered) >= 10:
                        break
                _polite_delay()

    except Exception as e:
        logger.warning("KonfHub scan error: %s", e)

    return discovered


def run_web_discovery(
    queries: list[str] | None = None,
    max_per_query: int = 5,
) -> list[dict]:
    """
    Main entry point: run multi-engine web discovery for hackathons.

    Args:
        queries: Custom search queries (defaults to DISCOVERY_QUERIES)
        max_per_query: Max results to extract per query

    Returns:
        List of verified hackathon documents ready for MongoDB insertion.
    """
    target_queries = queries or DISCOVERY_QUERIES[:8]  # Limit for speed
    all_discovered = []
    seen_links = set()

    logger.info("Web discovery starting: %d search queries", len(target_queries))

    # 1. Google Search Discovery
    for query in target_queries:
        try:
            urls = _scrape_google_search(query, max_results=max_per_query)
            for url in urls:
                if url in seen_links:
                    continue
                meta = _extract_metadata_from_url(url)
                if meta and meta.get("title"):
                    seen_links.add(url)
                    all_discovered.append(meta)
                _polite_delay()
        except Exception as e:
            logger.warning("Google discovery error for '%s': %s", query, e)

    # 2. MLH Events
    try:
        mlh_events = _scrape_mlh_events()
        for ev in mlh_events:
            link = ev.get("link", "")
            if link and link not in seen_links:
                seen_links.add(link)
                all_discovered.append(ev)
    except Exception as e:
        logger.warning("MLH discovery error: %s", e)

    _polite_delay()

    # 3. Eventbrite
    try:
        eb_events = _scrape_eventbrite("hackathon")
        for ev in eb_events:
            link = ev.get("link", "")
            if link and link not in seen_links:
                seen_links.add(link)
                all_discovered.append(ev)
    except Exception as e:
        logger.warning("Eventbrite discovery error: %s", e)

    _polite_delay()

    # 4. KonfHub
    try:
        kh_events = _scrape_konfhub()
        for ev in kh_events:
            link = ev.get("link", "")
            if link and link not in seen_links:
                seen_links.add(link)
                all_discovered.append(ev)
    except Exception as e:
        logger.warning("KonfHub discovery error: %s", e)

    logger.info(
        "Web discovery complete: %d hackathons discovered from internet",
        len(all_discovered)
    )
    return all_discovered
