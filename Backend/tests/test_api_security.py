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


@pytest.mark.anyio
async def test_pagination_bounds_validation():
    """Verify page and limit enforce strict upper and lower bounds."""
    # page must be >= 1
    status, _, _ = await asgi_request("GET", "/api/hackathons", query_string=b"page=0")
    assert status == 422

    status, _, _ = await asgi_request("GET", "/api/hackathons", query_string=b"page=-5")
    assert status == 422

    # limit must be >= 1 and <= 100
    status, _, _ = await asgi_request("GET", "/api/hackathons", query_string=b"limit=0")
    assert status == 422

    status, _, _ = await asgi_request("GET", "/api/hackathons", query_string=b"limit=500")
    assert status == 422


@pytest.mark.anyio
async def test_lat_lng_bounds_validation():
    """Verify latitude and longitude enforce physical geographic bounds."""
    status, _, _ = await asgi_request("GET", "/api/hackathons", query_string=b"lat=120.0&lng=50.0")
    assert status == 422

    status, _, _ = await asgi_request("GET", "/api/hackathons", query_string=b"lat=20.0&lng=250.0")
    assert status == 422


def test_proxy_ip_extraction():
    """Verify CF-Connecting-IP and X-Forwarded-For are correctly prioritized."""
    # 1. Cloudflare header
    req_cf = MagicMock()
    req_cf.headers = {"CF-Connecting-IP": "203.0.113.19"}
    assert get_client_ip(req_cf) == "203.0.113.19"

    # 2. X-Forwarded-For header (first IP in chain)
    req_fwd = MagicMock()
    req_fwd.headers = {"X-Forwarded-For": "198.51.100.42, 10.0.0.1"}
    assert get_client_ip(req_fwd) == "198.51.100.42"

    # 3. Fallback
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
