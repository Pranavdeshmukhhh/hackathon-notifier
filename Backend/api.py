import logging
import os
import sys
import time
import statistics
from collections import deque
from datetime import datetime
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

# ---------- In-memory TTL cache (matches 4-hour scrape interval) ----------
_CACHE_TTL = int(os.getenv("CACHE_TTL_SECONDS", 4 * 3600))  # default 4 h
_cache: TTLCache = TTLCache(maxsize=1, ttl=_CACHE_TTL)
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
    allow_origins=[_frontend_url],
    allow_methods=["*"],
    allow_headers=["*"],
)

def _sort_hackathons(docs: list[dict]) -> list[dict]:
    """
    Sort hackathons: upcoming (soonest first) -> no date -> ended/past (most recent first).
    """
    today = datetime.utcnow().strftime("%Y-%m-%d")
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
@limiter.limit("30/minute")
def get_hackathons(request: Request):
    # --- cache hit → skip Mongo entirely ---
    cached = _cache.get(_CACHE_KEY)
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
            docs.append(doc)

        sorted_docs = _sort_hackathons(docs)

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
        _cache[_CACHE_KEY] = payload
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
