"""Tests for HackerEarth scraper — _parse_event() and _parse_date()."""
from scrapers.hackerearth_scraper import _parse_event, _parse_date


# ── _parse_date tests ─────────────────────────────────────────────────────────

class TestParseDate:
    def test_standard_format(self):
        display, iso = _parse_date("Sep 27, 2026")
        assert iso == "2026-09-27"
        assert display == "27 Sep 2026"

    def test_empty(self):
        display, iso = _parse_date("")
        assert display == "TBA"
        assert iso == ""


# ── _parse_event tests ────────────────────────────────────────────────────────

VALID_EVENT = {
    "title": "CodeArena 2027",
    "url": "https://www.hackerearth.com/challenges/hackathon/codearena",
    "end_date": "Mar 15, 2027",
    "status": "ONGOING",
    "challenge_type": "hackathon",
    "college": True,
    "description": "Build cool stuff.",
    "is_hackerearth": True,
}

EVENT_NO_TITLE = {
    "title": "",
    "url": "https://www.hackerearth.com/challenges/hackathon/oops",
    "end_date": "Mar 15, 2027",
}

EVENT_NO_URL = {
    "title": "Ghost Event",
    "url": "",
    "end_date": "Mar 15, 2027",
}


class TestParseEvent:
    def test_valid_event(self):
        result = _parse_event(VALID_EVENT)
        assert result is not None
        assert result["title"] == "CodeArena 2027"
        assert result["link"] == "https://www.hackerearth.com/challenges/hackathon/codearena"
        assert result["deadline_iso"] == "2027-03-15"
        assert result["source"] == "HackerEarth"
        assert "hackathon" in result["tags"]
        assert "College" in result["tags"]

    def test_missing_title_returns_none(self):
        assert _parse_event(EVENT_NO_TITLE) is None

    def test_missing_url_returns_none(self):
        assert _parse_event(EVENT_NO_URL) is None

    def test_long_description_truncated(self):
        event = {**VALID_EVENT, "description": "x" * 600}
        result = _parse_event(event)
        assert result is not None
        assert len(result["desc"]) <= 500
