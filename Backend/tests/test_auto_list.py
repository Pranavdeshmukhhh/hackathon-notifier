"""
test_auto_list.py — Unit tests for the auto-listing API endpoints and discovery engine.
"""

import json
import pytest
from unittest.mock import MagicMock, patch
from api import app, _extract_url_metadata
from scripts.auto_discover_hackathons import auto_list_one, extract_metadata


async def asgi_post(path: str, body: dict):
    payload = json.dumps(body).encode("utf-8")
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "POST",
        "path": path,
        "raw_path": path.encode("latin1"),
        "query_string": b"",
        "headers": [
            (b"content-type", b"application/json"),
            (b"content-length", str(len(payload)).encode("latin1")),
        ],
        "client": ("127.0.0.1", 12345),
        "server": ("127.0.0.1", 80),
        "app": app,
        "state": getattr(app, "state", MagicMock()),
    }
    sent_body = False
    async def receive():
        nonlocal sent_body
        if not sent_body:
            sent_body = True
            return {"type": "http.request", "body": payload, "more_body": False}
        return {"type": "http.request", "body": b"", "more_body": False}

    response_body = bytearray()
    response_status = None

    async def send(message):
        nonlocal response_status
        if message["type"] == "http.response.start":
            response_status = message["status"]
        elif message["type"] == "http.response.body":
            response_body.extend(message.get("body", b""))

    await app(scope, receive, send)
    return response_status, json.loads(response_body.decode("utf-8")) if response_body else {}


@pytest.mark.anyio
async def test_auto_list_empty_link_rejected():
    status, data = await asgi_post("/api/hackathons/auto-list", {"link": "   "})
    assert status == 400
    assert data["success"] is False


@pytest.mark.anyio
async def test_preview_url_empty_link_rejected():
    status, data = await asgi_post("/api/hackathons/preview-url", {"link": ""})
    assert status == 400
    assert data["success"] is False


@pytest.mark.anyio
async def test_auto_list_success_with_classification():
    mock_col = MagicMock()
    mock_res = MagicMock()
    mock_res.upserted_id = "test-mongo-id-123"
    mock_col.update_one.return_value = mock_res
    mock_col.find_one.return_value = {
        "_id": "test-mongo-id-123",
        "title": "Pune Tech Hackathon (PICT Pune)",
        "link": "https://pict.edu/hackathon",
        "tags": ["pict", "pune", "faang"],
        "is_top_college": True,
        "college_type": "CFTI",
    }

    with patch("api.get_collection", return_value=mock_col), \
         patch("api._extract_url_metadata", return_value={"tags": ["pune"]}):
        status, data = await asgi_post("/api/hackathons/auto-list", {
            "link": "https://pict.edu/hackathon",
            "title": "Pune Tech Hackathon (PICT Pune)",
            "mode": "Offline",
            "location": "Pune, Maharashtra, India",
            "prize": "₹2 Lakhs",
            "tags": ["faang"],
            "fetch_metadata": False,
        })
        assert status == 200
        assert data["success"] is True
        assert data["is_new"] is True
        mock_col.update_one.assert_called_once()


def test_extract_url_metadata_domain_parsing():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = '<html><head><title>Meta Hacker Challenge</title><meta property="og:description" content="Global Meta competition for engineers"></head><body>Pune campus</body></html>'

    with patch("requests.get", return_value=mock_resp):
        res = _extract_url_metadata("https://devpost.com/software/example")
        assert res["source"] == "Devpost"
        assert "Meta Hacker Challenge" in res["title"]
        assert "faang" in res["tags"]
        assert "mango" in res["tags"]


def test_auto_list_one_dry_run():
    with patch("scripts.auto_discover_hackathons.extract_metadata", return_value={
        "title": "IIIT Hyderabad BioNLP Hackathon",
        "source": "IIIT Hyderabad Direct",
        "mode": "Virtual",
        "location": "Online",
        "tags": ["iiit", "hyderabad", "ai"],
        "prize": "₹1,00,000",
    }):
        doc = auto_list_one("https://iiit.ac.in/bionlp", dry_run=True)
        assert doc["title"] == "IIIT Hyderabad BioNLP Hackathon"
        assert doc["college_type"] == "IIIT"
        assert doc["is_top_college"] is True
