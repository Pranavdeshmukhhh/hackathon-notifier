"""
Backend/scrapers package — Concurrent multi-source hackathon discovery scrapers.
"""

from .devfolio_scraper import scrape_devfolio
from .devnovate_scraper import scrape_devnovate
from .devpost_scraper import scrape_devpost
from .hackerearth_scraper import scrape_hackerearth
from .unstop_scraper import scrape_unstop
from .geocoder import geocode

__all__ = [
    "scrape_devfolio",
    "scrape_devnovate",
    "scrape_devpost",
    "scrape_hackerearth",
    "scrape_unstop",
    "geocode",
]
