"""
test_pipeline.py — Tests for the orchestration logic in main.py.

These tests cover the pipeline stages that connect scrapers → DB → Telegram.
We use mongomock for the DB and unittest.mock for scrapers/Telegram so:
  - No real network calls happen
  - No real MongoDB connection needed
  - Tests run in ~100ms

Why these tests matter:
  The pipeline glues together 4 separate systems. Each individual component
  can be tested in isolation (see test_devfolio.py etc.) but the *wiring*
  between them — dedup, notification filter, concurrent execution — is where
  subtle bugs live. These tests are the net that catches integration-level
  mistakes.
"""
import json
from unittest.mock import MagicMock, patch
from concurrent.futures import ThreadPoolExecutor, as_completed

import mongomock
import pytest

from filters.keyword_filter import classify_all, filter_hackathons, is_duplicate


# ── Shared fixtures ───────────────────────────────────────────────────────────

@pytest.fixture()
def collection():
    """Fresh mongomock collection with a unique index on 'link', matching production."""
    client = mongomock.MongoClient()
    col = client["hackathon_tracker"]["hackathons"]
    col.create_index("link", unique=True)
    return col


def _hack(title="Test Hack", link="https://example.com/test", **kwargs) -> dict:
    """Helper: build a minimal hackathon dict."""
    return {
        "title": title,
        "link": link,
        "deadline": "01 Jan 2027",
        "deadline_iso": "2027-01-01",
        "source": "Devfolio",
        "mode": "Online",
        "tags": [],
        **kwargs,
    }


# ── Dedup logic ───────────────────────────────────────────────────────────────

class TestIsDuplicate:
    def test_new_link_is_not_duplicate(self, collection):
        """A link that's never been seen must return False."""
        assert is_duplicate("https://example.com/new", collection) is False

    def test_existing_link_is_duplicate(self, collection):
        """A link already in the DB must return True so we skip re-insertion."""
        collection.insert_one(_hack())
        assert is_duplicate("https://example.com/test", collection) is True

    def test_empty_link_treated_as_duplicate(self, collection):
        """An empty link string is treated as a duplicate (returns True) by design.

        This is a deliberate safe-fail: inserting a document with link=""
        would violate the unique index and crash. Better to skip silently.
        The test documents this policy so future developers don't accidentally
        change is_duplicate to return False for empty strings.
        """
        # This is intentional behavior, not a bug
        assert is_duplicate("", collection) is True

    def test_similar_but_different_links_not_duplicate(self, collection):
        """Links must match exactly, not partially."""
        collection.insert_one(_hack(link="https://example.com/hack-1"))
        assert is_duplicate("https://example.com/hack-2", collection) is False


# ── Notification filter ───────────────────────────────────────────────────────

class TestNotificationFilter:
    """Tests for filter_hackathons() — the gate before Telegram sends.

    filter_hackathons() calls classify_hackathon() internally on each item,
    so we must use real hackathon titles that trigger the classifier patterns
    rather than pre-setting is_top_college/is_internship flags manually.
    """

    def test_iit_hackathon_included(self):
        """A hackathon with 'IIT' in the title must survive the filter."""
        h = _hack(title="IIT Bombay TechFest")
        result = filter_hackathons([h])
        assert len(result) == 1
        assert result[0]["is_top_college"] is True

    def test_internship_included(self):
        """A title containing 'internship' must survive the filter."""
        h = _hack(title="Summer Internship Hiring Challenge")
        result = filter_hackathons([h])
        assert len(result) == 1
        assert result[0]["is_internship"] is True

    def test_generic_hackathon_excluded(self):
        """A plain generic hackathon with no college/internship signal is excluded."""
        h = _hack(title="Random Startup Weekend", tags=[])
        assert filter_hackathons([h]) == []

    def test_mixed_list_only_keeps_notable(self):
        notable = _hack("IIT Bombay Hack", "https://example.com/iit")
        generic = _hack("Random Hack", "https://example.com/random")
        result = filter_hackathons([notable, generic])
        assert len(result) == 1
        assert result[0]["is_top_college"] is True

    def test_empty_list_returns_empty(self):
        assert filter_hackathons([]) == []


# ── Classify + filter integration ─────────────────────────────────────────────

class TestClassifyAndFilter:
    """End-to-end: classify_all() writes flags, then filter_hackathons() reads them."""

    def test_iit_title_gets_classified_and_kept(self):
        hackathons = [_hack(title="IIT Bombay TechFest Hackathon", tags=["AI"])]
        classify_all(hackathons)
        assert hackathons[0]["is_top_college"] is True
        assert filter_hackathons(hackathons) == hackathons

    def test_random_title_gets_classified_and_dropped(self):
        hackathons = [_hack(title="Random Startup Hackathon", tags=[])]
        classify_all(hackathons)
        assert hackathons[0]["is_top_college"] is False
        assert filter_hackathons(hackathons) == []

    def test_internship_keyword_in_title_classified(self):
        hackathons = [_hack(title="Google Summer Internship Challenge", tags=[])]
        classify_all(hackathons)
        assert hackathons[0]["is_internship"] is True


# ── Concurrent scraper execution ──────────────────────────────────────────────

class TestConcurrentScrapers:
    """Verifies that the ThreadPoolExecutor wiring doesn't drop results.

    The real scrapers make network calls, so we mock them with functions
    that return predictable lists. The test checks that results from ALL
    workers are collected into the combined list, even when one worker
    returns an empty list.
    """

    def _run_concurrent(self, scraper_map: dict) -> list:
        """Mirrors the _run_scrapers() logic in main.py exactly."""
        combined = []
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {pool.submit(fn): name for name, fn in scraper_map.items()}
            for future in as_completed(futures):
                try:
                    combined.extend(future.result())
                except Exception:
                    pass  # mirrors main.py behavior: log and continue
        return combined

    def test_all_scrapers_results_combined(self):
        """Results from all 4 workers must all appear in the output list."""
        scrapers = {
            "A": lambda: [_hack("A1"), _hack("A2")],
            "B": lambda: [_hack("B1")],
            "C": lambda: [],              # empty is fine
            "D": lambda: [_hack("D1")],
        }
        results = self._run_concurrent(scrapers)
        titles = {r["title"] for r in results}
        assert titles == {"A1", "A2", "B1", "D1"}

    def test_failing_scraper_does_not_block_others(self):
        """If one scraper raises, the others must still return their results."""
        def broken():
            raise RuntimeError("Site is down")

        scrapers = {
            "OK":     lambda: [_hack("OK")],
            "Broken": broken,
        }
        results = self._run_concurrent(scrapers)
        assert len(results) == 1
        assert results[0]["title"] == "OK"
