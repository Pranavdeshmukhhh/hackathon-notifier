import logging
import os
import re
import sys
import time
import threading
import statistics
from collections import deque
from datetime import datetime, timedelta, timezone
import math
import hashlib
import json
import difflib
from contextlib import asynccontextmanager
from typing import Literal, Optional
from urllib.parse import urlparse
from bs4 import BeautifulSoup
from bson import ObjectId
from fastapi import FastAPI, Request, Query, Path, Response, BackgroundTasks, APIRouter, Depends
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from cachetools import TTLCache

from schemas import (
    HackathonsResponse,
    HackathonDetailResponse,
    HealthResponse,
    MetricsResponse,
    RefreshResponse,
    HackathonAutoListRequest,
    HackathonAutoListResponse,
    HackathonPreviewRequest,
    HackathonPreviewResponse,
    ScannerTriggerRequest,
    ScannerTriggerResponse,
    ScannerStatusResponse,
    InstagramScanRequest,
    InstagramScanResponse,
    WebDiscoveryRequest,
    WebDiscoveryResponse,
    VerifyHackathonRequest,
    VerifyHackathonResponse,
)
from filters.keyword_filter import classify_hackathon
from scrapers.geocoder import geocode
from lifecycle import is_expired, normalize_deadline, parse_deadline_iso
from ingestion import IngestionService, ensure_indexes, ingest_batch, resolve_event
from db.job_leases import JobLease, LeaseBusy
from event_normalization import lifecycle_values
from public_events import public_event, exact_registration_count
from security import AdminAccessDenied, client_ip, require_admin
from safe_http import FetchUnavailable, UnsafeURL, public_request, validate_public_url
from scrapers.internet_scanner import (
    run_internet_scan,
    get_scanner_status,
)

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
    """Ignore forwarded headers unless the immediate peer is explicitly trusted."""
    return client_ip(request)

# Rate limiter – configured per real validated client IP
limiter = Limiter(key_func=get_client_ip)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Scheduling belongs to unified_server; API workers never start another loop."""
    logger.info("API ready; scheduled scans are managed by unified_server.")
    yield

_is_prod = os.getenv("ENVIRONMENT", "").lower() == "production" or os.getenv("RENDER", "").lower() == "true"
app = FastAPI(
    title="Hackathon Notifier API",
    description="Autonomous radar discovery engine aggregating hackathons and tech hiring challenges across India.",
    version="1.0.0",
    docs_url=None if _is_prod else "/docs",
    redoc_url=None if _is_prod else "/redoc",
    openapi_url=None if _is_prod else "/openapi.json",
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(AdminAccessDenied)
async def admin_access_denied(request: Request, exc: AdminAccessDenied):
    return JSONResponse(status_code=exc.status_code,
        content={"success": False, "error": exc.detail, "message": exc.detail})

# Versioned API Router (v1)
v1_router = APIRouter(prefix="/api/v1", tags=["v1"])

# ── In-memory TTL cache ──────────────────────────────────────────────────────────────
#
# Strategy:
#   - maxsize=32 (one slot per unique (lat, lng) pair plus the "all" key)
#   - TTL = CACHE_TTL_SECONDS (default 900s = 15 minutes)
#   - Cache is keyed by rounded (lat, lng) so proximity-sorted results are also
#     cached per unique user location area without allowing cache exhaustion attacks.
#   - On a cache HIT the MongoDB round-trip is skipped entirely.
#
_CACHE_TTL = min(60, max(1, int(os.getenv("CACHE_TTL_SECONDS", 60))))
class _LockedTTLCache(TTLCache):
    def __init__(self, *args, **kwargs):
        self._lock = threading.RLock()
        super().__init__(*args, **kwargs)

    def get(self, *args):
        with self._lock:
            return super().get(*args)

    def __getitem__(self, key):
        with self._lock:
            return super().__getitem__(key)

    def __setitem__(self, key, value):
        with self._lock:
            return super().__setitem__(key, value)

    def __len__(self):
        with self._lock:
            return super().__len__()

    def clear(self):
        with self._lock:
            return super().clear()


_cache: TTLCache = _LockedTTLCache(maxsize=32, ttl=_CACHE_TTL)
_CACHE_KEY = "hackathons"

# Explicit public fields keep scraper traces and administrator metadata private.
_EVENT_PROJECTION = {key: 1 for key in (
    "_id", "title", "link", "source", "deadline", "deadline_iso", "mode",
    "location", "venue", "city", "lat", "lng", "tags", "prize",
    "is_top_college", "college_name", "college_type", "is_internship", "status",
    "total_registrations", "registrations", "min_team_size", "max_team_size",
    "scraped_at", "desc", "tagline", "organizer", "eligibility", "opportunity_type", "verified",
    "verification_confidence", "discovery_source", "source_account", "instagram_post_url", "registration_deadline", "deadline_kind", "publication_state",
)}

_last_generation = None
_generation_checked_at = 0.0
_generation_lock = threading.Lock()


def _check_dataset_generation():
    with _generation_lock:
        _poll_dataset_generation()


def _poll_dataset_generation():
    global _last_generation, _generation_checked_at
    now = time.monotonic()
    if now - _generation_checked_at < 5:
        return
    try:
        col = get_collection('dataset_state')
        if col is None:
            return
        state = col.find_one({'_id': 'events'}, {'generation': 1}) or {}
        generation = state.get('generation', 0)
        if generation != _last_generation:
            _cache.clear()
            _last_generation = generation
        _generation_checked_at = now
    except Exception:
        pass  # The 60-second TTL bounds stale data even if this poll fails.


def _matches_format(doc: dict, category: str) -> bool:
    """Recognize scraper format aliases consistently in counts and filters."""
    mode = str(doc.get("mode") or "").strip().lower()
    if category == "Hybrid":
        return bool(re.search(r"\bhybrid\b", mode))
    if re.search(r"\bhybrid\b", mode):
        return False
    pattern = r"\b(?:online|virtual)\b" if category == "Online" else r"\b(?:offline|in[ -]person|on[ -]?site)\b"
    return bool(re.search(pattern, mode))

def _deadline_sort_key(doc: dict) -> tuple:
    iso = parse_deadline_iso(doc.get("deadline_iso"))
    value = int(iso.replace("-", "")) if iso else 0
    past = bool(doc.get("is_past"))
    return past, iso is None, -value if past else value

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
_allowed_origins = list(set(_frontend_origins))
if not _is_prod:
    _allowed_origins.extend(["http://localhost:5173", "http://127.0.0.1:5173"])
_allowed_origins = list(set(_allowed_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["GET", "POST", "HEAD", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Admin-Secret", "Accept", "Origin", "If-None-Match"],
    expose_headers=["ETag", "X-Response-Time-Ms"],
)

# High-Performance Wire Compression (reduces JSON payload from ~60KB to ~9KB)
app.add_middleware(GZipMiddleware, minimum_size=800)

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

    # Currency Conversion Multipliers:
    # Deliberate architectural trade-off: Static conservative baseline FX rates (USD=87, EUR=94, GBP=110)
    # are utilized rather than real-time FX API polling on the request path. Real-time external HTTP round-trips
    # introduce network latency, 3rd-party outage dependencies, and rate quotas. For prize tiering and sorting,
    # fixed conservative rates guarantee <0.1ms computation with high accuracy.
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
        normalize_deadline(doc)  # Legacy compatibility; labelled records never infer event-end deadlines.
        iso = parse_deadline_iso(doc.get("deadline_iso")) or ""
        status = str(doc.get("status") or "").strip().lower()
        closed = lifecycle_values(doc)["is_past"]

        if iso and iso >= today and not closed:
            upcoming.append(doc)
        elif iso and (iso < today or closed):
            past.append(doc)
        elif closed:
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


# ── Venue & Typo-Tolerant Multi-Token Search Engine ──────────────────────────
CITY_AND_CAMPUS_SYNONYMS: dict[str, str] = {
    # Hyderabad typos, abbreviations & aliases
    "hydrerabad": "hyderabad",
    "hydrabad": "hyderabad",
    "hyderbad": "hyderabad",
    "hydrabaad": "hyderabad",
    "hyd": "hyderabad",
    "hyderabad": "hyderabad",

    # Bengaluru / Bangalore
    "bangalore": "bengaluru",
    "banglore": "bengaluru",
    "bengluru": "bengaluru",
    "bengaluru": "bengaluru",
    "blr": "bengaluru",

    # Mumbai / Bombay
    "bombay": "mumbai",
    "mumbai": "mumbai",
    "bombai": "mumbai",
    "bom": "mumbai",

    # Pune
    "poona": "pune",
    "pune": "pune",

    # Delhi / NCR / Gurugram / Gurgaon / Noida
    "delhi": "delhi",
    "newdelhi": "delhi",
    "gurgaon": "gurugram",
    "gurugram": "gurugram",
    "ncr": "delhi",
    "noida": "noida",

    # Chennai / Madras
    "madras": "chennai",
    "chennai": "chennai",

    # Kolkata / Calcutta
    "calcutta": "kolkata",
    "kolkata": "kolkata",

    # Ahmedabad
    "ahmdabad": "ahmedabad",
    "ahmedabad": "ahmedabad",
    "amdavad": "ahmedabad",

    # Prayagraj / Allahabad
    "allahabad": "prayagraj",
    "prayagraj": "prayagraj",

    # Varanasi / Banaras / Kashi
    "banaras": "varanasi",
    "benares": "varanasi",
    "kashi": "varanasi",
    "varanasi": "varanasi",

    # Chandigarh / Jaipur / Indore / Bhopal / Kochi / Calicut
    "chandigrh": "chandigarh",
    "chandigarh": "chandigarh",
    "jaypur": "jaipur",
    "jaipur": "jaipur",
    "indor": "indore",
    "indore": "indore",
    "cochin": "kochi",
    "kochi": "kochi",
    "calicut": "kozhikode",
    "kozhikode": "kozhikode",
    "trichy": "tiruchirappalli",
    "tiruchirappalli": "tiruchirappalli",
    "vizag": "visakhapatnam",
    "visakhapatnam": "visakhapatnam",
    "trivandrum": "thiruvananthapuram",
    "thiruvananthapuram": "thiruvananthapuram",

    # IIIT Campus Aliases
    "iiith": "iiit hyderabad",
    "iiit-h": "iiit hyderabad",
    "iiitb": "iiit bengaluru",
    "iiit-b": "iiit bengaluru",
    "iiitd": "iiit delhi",
    "iiit-d": "iiit delhi",
    "iiita": "iiit prayagraj",
    "iiit-a": "iiit prayagraj",
    "iiitm": "iiit gwalior",

    # IIT Campus Aliases
    "iitb": "iit bombay",
    "iit-b": "iit bombay",
    "iitd": "iit delhi",
    "iit-d": "iit delhi",
    "iitm": "iit madras",
    "iit-m": "iit madras",
    "iitk": "iit kanpur",
    "iit-k": "iit kanpur",
    "iitkgp": "iit kharagpur",
    "iit-kgp": "iit kharagpur",
    "iitr": "iit roorkee",
    "iit-r": "iit roorkee",
    "iitg": "iit guwahati",
    "iit-g": "iit guwahati",
    "iith": "iit hyderabad",
    "iitbhu": "iit varanasi",
    "iit-bhu": "iit varanasi",

    # NIT Campus Aliases
    "nitt": "nit tiruchirappalli",
    "nit-t": "nit tiruchirappalli",
    "nitk": "nit surathkal",
    "nit-k": "nit surathkal",
    "nitw": "nit warangal",
    "nit-w": "nit warangal",
    "nitc": "nit calicut",
    "nitr": "nit rourkela",

    # BITS & Premier Institutes
    "bitsp": "bits pilani",
    "bitsg": "bits goa",
    "bitsh": "bits hyderabad",
    "coep": "coep pune",
    "pict": "pict pune",
    "vjti": "vjti mumbai",
    "dtu": "dtu delhi",
    "nsut": "nsut delhi",
    "iisc": "iisc bengaluru",
}


def _expand_hyphens(text: str) -> str:
    """Expand hyphenated terms like IIIT-H into IIITH IIIT H for robust indexing."""
    return re.sub(r"(\b[a-zA-Z0-9]+)-([a-zA-Z0-9]+\b)", r"\1\2 \1 \2", text or "")


def _normalize_search_text(text: str) -> str:
    """Normalize text into lowercase alphanumeric space-delimited string."""
    expanded = _expand_hyphens((text or "").lower())
    clean = re.sub(r"[^a-z0-9\s]", " ", expanded)
    return " ".join(clean.split())


def _build_document_search_corpus(doc: dict) -> tuple[str, str, set[str]]:
    """
    Extracts raw haystack, normalized haystack, and token word set across all venue,
    location, college, title, and descriptive metadata fields.
    """
    fields = [
        str(doc.get("title") or ""),
        str(doc.get("venue") or ""),
        str(doc.get("location") or ""),
        str(doc.get("college_name") or ""),
        str(doc.get("college_type") or ""),
        str(doc.get("city") or ""),
        str(doc.get("desc") or ""),
        str(doc.get("tagline") or ""),
        str(doc.get("opportunity_type") or ""),
        " ".join(str(t) for t in doc.get("tags") or []),
    ]
    raw_haystack = " ".join(fields).lower()
    norm_haystack = _normalize_search_text(raw_haystack)
    words = set(norm_haystack.split())
    for w in list(words):
        if w in CITY_AND_CAMPUS_SYNONYMS:
            words.update(CITY_AND_CAMPUS_SYNONYMS[w].split())
    return raw_haystack, norm_haystack, words


def _match_hackathon_search(doc: dict, search_query: str) -> bool:
    """
    Venue-aware, typo-tolerant, multi-token fuzzy search matcher.

    Matches queries like 'iiit hydrerabad', 'iiit hydrabad', 'iiit hyderabad', 'iiith'
    against hackathon documents whose venue, location, college_name, or title
    contain 'IIIT Hyderabad', 'iiit hydrabad', or any phonetic/spelling variation.
    """
    if not search_query or not search_query.strip():
        return True

    raw_haystack, norm_haystack, doc_words = _build_document_search_corpus(doc)
    q_trimmed = search_query.strip().lower()

    # Direct substring matches in raw or normalized strings
    if q_trimmed in raw_haystack:
        return True

    q_norm = _normalize_search_text(q_trimmed)
    if not q_norm:
        return True

    if q_norm in norm_haystack:
        return True

    # Expand query tokens (e.g. 'iiith' -> ['iiit', 'hyderabad'])
    raw_tokens = q_norm.split()
    target_tokens: list[str] = []
    for t in raw_tokens:
        if t in CITY_AND_CAMPUS_SYNONYMS:
            target_tokens.extend(CITY_AND_CAMPUS_SYNONYMS[t].split())
        else:
            target_tokens.append(t)

    # Every target token must match
    for tok in target_tokens:
        if tok in doc_words or tok in norm_haystack:
            continue

        alias = CITY_AND_CAMPUS_SYNONYMS.get(tok)
        if alias and (alias in doc_words or alias in norm_haystack):
            continue

        matched = False
        if len(tok) >= 4:
            for dw in doc_words:
                if len(dw) >= 4 and abs(len(dw) - len(tok)) <= 3:
                    if difflib.SequenceMatcher(None, tok, dw).ratio() >= 0.78:
                        matched = True
                        break
        if not matched:
            return False

    return True


# ── Optional Coarse Visit Metrics ─────────────────────────────
_visitor_db_cache: TTLCache = TTLCache(maxsize=4096, ttl=300)  # Max 1 DB write per IP every 5 min

def _parse_user_agent(ua: str) -> dict:
    """Parse device, OS, and browser from user-agent string without external dependencies."""
    if not ua:
        return {"device": "Unknown", "os": "Unknown", "browser": "Unknown"}
    ua_lower = ua.lower()

    # Device
    if any(k in ua_lower for k in ("mobile", "android", "iphone", "ipod")):
        device = "Mobile"
    elif "ipad" in ua_lower or "tablet" in ua_lower:
        device = "Tablet"
    else:
        device = "Desktop"

    # Operating System
    if "iphone" in ua_lower or "ipad" in ua_lower:
        os_name = "iOS"
    elif "android" in ua_lower:
        os_name = "Android"
    elif "windows" in ua_lower:
        os_name = "Windows"
    elif "mac os" in ua_lower or "macintosh" in ua_lower:
        os_name = "macOS"
    elif "linux" in ua_lower:
        os_name = "Linux"
    else:
        os_name = "Other"

    # Browser
    if "edg/" in ua_lower:
        browser = "Edge"
    elif "chrome/" in ua_lower and "safari/" in ua_lower:
        browser = "Chrome"
    elif "firefox/" in ua_lower:
        browser = "Firefox"
    elif "safari/" in ua_lower and "chrome/" not in ua_lower:
        browser = "Safari"
    else:
        browser = "Other"

    return {"device": device, "os": os_name, "browser": browser}


def _record_visitor(ip: str, user_agent: str, referer: str, path: str, country: str):
    """Optional coarse visit metrics; never persist IP, full UA, or referrer."""
    if os.getenv("TRACK_VISITORS", "false").lower() != "true":
        return
    if not ip or ip in ("127.0.0.1", "localhost", "testclient") or ip in _visitor_db_cache:
        return
    _visitor_db_cache[ip] = True
    ua_info = _parse_user_agent(user_agent)
    try:
        col = get_collection("visitors")
        if col is not None:
            col.insert_one({
                "device": ua_info["device"], "os": ua_info["os"],
                "browser": ua_info["browser"], "path": path.split("?", 1)[0][:100],
                "visited_at": datetime.now(timezone.utc),
            })
    except Exception:
        logger.debug("Could not record optional visit metrics")


@app.get("/")
@app.head("/")
def read_root():
    return {"message": "Hackathon API is running"}

@app.get("/api/hackathons", response_model=HackathonsResponse)
@v1_router.get("/hackathons", response_model=HackathonsResponse)
@limiter.limit("60/minute")
def get_hackathons(
    request: Request, 
    background_tasks: BackgroundTasks = BackgroundTasks(),
    lat: Optional[float] = Query(default=None, ge=-90.0, le=90.0), 
    lng: Optional[float] = Query(default=None, ge=-180.0, le=180.0),
    page: int = Query(default=1, ge=1, le=1000),
    limit: int = Query(default=12, ge=1, le=100),
    category: str = Query(default="All", max_length=30),
    source: Optional[str] = Query(default=None, max_length=50),
    search: str = Query(default="", max_length=100),
    sort: str = Query(default="deadline", max_length=20),
    tab: str = Query(default="upcoming", max_length=20),
    format: Literal["All", "Online", "Offline", "Hybrid"] = Query(default="All"),
    deadline_days: Optional[int] = Query(default=None, ge=1, le=30)
):
    # Normalize query params if passed directly without FastAPI dependency injection
    if not isinstance(source, str):
        source = getattr(source, 'default', None)
    if not isinstance(category, str):
        category = getattr(category, 'default', 'All')
    if not isinstance(tab, str):
        tab = getattr(tab, 'default', 'upcoming')
    if not isinstance(sort, str):
        sort = getattr(sort, 'default', 'deadline')
    if not isinstance(search, str):
        search = getattr(search, 'default', '')
    if not isinstance(page, int):
        page = getattr(page, 'default', 1)
    if not isinstance(limit, int):
        limit = getattr(limit, 'default', 12)
    if not isinstance(format, str):
        format = getattr(format, 'default', 'All')
    if not isinstance(deadline_days, int) and deadline_days is not None:
        deadline_days = getattr(deadline_days, 'default', None)
    if not isinstance(lat, (float, int)) and lat is not None:
        lat = getattr(lat, 'default', None)
    if not isinstance(lng, (float, int)) and lng is not None:
        lng = getattr(lng, 'default', None)

    # Enqueue visitor tracking in background (zero latency added to response)
    if request is not None and background_tasks is not None and os.getenv("TRACK_VISITORS", "false").lower() == "true":
        client_ip = get_client_ip(request)
        ua = request.headers.get("user-agent", "")
        ref = request.headers.get("referer", "")
        country = request.headers.get("cf-ipcountry", "Unknown")
        background_tasks.add_task(_record_visitor, client_ip, ua, ref, request.url.path, country)

    # --- cache hit → skip Mongo entirely ---
    # Store base dataset in _cache[_CACHE_KEY]; compute distance dynamically to prevent cache thrashing attacks
    _check_dataset_generation()
    cached = _cache.get(_CACHE_KEY)
    today = datetime.now(timezone.utc).date()
    if cached and cached.get("day") != today.isoformat():
        cached = None
    
    if cached is None:
        logger.info("Cache MISS — querying MongoDB")
        try:
            collection = get_collection()
            # Projection: only fetch UI fields, skipping raw debug/trace metadata to speed up MongoDB transit
            cursor = collection.find({"publication_state": {"$ne": "suppressed"}}, _EVENT_PROJECTION)
            docs = []
            for doc in cursor:
                docs.append(public_event(doc))

            sorted_docs = _sort_hackathons(docs)
            active_docs = [d for d in sorted_docs if not d.get("is_past", False)]
            lost_docs = [d for d in sorted_docs if d.get("is_past", False)]

            # Collect stats
            all_tags = set()
            sources = set()
            college_types = set()
            latest_scrape = ""
            top_college_count = 0
            internship_count = 0
            source_counts: dict[str, int] = {}

            for doc in sorted_docs:
                for t in doc.get("tags", []):
                    all_tags.add(t)
                src = doc.get("source", "Unknown")
                sources.add(src)
                source_counts[src] = source_counts.get(src, 0) + 1

                sa = doc.get("scraped_at", "")
                if sa > latest_scrape:
                    latest_scrape = sa

                # Classification stats on active opportunities
                if not doc.get("is_past", False):
                    if doc.get("is_top_college"):
                        top_college_count += 1
                        ct = doc.get("college_type")
                        if ct:
                            college_types.add(ct)
                    if doc.get("is_internship"):
                        internship_count += 1

            # Calculate real prize pool & real total registrations on active docs
            total_prize_inr = sum(_clean_prize_to_inr(d.get("prize", "")) for d in active_docs)
            if total_prize_inr >= 10_000_000:
                total_prize_formatted = f"₹{total_prize_inr / 10_000_000:.1f} Cr"
            elif total_prize_inr >= 100_000:
                total_prize_formatted = f"₹{total_prize_inr / 100_000:.1f} Lakh"
            elif total_prize_inr > 0:
                total_prize_formatted = f"₹{int(total_prize_inr):,}"
            else:
                total_prize_formatted = "₹0"

            total_registrations = sum(exact_registration_count(d) for d in active_docs)
            if total_registrations >= 1_000:
                total_registrations_formatted = f"{total_registrations / 1000:.1f}k"
            else:
                total_registrations_formatted = str(total_registrations)

            p50_lat = round(statistics.median(_latencies), 1) if _latencies else None

            stats = {
                "total": len(active_docs),  # User constraint: Lost opportunities are not counted in total found
                "active_count": len(active_docs),
                "lost_opportunities_count": len(lost_docs),
                "all_total": len(sorted_docs),
                "unique_tags": len(all_tags),
                "sources": list(sources),
                "source_counts": source_counts,
                "last_scraped": latest_scrape,
                "top_college_count": top_college_count,
                "internship_count": internship_count,
                "college_types": sorted(college_types),
                "online_count": sum(1 for d in active_docs if _matches_format(d, "Online")),
                "offline_count": sum(1 for d in active_docs if _matches_format(d, "Offline")),
                "unique_sources_count": sum(1 for d in active_docs if d.get("source") == "Unique Sources"),
                "hackathon_count": sum(1 for d in active_docs if d.get("opportunity_type") == "Hackathon"),
                "total_prize_pool_inr": total_prize_inr,
                "total_prize_pool_formatted": total_prize_formatted,
                "total_registrations": total_registrations,
                "total_registrations_formatted": total_registrations_formatted,
                "p50_latency_ms": p50_lat,
                "recalculated_cadence": None,
                "calculated_at": datetime.now(timezone.utc).isoformat()
            }

            cached = {"docs": sorted_docs, "stats": stats, "day": today.isoformat()}
            _cache[_CACHE_KEY] = cached
        except Exception:
            logger.error("Error fetching hackathons", exc_info=True)
            return JSONResponse(status_code=503,
                content={"success": False, "error": "Listings temporarily unavailable", "data": [], "stats": {}},
                headers={"Cache-Control": "no-store"})

    # Dynamic distance enrichment & proximity sorting on cached in-memory data
    if lat is not None and lng is not None:
        docs_with_distance = []
        for d in cached["docs"]:
            item = dict(d)
            if "lat" in item and "lng" in item and item["lat"] is not None and item["lng"] is not None:
                try:
                    d_lat = math.radians(item["lat"] - lat)
                    d_lng = math.radians(item["lng"] - lng)
                    a = math.sin(d_lat/2) * math.sin(d_lat/2) + \
                        math.cos(math.radians(lat)) * math.cos(math.radians(item["lat"])) * \
                        math.sin(d_lng/2) * math.sin(d_lng/2)
                    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
                    item["distance_km"] = round(6371 * c, 1)
                except Exception:
                    pass
            docs_with_distance.append(item)
        docs_with_distance.sort(key=lambda x: (x.get("is_past", False), x.get("distance_km", 999999)))
        filtered = docs_with_distance
    else:
        filtered = cached["docs"]
    
    # Filter by source platform if specified
    if source and source != "All":
        filtered = [d for d in filtered if d.get('source', '').lower() == source.lower()]

    # Filter by category
    if category == 'Top College':
        filtered = [d for d in filtered if d.get('is_top_college')]
    elif category == 'Internship':
        filtered = [d for d in filtered if d.get('is_internship')]
    elif category == 'Hackathon':
        filtered = [d for d in filtered if d.get('opportunity_type') == 'Hackathon']
    elif category == 'Online':
        filtered = [d for d in filtered if _matches_format(d, "Online")]
    elif category == 'Offline':
        filtered = [d for d in filtered if _matches_format(d, "Offline")]
    elif category == 'Unique Sources':
        filtered = [d for d in filtered if d.get('source') == 'Unique Sources']
    elif category in ['Devfolio', 'Unstop', 'Devpost', 'HackerEarth', 'Devnovate']:
        filtered = [d for d in filtered if d.get('source', '').lower() == category.lower()]
    elif category != 'All':
        c_low = category.lower()
        filtered = [d for d in filtered if (
            d.get('source', '').lower() == c_low or
            d.get('mode', '').lower() == c_low or
            any(c_low in str(t).lower() for t in d.get('tags', []))
        )]

    if search and search.strip():
        filtered = [d for d in filtered if _match_hackathon_search(d, search)]

    if format != "All":
        filtered = [d for d in filtered if _matches_format(d, format)]
    if deadline_days is not None:
        end = (today + timedelta(days=deadline_days)).isoformat()
        filtered = [d for d in filtered if not d.get("is_past") and (
            (deadline := parse_deadline_iso(d.get("deadline_iso"))) is not None
            and today.isoformat() <= deadline <= end
        )]
        
    # Sorting
    if sort == 'deadline':
        filtered = sorted(filtered, key=_deadline_sort_key)
    elif sort == 'distance':
        filtered = sorted(filtered, key=lambda d: float(d.get('distance_km')) if d.get('distance_km') is not None else 999999.0)
    elif sort == 'name':
        filtered = sorted(filtered, key=lambda d: str(d.get('title') or '').lower())
    elif sort == 'newest':
        filtered = sorted(filtered, key=lambda d: str(d.get('scraped_at') or ''), reverse=True)

    # Split into Upcoming / Missed (Lost Opportunities) / All
    upcoming = [d for d in filtered if not d.get('is_past', False)]
    missed = [d for d in filtered if d.get('is_past', False)]
    
    if tab == 'all':
        target_list = filtered
    elif tab in ('missed', 'lost', 'lost_opportunities'):
        target_list = missed
    else: # upcoming
        target_list = upcoming
    
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
        "lost_opportunities_total": len(missed),
        "all_total": len(filtered),
        "stats": cached["stats"]
    }

    # High-Performance HTTP Caching & ETag Validation
    # Validate the representation, including edits and location-specific ordering.
    etag_seed = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    etag = f'"{hashlib.md5(etag_seed.encode("utf-8"), usedforsecurity=False).hexdigest()}"'

    if_none_match = request.headers.get("if-none-match")
    if if_none_match and if_none_match.strip() == etag:
        return Response(status_code=304, headers={
            "ETag": etag,
            "Cache-Control": "public, max-age=60, must-revalidate"
        })

    return JSONResponse(
        content=payload,
        media_type="application/json; charset=utf-8",
        headers={
            "ETag": etag,
            "Cache-Control": "public, max-age=60, must-revalidate"
        }
    )


@app.get("/api/hackathons/{event_id}", response_model=HackathonDetailResponse)
@v1_router.get("/hackathons/{event_id}", response_model=HackathonDetailResponse)
@limiter.limit("60/minute")
def get_hackathon_detail(request: Request, event_id: str = Path(pattern=r"^[0-9a-fA-F]{24}$")):
    """Read a single stored listing. Never fetch its destination or start a scraper."""
    try:
        collection = get_collection()
        if collection is None:
            raise RuntimeError("Database unavailable")
        projection = {**_EVENT_PROJECTION, "organizer": 1, "eligibility": 1}
        resolved = resolve_event(collection, event_id, projection)
        doc = {key: value for key, value in (resolved or {}).items() if key in projection} if resolved else None
        if doc is None:
            return JSONResponse(status_code=404, content={"success": False, "error": "Event not found"}, headers={"Cache-Control": "no-store"})
        doc["_id"] = event_id.lower()  # Alias URLs continue to resolve with the requested public ID.
        doc = _sort_hackathons([public_event(doc)])[0]
        payload = jsonable_encoder({"success": True, "data": doc})
        etag = '"' + hashlib.md5(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8"), usedforsecurity=False).hexdigest() + '"'
        headers = {"ETag": etag, "Cache-Control": "public, max-age=60, must-revalidate"}
        if request.headers.get("if-none-match", "").strip() == etag:
            return Response(status_code=304, headers=headers)
        return JSONResponse(content=payload, headers=headers)
    except Exception:
        logger.exception("Error fetching event detail")
        return JSONResponse(status_code=503, content={"success": False, "error": "Event details unavailable"}, headers={"Cache-Control": "no-store"})


@app.get("/health", response_model=HealthResponse)
@app.head("/health")
@v1_router.get("/health", response_model=HealthResponse)
@v1_router.head("/health")
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


@app.get("/api/metrics", response_model=MetricsResponse)
@v1_router.get("/metrics", response_model=MetricsResponse)
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


@app.post("/api/refresh", response_model=RefreshResponse, dependencies=[Depends(require_admin)])
@v1_router.post("/refresh", response_model=RefreshResponse, dependencies=[Depends(require_admin)])
@limiter.limit("5/minute")
def refresh_cache(request: Request):
    """Invalidate the in-memory cache, forcing the next GET /api/hackathons
    to re-query MongoDB.

    Secured: Uses constant-time token comparison (secrets.compare_digest).
    If ADMIN_SECRET is set, requires valid X-Admin-Secret or Authorization: Bearer <secret>.
    If ADMIN_SECRET is not configured, administrator operations are disabled in every environment.
    Rate-limited: 5 calls per minute per client IP to prevent cache-stampede abuse.
    """
    n = len(_cache)
    _cache.clear()
    logger.info("Cache manually cleared via POST /api/refresh (%d entries removed).", n)
    return {"success": True, "cleared": n, "message": "Cache cleared. Next request will re-query MongoDB."}


def _extract_url_metadata(url: str) -> dict:
    """Safely scrape and infer metadata, tags, mode, and platform from a hackathon URL."""
    url = validate_public_url(url.strip())

    result = {
        "title": None,
        "desc": None,
        "source": "Community / Direct",
        "mode": None,
        "location": None,
        "tags": [],
        "image": None,
    }

    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        if domain.startswith("www."):
            domain = domain[4:]

        # Infer source from domain
        if domain == "devfolio.co" or domain.endswith(".devfolio.co"):
            result["source"] = "Devfolio"
        elif domain == "unstop.com" or domain.endswith(".unstop.com"):
            result["source"] = "Unstop"
        elif domain == "devpost.com" or domain.endswith(".devpost.com"):
            result["source"] = "Devpost"
        elif domain == "hackerearth.com" or domain.endswith(".hackerearth.com"):
            result["source"] = "HackerEarth"
        elif domain == "mlh.io" or domain.endswith(".mlh.io"):
            result["source"] = "MLH"
        elif domain == "kaggle.com" or domain.endswith(".kaggle.com"):
            result["source"] = "Kaggle"
        elif domain == "github.com" or domain.endswith(".github.com"):
            result["source"] = "GitHub"
        elif domain == "codeforces.com" or domain.endswith(".codeforces.com"):
            result["source"] = "Codeforces"
        elif domain == "leetcode.com" or domain.endswith(".leetcode.com"):
            result["source"] = "LeetCode"
        elif domain:
            base_name = domain.split(".")[0].capitalize()
            result["source"] = f"{base_name} Direct"

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
        resp = public_request(url, headers=headers, timeout=6, html_only=True)
        if resp.status_code != 200:
            raise FetchUnavailable("Source returned an unsuccessful response")
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, "html.parser")

            # Extract Title
            og_title = soup.find("meta", property="og:title") or soup.find("meta", attrs={"name": "twitter:title"})
            if og_title and og_title.get("content"):
                result["title"] = og_title["content"].strip()
            elif soup.title and soup.title.string:
                result["title"] = soup.title.string.strip()

            if result["title"]:
                result["title"] = re.split(r"[\-|–—:]\s*(?:Devfolio|Unstop|Devpost|HackerEarth|MLH)", result["title"], flags=re.IGNORECASE)[0].strip()

            # Extract Description
            og_desc = soup.find("meta", property="og:description") or soup.find("meta", attrs={"name": "description"}) or soup.find("meta", attrs={"name": "twitter:description"})
            if og_desc and og_desc.get("content"):
                result["desc"] = og_desc["content"].strip()[:400]

            # Extract Image
            og_img = soup.find("meta", property="og:image") or soup.find("meta", attrs={"name": "twitter:image"})
            if og_img and og_img.get("content"):
                result["image"] = og_img["content"].strip()

            combined_text = f"{result['title'] or ''} {result['desc'] or ''} {resp.text[:5000]}".lower()

            # Infer tags
            detected_tags = set()
            tag_keywords = {
                "ai": ["ai", "artificial intelligence"],
                "ml": ["ml", "machine learning"],
                "web3": ["web3", "crypto", "blockchain", "solana", "ethereum"],
                "fintech": ["fintech", "finance", "banking"],
                "iot": ["iot", "hardware", "arduino", "raspberry"],
                "cloud": ["cloud", "aws", "azure", "gcp"],
                "faang": ["meta", "google", "apple", "amazon", "netflix", "microsoft", "faang", "mango"],
                "mango": ["meta", "google", "apple", "amazon", "netflix", "microsoft", "mango"],
                "open-source": ["open-source", "open source", "foss", "github"],
                "cybersecurity": ["cybersecurity", "security", "infosec", "ctf"],
                "pune": ["pune", "coep", "pict", "vit pune", "mit pune", "pccoe"],
                "hyderabad": ["hyderabad", "iiit hyderabad", "iiit-h", "telangana"],
                "iit": ["iit", "indian institute of technology"],
                "nit": ["nit", "national institute of technology"],
                "iiit": ["iiit", "indian institute of information technology"],
            }
            for tag, kws in tag_keywords.items():
                if any(re.search(rf"\b{kw}\b", combined_text) for kw in kws):
                    detected_tags.add(tag)
            result["tags"] = sorted(list(detected_tags))

            # Infer mode & location
            if any(term in combined_text for term in ["offline", "in-person", "campus", "venue", "on-site"]):
                result["mode"] = "Offline"
                if "pune" in combined_text:
                    result["location"] = "Pune, Maharashtra, India"
                elif "hyderabad" in combined_text:
                    result["location"] = "Hyderabad, Telangana, India"
                elif "bangalore" in combined_text or "bengaluru" in combined_text:
                    result["location"] = "Bengaluru, Karnataka, India"
                elif "mumbai" in combined_text:
                    result["location"] = "Mumbai, Maharashtra, India"
                elif "delhi" in combined_text:
                    result["location"] = "New Delhi, Delhi, India"
            elif any(term in combined_text for term in ["hybrid"]):
                result["mode"] = "Hybrid"
            elif any(term in combined_text for term in ["online", "virtual", "remote"]):
                result["mode"] = "Virtual"
                result["location"] = "Online"

    except (UnsafeURL, FetchUnavailable):
        raise
    except Exception as e:
        logger.warning("Metadata extraction failed (%s)", type(e).__name__)

    return result


@app.post("/api/hackathons/preview-url", response_model=HackathonPreviewResponse, dependencies=[Depends(require_admin)])
@v1_router.post("/hackathons/preview-url", response_model=HackathonPreviewResponse, dependencies=[Depends(require_admin)])
@limiter.limit("30/minute")
def preview_hackathon_url(request: Request, body: HackathonPreviewRequest):
    """Fetch live metadata preview for a given hackathon URL."""
    link = body.link.strip()
    if not link:
        return JSONResponse(status_code=400, content={"success": False, "message": "Link URL cannot be empty."})

    try:
        meta = _extract_url_metadata(link)
    except UnsafeURL as exc:
        return JSONResponse(status_code=400, content={"success": False, "message": str(exc)})
    except FetchUnavailable:
        return JSONResponse(status_code=502, content={"success": False, "message": "Source could not be reached"})
    return {
        "success": True,
        "title": meta.get("title"),
        "desc": meta.get("desc"),
        "source": meta.get("source"),
        "mode": meta.get("mode"),
        "location": meta.get("location"),
        "tags": meta.get("tags") or [],
        "image": meta.get("image"),
        "message": "Metadata extracted successfully",
    }


@app.post("/api/hackathons/auto-list", response_model=HackathonAutoListResponse, dependencies=[Depends(require_admin)])
@v1_router.post("/hackathons/auto-list", response_model=HackathonAutoListResponse, dependencies=[Depends(require_admin)])
@limiter.limit("20/minute")
def auto_list_hackathon(request: Request, body: HackathonAutoListRequest):
    """Auto-list or manually submit a hackathon into the live radar database."""
    link = body.link.strip()
    if not link:
        return JSONResponse(status_code=400, content={"success": False, "message": "Link URL is required.", "is_new": False, "data": None})

    meta = {}
    try:
        validate_public_url(link)
        if body.fetch_metadata or not body.title or not body.desc:
            meta = _extract_url_metadata(link)
    except UnsafeURL as exc:
        return JSONResponse(status_code=400, content={"success": False, "message": str(exc), "is_new": False})
    except FetchUnavailable:
        return JSONResponse(status_code=502, content={"success": False, "message": "Source could not be reached", "is_new": False})

    title = (body.title or meta.get("title") or "Community Hackathon").strip()
    source = (body.source or meta.get("source") or "Community / Auto-Listed").strip()
    mode = (body.mode or meta.get("mode") or "Unknown").strip().capitalize()
    location = body.location if body.location is not None else meta.get("location")
    desc = (body.desc or meta.get("desc") or "").strip()

    # Merge tags
    tag_set = set(t.lower().strip() for t in (body.tags or []) if t and t.strip())
    for t in (meta.get("tags") or []):
        tag_set.add(t.lower().strip())

    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "title": title,
        "link": link,
        "source": source,
        "mode": mode,
        "location": location or ("Online" if mode == "Virtual" else "TBA"),
        "venue": (body.venue or "").strip() or None,
        "city": (body.city or "").strip() or None,
        "deadline": body.deadline or "TBA",
        "deadline_iso": body.deadline_iso,
        "prize": body.prize or "TBA",
        "tags": sorted(list(tag_set)),
        "desc": desc,
        "status": None,
        "is_past": False,
        "scraped_at": now_iso,
    }
    if doc.get("venue") and (not doc.get("location") or doc["location"] in ("TBA", "Online")):
        if mode != "Virtual":
            doc["location"] = doc["venue"]

    # Enrich with college / internship / FAANG classification
    classify_hackathon(doc)

    # Geocode if offline and coords missing
    if doc.get("mode", "").lower() == "offline" and doc.get("location"):
        loc = doc["location"]
        if loc.lower() not in {"online", "virtual", "remote", "tba"}:
            lat, lng = geocode(loc)
            if lat is not None and lng is not None:
                doc["lat"] = lat
                doc["lng"] = lng

    # Upsert to MongoDB
    try:
        col = get_collection()
        if col is None:
            return JSONResponse(
                status_code=503,
                content={"success": False, "message": "Database unavailable", "is_new": False, "data": None}
            )
        ensure_indexes(col.database)
        doc["deadline_kind"] = "registration"
        supplied = body.model_fields_set - {"link", "fetch_metadata"}
        authorities = {field: 3 for field in supplied}
        if supplied & {"deadline", "deadline_iso"}:
            supplied.update({"deadline_kind", "registration_deadline", "deadline", "deadline_iso"})
            authorities.update({field: 3 for field in ("deadline_kind", "registration_deadline", "deadline", "deadline_iso")})
        clear_fields = {field for field in body.model_fields_set if getattr(body, field, None) is None}
        if "deadline_iso" in clear_fields and "deadline" not in body.model_fields_set:
            clear_fields.add("registration_deadline")
        with JobLease(col.database.job_leases) as lease:
            result = IngestionService(col, lease=lease).ingest(doc, authority=1, protected_fields=supplied, clear_fields=clear_fields, field_authorities=authorities)
        is_new = result["is_new"]

        # Clear API in-memory cache so newly listed hackathon is immediately visible
        _cache.clear()
        logger.info("Auto-listed hackathon '%s' (is_new=%s)", title, is_new)

        # Fetch inserted/updated doc with _id stringified
        saved = {key: value for key, value in result["data"].items() if key in {**_EVENT_PROJECTION, "organizer": 1, "eligibility": 1}}
        if saved and "_id" in saved:
            saved["_id"] = str(saved["_id"])

        return {
            "success": True,
            "message": f"Hackathon '{title}' {'listed successfully' if is_new else 'updated successfully'}!",
            "is_new": is_new,
            "data": saved or doc,
        }
    except LeaseBusy:
        return JSONResponse(status_code=409, content={"success": False, "message": "An ingestion job is running; retry later", "is_new": False, "data": None})
    except ValueError:
        return JSONResponse(status_code=422, content={"success": False, "message": "Event facts or identities require review", "is_new": False, "data": None})
    except Exception as e:
        logger.error("Failed to save hackathon (%s)", type(e).__name__)
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "Event could not be saved", "is_new": False, "data": None}
        )


# ── Autonomous Continuous Internet Scanner Endpoints ─────────────────────────

@app.get("/api/scanner/status", response_model=ScannerStatusResponse)
@v1_router.get("/scanner/status", response_model=ScannerStatusResponse)
@limiter.limit("60/minute")
def get_internet_scanner_status(request: Request):
    """Return live status and telemetry of autonomous web discovery scanner."""
    return get_scanner_status()


@app.get("/api/scan-status")
@v1_router.get("/scan-status")
@limiter.limit("60/minute")
def get_latest_scan_status(request: Request):
    """Expose the last run summary from MongoDB scan_history (JSON only)."""
    try:
        col = get_collection("scan_history")
        if col is not None:
            latest = col.find_one(sort=[("timestamp", -1)])
            if latest:
                latest["_id"] = str(latest["_id"])
                safe = {key: latest[key] for key in ("_id", "success", "status", "run_at", "timestamp", "duration_s", "scraped", "new", "updated", "archived", "purged", "notified") if key in latest}
                safe["sources"] = {name: {key: info[key] for key in ("found", "status") if key in info} for name, info in latest.get("sources", {}).items() if isinstance(info, dict)}
                return JSONResponse(content=safe)
    except Exception as e:
        logger.warning("Failed to fetch latest scan status: %s", e)

    return JSONResponse(content={
        "status": "idle",
        "message": "No scan runs recorded yet.",
        "scraped": 0,
        "new": 0,
        "updated": 0,
        "archived": 0,
        "notified": 0,
        "sources": {},
    })


@app.post("/api/scanner/trigger", response_model=ScannerTriggerResponse, dependencies=[Depends(require_admin)])
@v1_router.post("/scanner/trigger", response_model=ScannerTriggerResponse, dependencies=[Depends(require_admin)])
@limiter.limit("10/minute")
def trigger_internet_scanner(request: Request, body: ScannerTriggerRequest):
    """Trigger an immediate autonomous sweep across target college/city/FAANG keywords."""
    res = run_internet_scan(keywords=body.keywords)
    return res


# ── Instagram Scanner Endpoint ───────────────────────────────────────────────

@app.post("/api/scanner/instagram", response_model=InstagramScanResponse, dependencies=[Depends(require_admin)])
@v1_router.post("/scanner/instagram", response_model=InstagramScanResponse, dependencies=[Depends(require_admin)])
@limiter.limit("5/minute")
def trigger_instagram_scan(request: Request, body: InstagramScanRequest):
    """Trigger an Instagram scan for hackathon posts from known accounts and hashtags."""
    import time as _time
    from scrapers.source_runner import bounded_scrape

    start = _time.time()
    try:
        collection = get_collection()
        if collection is None:
            return JSONResponse(status_code=503, content={"success": False, "message": "Database unavailable", "total_found": 0, "new_indexed": 0})
        ensure_indexes(collection.database)
        with JobLease(collection.database.job_leases) as lease:
            items = bounded_scrape("scrapers.instagram_scraper", "scrape_instagram_hackathons", {"accounts": body.accounts, "hashtags": body.hashtags})
            for doc in items:
                classify_hackathon(doc)
            batch = ingest_batch(collection, items, lease=lease)
        new_indexed = batch['new']

        _cache.clear()
        elapsed = round(_time.time() - start, 2)

        return {
            "success": True,
            "message": f"Instagram scan completed in {elapsed}s. Found {len(items)} posts, indexed {new_indexed} new hackathons.",
            "total_found": len(items),
            "new_indexed": new_indexed,
            "elapsed_seconds": elapsed,
        }
    except LeaseBusy:
        return JSONResponse(status_code=409, content={"success": False, "message": "An ingestion job is running; retry later", "total_found": 0, "new_indexed": 0})
    except Exception as e:
        logger.error("Instagram scan error (%s)", type(e).__name__)
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "Instagram scan failed", "total_found": 0, "new_indexed": 0}
        )


# ── Web Discovery Endpoint ───────────────────────────────────────────────────

@app.post("/api/scanner/web-discovery", response_model=WebDiscoveryResponse, dependencies=[Depends(require_admin)])
@v1_router.post("/scanner/web-discovery", response_model=WebDiscoveryResponse, dependencies=[Depends(require_admin)])
@limiter.limit("5/minute")
def trigger_web_discovery(request: Request, body: WebDiscoveryRequest):
    """Trigger a web discovery scan across Google, MLH, Eventbrite, and KonfHub."""
    import time as _time
    from scrapers.source_runner import bounded_scrape

    start = _time.time()
    try:
        collection = get_collection()
        if collection is None:
            return JSONResponse(status_code=503, content={"success": False, "message": "Database unavailable", "total_found": 0, "new_indexed": 0})
        ensure_indexes(collection.database)
        with JobLease(collection.database.job_leases) as lease:
            items = bounded_scrape("scrapers.web_discovery_scraper", "run_web_discovery", {"queries": body.queries})
            for doc in items:
                classify_hackathon(doc)
            batch = ingest_batch(collection, items, lease=lease)
        new_indexed = batch['new']

        _cache.clear()
        elapsed = round(_time.time() - start, 2)

        return {
            "success": True,
            "message": f"Web discovery completed in {elapsed}s. Found {len(items)} events, indexed {new_indexed} new hackathons.",
            "total_found": len(items),
            "new_indexed": new_indexed,
            "elapsed_seconds": elapsed,
        }
    except LeaseBusy:
        return JSONResponse(status_code=409, content={"success": False, "message": "An ingestion job is running; retry later", "total_found": 0, "new_indexed": 0})
    except Exception as e:
        logger.error("Web discovery error (%s)", type(e).__name__)
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "Web discovery failed", "total_found": 0, "new_indexed": 0}
        )


# ── Hackathon Verification Endpoint ──────────────────────────────────────────

@app.post("/api/hackathons/verify", response_model=VerifyHackathonResponse, dependencies=[Depends(require_admin)])
@v1_router.post("/hackathons/verify", response_model=VerifyHackathonResponse, dependencies=[Depends(require_admin)])
@limiter.limit("30/minute")
def verify_hackathon_endpoint(request: Request, body: VerifyHackathonRequest):
    """Verify whether a hackathon listing is legitimate using multi-signal analysis."""
    from scrapers.hackathon_verifier import verify_hackathon as _verify

    try:
        link = validate_public_url(body.link.strip())
    except UnsafeURL as exc:
        return JSONResponse(status_code=400, content={"success": False, "message": str(exc)})

    doc = {
        "title": body.title,
        "link": link,
        "desc": body.desc or "",
        "source": body.source or "",
        "deadline_iso": body.deadline_iso,
    }

    result = _verify(doc, check_url=True)
    return result


# Mount API v1 router
app.include_router(v1_router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
