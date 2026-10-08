"""Discovery contracts against an isolated database; no network or notifications."""
from datetime import datetime, timedelta, timezone

import mongomock
import pytest
from fastapi.testclient import TestClient
import api


@pytest.fixture
def discovery(monkeypatch):
    collection = mongomock.MongoClient().discovery.hackathons
    today = datetime.now(timezone.utc).date()
    rows = [
        ("Today", "Virtual", 0, "Open", True),
        ("Seven days", "Online", 7, "Open", True),
        ("Eight days", "Online", 8, "Open", False),
        ("Campus", "In-person", 3, "Open", True),
        ("Hybrid", "Online / Hybrid", 4, "Open", True),
        ("Unknown", None, None, None, False),
        ("Closed", "Online", 2, "Closed", True),
        ("Yesterday", "Online", -1, "Open", True),
        ("Older", "Offline", -2, "Ended", False),
    ]
    for index, (title, mode, days, status, campus) in enumerate(rows):
        collection.insert_one({
            "title": title, "mode": mode, "status": status,
            "source": "Devpost" if title != "Seven days" else "Unstop",
            "link": f"https://example.com/{index}", "tags": ["web"],
            "deadline_iso": (today + timedelta(days=days)).isoformat() if days is not None else "",
            "is_top_college": campus, "opportunity_type": "Hackathon",
            "lat": float(index), "lng": 0.0,
        })
    monkeypatch.setattr(api, "get_collection", lambda: collection)
    api._cache.clear()
    with TestClient(api.app) as client:
        yield client, collection, today
    api._cache.clear()


def titles(response):
    assert response.status_code == 200
    assert response.json()["success"] is True
    return [event["title"] for event in response.json()["data"]]


def test_filters_combine_and_counts_describe_the_filtered_set(discovery):
    client, _, _ = discovery
    response = client.get("/api/hackathons", params={"category": "Top College", "source": "Devpost", "format": "Online", "search": "web"})
    assert titles(response) == ["Today"]
    assert response.json()["upcoming_total"] == 1
    assert response.json()["missed_total"] == 2
    assert response.json()["all_total"] == 3


@pytest.mark.parametrize("format, expected", [("Online", {"Today", "Seven days", "Eight days"}), ("Offline", {"Campus"}), ("Hybrid", {"Hybrid"})])
def test_hybrid_is_separate_and_unknowns_are_not_guessed(discovery, format, expected):
    client, _, _ = discovery
    assert set(titles(client.get("/api/hackathons", params={"format": format}))) == expected


def test_closing_soon_includes_today_and_seven_day_boundary(discovery):
    client, _, _ = discovery
    response = client.get("/api/hackathons", params={"format": "Online", "deadline_days": 7, "tab": "all"})
    assert titles(response) == ["Today", "Seven days"]
    assert response.json()["missed_total"] == 0


def test_deadline_order_and_pagination_include_truthful_totals(discovery):
    client, _, _ = discovery
    response = client.get("/api/hackathons", params={"limit": 2, "page": 2})
    assert titles(response) == ["Hybrid", "Seven days"]
    assert response.json()["upcoming_total"] == 6
    assert titles(client.get("/api/hackathons", params={"tab": "all"}))[-3:] == ["Closed", "Yesterday", "Older"]


@pytest.mark.parametrize("params", [{"format": "Mystery"}, {"deadline_days": 0}, {"deadline_days": 31}])
def test_new_parameters_are_validated(discovery, params):
    assert discovery[0].get("/api/hackathons", params=params).status_code == 422


def test_v1_supports_the_same_filters(discovery):
    assert titles(discovery[0].get("/api/v1/hackathons", params={"format": "Hybrid", "category": "Top College"})) == ["Hybrid"]


def test_etag_changes_with_location_and_edits_not_just_count(discovery):
    client, collection, _ = discovery
    response = client.get("/api/hackathons", params={"sort": "distance", "lat": 0, "lng": 0})
    etag = response.headers["etag"]
    assert client.get("/api/hackathons", params={"sort": "distance", "lat": 0, "lng": 0}, headers={"If-None-Match": etag}).status_code == 304
    changed = client.get("/api/hackathons", params={"sort": "distance", "lat": 10, "lng": 0}, headers={"If-None-Match": etag})
    assert changed.status_code == 200
    assert changed.headers["etag"] != etag
    before = client.get("/api/hackathons")
    collection.update_one({"title": "Today"}, {"$set": {"prize": "Organizer prize"}})
    api._cache.clear()
    after = client.get("/api/hackathons", headers={"If-None-Match": before.headers["etag"]})
    assert after.status_code == 200
    assert after.headers["etag"] != before.headers["etag"]


def test_calendar_rollover_reclassifies_cached_events(discovery, monkeypatch):
    client, _, today = discovery
    client.get("/api/hackathons")
    class Tomorrow(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime.combine(today + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)
    monkeypatch.setattr(api, "datetime", Tomorrow)
    result = client.get("/api/hackathons", params={"tab": "missed"})
    assert "Today" in titles(result)
    assert api._cache[api._CACHE_KEY]["day"] == (today + timedelta(days=1)).isoformat()
