"""
geocoder.py — Shared helper to geocode a location string → (lat, lng).

Uses the free OpenStreetMap Nominatim API.

Key design decisions:
  - In-process LRU cache (maxsize=512): avoids hammering Nominatim for the
    same "Mumbai" / "IIT Bombay" etc. city strings across every scrape run.
  - Rate-limit: Nominatim's usage policy requires ≤1 req/s. We enforce this
    with a 1.1 s sleep between requests.
  - Failure → returns (None, None) so the caller can gracefully omit coords
    rather than crashing the whole scrape job.
  - India-biased: if a query has no country hint we add ", India" to reduce
    ambiguity (most hackathons in this dataset are Indian events).
"""

import logging
import time
from functools import lru_cache

import requests

logger = logging.getLogger(__name__)

_NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
_HEADERS = {
    "User-Agent": "HackathonNotifier/1.0 (contact: opensource-project)",
    "Accept-Language": "en",
}
_last_request_time: float = 0.0


def _rate_limited_get(params: dict) -> dict | None:
    """Calls Nominatim with mandatory 1.1-second inter-request delay."""
    global _last_request_time
    elapsed = time.monotonic() - _last_request_time
    if elapsed < 1.1:
        time.sleep(1.1 - elapsed)
    try:
        resp = requests.get(_NOMINATIM_URL, params=params, headers=_HEADERS, timeout=8)
        _last_request_time = time.monotonic()
        if resp.status_code == 200:
            data = resp.json()
            if data:
                return data[0]
    except Exception as e:
        logger.debug("Nominatim request failed: %s", e)
    _last_request_time = time.monotonic()
    return None


@lru_cache(maxsize=512)
def geocode(location: str) -> tuple[float | None, float | None]:
    """
    Resolve a location string to (lat, lng) floats, or (None, None) on failure.

    Results are cached in-process for the lifetime of the Python process, so
    repeated scrapes hitting the same city strings cost only one network call.

    Args:
        location: Any human-readable location like "IIT Bombay", "Mumbai",
                  "Bangalore, Karnataka", etc.

    Returns:
        (lat, lng) tuple of floats, or (None, None) if geocoding fails.
    """
    if not location or not location.strip():
        return (None, None)

    clean = location.strip()

    # Skip obviously online locations
    if clean.lower() in ("online", "virtual", "remote", "tba", ""):
        return (None, None)

    # Try exact query first
    result = _rate_limited_get({
        "q": clean,
        "format": "json",
        "limit": 1,
        "addressdetails": 0,
    })

    if result:
        try:
            return (float(result["lat"]), float(result["lon"]))
        except (KeyError, ValueError):
            pass

    # Retry with India suffix if no country hint is present
    if "india" not in clean.lower() and "," not in clean:
        result = _rate_limited_get({
            "q": f"{clean}, India",
            "format": "json",
            "limit": 1,
            "addressdetails": 0,
        })
        if result:
            try:
                return (float(result["lat"]), float(result["lon"]))
            except (KeyError, ValueError):
                pass

    logger.debug("Geocoding failed for: %r", clean)
    return (None, None)
