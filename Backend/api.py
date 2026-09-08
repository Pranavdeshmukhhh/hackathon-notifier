import logging
import os
import sys
import time
import statistics
from collections import deque
from datetime import datetime, timezone
import math
from fastapi import FastAPI, Request
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

# Rate limiter – 30 requests/min per IP
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="Hackathon Notifier API")
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
#   - Cache is keyed by (lat, lng) so proximity-sorted results are also
#     cached per unique user location, not just the default list.
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
#     - Production            : 3600  (1 hour  — matches scrape interval)
#
_CACHE_TTL = int(os.getenv("CACHE_TTL_SECONDS", 1 * 3600))
_cache: TTLCache = TTLCache(maxsize=32, ttl=_CACHE_TTL)  # maxsize raised: supports ~32 unique locations
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

# CORS – restrict to actual frontend origin; no credentials needed
_frontend_url = os.getenv("FRONTEND_URL", "https://hackathon-notifier.vercel.app")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[_frontend_url, "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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
def get_hackathons(request: Request, lat: float = None, lng: float = None):
    # --- cache hit → skip Mongo entirely ---
    cache_key = f"{_CACHE_KEY}_{lat}_{lng}" if lat and lng else _CACHE_KEY
    cached = _cache.get(cache_key)
    if cached is not None:
        logger.debug("Cache HIT")
        return cached

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
        
        # If lat/lng is provided, sort upcoming offline events by distance
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
            for tag in doc.get("tags", []):
                all_tags.add(tag)
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

        stats = {
            "total": len(sorted_docs),
            "unique_tags": len(all_tags),
            "sources": list(sources),
            "last_scraped": latest_scrape,
            "top_college_count": top_college_count,
            "internship_count": internship_count,
            "college_types": sorted(college_types),
        }

        payload = {"success": True, "count": len(sorted_docs), "data": sorted_docs, "stats": stats}

        # --- populate cache ---
        _cache[cache_key] = payload
        return payload
    except Exception as e:
        logger.error("Error fetching hackathons", exc_info=True)
        return {"success": False, "error": "Internal server error", "data": [], "stats": {}}


@app.get("/health")
def health_check():
    """
    Liveness + readiness probe.
    Returns 200 if Mongo is reachable, 503 otherwise.
    Hook this up to UptimeRobot / Render health-check.
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
            content={"status": "unhealthy", "reason": str(e)},
        )


@app.get("/api/metrics")
def get_metrics():
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

    Intended use:
      After a scrape job runs (e.g. scrape_job.py triggered by Render cron),
      call this endpoint so the frontend immediately sees fresh data instead
      of waiting for the TTL to expire naturally.

    Example (from scrape_job.py or a shell script):
      curl -X POST https://your-backend.onrender.com/api/refresh

    Rate-limited: 5 calls per minute per IP to prevent cache-stampede abuse.

    Returns:
      {"success": true, "cleared": <number of cache entries removed>}
    """
    n = len(_cache)
    _cache.clear()
    logger.info("Cache manually cleared via POST /api/refresh (%d entries removed).", n)
    return {"success": True, "cleared": n, "message": "Cache cleared. Next request will re-query MongoDB."}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
