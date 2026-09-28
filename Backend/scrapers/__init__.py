"""
Backend/scrapers package — Concurrent multi-source hackathon discovery scrapers.

Includes:
  - Platform scrapers: Devfolio, Unstop, Devpost, HackerEarth, Devnovate
  - Internet scanner: Autonomous keyword-based web scanning
  - Instagram scraper: Public Instagram post/hashtag hackathon discovery
  - Web discovery: Multi-engine internet search (Google, Eventbrite, MLH, KonfHub)
  - Hackathon verifier: Multi-signal verification pipeline
"""

from .devfolio_scraper import scrape_devfolio
from .devnovate_scraper import scrape_devnovate
from .devpost_scraper import scrape_devpost
from .hackerearth_scraper import scrape_hackerearth
from .unstop_scraper import scrape_unstop
from .geocoder import geocode
from .instagram_scraper import scrape_instagram_hackathons
from .web_discovery_scraper import run_web_discovery
from .hackathon_verifier import verify_hackathon, batch_verify

__all__ = [
    "scrape_devfolio",
    "scrape_devnovate",
    "scrape_devpost",
    "scrape_hackerearth",
    "scrape_unstop",
    "geocode",
    "scrape_instagram_hackathons",
    "run_web_discovery",
    "verify_hackathon",
    "batch_verify",
]
