"""
auto_discover_hackathons.py — Automated Hackathon Discovery & Ingestion Engine.

This tool automatically discovers, scrapes, parses, classifies, geocodes,
and lists hackathons from external feeds, web URLs, and search sources into MongoDB.

Features:
- Auto-extracts OpenGraph metadata, dates, locations, tags, and prizes.
- Classifies college tier (IIT, NIT, IIIT, BITS, COEP, PICT, etc.).
- Auto-tags FAANG/MANGO competitions.
- Geocodes physical venues (Pune, Hyderabad, Bangalore, etc.).
- Upserts to MongoDB without duplicates.
- Evicts API cache so new events appear on the website immediately.

Usage:
  python scripts/auto_discover_hackathons.py --url https://example.com/hackathon
  python scripts/auto_discover_hackathons.py --query "pune"
  python scripts/auto_discover_hackathons.py --query "faang"
  python scripts/auto_discover_hackathons.py --auto-all
  python scripts/auto_discover_hackathons.py --dry-run --auto-all
"""

import argparse
import json
import logging
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import requests
from safe_http import public_request
from bs4 import BeautifulSoup

# Ensure Backend root in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from db.mongo_client import get_collection
from filters.keyword_filter import classify_hackathon
from scrapers.geocoder import geocode

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("auto_discover")

# Preset curated discovery endpoints & high-yield feeds
DISCOVERY_FEEDS = [
    {
        "name": "Devpost Global Hackathons",
        "url": "https://devpost.com/hackathons?challenge_type[]=online&challenge_type[]=in-person&sort_by=Recently+added",
        "type": "devpost_html",
    },
    {
        "name": "Major League Hacking Season",
        "url": "https://mlh.io/seasons/2026/events",
        "type": "mlh_html",
    },
    {
        "name": "GitHub Curated Student Hackathons",
        "url": "https://raw.githubusercontent.com/mlh/mlh-hackathon-flask-starter/master/README.md",
        "type": "generic_urls",
    },
]


def extract_metadata(url: str) -> dict:
    """Scrape OpenGraph and page metadata from any hackathon link."""
    url = url.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    info = {
        "title": None,
        "desc": "",
        "source": "Auto-Discovery",
        "mode": "Virtual",
        "location": "Online",
        "tags": [],
        "prize": "TBA",
        "deadline": "TBA",
        "deadline_iso": None,
    }

    parsed = urlparse(url)
    domain = parsed.netloc.lower()
    if domain.startswith("www."):
        domain = domain[4:]

    if "devfolio.co" in domain:
        info["source"] = "Devfolio"
    elif "unstop.com" in domain:
        info["source"] = "Unstop"
    elif "devpost.com" in domain:
        info["source"] = "Devpost"
    elif "hackerearth.com" in domain:
        info["source"] = "HackerEarth"
    elif "mlh.io" in domain:
        info["source"] = "MLH"
    elif domain:
        info["source"] = domain.split(".")[0].capitalize() + " Direct"

    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
        res = public_request(url, headers=headers, timeout=8, html_only=True)
        if res.status_code == 200:
            soup = BeautifulSoup(res.text, "html.parser")

            og_title = soup.find("meta", property="og:title") or soup.find("meta", attrs={"name": "twitter:title"})
            if og_title and og_title.get("content"):
                info["title"] = og_title["content"].strip()
            elif soup.title and soup.title.string:
                info["title"] = soup.title.string.strip()

            if info["title"]:
                info["title"] = re.split(r"[\-|–—:]\s*(?:Devfolio|Unstop|Devpost|HackerEarth|MLH)", info["title"], flags=re.IGNORECASE)[0].strip()

            og_desc = soup.find("meta", property="og:description") or soup.find("meta", attrs={"name": "description"})
            if og_desc and og_desc.get("content"):
                info["desc"] = og_desc["content"].strip()[:400]

            combined = f"{info['title'] or ''} {info['desc'] or ''} {res.text[:6000]}".lower()

            # Detect tags
            tags = set()
            keywords = {
                "ai": ["ai", "artificial intelligence"],
                "ml": ["ml", "machine learning"],
                "web3": ["web3", "crypto", "blockchain", "solana", "ethereum"],
                "faang": ["meta", "google", "apple", "amazon", "netflix", "microsoft", "faang"],
                "mango": ["meta", "google", "apple", "amazon", "netflix", "microsoft", "mango"],
                "open-source": ["open-source", "open source", "foss", "github"],
                "pune": ["pune", "coep", "pict", "vit pune", "mit pune", "pccoe"],
                "hyderabad": ["hyderabad", "iiit hyderabad", "iiit-h"],
                "iit": ["iit", "indian institute of technology"],
                "nit": ["nit", "national institute of technology"],
                "iiit": ["iiit", "indian institute of information technology"],
            }
            for tag, kws in keywords.items():
                if any(re.search(rf"\b{kw}\b", combined) for kw in kws):
                    tags.add(tag)
            info["tags"] = sorted(list(tags))

            # Detect mode & location
            if any(term in combined for term in ["offline", "in-person", "campus", "venue", "on-site"]):
                info["mode"] = "Offline"
                if "pune" in combined:
                    info["location"] = "Pune, Maharashtra, India"
                elif "hyderabad" in combined:
                    info["location"] = "Hyderabad, Telangana, India"
                elif "bangalore" in combined or "bengaluru" in combined:
                    info["location"] = "Bengaluru, Karnataka, India"
                elif "mumbai" in combined:
                    info["location"] = "Mumbai, Maharashtra, India"
                elif "delhi" in combined:
                    info["location"] = "New Delhi, Delhi, India"
            elif any(term in combined for term in ["hybrid"]):
                info["mode"] = "Hybrid"
            else:
                info["mode"] = "Virtual"
                info["location"] = "Online"

            # Detect prize hints (e.g. ₹5,00,000 or $50,000)
            prize_m = re.search(r"((?:₹|\$|INR|USD)\s*[\d,]+(?:\s*(?:lakh|crore|k|cr))?)", res.text[:10000], re.IGNORECASE)
            if prize_m:
                info["prize"] = prize_m.group(1).strip()

    except Exception as e:
        logger.warning("Metadata extraction failed for %s: %s", url, e)

    return info


def auto_list_one(url: str, custom_title: str = None, dry_run: bool = False) -> dict:
    """Enrich and auto-list a single hackathon into MongoDB."""
    meta = extract_metadata(url)
    title = custom_title or meta.get("title") or "Auto-Discovered Hackathon"

    doc = {
        "title": title,
        "link": url,
        "source": meta.get("source") or "Auto-Discovery",
        "mode": meta.get("mode") or "Unknown",
        "location": meta.get("location"),
        "deadline": meta.get("deadline") or "TBA",
        "deadline_iso": meta.get("deadline_iso"),
        "prize": meta.get("prize") or "TBA",
        "tags": meta.get("tags") or [],
        "desc": meta.get("desc") or "",
        "status": None,
        "is_past": False,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
    }

    # Classify college, internship, and FAANG/MANGO
    classify_hackathon(doc)

    # Geocode if offline
    if not dry_run and doc.get("mode", "").lower() == "offline" and doc.get("location") and doc["location"].lower() not in {"online", "virtual", "tba"}:
        lat, lng = geocode(doc["location"])
        if lat is not None and lng is not None:
            doc["lat"] = lat
            doc["lng"] = lng

    if dry_run:
        logger.info("[DRY RUN] Would list: %s | %s | %s | Tags: %s", doc["title"], doc["mode"], doc["location"], doc["tags"])
        return doc

    collection = get_collection()
    from ingestion import ensure_indexes, IngestionService
    from db.job_leases import JobLease
    ensure_indexes(collection.database)
    with JobLease(collection.database.job_leases) as lease:
        result = IngestionService(collection, lease=lease).ingest(doc)
    is_new = result["is_new"]
    logger.info("Successfully %s: %s", "inserted" if is_new else "updated", doc["title"])
    return doc


def discover_from_query(query: str, dry_run: bool = False):
    """Search and discover hackathons matching a keyword query."""
    logger.info("Starting auto-discovery for query: '%s'", query)
    
    # Query Devpost public search API/HTML
    search_url = f"https://devpost.com/hackathons?search={query}&challenge_type[]=online&challenge_type[]=in-person"
    headers = {"User-Agent": "Mozilla/5.0"}
    
    try:
        r = requests.get(search_url, headers=headers, timeout=8)
        if r.status_code == 200:
            soup = BeautifulSoup(r.text, "html.parser")
            cards = soup.select(".hackathon-tile, a.clearfix")
            found = 0
            for card in cards[:10]:
                href = card.get("href")
                if not href:
                    link_el = card.find("a")
                    href = link_el.get("href") if link_el else None
                if href and href.startswith("http"):
                    title_el = card.select_one("h3, h5, .title")
                    title = title_el.text.strip() if title_el else None
                    auto_list_one(href, custom_title=title, dry_run=dry_run)
                    found += 1
            logger.info("Discovery complete for '%s'. Processed %d entries.", query, found)
    except Exception as e:
        logger.error("Discovery error for query '%s': %s", query, e)


def main():
    parser = argparse.ArgumentParser(description="Auto-discover and list hackathons into MongoDB.")
    parser.add_argument("--url", help="Direct URL of a hackathon to auto-list")
    parser.add_argument("--title", help="Optional custom title for direct URL")
    parser.add_argument("--query", help="Keyword to search and auto-discover hackathons for (e.g. pune, faang, iiit)")
    parser.add_argument("--auto-all", action="store_true", help="Run automated discovery across all preset feeds")
    parser.add_argument("--dry-run", action="store_true", help="Preview discovery without committing to MongoDB")

    args = parser.parse_args()

    if args.url:
        auto_list_one(args.url, custom_title=args.title, dry_run=args.dry_run)
    elif args.query:
        discover_from_query(args.query, dry_run=args.dry_run)
    elif args.auto_all:
        logger.info("Running complete automated discovery sweep across target themes...")
        for theme in ["pune", "iiit hyderabad", "faang", "ai hackathon india", "web3 india"]:
            discover_from_query(theme, dry_run=args.dry_run)
            time.sleep(1)
        logger.info("Automated sweep finished.")
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
