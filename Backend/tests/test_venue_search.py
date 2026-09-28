"""
test_venue_search.py — Comprehensive tests for venue-aware, typo-tolerant search.

Verifies:
- User typing 'iiit hydrerabad' matches hackathons where venue is 'iiit hydrabad' or 'IIIT Hyderabad'
- User typing 'iiith' or 'iiit-h' matches 'IIIT Hyderabad' venues and campus locations
- Hyphenated venues like 'IIIT-H Campus' match city and college searches
- Common Indian tech city and campus typo tolerance (e.g. 'hydrerabad' -> 'hyderabad', 'bengluru' -> 'bengaluru')
- Direct API integration test via asgi_request on /api/hackathons?search=...
"""

import json
import pytest
from unittest.mock import patch, MagicMock

from api import app, _cache, _match_hackathon_search, _build_document_search_corpus


async def asgi_request(method="GET", path="/", query_string=b"", headers=None):
    """Zero-dependency ASGI caller to test FastAPI endpoints."""
    headers = headers or []
    raw_headers = [(k.lower().encode("latin1"), v.encode("latin1")) for k, v in headers]

    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": method,
        "path": path,
        "raw_path": path.encode("latin1"),
        "query_string": query_string,
        "headers": raw_headers,
        "client": ("127.0.0.1", 12345),
        "server": ("127.0.0.1", 80),
        "app": app,
        "state": getattr(app, "state", MagicMock()),
    }

    response_body = bytearray()
    response_status = None
    response_headers = {}

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        nonlocal response_status, response_headers
        if message["type"] == "http.response.start":
            response_status = message["status"]
            response_headers = {k.decode("latin1"): v.decode("latin1") for k, v in message.get("headers", [])}
        elif message["type"] == "http.response.body":
            response_body.extend(message.get("body", b""))

    await app(scope, receive, send)
    return response_status, response_headers, bytes(response_body)


def test_venue_typo_iiit_hydrerabad_matches_iiit_hydrabad():
    """Directly verifies user scenario: query 'iiit hydrerabad' matches venue 'iiit hydrabad'."""
    doc = {
        "title": "Megathon 2026",
        "venue": "iiit hydrabad",
        "location": "Telangana, India",
        "tags": ["AI", "Hackathon"],
    }
    # Typo with extra 'r' in query matches typo with missing 'e' in venue
    assert _match_hackathon_search(doc, "iiit hydrerabad") is True
    assert _match_hackathon_search(doc, "iiit hyderabad") is True
    assert _match_hackathon_search(doc, "iiit hydrabad") is True
    assert _match_hackathon_search(doc, "iiith") is True
    assert _match_hackathon_search(doc, "iiit-h") is True
    assert _match_hackathon_search(doc, "hydrerabad") is True
    assert _match_hackathon_search(doc, "hydrabad") is True
    assert _match_hackathon_search(doc, "hyderabad") is True


def test_venue_negative_cases():
    """Verifies that unrelated venues or colleges are strictly excluded."""
    doc = {
        "title": "Megathon 2026",
        "venue": "iiit hydrabad",
        "location": "Telangana, India",
        "tags": ["AI", "Hackathon"],
    }
    assert _match_hackathon_search(doc, "iiit delhi") is False
    assert _match_hackathon_search(doc, "iit bombay") is False
    assert _match_hackathon_search(doc, "pune") is False
    assert _match_hackathon_search(doc, "bengaluru") is False


def test_search_matches_location_and_college_name():
    """Verifies search matches across location and college_name if venue is absent."""
    doc_location = {
        "title": "Felicity Hack",
        "location": "IIIT Hyderabad, Gachibowli",
        "venue": None,
    }
    assert _match_hackathon_search(doc_location, "iiit hydrerabad") is True
    assert _match_hackathon_search(doc_location, "iiit hyderabad") is True

    doc_college = {
        "title": "CodeCraft",
        "college_name": "IIIT Hyderabad",
        "college_type": "IIIT",
        "location": "Virtual",
    }
    assert _match_hackathon_search(doc_college, "iiit hydrerabad") is True
    assert _match_hackathon_search(doc_college, "iiit hydrabad") is True


def test_hyphen_expansion_iiit_h_campus():
    """Verifies that 'IIIT-H Campus' indexes both IIIT and Hyderabad aliases."""
    doc_hyphen = {
        "title": "HackIIIT",
        "venue": "IIIT-H Campus",
        "location": "Gachibowli",
    }
    assert _match_hackathon_search(doc_hyphen, "iiit hydrerabad") is True
    assert _match_hackathon_search(doc_hyphen, "iiit hyderabad") is True
    assert _match_hackathon_search(doc_hyphen, "iiit-h") is True
    assert _match_hackathon_search(doc_hyphen, "iiith") is True


def test_city_typos_and_synonyms():
    """Verifies other common tech hub cities with typos/aliases."""
    doc_blr = {
        "title": "SiliconCity Hack",
        "location": "Bengaluru, Karnataka",
        "venue": "IISc Bengaluru",
    }
    assert _match_hackathon_search(doc_blr, "bengluru") is True
    assert _match_hackathon_search(doc_blr, "banglore") is True
    assert _match_hackathon_search(doc_blr, "iisc") is True

    doc_mumbai = {
        "title": "Mood Indigo Hack",
        "location": "Mumbai, Maharashtra",
        "venue": "IIT Bombay",
    }
    assert _match_hackathon_search(doc_mumbai, "bombay") is True
    assert _match_hackathon_search(doc_mumbai, "iitb") is True
    assert _match_hackathon_search(doc_mumbai, "iit-b") is True


@pytest.mark.anyio
async def test_api_hackathons_search_endpoint_with_venue():
    """Integration test: calling /api/hackathons?search=iiit+hydrerabad returns matched venue."""
    mock_docs = [
        {
            "_id": "507f1f77bcf86cd799439011",
            "title": "Megathon 2026",
            "venue": "iiit hydrabad",
            "location": "Hyderabad, Telangana",
            "source": "Devfolio",
            "deadline": "2026-11-20",
            "deadline_iso": "2026-11-20",
            "status": "Open",
            "is_past": False,
            "tags": ["AI", "Web3"],
        },
        {
            "_id": "507f1f77bcf86cd799439012",
            "title": "HackDelhi 2026",
            "venue": "IIT Delhi Campus",
            "location": "New Delhi",
            "source": "Unstop",
            "deadline": "2026-12-01",
            "deadline_iso": "2026-12-01",
            "status": "Open",
            "is_past": False,
            "tags": ["FinTech"],
        },
    ]

    with patch("api.get_collection") as mock_get_col:
        mock_col = MagicMock()
        mock_col.find.return_value = list(mock_docs)
        mock_get_col.return_value = mock_col

        _cache.clear()

        # 1. Search with typo 'iiit hydrerabad'
        status, headers, body = await asgi_request("GET", "/api/hackathons", query_string=b"search=iiit+hydrerabad")
        assert status == 200
        data = json.loads(body.decode("utf-8"))
        assert data["success"] is True
        assert len(data["data"]) == 1
        assert data["data"][0]["title"] == "Megathon 2026"
        assert data["data"][0]["venue"] == "iiit hydrabad"

        # 2. Search with typo 'iiit hydrabad'
        status2, headers2, body2 = await asgi_request("GET", "/api/hackathons", query_string=b"search=iiit+hydrabad")
        assert status2 == 200
        data2 = json.loads(body2.decode("utf-8"))
        assert len(data2["data"]) == 1
        assert data2["data"][0]["title"] == "Megathon 2026"

        # 3. Search with abbreviation 'iiith'
        status3, headers3, body3 = await asgi_request("GET", "/api/hackathons", query_string=b"search=iiith")
        assert status3 == 200
        data3 = json.loads(body3.decode("utf-8"))
        assert len(data3["data"]) == 1
        assert data3["data"][0]["title"] == "Megathon 2026"
