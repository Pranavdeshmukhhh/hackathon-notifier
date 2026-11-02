import json
import os
import pytest
from unittest.mock import MagicMock, patch
from api import app, get_client_ip


async def asgi_request(method="GET", path="/", query_string=b"", headers=None):
    import httpx
    transport = httpx.ASGITransport(app=app, client=("127.0.0.1", 12345))
    url = path + ("?" + query_string.decode("ascii") if query_string else "")
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.request(method, url, headers=headers or [])
    return response.status_code, dict(response.headers), response.content


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
    req = MagicMock()
    req.client.host = "10.0.0.2"
    req.headers = {"X-Forwarded-For": "203.0.113.99, 198.51.100.42, 10.0.0.1"}
    assert get_client_ip(req) == "10.0.0.2"
    with patch.dict(os.environ, {"TRUSTED_PROXY_CIDRS": "10.0.0.0/24"}):
        assert get_client_ip(req) == "198.51.100.42"
        req.headers = {"X-Forwarded-For": "not-an-ip"}
        assert get_client_ip(req) == "10.0.0.2"
        req.headers = {"CF-Connecting-IP": "203.0.113.19"}
        assert get_client_ip(req) == "10.0.0.2"
        with patch.dict(os.environ, {"TRUST_CLOUDFLARE_HEADERS": "true"}):
            assert get_client_ip(req) == "203.0.113.19"


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
    from api import _record_visitor, _visitor_db_cache
    mock_col = MagicMock()
    _visitor_db_cache.clear()
    with patch("api.get_collection", return_value=mock_col), patch("requests.post") as post:
        _record_visitor("203.0.113.55", "Chrome", "https://example.com/private", "/api/hackathons?lat=1", "IN")
        mock_col.insert_one.assert_not_called()
        with patch.dict(os.environ, {"TRACK_VISITORS": "true"}):
            _record_visitor("203.0.113.55", "Chrome", "https://example.com/private", "/api/hackathons?lat=1", "IN")
            _record_visitor("203.0.113.55", "Chrome", "", "/api/hackathons", "IN")
        mock_col.insert_one.assert_called_once()
        document = mock_col.insert_one.call_args.args[0]
        assert document["path"] == "/api/hackathons"
        assert not {"ip", "user_agent", "referer", "country"}.intersection(document)
        post.assert_not_called()


@pytest.mark.anyio
async def test_api_v1_versioned_routes():
    """Verify /api/v1 versioned routes are active and functional."""
    # Test v1 health
    mock_col = MagicMock()
    with patch("api.get_collection", return_value=mock_col):
        status, _, body = await asgi_request("GET", "/api/v1/health")
        assert status == 200
        data = json.loads(body.decode("utf-8"))
        assert data.get("status") == "healthy"

    # Test v1 metrics
    status, _, body = await asgi_request("GET", "/api/v1/metrics")
    assert status == 200

    # Test v1 hackathons
    with patch("api.get_collection", return_value=mock_col):
        status, _, body = await asgi_request("GET", "/api/v1/hackathons")
        assert status == 200
        data = json.loads(body.decode("utf-8"))
        assert "data" in data
        assert "stats" in data


@pytest.mark.anyio
async def test_tab_all_and_source_filter():
    """Verify tab=all, source parameter validation, and all_total returned."""
    # 1. source parameter max length rejection
    long_source = b"source=" + b"a" * 55
    status, _, _ = await asgi_request("GET", "/api/hackathons", query_string=long_source)
    assert status == 422

    # 2. tab=all works with mock data
    mock_docs = [
        {"_id": "1", "title": "Upcoming Hack", "source": "Devfolio", "deadline_iso": "2099-01-01", "status": "Open", "mode": "Online", "tags": []},
        {"_id": "2", "title": "Past Hack", "source": "Unstop", "deadline_iso": "2020-01-01", "status": "Ended", "mode": "Offline", "tags": []},
    ]
    with patch("api.get_collection") as mock_get_col, patch("api._cache", {}):
        mock_col = MagicMock()
        mock_col.find.return_value = mock_docs
        mock_get_col.return_value = mock_col

        status, _, body = await asgi_request("GET", "/api/hackathons", query_string=b"tab=all")
        assert status == 200
        data = json.loads(body.decode("utf-8"))
        assert data["success"] is True
        assert data["all_total"] == 2
        assert len(data["data"]) == 2
        assert data["upcoming_total"] == 1
        assert data["missed_total"] == 1
        assert data["lost_opportunities_total"] == 1
        # Verification: stats.total excludes lost opportunities!
        assert data["stats"]["total"] == 1
        assert data["stats"]["active_count"] == 1
        assert data["stats"]["lost_opportunities_count"] == 1
        assert data["stats"]["all_total"] == 2
        assert "source_counts" in data["stats"]
        assert data["stats"]["source_counts"]["Devfolio"] == 1
        assert data["stats"]["source_counts"]["Unstop"] == 1

        # 3. Test tab=lost_opportunities returns only missed/past hackathons
        status_lost, _, body_lost = await asgi_request("GET", "/api/hackathons", query_string=b"tab=lost_opportunities")
        assert status_lost == 200
        data_lost = json.loads(body_lost.decode("utf-8"))
        assert len(data_lost["data"]) == 1
        assert data_lost["data"][0]["title"] == "Past Hack"


