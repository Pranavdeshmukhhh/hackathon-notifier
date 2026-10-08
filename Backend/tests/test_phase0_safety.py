"""Regression coverage for trust boundaries and recovery safeguards."""

from datetime import datetime, timezone
from io import BytesIO
from unittest.mock import MagicMock, patch

import mongomock
import pytest
from bson import ObjectId

from safe_http import UnsafeURL, public_request, validate_public_url
from scripts.backup_database import export_database, restore_database, verify_backup
from scrapers.hackathon_verifier import _score_domain
from tests.test_api_security import asgi_request


@pytest.mark.parametrize("url", [
    "file:///etc/passwd", "http://localhost/", "http://127.0.0.1/",
    "http://10.0.0.1/", "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/", "http://[::ffff:127.0.0.1]/", "https://service.internal/",
    "https://user:password@example.com/", "https://example.com:8080/",
    "https://example.com\\@localhost/", "https://example.com/\nheader",
])
def test_unsafe_url_syntax(url):
    with pytest.raises(UnsafeURL):
        validate_public_url(url)


def dns_result(*addresses):
    return [(2, 1, 6, "", (address, 443)) for address in addresses]


def response(status=200, headers=None, body=b"<html>safe</html>"):
    result = MagicMock(status=status, headers=headers or {"Content-Type": "text/html"})
    stream = BytesIO(body)
    result.read.side_effect = lambda size, **kwargs: stream.read(size)
    return result


def test_dns_with_any_private_address_is_rejected():
    with patch("safe_http.socket.getaddrinfo", return_value=dns_result("8.8.8.8", "10.0.0.1")), \
         patch("safe_http.urllib3.HTTPSConnectionPool") as pool:
        with pytest.raises(UnsafeURL):
            public_request("https://example.com/")
        pool.assert_not_called()


def test_dns_failure_is_not_an_event_deletion_signal():
    from lifecycle import check_link, LinkStatus
    with patch("safe_http.socket.getaddrinfo", side_effect=OSError("temporary DNS failure")):
        assert check_link("https://example.com/") is LinkStatus.UNKNOWN
    assert check_link("https://[invalid-ip/") is LinkStatus.UNKNOWN


def test_connection_is_pinned_with_original_tls_hostname():
    pool = MagicMock()
    pool.urlopen.return_value = response()
    with patch("safe_http.socket.getaddrinfo", return_value=dns_result("8.8.8.8")), \
         patch("safe_http.urllib3.HTTPSConnectionPool", return_value=pool) as constructor:
        result = public_request("https://example.com/event?q=1", html_only=True)
    assert result.text == "<html>safe</html>"
    assert constructor.call_args.args[0] == "8.8.8.8"
    assert constructor.call_args.kwargs["server_hostname"] == "example.com"
    assert constructor.call_args.kwargs["assert_hostname"] == "example.com"
    assert constructor.call_args.kwargs["cert_reqs"] == "CERT_REQUIRED"
    assert pool.urlopen.call_args.kwargs["headers"]["Host"] == "example.com"
    assert pool.urlopen.call_args.kwargs["redirect"] is False
    pool.close.assert_called_once()


def test_redirect_destination_is_resolved_and_checked_again():
    pool = MagicMock()
    pool.urlopen.return_value = response(302, {"Location": "https://redirect.example/event"})
    with patch("safe_http.socket.getaddrinfo", side_effect=[dns_result("8.8.8.8"), dns_result("10.0.0.1")]), \
         patch("safe_http.urllib3.HTTPSConnectionPool", return_value=pool) as constructor:
        with pytest.raises(UnsafeURL):
            public_request("https://example.com/")
    assert constructor.call_count == 1
    pool.close.assert_called_once()


@pytest.mark.parametrize("headers,body", [
    ({"Content-Type": "text/html", "Content-Length": "500"}, b"x"),
    ({"Content-Type": "text/html", "Content-Encoding": "gzip"}, b"x"),
    ({"Content-Type": "application/json"}, b"{}"),
    ({"Content-Type": "text/html"}, b"x" * 33),
])
def test_response_limits(headers, body):
    pool = MagicMock()
    pool.urlopen.return_value = response(headers=headers, body=body)
    with patch("safe_http.socket.getaddrinfo", return_value=dns_result("8.8.8.8")), \
         patch("safe_http.urllib3.HTTPSConnectionPool", return_value=pool):
        with pytest.raises(UnsafeURL):
            public_request("https://example.com/", max_bytes=32, html_only=True)
    pool.close.assert_called_once()


def test_platform_domain_cannot_be_spoofed():
    assert _score_domain("https://devpost.com/event") == 0.95
    assert _score_domain("https://event.devpost.com/") == 0.95
    assert _score_domain("https://devpost.com.attacker.net/") == 0.40
    assert _score_domain("https://attacker-devpost.com/") == 0.40
    assert _score_domain("https://devpost.com@attacker.net/") == 0.0


ADMIN_PATHS = ["refresh", "hackathons/preview-url", "hackathons/auto-list",
               "scanner/trigger", "scanner/instagram", "scanner/web-discovery", "hackathons/verify"]


@pytest.mark.anyio
@pytest.mark.parametrize("prefix", ["/api/", "/api/v1/"])
@pytest.mark.parametrize("path", ADMIN_PATHS)
async def test_all_admin_routes_fail_closed(prefix, path, monkeypatch):
    monkeypatch.setenv("ADMIN_SECRET", "")
    with patch("api.get_collection") as db, patch("api.public_request") as fetch:
        status, _, _ = await asgi_request("POST", prefix + path)
    assert status == 403
    db.assert_not_called()
    fetch.assert_not_called()


class ExportSource:
    """Supply collection metadata unsupported by mongomock."""
    def __init__(self, database):
        self.database = database
        self.name = database.name

    def __getitem__(self, name):
        return self.database[name]

    def list_collections(self):
        return [{"name": name, "type": "collection", "options": {}}
                for name in self.database.list_collection_names()]


def test_backup_roundtrip_preserves_bson_and_unique_indexes(tmp_path):
    client = mongomock.MongoClient(tz_aware=True)
    original = client.hackathon_tracker
    document = {"_id": ObjectId(), "link": "https://example.com/event",
                "created_at": datetime(2026, 1, 1, tzinfo=timezone.utc)}
    original.events.insert_one(document)
    original.events.create_index("link", unique=True)
    output = tmp_path / "backup"
    manifest = export_database(ExportSource(original), output)
    assert manifest["collections"][0]["count"] == 1
    target = client.phase0_restore_test
    restore_database(target, output)
    assert target.events.find_one() == document
    assert target.events.index_information()["link_1"]["unique"] is True
    with pytest.raises(ValueError):
        restore_database(original, output)
    with pytest.raises(ValueError):
        restore_database(target, output)
    with pytest.raises(FileExistsError):
        export_database(ExportSource(original), output)
    data_file = output / manifest["collections"][0]["file"]
    data_file.write_bytes(data_file.read_bytes() + b"tampered")
    with pytest.raises(ValueError, match="checksum"):
        verify_backup(output)


def test_missing_bot_token_does_not_start_poll_loop(monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "")
    from unified_server import _run_bot_polling
    with patch("unified_server.start_polling") as polling:
        _run_bot_polling()
    polling.assert_not_called()
