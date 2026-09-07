"""Tests for Devpost scraper — _parse_hackathon() and _parse_date()."""
from scrapers.devpost_scraper import _parse_hackathon, _parse_date


# ── _parse_date tests ─────────────────────────────────────────────────────────

class TestParseDate:
    def test_standard_range(self):
        display, iso = _parse_date("Jul 31 - Oct 01, 2026")
        assert iso == "2026-10-01"
        assert display == "01 Oct 2026"

    def test_empty_string(self):
        display, iso = _parse_date("")
        assert display == "TBA"
        assert iso == ""

    def test_unparseable(self):
        display, iso = _parse_date("not a date")
        assert display == "TBA"
        assert iso == ""


# ── _parse_hackathon tests ────────────────────────────────────────────────────

VALID_ITEM = {
    "title": "AI Global Hack",
    "url": "https://devpost.com/hackathons/ai-global",
    "displayed_location": {"location": "Online"},
    "themes": [{"name": "AI"}, {"name": "Healthcare"}],
    "submission_period_dates": "Aug 01 - Oct 01, 2027",
    "open_state": "open",
    "time_left_to_submission": "60 days left",
    "prize_amount": "$<span>10,000</span>",
    "organization_name": "OpenAI",
    "registrations_count": 500,
}

ITEM_NO_TITLE = {
    "title": "",
    "url": "https://devpost.com/hackathons/missing",
    "submission_period_dates": "Oct 01, 2027",
}

ITEM_NO_URL = {
    "title": "Ghost Hackathon",
    "url": "",
    "submission_period_dates": "Oct 01, 2027",
}


class TestParseHackathon:
    def test_valid_item(self):
        result = _parse_hackathon(VALID_ITEM)
        assert result is not None
        assert result["title"] == "AI Global Hack"
        assert result["link"] == "https://devpost.com/hackathons/ai-global"
        assert result["deadline_iso"] == "2027-10-01"
        assert result["source"] == "Devpost"
        assert "AI" in result["tags"]
        assert result["mode"] == "Online"
        assert result["prize"] == "$10,000"

    def test_missing_title_returns_none(self):
        assert _parse_hackathon(ITEM_NO_TITLE) is None

    def test_missing_url_returns_none(self):
        assert _parse_hackathon(ITEM_NO_URL) is None
