"""
internet_scanner.py — Autonomous Multi-Engine Internet Hackathon Scanner.

Continuously scans web sources, APIs, GitHub event repositories, and feeds
using targeted keyword queries:
  - Big Colleges: IIT, NIT, IIIT, BITS, COEP, PICT, VJTI, DTU, NSUT, etc.
  - City Specific: Pune, Hyderabad, Bengaluru, Mumbai, Delhi, etc.
  - FAANG / MANGO: Meta, Google, Apple, Amazon/AWS, Netflix, Microsoft.
"""

import json
import logging
import os
import re
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

from db.mongo_client import get_collection
from filters.keyword_filter import classify_hackathon
from scrapers.geocoder import geocode

logger = logging.getLogger("internet_scanner")

# ── Monitored Keyword Sets ────────────────────────────────────────────────────
COLLEGE_KEYWORDS = [
    "iit", "nit", "iiit", "bits pilani", "coep", "pict", "vjti",
    "dtu", "nsut", "vit pune", "iiit hyderabad", "iiit bangalore",
    "iiit delhi", "iisc"
]

CITY_KEYWORDS = [
    "pune", "hyderabad", "bengaluru", "bangalore", "mumbai", "delhi", "chennai"
]

FAANG_KEYWORDS = [
    "faang", "mango", "meta", "google", "apple", "amazon", "netflix", "microsoft"
]

DEFAULT_KEYWORDS = [
    "iit", "nit", "iiit", "iiit hyderabad", "pune", "coep", "pict",
    "hyderabad", "bengaluru", "faang", "mango", "meta", "google"
]

_scanner_lock = threading.Lock()
_scanner_state = {
    "is_scanning": False,
    "last_scanned_at": None,
    "total_scans_run": 0,
    "total_new_indexed": 0,
    "active_keywords": {
        "colleges": COLLEGE_KEYWORDS,
        "cities": CITY_KEYWORDS,
        "faang": FAANG_KEYWORDS,
    },
    "last_scan_logs": [],
}


def get_scanner_status() -> dict:
    """Return live telemetry of the autonomous internet scanner."""
    return dict(_scanner_state)


def _clean_text(s: str) -> str:
    if not s:
        return ""
    return re.sub(r"\s+", " ", str(s)).strip()


def _scrape_unstop_feed(keyword: str) -> list[dict]:
    """Scan Unstop live public API for authentic hackathon opportunities matching keyword."""
    discovered = []
    try:
        from curl_cffi import requests as cffi_requests
        url = f"https://unstop.com/api/public/opportunity/search-result?opportunity=hackathons&size=20&status=open&searchTerm={keyword}"
        res = cffi_requests.get(url, impersonate="chrome107", timeout=10)
        if res.status_code == 200:
            data = res.json()
            items = data.get("data", {}).get("data", [])
            for item in items:
                title = item.get("title") or item.get("organisation", {}).get("name", "")
                link = item.get("seo_url")
                if not link:
                    slug = item.get("public_url") or item.get("short_url")
                    link = f"https://unstop.com/{slug}" if slug else ""
                if not title or not link:
                    continue

                if link.startswith("/"):
                    link = f"https://unstop.com{link}"

                # Strict rejection of any non-registration or raw code repos
                if "github.com" in link.lower():
                    continue

                tags = [keyword.lower()]
                for t in item.get("filters", []):
                    if isinstance(t, dict) and t.get("name"):
                        tags.append(t["name"].lower())

                # Location & mode
                regn_req = item.get("regnRequirements", {}) or {}
                raw_loc = regn_req.get("location") or ""
                region_type = (item.get("region") or "").lower()
                if "online" in region_type or not raw_loc or raw_loc.lower() == "online":
                    mode = "Virtual"
                    loc = "Online"
                else:
                    mode = "Offline"
                    loc = raw_loc

                # Prize
                prizes = item.get("prizes", [])
                prize_str = "TBA"
                if prizes and isinstance(prizes, list):
                    first_p = prizes[0]
                    if isinstance(first_p, dict) and first_p.get("cash"):
                        prize_str = f"₹{first_p.get('cash'):,}"

                # End date
                end_date = item.get("end_date") or item.get("register_end_date") or "TBA"
                deadline_iso = None
                if end_date and end_date != "TBA":
                    try:
                        deadline_iso = datetime.fromisoformat(end_date.replace("Z", "+00:00")).date().isoformat()
                    except Exception:
                        deadline_iso = None

                discovered.append({
                    "title": _clean_text(title),
                    "link": link,
                    "source": "Unstop",
                    "mode": mode,
                    "location": loc,
                    "deadline": end_date[:10] if end_date != "TBA" else "TBA",
                    "deadline_iso": deadline_iso,
                    "prize": prize_str,
                    "tags": sorted(list(set(tags))),
                    "desc": _clean_text(item.get("raw_description") or f"Hackathon challenge hosted on Unstop for {keyword}."),
                    "status": "Open",
                    "is_past": False,
                    "scraped_at": datetime.now(timezone.utc).isoformat(),
                })
    except Exception as e:
        logger.warning("Unstop scan error for keyword '%s': %s", keyword, e)

    return discovered


_feed_cache = {
    "devpost": {"data": None, "ts": 0},
    "hackerearth": {"data": None, "ts": 0},
}


def _scrape_devpost_feed(keyword: str) -> list[dict]:
    """Scan Devpost public hackathon directory matching keyword."""
    discovered = []
    try:
        now = time.time()
        cached = _feed_cache["devpost"]
        if cached["data"] is not None and (now - cached["ts"] < 180):
            data = cached["data"]
        else:
            url = "https://devpost.com/api/hackathons?status[]=upcoming&status[]=open&page=1"
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)",
                "Accept": "application/json",
            }
            res = requests.get(url, headers=headers, timeout=8)
            if res.status_code == 200:
                data = res.json()
                _feed_cache["devpost"] = {"data": data, "ts": now}
            else:
                data = cached["data"] or {}

        if data:
            k_lower = keyword.lower()
            for h in data.get("hackathons", []):
                title = h.get("title", "")
                desc = h.get("tagline") or ""
                link = h.get("url") or ""
                if not link:
                    continue

                full_str = f"{title} {desc}".lower()
                # Check if keyword matches
                if k_lower in full_str or k_lower in ["faang", "mango", "all"]:
                    tags = set(["devpost", k_lower])
                    for t in h.get("themes", []):
                        if isinstance(t, dict):
                            tags.add(t.get("name", "").lower())

                    loc_info = h.get("displayed_location", {})
                    loc_name = loc_info.get("location") if isinstance(loc_info, dict) else "Online"
                    mode = "Offline" if loc_name and loc_name.lower() != "online" else "Virtual"

                    prize_str = h.get("prize_amount")
                    prize_formatted = f"${prize_str:,}" if isinstance(prize_str, (int, float)) else (str(prize_str) if prize_str else "TBA")

                    discovered.append({
                        "title": _clean_text(title),
                        "link": link,
                        "source": "Devpost",
                        "mode": mode,
                        "location": loc_name or "Online",
                        "deadline": h.get("submission_period_dates") or "TBA",
                        "deadline_iso": None,
                        "prize": prize_formatted,
                        "tags": sorted(list(tags)),
                        "desc": _clean_text(desc),
                        "status": "Open",
                        "is_past": False,
                        "scraped_at": datetime.now(timezone.utc).isoformat(),
                    })
    except Exception as e:
        logger.warning("Devpost scan error for keyword '%s': %s", keyword, e)

    return discovered


def _scrape_hackerearth_feed(keyword: str) -> list[dict]:
    """Scan HackerEarth live events endpoint for keyword matches."""
    discovered = []
    try:
        now = time.time()
        cached = _feed_cache["hackerearth"]
        if cached["data"] is not None and (now - cached["ts"] < 180):
            data = cached["data"]
        else:
            url = "https://www.hackerearth.com/chrome-extension/events/"
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "application/json",
            }
            res = requests.get(url, headers=headers, timeout=8)
            if res.status_code == 200:
                data = res.json()
                _feed_cache["hackerearth"] = {"data": data, "ts": now}
            else:
                data = cached["data"] or {}

        if data:
            k_lower = keyword.lower()
            for ev in data.get("response", []):
                title = ev.get("title", "")
                link = ev.get("url") or ""
                desc = ev.get("description") or ""
                if not link:
                    continue

                full_str = f"{title} {desc}".lower()
                if k_lower in full_str or k_lower in ["faang", "mango", "all"]:
                    tags = set(["hackerearth", k_lower])
                    discovered.append({
                        "title": _clean_text(title),
                        "link": link,
                        "source": "HackerEarth",
                        "mode": "Virtual",
                        "location": "Online",
                        "deadline": ev.get("end_date") or "TBA",
                        "deadline_iso": None,
                        "prize": "Hiring Opportunity",
                        "tags": sorted(list(tags)),
                        "desc": _clean_text(desc or "HackerEarth technical innovation & hiring challenge."),
                        "status": "Open",
                        "is_past": False,
                        "scraped_at": datetime.now(timezone.utc).isoformat(),
                    })
    except Exception as e:
        logger.warning("HackerEarth scan error for keyword '%s': %s", keyword, e)

    return discovered


def scan_single_keyword(keyword: str) -> list[dict]:
    """Scan the internet across all supported channels for a specific keyword."""
    keyword = keyword.strip()
    if not keyword:
        return []

    logger.info("Scanning internet for keyword: '%s'...", keyword)
    results = []

    # 1. Unstop Hackathons (India #1 for IIT, NIT, IIIT, Pune, FAANG)
    results.extend(_scrape_unstop_feed(keyword))

    # 2. Devpost search
    results.extend(_scrape_devpost_feed(keyword))

    # 3. HackerEarth
    results.extend(_scrape_hackerearth_feed(keyword))

    # Strict guarantee: filter out any code repository links
    cleaned = []
    for r in results:
        lnk = (r.get("link") or "").lower()
        if not lnk or "github.com" in lnk or lnk.endswith(".git"):
            continue
        cleaned.append(r)

    return cleaned


def run_internet_scan(keywords: list[str] = None) -> dict:
    """
    Execute an autonomous internet scan sweep across college, city, and FAANG keywords.
    Deduplicates against MongoDB, classifies, geocodes, and inserts new items.
    """
    if _scanner_state["is_scanning"]:
        return {
            "success": False,
            "message": "Scanner is already actively running an internet sweep.",
            "new_indexed": 0,
        }

    with _scanner_lock:
        _scanner_state["is_scanning"] = True
        start_time = time.time()
        logs = []

    target_keywords = keywords if (keywords and len(keywords) > 0) else DEFAULT_KEYWORDS
    logs.append(f"Starting autonomous sweep across {len(target_keywords)} target keyword channels...")
    with _scanner_lock:
        _scanner_state["last_scan_logs"] = list(logs)

    collection = get_collection()
    new_indexed = 0
    total_found = 0

    try:
        for kw in target_keywords:
            with _scanner_lock:
                logs.append(f"Scanning internet channel '{kw}'...")
                _scanner_state["last_scan_logs"] = list(logs[-15:])
            found_items = scan_single_keyword(kw)
            total_found += len(found_items)

            for doc in found_items:
                link = doc.get("link")
                if not link:
                    continue

                # Classify academic tier, internship flags, and FAANG tags
                classify_hackathon(doc)

                # Geocode physical events
                if doc.get("mode", "").lower() == "offline" and doc.get("location"):
                    loc = doc["location"]
                    if loc.lower() not in {"online", "virtual", "tba"} and not doc.get("lat"):
                        lat, lng = geocode(loc)
                        if lat and lng:
                            doc["lat"] = lat
                            doc["lng"] = lng

                # Upsert to MongoDB
                if collection is not None:
                    res = collection.update_one({"link": link}, {"$set": doc}, upsert=True)
                    if res.upserted_id:
                        new_indexed += 1
                        logger.info("Auto-indexed new internet hackathon: %s", doc["title"])

        elapsed = round(time.time() - start_time, 2)
        logs.append(f"Sweep complete in {elapsed}s. Scanned: {total_found} items, New indexed: {new_indexed}.")

        # Invalidate API cache so fresh items are visible immediately
        try:
            from api import _cache
            _cache.clear()
        except Exception:
            pass

        with _scanner_lock:
            _scanner_state["last_scanned_at"] = datetime.now(timezone.utc).isoformat()
            _scanner_state["total_scans_run"] += 1
            _scanner_state["total_new_indexed"] += new_indexed
            _scanner_state["last_scan_logs"] = logs[-15:]

        return {
            "success": True,
            "message": f"Autonomous sweep completed in {elapsed}s. Found {total_found} opportunities, indexed {new_indexed} new events.",
            "total_found": total_found,
            "new_indexed": new_indexed,
            "keywords_scanned": target_keywords,
            "elapsed_seconds": elapsed,
        }

    except Exception as e:
        logger.exception("Internet scanner sweep error: %s", e)
        return {
            "success": False,
            "message": f"Scanner error: {str(e)}",
            "new_indexed": 0,
        }
    finally:
        with _scanner_lock:
            _scanner_state["is_scanning"] = False


def start_continuous_background_scanner(interval_hours: float = 2.0):
    """Launch a continuous daemon worker that periodically sweeps the web."""
    def worker():
        logger.info("Continuous background internet scanner daemon launched (interval=%.1f hrs)", interval_hours)
        while True:
            try:
                run_internet_scan()
            except Exception as e:
                logger.error("Continuous scanner cycle error: %s", e)
            time.sleep(interval_hours * 3600)

    t = threading.Thread(target=worker, daemon=True, name="continuous-internet-scanner")
    t.start()
    return t
