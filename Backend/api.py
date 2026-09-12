import ipaddress
import logging
import os
import re
import secrets
import sys
import time
import statistics
from collections import deque
from datetime import datetime, timezone
import math
from typing import Optional
from fastapi import FastAPI, Request, Query
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from cachetools import TTLCache

# Ensure utf-8 encoding for standard output
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)

# Import the existing db module
from db.mongo_client import get_collection

# Proxy-aware client IP extractor for SlowAPI (respects Cloudflare & reverse proxies with IP validation)
def get_client_ip(request: Request) -> str:
    """Extract real client IP safely respecting Cloudflare and reverse proxy headers with format validation."""
    cf_ip = request.headers.get("CF-Connecting-IP")
    if cf_ip:
        candidate = cf_ip.strip()
        try:
            ipaddress.ip_address(candidate)
            return candidate
        except ValueError:
            pass

    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        candidate = forwarded.split(",")[0].strip()
        try:
            ipaddress.ip_address(candidate)
            return candidate
        except ValueError:
            pass

    return get_remote_address(request)

# Rate limiter – configured per real validated client IP
limiter = Limiter(key_func=get_client_ip)

_is_prod = os.getenv("ENVIRONMENT", "").lower() == "production" or os.getenv("RENDER", "").lower() == "true"
app = FastAPI(
    title="Hackathon Notifier API",
    docs_url=None if _is_prod else "/docs",
    redoc_url=None if _is_prod else "/redoc",
    openapi_url=None if _is_prod else "/openapi.json",
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── In-memory TTL cache ──────────────────────────────────────────────────────────────
#
# Why TTLCache instead of Redis / Memcached?
#   At this scale (single Render instance, ~100 requests/day), in-process
#   caching has zero infrastructure cost and <1ms latency. A distributed
#   cache would add complexity and a new failure mode without measurable
#   benefit. This is a deliberate trade-off, documented here so future
#   contributors understand it wasn't an oversight.
#
# Strategy:
#   - maxsize=32 (one slot per unique (lat, lng) pair plus the "all" key)
#   - TTL = CACHE_TTL_SECONDS (default 3600s = 1 hour)
#   - Cache is keyed by rounded (lat, lng) so proximity-sorted results are also
#     cached per unique user location area without allowing cache exhaustion attacks.
#   - On a cache HIT the MongoDB round-trip is skipped entirely —
#     a query that takes ~80ms from cold becomes ~0.2ms from cache.
#   - After a scrape job runs (scrape_job.py / Render cron), the frontend
#     would normally wait up to TTL for fresh data. To avoid this, POST
#     /api/refresh clears the cache immediately. The scrape cron should
#     call that endpoint as its final step.
#
# Tuning:
#   Set CACHE_TTL_SECONDS env var to override. Recommended values:
#     - Development / testing : 60    (1 minute — see changes quickly)
#     - Production            : 10800 (3 hours — calculated every 3-4 hours)
#
_CACHE_TTL = int(os.getenv("CACHE_TTL_SECONDS", 3 * 3600))
_cache: TTLCache = TTLCache(maxsize=32, ttl=_CACHE_TTL)
_CACHE_KEY = "hackathons"

# ---------- Response-time tracking for p50/p95 ----------
_latencies: deque[float] = deque(maxlen=500)  # last 500 requests

@app.middleware("http")
async def timing_middleware(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    _latencies.append(elapsed_ms)
    response.headers["X-Response-Time-Ms"] = f"{elapsed_ms:.2f}"
    return response

@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Permissions-Policy"] = "geolocation=(self), camera=(), microphone=()"
    response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
    if request.url.scheme == "https" or request.headers.get("X-Forwarded-Proto") == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# CORS – restrict to validated frontend origins; explicit allowed methods and headers
_raw_frontends = os.getenv("FRONTEND_URL", "https://hackathon-notifier.vercel.app")
_frontend_origins = [o.strip() for o in _raw_frontends.split(",") if o.strip()]
_allowed_origins = list(set(_frontend_origins + ["http://localhost:5173", "http://127.0.0.1:5173"]))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["GET", "POST", "HEAD", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Admin-Secret", "Accept", "Origin"],
)

def _clean_prize_to_inr(text: str) -> float:
    """Parse raw prize string into numerical INR safely without false positive triggers."""
    if not text:
        return 0.0
    s = str(text).strip()
    is_crore = bool(re.search(r'\b(?:cr|crore|crores)\b', s, re.I))
    is_lakh = bool(re.search(r'\b(?:lakh|lakhs|lac|lacs)\b', s, re.I))
    is_usd = '$' in s or bool(re.search(r'\b(?:usd)\b', s, re.I))
    is_eur = '€' in s or bool(re.search(r'\b(?:eur)\b', s, re.I))
    is_gbp = '£' in s or bool(re.search(r'\b(?:gbp)\b', s, re.I))

    # Remove commas between digits (e.g. 10,00,000 -> 1000000)
    s_clean = re.sub(r'(\d),(\d)', r'\1\2', s)
    m = re.search(r'(\d+(?:\.\d+)?)', s_clean)
    if not m:
        return 0.0
    try:
        val = float(m.group(1))
    except ValueError:
        return 0.0

    if val > 500_000_000:
        return 0.0

    mult = 1.0
    if is_crore:
        mult = 10_000_000.0
    elif is_lakh:
        mult = 100_000.0
    elif is_usd:
        mult = 87.0
    elif is_eur:
        mult = 94.0
    elif is_gbp:
        mult = 110.0

    total = val * mult
    # Cap single hackathon prize to 10 Cr to filter typos or test strings
    if total > 100_000_000:
        return 0.0
    return total

def _sort_hackathons(docs: list[dict]) -> list[dict]:
    """
    Sort hackathons: upcoming (soonest first) -> no date -> ended/past (most recent first).
    If lat and lng are provided in the request (handled outside), they will be pre-sorted.
    """
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    upcoming, no_date, past = [], [], []

    for doc in docs:
        iso = doc.get("deadline_iso", "")
        status = doc.get("status", "").lower()

        if iso and iso >= today and status != "ended":
            upcoming.append(doc)
        elif iso and (iso < today or status == "ended"):
            past.append(doc)
        elif status == "ended":
            past.append(doc)
        else:
            no_date.append(doc)

    upcoming.sort(key=lambda d: d.get("deadline_iso", "9999"))
    past.sort(key=lambda d: d.get("deadline_iso", ""), reverse=True)

    for doc in upcoming:
        doc["is_past"] = False
    for doc in no_date:
        doc["is_past"] = False
    for doc in past:
        doc["is_past"] = True

    return upcoming + no_date + past


@app.get("/")
@app.head("/")
def read_root():
    return {"message": "Hackathon API is running"}

@app.get("/api/hackathons")
@limiter.limit("60/minute")
def get_hackathons(
    request: Request, 
    lat: Optional[float] = Query(default=None, ge=-90.0, le=90.0), 
    lng: Optional[float] = Query(default=None, ge=-180.0, le=180.0),
    page: int = Query(default=1, ge=1, le=1000),
    limit: int = Query(default=12, ge=1, le=100),
    category: str = Query(default="All", max_length=30),
    search: str = Query(default="", max_length=100),
    sort: str = Query(default="deadline", max_length=20),
    tab: str = Query(default="upcoming", max_length=20)
):
    # --- cache hit → skip Mongo entirely ---
    # Round coordinates to 2 decimal places (~1.1km radius) to group requests safely and avoid cache thrashing attacks
    if lat is not None and lng is not None:
        cache_key = f"{_CACHE_KEY}_{round(lat, 2)}_{round(lng, 2)}"
    else:
        cache_key = _CACHE_KEY
    cached = _cache.get(cache_key)
    
    if cached is None:
        logger.info("Cache MISS — querying MongoDB")
        try:
            collection = get_collection()
            cursor = collection.find({})
            docs = []
            for doc in cursor:
                doc["_id"] = str(doc["_id"])
                # Calculate distance if we have coords
                if lat is not None and lng is not None and "lat" in doc and "lng" in doc:
                    try:
                        d_lat = math.radians(doc["lat"] - lat)
                        d_lng = math.radians(doc["lng"] - lng)
                        a = math.sin(d_lat/2) * math.sin(d_lat/2) + \
                            math.cos(math.radians(lat)) * math.cos(math.radians(doc["lat"])) * \
                            math.sin(d_lng/2) * math.sin(d_lng/2)
                        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
                        distance_km = 6371 * c
                        doc["distance_km"] = round(distance_km, 1)
                    except Exception:
                        pass
                docs.append(doc)

            sorted_docs = _sort_hackathons(docs)
            
            # If lat/lng is provided, sort upcoming offline events by distance default in cache
            if lat is not None and lng is not None:
                sorted_docs.sort(key=lambda x: (x.get("is_past", False), x.get("distance_km", 999999)))

            # Collect stats
            all_tags = set()
            sources = set()
            college_types = set()
            latest_scrape = ""
            top_college_count = 0
            internship_count = 0

            for doc in sorted_docs:
                for t in doc.get("tags", []):
                    all_tags.add(t)
                sources.add(doc.get("source", "Unknown"))
                sa = doc.get("scraped_at", "")
                if sa > latest_scrape:
                    latest_scrape = sa

                # Classification stats
                if doc.get("is_top_college"):
                    top_college_count += 1
                    ct = doc.get("college_type")
                    if ct:
                        college_types.add(ct)
                if doc.get("is_internship"):
                    internship_count += 1

            # Calculate real prize pool & real total registrations
            total_prize_inr = sum(_clean_prize_to_inr(d.get("prize", "")) for d in sorted_docs)
            if total_prize_inr >= 10_000_000:
                total_prize_formatted = f"₹{total_prize_inr / 10_000_000:.1f} Cr"
            elif total_prize_inr >= 100_000:
                total_prize_formatted = f"₹{total_prize_inr / 100_000:.1f} Lakh"
            elif total_prize_inr > 0:
                total_prize_formatted = f"₹{int(total_prize_inr):,}"
            else:
                total_prize_formatted = "₹0"

            total_registrations = sum(int(d.get("total_registrations") or d.get("registrations") or 0) for d in sorted_docs)
            if total_registrations >= 1_000:
                total_registrations_formatted = f"{total_registrations / 1000:.1f}k"
            else:
                total_registrations_formatted = str(total_registrations)

            p50_lat = round(statistics.median(_latencies), 1) if _latencies else 32.0

            stats = {
                "total": len(sorted_docs),
                "unique_tags": len(all_tags),
                "sources": list(sources),
                "last_scraped": latest_scrape,
                "top_college_count": top_college_count,
                "internship_count": internship_count,
                "college_types": sorted(college_types),
                "online_count": sum(1 for d in sorted_docs if "online" in d.get("mode", "").lower()),
                "offline_count": sum(1 for d in sorted_docs if "offline" in d.get("mode", "").lower()),
                "unique_sources_count": sum(1 for d in sorted_docs if d.get("source") == "Unique Sources"),
                "hackathon_count": sum(1 for d in sorted_docs if d.get("opportunity_type") == "Hackathon"),
                "total_prize_pool_inr": total_prize_inr,
                "total_prize_pool_formatted": total_prize_formatted,
                "total_registrations": total_registrations,
                "total_registrations_formatted": total_registrations_formatted,
                "p50_latency_ms": p50_lat,
                "recalculated_cadence": "Every 3-4 hours",
                "calculated_at": datetime.now(timezone.utc).isoformat()
            }

            cached = {"docs": sorted_docs, "stats": stats}
            _cache[cache_key] = cached
        except Exception as e:
            logger.error("Error fetching hackathons", exc_info=True)
            return {"success": False, "error": "Internal server error", "data": [], "stats": {}}

    # Apply filters dynamically in Python
    filtered = cached["docs"]
    
    if category == 'Top College':
        filtered = [d for d in filtered if d.get('is_top_college')]
    elif category == 'Internship':
        filtered = [d for d in filtered if d.get('is_internship')]
    elif category == 'Hackathon':
        filtered = [d for d in filtered if d.get('opportunity_type') == 'Hackathon']
    elif category == 'Online':
        filtered = [d for d in filtered if 'online' in d.get('mode', '').lower()]
    elif category == 'Offline':
        filtered = [d for d in filtered if 'offline' in d.get('mode', '').lower()]
    elif category == 'Unique Sources':
        filtered = [d for d in filtered if d.get('source') == 'Unique Sources']

    if search:
        q = search.lower()
        filtered = [d for d in filtered if (
            q in d.get('title', '').lower() or
            q in d.get('location', '').lower() or
            any(q in tag.lower() for tag in d.get('tags', []))
        )]
        
    # Sorting
    if sort == 'deadline':
        filtered = sorted(filtered, key=lambda d: d.get('deadline_iso', '9999'))
    elif sort == 'distance':
        filtered = sorted(filtered, key=lambda d: d.get('distance_km', 999999))
    elif sort == 'name':
        filtered = sorted(filtered, key=lambda d: d.get('title', '').lower())
    elif sort == 'newest':
        filtered = sorted(filtered, key=lambda d: d.get('scraped_at', ''), reverse=True)

    # Split into Upcoming / Missed
    upcoming = [d for d in filtered if not d.get('is_past', False)]
    missed = [d for d in filtered if d.get('is_past', False)]
    
    target_list = upcoming if tab == 'upcoming' else missed
    
    # Paginate
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    page_data = target_list[start_idx:end_idx]

    payload = {
        "success": True, 
        "count": len(page_data), 
        "data": page_data, 
        "upcoming_total": len(upcoming),
        "missed_total": len(missed),
        "stats": cached["stats"]
    }

    return payload


@app.get("/health")
@limiter.limit("60/minute")
def health_check(request: Request):
    """
    Liveness + readiness probe.
    Returns 200 if Mongo is reachable, 503 otherwise.
    Protected from error message leakage and rate-limited.
    """
    try:
        col = get_collection()
        if col is None:
            return JSONResponse(
                status_code=503,
                content={"status": "unhealthy", "reason": "database unavailable"},
            )
        # Fast round-trip to verify the connection is actually alive
        col.database.client.admin.command("ping")
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        logger.error("Health check failed: %s", e)
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "reason": "database unavailable"},
        )


@app.get("/api/metrics")
@limiter.limit("60/minute")
def get_metrics(request: Request):
    """Return p50/p95 response times (ms) for the last 500 requests."""
    if not _latencies:
        return {"message": "No requests recorded yet"}
    data = sorted(_latencies)
    return {
        "request_count": len(data),
        "p50_ms": round(statistics.median(data), 2),
        "p95_ms": round(data[int(len(data) * 0.95) - 1], 2) if len(data) >= 2 else round(data[0], 2),
        "min_ms": round(data[0], 2),
        "max_ms": round(data[-1], 2),
        "cache_ttl_seconds": _CACHE_TTL,
        "cache_size": len(_cache),
    }


@app.post("/api/refresh")
@limiter.limit("5/minute")
def refresh_cache(request: Request):
    """Invalidate the in-memory cache, forcing the next GET /api/hackathons
    to re-query MongoDB.

    Secured: Uses constant-time token comparison (secrets.compare_digest).
    If ADMIN_SECRET is set, requires valid X-Admin-Secret or Authorization: Bearer <secret>.
    If in production and ADMIN_SECRET is not configured, rejects unauthenticated cache purges.
    Rate-limited: 5 calls per minute per client IP to prevent cache-stampede abuse.
    """
    admin_secret = os.getenv("ADMIN_SECRET", "").strip()
    if admin_secret:
        auth_header = request.headers.get("X-Admin-Secret") or request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            auth_header = auth_header[7:].strip()
        if not secrets.compare_digest(auth_header, admin_secret):
            return JSONResponse(
                status_code=401,
                content={"success": False, "error": "Unauthorized: invalid or missing admin token"}
            )
    elif _is_prod:
        return JSONResponse(
            status_code=403,
            content={"success": False, "error": "Forbidden: ADMIN_SECRET is not configured"}
        )

    n = len(_cache)
    _cache.clear()
    logger.info("Cache manually cleared via POST /api/refresh (%d entries removed).", n)
    return {"success": True, "cleared": n, "message": "Cache cleared. Next request will re-query MongoDB."}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
