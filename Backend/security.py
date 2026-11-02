"""Administrator authorization and explicit reverse-proxy trust boundaries."""

import ipaddress
import os
import secrets

from fastapi import HTTPException, Request


class AdminAccessDenied(HTTPException):
    pass


def require_admin(request: Request) -> None:
    secret = os.getenv("ADMIN_SECRET", "").strip()
    if not secret:
        raise AdminAccessDenied(status_code=403, detail="Administrator operations are disabled until ADMIN_SECRET is configured")
    supplied = request.headers.get("X-Admin-Secret", "")
    if not supplied:
        authorization = request.headers.get("Authorization", "")
        scheme, _, value = authorization.partition(" ")
        if scheme.lower() == "bearer":
            supplied = value.strip()
    if not secrets.compare_digest(supplied.encode("utf-8"), secret.encode("utf-8")):
        raise AdminAccessDenied(status_code=401, detail="Administrator access required")


def client_ip(request: Request) -> str:
    peer = request.client.host if request.client else "unknown"
    networks = []
    for value in os.getenv("TRUSTED_PROXY_CIDRS", "").split(","):
        try:
            networks.append(ipaddress.ip_network(value.strip(), strict=False))
        except ValueError:
            continue

    def trusted(value):
        try:
            address = ipaddress.ip_address(value)
            return any(address in network for network in networks)
        except ValueError:
            return False

    if not trusted(peer):
        return peer
    if os.getenv("TRUST_CLOUDFLARE_HEADERS", "false").lower() == "true":
        try:
            return str(ipaddress.ip_address(request.headers.get("CF-Connecting-IP", "").strip()))
        except ValueError:
            pass
    forwarded = request.headers.get("X-Forwarded-For", "")
    if len(forwarded) > 2048:
        return peer
    chain = forwarded.split(",") if forwarded else []
    if len(chain) > 20:
        return peer
    try:
        addresses = [str(ipaddress.ip_address(value.strip())) for value in chain]
    except ValueError:
        return peer
    for address in reversed(addresses):
        if not trusted(address):
            return address
    return addresses[0] if addresses else peer
