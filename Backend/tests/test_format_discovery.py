"""Homepage format shortcuts must include the aliases returned by scrapers."""
import mongomock
import pytest
from fastapi.testclient import TestClient
import api


@pytest.mark.parametrize("category, expected", [
    ("Online", ["Online", "Virtual"]),
    ("Offline", ["Offline", "In-person", "Onsite"]),
])
def test_format_filter_and_counts_agree(monkeypatch, category, expected):
    collection = mongomock.MongoClient().test.hackathons
    for mode in ["Online", "Virtual", "Offline", "In-person", "Onsite", None, "TBA", "Hybrid"]:
        collection.insert_one({
            "title": str(mode), "mode": mode, "source": "Preview",
            "link": "https://example.com/" + str(mode), "deadline_iso": "2099-01-01",
            "tags": [], "status": "Open",
        })
    monkeypatch.setattr(api, "get_collection", lambda: collection)
    api._cache.clear()
    try:
        with TestClient(api.app) as client:
            response = client.get("/api/hackathons", params={"category": category})
        assert response.status_code == 200
        payload = response.json()
        assert {event["mode"] for event in payload["data"]} == set(expected)
        assert payload["stats"]["online_count"] == 2
        assert payload["stats"]["offline_count"] == 3
    finally:
        api._cache.clear()
