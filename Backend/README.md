# Backend — Hackathon Notifier

FastAPI backend for the Hackathon Notifier platform. Handles scraping, classification, MongoDB persistence, Telegram notifications, and REST API serving.

**Live API:** [https://hackathon-notifier.onrender.com](https://hackathon-notifier.onrender.com)

---

## Requirements

- Python 3.11+
- A MongoDB Atlas M0 (free) cluster
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- Your Telegram chat ID (get via the `getUpdates` API after messaging your bot)

---

## Setup

```bash
# 1. Create and activate virtual environment
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure secrets
cp .env.example .env
# Open .env and fill in your values
```

### Environment Variables

Copy `.env.example` to `.env` and fill in each value:

| Variable | Required | Description |
|---|---|---|
| `MONGO_URI` | ✅ Yes | MongoDB Atlas connection string (`mongodb+srv://...`) |
| `TELEGRAM_BOT_TOKEN` | ✅ Yes | Bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | ✅ Yes | Your personal chat ID for admin commands and notifications |
| `WEBAPP_URL` | No | Frontend URL for "Open App" links in bot messages (default: Vercel URL) |
| `ADMIN_SECRET` | No | Random string to protect the `/api/refresh` cache-clear endpoint |
| `CACHE_TTL_SECONDS` | No | Cache time-to-live in seconds (default: `10800` = 3 hours) |
| `PORT` | No | HTTP port for the server (default: `10000`, set automatically by Render) |
| `ENVIRONMENT` | No | Set to `production` to disable `/docs` and `/redoc` Swagger UI |

> ⚠️ Never commit your `.env` file. It is in `.gitignore`. Use `.env.example` as the reference template.

---

## Running Locally

### API Server only

```bash
uvicorn api:app --reload --port 8000
```

Swagger UI available at `http://localhost:8000/docs` (only in non-production mode).

### Full Unified Server (API + Telegram bot + hourly scraper)

```bash
python unified_server.py
```

This is the same command used on Render. It starts three concurrent threads:
1. **FastAPI** via Uvicorn on `$PORT` (HTTP server, main thread)
2. **Telegram polling** (daemon thread, restarts on crash)
3. **Hourly scraper** (daemon thread, waits 30s on boot then runs every hour)

### Scraper Pipeline

```bash
# Full run: scrape all sources, insert new items to MongoDB, send Telegram alerts
python -m main

# Dry run: scrape only, no DB writes, no Telegram messages (safe for testing)
python -m main --dry-run
```

---

## How the Pipeline Works

```
python -m main
       │
       ├── 1. Connect to MongoDB (fail fast if unreachable)
       │
       ├── 2. Launch 8 scrapers concurrently (ThreadPoolExecutor, 8 workers)
       │       Devfolio / Unstop / Devpost / HackerEarth / Devnovate
       │       + Instagram Scraper + Web Discovery + Autonomous Scanner
       │
       ├── 3. Verify authenticity (7-Signal Heuristic Verifier)
       │       verify_hackathon() validates candidates before ingestion:
       │         - Title keyword relevance
       │         - Domain reputation & authority
       │         - Content legitimacy & description depth
       │         - Date plausibility & range checks
       │         - Spam, marketing, & scam penalties
       │         - Source platform trust weight
       │         - Live URL reachability
       │       Candidates with confidence >= 65% are accepted.
       │
       ├── 4. Classify all results
       │       classify_all() adds metadata to every hackathon dict:
       │         is_top_college   → True if IIT / NIT / IIIT / BITS / IISc / IIM / DTU
       │         college_type     → "IIT" | "NIT" | "IIIT" | "BITS" | "IISc" | "IIM" | "CFTI"
       │         college_name     → matched text, e.g. "NIT Raipur"
       │         is_internship    → True if title/tags contain internship/hiring keywords
       │         opportunity_type → "Hackathon" | "Internship" | "Hiring Challenge"
       │
       ├── 5. Dedup + insert
       │       For each hackathon, check if link already exists in MongoDB.
       │       If new → insert_one(). If duplicate → skip.
       │       Race-condition DuplicateKeyError is caught and skipped silently.
       │
       ├── 6. Filter notification-worthy items
       │       Keep only hackathons where is_top_college OR is_internship is True.
       │
       └── 7. Send Telegram batch notifications
               send_batch() sends one message per item with exponential back-off.
               Respects Telegram's 429 retry_after header.

Exit code: 0 on success, 1 on fatal error.
```

---

## API Endpoints

All endpoints return JSON and are rate-limited per IP. All routes are also mirrored under the `/api/v1` prefix.

| Method | Endpoint | Rate Limit | Description |
|---|---|---|---|
| `GET` | `/` | — | Root health check: `{"message": "Hackathon API is running"}` |
| `GET` | `/health` | 60/min | Liveness & readiness probe (verifies MongoDB ping) |
| `GET` | `/api/hackathons` | 60/min | Paginated upcoming/missed listings with search, filters & GPS distance |
| `GET` | `/api/hackathons/all` | 60/min | Unified discovery feed across all sources, online/offline, top college, internships |
| `POST` | `/api/hackathons/verify` | 30/min | Run 7-signal verification on arbitrary candidate hackathon payload |
| `POST` | `/api/scanner/run` | 10/min | Trigger background sweep of continuous autonomous internet scanner |
| `POST` | `/api/scanner/instagram` | 10/min | Scrape Instagram channels & hashtags, verify, and auto-list |
| `POST` | `/api/scanner/web-discovery`| 10/min | Search Google, MLH, Eventbrite, KonfHub, verify, and auto-list |
| `GET` | `/api/scanner/status` | 60/min | Telemetry: scanner running status, last scan timestamp, scraped counts |
| `GET` | `/api/metrics` | 60/min | API telemetry: p50/p95 response latencies, request count, cache size |
| `POST` | `/api/refresh` | 5/min | Invalidate TTLCache (requires `X-Admin-Secret` header or Bearer token) |

> ℹ️ **Note:** Platform statistics (total counts, sources, mode breakdown) are embedded directly within each `/api/hackathons` response under the `stats` key to avoid round-trip overhead.

### `/api/hackathons` Query Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | int | `1` | Page number (min: 1, max: 1000) |
| `limit` | int | `12` | Items per page (min: 1, max: 100) |
| `category` | string | `All` | Filter: `All`, `Top College`, `Internship`, `Hackathon`, `Online`, `Offline`, `Unique Sources` |
| `search` | string | `""` | Search query matching title, location, or tags (max length: 100) |
| `sort` | string | `deadline` | Sort order: `deadline` (soonest), `distance` (nearest km), `name` (A-Z), `newest` (latest scraped) |
| `tab` | string | `upcoming` | Tab view: `upcoming` (active events) or `missed` (ended/past events) |
| `lat` | float | `None` | User latitude for distance sorting (-90.0 to 90.0) |
| `lng` | float | `None` | User longitude for distance sorting (-180.0 to 180.0) |

---

## Module Overview

| File | Responsibility |
|---|---|
| `api.py` | FastAPI application, all HTTP routes, TTLCache, rate limiting, CORS, telemetry |
| `schemas.py` | Pydantic v2 models for OpenAPI validation (`HackathonOut`, `StatsOut`, `HackathonsResponse`, `InstagramScanRequest`, `WebDiscoveryRequest`, `VerifyHackathonRequest`, etc.) |
| `main.py` | One-shot pipeline orchestrator (scrape → verify → classify → dedup → notify) |
| `unified_server.py` | Render entry point (API + Telegram bot polling + scheduler in one process) |
| `scrape_job.py` | Standalone cron-friendly scraper runner |
| `scrapers/devfolio_scraper.py` | Devfolio scraper (requests + BeautifulSoup) |
| `scrapers/unstop_scraper.py` | Unstop scraper (curl_cffi for Cloudflare TLS fingerprint bypass) |
| `scrapers/devpost_scraper.py` | Devpost scraper (requests + BeautifulSoup) |
| `scrapers/hackerearth_scraper.py` | HackerEarth scraper (JSON API) |
| `scrapers/devnovate_scraper.py` | Devnovate scraper (requests + BeautifulSoup) |
| `scrapers/instagram_scraper.py` | Instagram scraper (20+ communities & hashtags, captions, deadlines, posts) |
| `scrapers/web_discovery_scraper.py` | Multi-engine open web search (Google, MLH, Eventbrite, KonfHub) |
| `scrapers/hackathon_verifier.py` | 7-signal automated authenticity, legitimacy, and spam verification engine |
| `scrapers/internet_scanner.py` | Continuous autonomous scanner targeting IIT/NIT/Pune/FAANG keywords |
| `scrapers/geocoder.py` | Nominatim geocoding (1.1s rate-limited with cache) |
| `filters/keyword_filter.py` | College (IIT/NIT/IIIT/BITS/IISc/IIM/CFTI) and internship regex classifier |
| `notifier/telegram_bot.py` | Full Telegram bot: send, batch notifications, polling, interactive commands |
| `db/mongo_client.py` | Singleton MongoClient, collection getters, subscriber CRUD |
| `data/unique_sources.json` | Curated hackathon feed (manually maintained opportunity links) |
| `scripts/auto_discover_hackathons.py` | CLI tool to execute multi-source discovery, verification, and auto-listing |
| `scripts/import_unique_sources.py` | Script to populate MongoDB with curated hackathon opportunities |

---

## Tests

```bash
# Run full test suite (109 tests)
pytest tests/ -v

# With coverage report
pytest tests/ -v --cov=. --cov-report=term-missing

# Run a specific test suite
pytest tests/test_pipeline.py -v
```

Tests use `mongomock` for in-memory MongoDB — no real Atlas connection required to run them.

All 109 backend tests pass on every push to `main` via GitHub Actions CI.

---

## Deployment (Render)

The `Procfile` in this directory tells Render what to run:

```
web: python unified_server.py
```

Render detects the `Procfile` automatically. Required environment variables must be set in the Render dashboard under **Environment**.

### Recommended Render settings

| Setting | Value |
|---|---|
| Runtime | Python 3 |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `python unified_server.py` |
| Instance Type | Free (or Starter for no cold starts) |
| Health Check Path | `/health` |

---

## Security Notes

- For our full security policy, vulnerability reporting, and coordinated disclosure guidelines, see [**SECURITY.md**](../SECURITY.md).
- **OWASP Response Headers**: Injects `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-XSS-Protection: 1; mode=block`, `Permissions-Policy: geolocation=(self)`, and `X-Permitted-Cross-Domain-Policies: none`.
- **Per-IP Rate Limiting**: SlowAPI restricts incoming requests (60 req/min for hackathons, health, and metrics; 5 req/min for cache refresh) to protect against DoS and scraper exhaustion.
- **Client IP Validation**: `CF-Connecting-IP` and `X-Forwarded-For` proxy headers are validated against IPv4/IPv6 address syntax using Python's `ipaddress` library before being trusted.
- **Constant-Time Authentication**: `ADMIN_SECRET` tokens are checked with `secrets.compare_digest` to prevent side-channel timing attacks.
- **Strict Query Bounds**: Query parameters (`page` 1–1000, `limit` 1–100, `lat` ±90.0, `lng` ±180.0, string length caps on search/category) enforce strict limits, rejecting malformed requests before DB execution.
- **Error Sanitization**: `/health` swallows connection exceptions into generic JSON (`{"status": "unhealthy", "reason": "database unavailable"}`) to avoid leaking database URIs, credentials, or internal stack traces.
- **Production Swagger Protection**: API documentation (`/docs`, `/redoc`, `/openapi.json`) can be disabled in production via `ENVIRONMENT=production`.
- **Database Unique Indexing**: MongoDB enforces a unique index on `link`, preventing duplicate entries even during concurrent scraper execution.
- **HTML Message Escaping**: All Telegram alerts and interactive bot responses are escaped with `html.escape` to prevent markup injection.
- **Zero Credentials in Code**: The `.env` file is git-ignored. All tokens and URIs are loaded from environment variables.
