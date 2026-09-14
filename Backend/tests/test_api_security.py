import json
import os
import pytest
from unittest.mock import MagicMock, patch
from api import app, get_client_ip


async def asgi_request(method="GET", path="/", query_string=b"", headers=None):
    """Zero-dependency ASGI caller to test FastAPI endpoints, middleware, and validation."""
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


@pytest.mark.anyio
async def test_security_headers_present():
    """Verify OWASP security headers are injected on HTTP responses."""
    status, headers, body = await asgi_request("GET", "/")
    assert status == 200
    assert headers.get("x-content-type-options") == "nosniff"
    assert headers.get("x-frame-options") == "DENY"
    assert headers.get("referrer-policy") == "strict-origin-when-cross-origin"
    assert "1; mode=block" in headers.get("x-xss-protection", "")
    assert "geolocation=(self)" in headers.get("permissions-policy", "")
    assert headers.get("x-permitted-cross-domain-policies") == "none"


@pytest.mark.anyio
async def test_pagination_bounds_validation():
    """Verify page and limit enforce strict upper and lower bounds."""
    # page must be >= 1
    status, _, _ = await asgi_request("GET", "/api/hackathons", query_string=b"page=0")
    assert status == 422

    status, _, _ = await asgi_request("GET", "/api/hackathons", query_string=b"page=-5")
    assert status == 422

    # page must be <= 1000
    status, _, _ = await asgi_request("GET", "/api/hackathons", query_string=b"page=1001")
    assert status == 422

    # limit must be >= 1 and <= 100
    status, _, _ = await asgi_request("GET", "/api/hackathons", query_string=b"limit=0")
    assert status == 422

    status, _, _ = await asgi_request("GET", "/api/hackathons", query_string=b"limit=500")
    assert status == 422


@pytest.mark.anyio
async def test_query_string_length_bounds():
    """Verify search, category, and sort parameters reject excessively long strings."""
    # search string > 100 chars
    long_search = b"search=" + b"a" * 105
    status, _, _ = await asgi_request("GET", "/api/hackathons", query_string=long_search)
    assert status == 422

    # category string > 30 chars
    long_category = b"category=" + b"a" * 35
    status, _, _ = await asgi_request("GET", "/api/hackathons", query_string=long_category)
    assert status == 422


@pytest.mark.anyio
async def test_lat_lng_bounds_validation():
    """Verify latitude and longitude enforce physical geographic bounds."""
    status, _, _ = await asgi_request("GET", "/api/hackathons", query_string=b"lat=120.0&lng=50.0")
    assert status == 422

    status, _, _ = await asgi_request("GET", "/api/hackathons", query_string=b"lat=20.0&lng=250.0")
    assert status == 422


def test_proxy_ip_extraction():
    """Verify CF-Connecting-IP and X-Forwarded-For are correctly prioritized and validated."""
    # 1. Valid Cloudflare header
    req_cf = MagicMock()
    req_cf.headers = {"CF-Connecting-IP": "203.0.113.19"}
    assert get_client_ip(req_cf) == "203.0.113.19"

    # 2. Malformed Cloudflare header falls back to X-Forwarded-For or remote address
    req_bad_cf = MagicMock()
    req_bad_cf.headers = {"CF-Connecting-IP": "not_an_ip; malicious payload"}
    req_bad_cf.client.host = "192.0.2.1"
    assert get_client_ip(req_bad_cf) == "192.0.2.1"

    # 3. Valid X-Forwarded-For header (first IP in chain)
    req_fwd = MagicMock()
    req_fwd.headers = {"X-Forwarded-For": "198.51.100.42, 10.0.0.1"}
    assert get_client_ip(req_fwd) == "198.51.100.42"

    # 4. Fallback
    req_fallback = MagicMock()
    req_fallback.headers = {}
    req_fallback.client.host = "192.0.2.1"
    assert get_client_ip(req_fallback) == "192.0.2.1"


@pytest.mark.anyio
async def test_secured_refresh_endpoint():
    """Verify /api/refresh requires valid secret when ADMIN_SECRET is configured."""
    with patch.dict(os.environ, {"ADMIN_SECRET": "super_secret_test_token_123"}):
        # Unauthenticated attempt should fail with 401
        status, _, body = await asgi_request("POST", "/api/refresh")
        assert status == 401
        assert json.loads(body)["success"] is False

        # Wrong token attempt should fail with 401
        status, _, _ = await asgi_request("POST", "/api/refresh", headers=[("X-Admin-Secret", "wrong_token")])
        assert status == 401

        # Valid X-Admin-Secret header should succeed
        status, _, body = await asgi_request("POST", "/api/refresh", headers=[("X-Admin-Secret", "super_secret_test_token_123")])
        assert status == 200
        assert json.loads(body)["success"] is True

        # Valid Bearer token should also succeed
        status, _, body = await asgi_request("POST", "/api/refresh", headers=[("Authorization", "Bearer super_secret_test_token_123")])
        assert status == 200
        assert json.loads(body)["success"] is True


@pytest.mark.anyio
async def test_production_unconfigured_admin_secret():
    """Verify that in production without ADMIN_SECRET, refresh is forbidden (403)."""
    with patch.dict(os.environ, {"ADMIN_SECRET": "", "ENVIRONMENT": "production"}), patch("api._is_prod", True):
        status, _, body = await asgi_request("POST", "/api/refresh")
        assert status == 403
        assert json.loads(body)["success"] is False


def test_user_agent_parsing():
    """Verify user-agent parsing categorizes device, os, and browser accurately."""
    from api import _parse_user_agent

    # Mobile iPhone Safari
    ua_iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    info = _parse_user_agent(ua_iphone)
    assert info["device"] == "Mobile"
    assert info["os"] == "iOS"
    assert info["browser"] == "Safari"

    # Desktop Windows Chrome
    ua_chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    info = _parse_user_agent(ua_chrome)
    assert info["device"] == "Desktop"
    assert info["os"] == "Windows"
    assert info["browser"] == "Chrome"

    # Empty / fallback
    info_empty = _parse_user_agent("")
    assert info_empty["device"] == "Unknown"


def test_visitor_telemetry_recording():
    """Verify visitor recording inserts into MongoDB and triggers debounced alerts."""
    from api import _record_visitor, _visitor_alert_cache, _visitor_db_cache

    mock_col = MagicMock()
    _visitor_alert_cache.clear()
    _visitor_db_cache.clear()

    with patch("api.get_collection", return_value=mock_col), \
         patch.dict(os.environ, {"TELEGRAM_BOT_TOKEN": "mock_token", "TELEGRAM_CHAT_ID": "123456"}), \
         patch("requests.post") as mock_post:
        
        # 1. Localhost should be skipped
        _record_visitor("127.0.0.1", "Chrome", "https://google.com", "/api/hackathons", "IN")
        assert mock_col.insert_one.call_count == 0
        assert mock_post.call_count == 0

        # 2. Real visitor IP should record in Mongo and trigger Telegram
        _record_visitor("203.0.113.55", "Chrome on Windows", "https://linkedin.com", "/api/hackathons", "IN")
        assert mock_col.insert_one.call_count == 1
        assert mock_post.call_count == 1
        assert "203.0.113.55" in _visitor_alert_cache

        # 3. Rapid repeat visit from same IP debounces BOTH Mongo write and Telegram
        _record_visitor("203.0.113.55", "Chrome on Windows", "https://linkedin.com", "/api/hackathons", "IN")
        assert mock_col.insert_one.call_count == 1  # Debounced, protects DB from floods!
        assert mock_post.call_count == 1  # Debounced, protects Telegram!

        # 4. Visit from another IP records in Mongo
        _record_visitor("198.51.100.88", "Firefox on Linux", "https://github.com", "/api/hackathons", "US")
        assert mock_col.insert_one.call_count == 2

