"""Tests for _sort_hackathons() in api.py — pure logic, no DB needed."""
from api import _sort_hackathons


class TestSortHackathons:
    def _make(self, title, deadline_iso="", status="Open"):
        return {"title": title, "deadline_iso": deadline_iso, "status": status}

    def test_upcoming_before_no_date(self):
        docs = [
            self._make("No Date"),
            self._make("Upcoming", deadline_iso="2099-01-01"),
        ]
        result = _sort_hackathons(docs)
        assert result[0]["title"] == "Upcoming"
        assert result[1]["title"] == "No Date"

    def test_no_date_before_past(self):
        docs = [
            self._make("Past", deadline_iso="2020-01-01", status="Ended"),
            self._make("No Date"),
        ]
        result = _sort_hackathons(docs)
        assert result[0]["title"] == "No Date"
        assert result[1]["title"] == "Past"

    def test_upcoming_sorted_soonest_first(self):
        docs = [
            self._make("Later", deadline_iso="2099-06-01"),
            self._make("Sooner", deadline_iso="2099-01-01"),
        ]
        result = _sort_hackathons(docs)
        assert result[0]["title"] == "Sooner"
        assert result[1]["title"] == "Later"

    def test_past_sorted_most_recent_first(self):
        docs = [
            self._make("Older", deadline_iso="2019-01-01", status="Ended"),
            self._make("Newer", deadline_iso="2020-06-01", status="Ended"),
        ]
        result = _sort_hackathons(docs)
        # Past items are after upcoming+no_date, newest first
        assert result[0]["title"] == "Newer"
        assert result[1]["title"] == "Older"

    def test_is_past_flag_set_correctly(self):
        docs = [
            self._make("Upcoming", deadline_iso="2099-01-01"),
            self._make("No Date"),
            self._make("Past", deadline_iso="2020-01-01", status="Ended"),
        ]
        result = _sort_hackathons(docs)
        for doc in result:
            if doc["title"] == "Past":
                assert doc["is_past"] is True
            else:
                assert doc["is_past"] is False

    def test_full_ordering(self):
        """upcoming → no-date → past, in one shot."""
        docs = [
            self._make("Past", deadline_iso="2020-01-01", status="Ended"),
            self._make("No Date"),
            self._make("Upcoming", deadline_iso="2099-01-01"),
        ]
        result = _sort_hackathons(docs)
        titles = [d["title"] for d in result]
        assert titles == ["Upcoming", "No Date", "Past"]

    def test_empty_list(self):
        assert _sort_hackathons([]) == []
