"""Tests for Devfolio scraper — _parse_card() and _extract_slug()."""
from bs4 import BeautifulSoup

from scrapers.devfolio_scraper import _parse_card, _extract_slug


# ── Fixture HTML ──────────────────────────────────────────────────────────────

VALID_CARD_HTML = """
<div class="CompactHackathonCard__root">
  <a class="Link__LinkBase-sc-c569441e-0" href="https://devfolio.co/hackathons/code-relay">
    <h3>Code Relay 2026</h3>
  </a>
  <div class="TsCKF">
    <p>THEME</p>
    <p>AI/ML</p>
    <p>Blockchain</p>
  </div>
  <div class="kvhgSq">
    <p>ONLINE</p>
    <p>OPEN</p>
    <p>Ends 15/09/26</p>
  </div>
</div>
"""

CARD_NO_TITLE_HTML = """
<div class="CompactHackathonCard__root">
  <a class="Link__LinkBase-sc-c569441e-0" href="https://devfolio.co/hackathons/oops">
    <h3></h3>
  </a>
</div>
"""

CARD_NO_ANCHOR_HTML = """
<div class="CompactHackathonCard__root">
  <p>No link here</p>
</div>
"""


# ── _parse_card tests ─────────────────────────────────────────────────────────

class TestParseCard:
    def test_valid_card_extracts_title_and_link(self):
        soup = BeautifulSoup(VALID_CARD_HTML, "html.parser")
        card = soup.find("div")
        result = _parse_card(card)
        assert result is not None
        assert result["title"] == "Code Relay 2026"
        assert result["link"] == "https://devfolio.co/hackathons/code-relay"

    def test_valid_card_extracts_deadline(self):
        soup = BeautifulSoup(VALID_CARD_HTML, "html.parser")
        card = soup.find("div")
        result = _parse_card(card)
        assert result is not None
        assert result["deadline_iso"] == "2026-09-15"
        assert result["deadline"] == "15 Sep 2026"

    def test_valid_card_extracts_tags_without_theme_label(self):
        soup = BeautifulSoup(VALID_CARD_HTML, "html.parser")
        card = soup.find("div")
        result = _parse_card(card)
        assert result is not None
        assert "AI/ML" in result["tags"]
        assert "Blockchain" in result["tags"]
        assert "THEME" not in result["tags"]

    def test_valid_card_mode_and_source(self):
        soup = BeautifulSoup(VALID_CARD_HTML, "html.parser")
        card = soup.find("div")
        result = _parse_card(card)
        assert result is not None
        assert result["mode"] == "Online"
        assert result["source"] == "Devfolio"

    def test_missing_title_returns_none(self):
        soup = BeautifulSoup(CARD_NO_TITLE_HTML, "html.parser")
        card = soup.find("div")
        result = _parse_card(card)
        assert result is None

    def test_missing_anchor_returns_none(self):
        soup = BeautifulSoup(CARD_NO_ANCHOR_HTML, "html.parser")
        card = soup.find("div")
        result = _parse_card(card)
        assert result is None


# ── _extract_slug tests ───────────────────────────────────────────────────────

class TestExtractSlug:
    def test_hackathons_path(self):
        assert _extract_slug("https://devfolio.co/hackathons/code-relay") == "code-relay"

    def test_subdomain(self):
        assert _extract_slug("https://code-relay.devfolio.co") == "code-relay"

    def test_www_subdomain_ignored(self):
        assert _extract_slug("https://www.devfolio.co") == ""

    def test_empty_string(self):
        assert _extract_slug("") == ""
