"""Bounded HTTP requests to public destinations, with DNS-pinned connections."""

from dataclasses import dataclass
import ipaddress
import socket
import time
from urllib.parse import urljoin, urlsplit, urlunsplit

import certifi
import urllib3


class UnsafeURL(ValueError):
    """The destination or response violates the fetch policy."""


class FetchUnavailable(RuntimeError):
    """The public destination could not be reached within the request budget."""


@dataclass(frozen=True)
class PublicResponse:
    status_code: int
    text: str
    url: str


def validate_public_url(url: str) -> str:
    """Validate syntax and literal addresses without making network requests."""
    if not isinstance(url, str) or not url or len(url) > 2048:
        raise UnsafeURL("A valid public HTTP or HTTPS URL is required")
    if any(ord(char) <= 32 or ord(char) == 127 for char in url) or "\\" in url:
        raise UnsafeURL("URL contains invalid characters")
    try:
        parts = urlsplit(url)
        hostname = parts.hostname
        port = parts.port
        if parts.scheme not in {"http", "https"} or not hostname or parts.username is not None or parts.password is not None:
            raise UnsafeURL("Only public HTTP or HTTPS URLs without credentials are allowed")
        default_port = 443 if parts.scheme == "https" else 80
        if port is not None and port != default_port:
            raise UnsafeURL("Only standard HTTP and HTTPS ports are allowed")
        hostname = hostname.rstrip(".").encode("idna").decode("ascii").lower()
        if hostname == "localhost" or hostname.endswith((".localhost", ".local", ".internal")):
            raise UnsafeURL("Local destinations are not allowed")
        try:
            address = ipaddress.ip_address(hostname)
        except ValueError:
            if len(hostname) > 253 or "." not in hostname or any(not label or len(label) > 63 or label.startswith("-") or label.endswith("-") or not all(c.isalnum() or c == "-" for c in label) for label in hostname.split(".")):
                raise UnsafeURL("Invalid public hostname")
        else:
            if not _is_public(address):
                raise UnsafeURL("Non-public destinations are not allowed")
        host = f"[{hostname}]" if ":" in hostname else hostname
        return urlunsplit((parts.scheme, host, parts.path or "/", parts.query, ""))
    except (ValueError, UnicodeError) as exc:
        if isinstance(exc, UnsafeURL):
            raise
        raise UnsafeURL("Invalid URL") from None


def _is_public(address) -> bool:
    mapped = getattr(address, "ipv4_mapped", None)
    return address.is_global and not address.is_multicast and not address.is_reserved and (mapped is None or _is_public(mapped))


def _resolve_public(hostname: str, port: int) -> str:
    try:
        addresses = {entry[4][0] for entry in socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)}
    except OSError:
        raise FetchUnavailable("Destination could not be resolved") from None
    if not addresses or any(not _is_public(ipaddress.ip_address(address)) for address in addresses):
        raise UnsafeURL("Destination resolves to a non-public address")
    return sorted(addresses)[0]


def public_request(url: str, *, method: str = "GET", headers: dict | None = None,
                   timeout: float = 6.0, max_bytes: int = 2_000_000,
                   max_redirects: int = 3, html_only: bool = False) -> PublicResponse:
    """Check every redirect and connect to the validated IP with original TLS SNI.

    No environment proxies, cookies, credentials, or automatic redirect/retry
    behavior are used. Body reads are bounded; compression is not accepted.
    """
    if method not in {"GET", "HEAD"}:
        raise ValueError("Only GET and HEAD are supported")
    current = validate_public_url(url)
    deadline = time.monotonic() + timeout
    for redirect in range(max_redirects + 1):
        parts = urlsplit(current)
        port = 443 if parts.scheme == "https" else 80
        address = _resolve_public(parts.hostname, port)
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise FetchUnavailable("Fetch timed out")
        options = {"timeout": urllib3.Timeout(total=remaining, connect=min(remaining, 3), read=min(remaining, 3)), "maxsize": 1}
        if parts.scheme == "https":
            pool = urllib3.HTTPSConnectionPool(address, port, server_hostname=parts.hostname,
                assert_hostname=parts.hostname, cert_reqs="CERT_REQUIRED", ca_certs=certifi.where(), **options)
        else:
            pool = urllib3.HTTPConnectionPool(address, port, **options)
        response = None
        try:
            request_headers = {name: value for name, value in (headers or {}).items()
                               if name.lower() in {"user-agent", "accept", "accept-language"}}
            request_headers["Host"] = parts.netloc
            request_headers["Accept-Encoding"] = "identity"
            response = pool.urlopen(method, urlunsplit(("", "", parts.path, parts.query, "")),
                headers=request_headers, redirect=False, retries=False, preload_content=False, assert_same_host=False)
            if response.status in {301, 302, 303, 307, 308}:
                location = response.headers.get("Location")
                if not location or redirect == max_redirects:
                    raise UnsafeURL("Invalid or excessive redirects")
                target = validate_public_url(urljoin(current, location))
                if parts.scheme == "https" and urlsplit(target).scheme != "https":
                    raise UnsafeURL("HTTPS downgrade is not allowed")
                current = target
                continue
            body = bytearray()
            if method != "HEAD" and max_bytes > 0:
                content_type = response.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
                if html_only and content_type not in {"text/html", "application/xhtml+xml"}:
                    raise UnsafeURL("Destination did not return HTML")
                if response.headers.get("Content-Encoding", "identity").lower() not in {"identity", ""}:
                    raise UnsafeURL("Compressed responses are not accepted")
                length = response.headers.get("Content-Length")
                if length and (not length.isdigit() or int(length) > max_bytes):
                    raise UnsafeURL("Response exceeds the size limit")
                while True:
                    if time.monotonic() >= deadline:
                        raise FetchUnavailable("Fetch timed out")
                    chunk = response.read(min(16_384, max_bytes + 1 - len(body)), decode_content=False)
                    if not chunk:
                        break
                    body.extend(chunk)
                    if len(body) > max_bytes:
                        raise UnsafeURL("Response exceeds the size limit")
            return PublicResponse(response.status, body.decode("utf-8", errors="replace"), current)
        except urllib3.exceptions.HTTPError:
            raise FetchUnavailable("Destination could not be reached") from None
        finally:
            if response is not None:
                response.close()
            pool.close()
    raise UnsafeURL("Excessive redirects")
