"""Tests for Unstop scraper — _parse_api_items()."""
from scrapers.unstop_scraper import _parse_api_items


# ── Fixture: raw API items ────────────────────────────────────────────────────

VALID_ITEM = {
    "title": "HackCelestial 3.0",
    "seo_url": "https://unstop.com/hackathons/hackcelestial-3",
    "regnRequirements": {"end_regn_dt": "2027-01-15T23:59:59"},
    "region": "Online",
    "filters": [{"name": "AI"}, {"name": "Web3"}],
    "prizes": [{"cash": "50000"}],
    "organisation": {"name": "TechCorp"},
}

ITEM_MISSING_TITLE = {
    "title": "",
    "seo_url": "https://unstop.com/hackathons/no-title",
    "regnRequirements": {"end_regn_dt": "2027-01-15T23:59:59"},
}

ITEM_MISSING_LINK = {
    "title": "No Link Hackathon",
    "seo_url": "",
    "public_url": "",
    "short_url": "",
    "regnRequirements": {"end_regn_dt": "2027-01-15T23:59:59"},
}

EXPIRED_ITEM = {
    "title": "Old Hackathon",
    "seo_url": "https://unstop.com/hackathons/old",
    "regnRequirements": {"end_regn_dt": "2020-01-01T00:00:00"},
    "region": "Offline",
    "filters": [],
    "organisation": {"name": "OldCorp"},
}

ITEM_TIMESTAMP_DEADLINE = {
    "title": "Timestamp Hackathon",
    "seo_url": "https://unstop.com/hackathons/ts-hack",
    "regnRequirements": {"end_regn_dt": 1800000000},  # ~2027-01-14
    "region": "Online",
    "filters": [],
    "organisation": {"name": "TSCorp"},
}


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestParseApiItems:
    def test_valid_item_extracts_fields(self):
        results = _parse_api_items([VALID_ITEM])
        assert len(results) == 1
        h = results[0]
        assert h["title"] == "HackCelestial 3.0"
        assert h["link"] == "https://unstop.com/hackathons/hackcelestial-3"
        assert h["deadline_iso"] == "2027-01-15"
        assert h["source"] == "Unstop"
        assert h["mode"] == "Online"
        assert "AI" in h["tags"]
        assert h["prize"] == "₹50000"
        assert h["organization"] == "TechCorp"

    def test_missing_title_skipped(self):
        results = _parse_api_items([ITEM_MISSING_TITLE])
        assert len(results) == 0

    def test_missing_link_skipped(self):
        results = _parse_api_items([ITEM_MISSING_LINK])
        assert len(results) == 0

    def test_expired_item_kept_as_ended(self):
        results = _parse_api_items([EXPIRED_ITEM])
        assert len(results) == 1
        assert results[0]["status"] == "Ended"

    def test_valid_among_invalid(self):
        """Valid and expired items survive when mixed with invalid ones."""
        results = _parse_api_items([VALID_ITEM, ITEM_MISSING_TITLE, EXPIRED_ITEM])
        assert len(results) == 2
        titles = [r["title"] for r in results]
        assert "HackCelestial 3.0" in titles
        assert "Old Hackathon" in titles

    def test_timestamp_deadline(self):
        results = _parse_api_items([ITEM_TIMESTAMP_DEADLINE])
        assert len(results) == 1
        assert results[0]["deadline_iso"] != ""  # should have parsed the timestamp
