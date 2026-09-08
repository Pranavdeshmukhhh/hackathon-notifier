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


# ── Resilience tests: simulating site structure changes ───────────────────────

# When Devfolio's React build regenerates, the hashed class name on the <a>
# tag changes (e.g. Link__LinkBase-sc-c569441e-0 becomes sc-abc12345-0).
# The scraper has a fallback: find any <a> that wraps an <h3>.
# This test verifies that fallback so we catch breakages immediately in CI.
CHANGED_CLASS_HTML = """
<div class="CompactHackathonCard__root">
  <a class="COMPLETELY_DIFFERENT_GENERATED_CLASS" href="https://devfolio.co/hackathons/build-it">
    <h3>Build It 2027</h3>
  </a>
  <div class="kvhgSq">
    <p>OFFLINE</p>
    <p>OPEN</p>
    <p>Ends 20/12/27</p>
  </div>
</div>
"""

CARD_OFFLINE_HTML = """
<div class="CompactHackathonCard__root">
  <a class="Link__LinkBase-sc-c569441e-0" href="https://devfolio.co/hackathons/offline-hack">
    <h3>Offline Hackathon 2027</h3>
  </a>
  <div class="kvhgSq">
    <p>OFFLINE</p>
    <p>OPEN</p>
  </div>
</div>
"""

CARD_NO_DATE_HTML = """
<div class="CompactHackathonCard__root">
  <a class="Link__LinkBase-sc-c569441e-0" href="https://devfolio.co/hackathons/mystery-hack">
    <h3>Mystery Hack</h3>
  </a>
  <div class="kvhgSq">
    <p>ONLINE</p>
  </div>
</div>
"""


class TestParseCardResilience:
    def test_changed_css_class_falls_back_to_h3_anchor(self):
        """If Devfolio renames their React class, the h3-anchor fallback still works.

        Interview talking point: scrapers coupled to generated class names are
        fragile. The fallback strategy buys time between breakage and a fix.
        This test would have caught the breakage on the next CI run.
        """
        soup = BeautifulSoup(CHANGED_CLASS_HTML, "html.parser")
        card = soup.find("div")
        result = _parse_card(card)
        assert result is not None
        assert result["title"] == "Build It 2027"
        assert result["link"] == "https://devfolio.co/hackathons/build-it"

    def test_offline_mode_detected(self):
        """OFFLINE keyword in the info row must produce mode='Offline', not 'Unknown'."""
        soup = BeautifulSoup(CARD_OFFLINE_HTML, "html.parser")
        result = _parse_card(soup.find("div"))
        assert result is not None
        assert result["mode"] == "Offline"

    def test_no_date_card_returns_tba(self):
        """A card with no date information should still parse — deadline defaults to 'TBA'.

        Returning None here would silently drop a valid hackathon from the DB.
        """
        soup = BeautifulSoup(CARD_NO_DATE_HTML, "html.parser")
        result = _parse_card(soup.find("div"))
        assert result is not None
        assert result["title"] == "Mystery Hack"
        assert result["deadline"] == "TBA"
        assert result["deadline_iso"] == ""
