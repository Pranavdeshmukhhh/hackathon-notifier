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
       ├── 2. Launch 5 scrapers concurrently (ThreadPoolExecutor, 5 workers)
       │       Devfolio / Unstop / Devpost / HackerEarth / Devnovate
       │
       ├── 3. Classify all results
       │       classify_all() adds metadata to every hackathon dict:
       │         is_top_college  → True if IIT / NIT / IIIT / BITS / IISc / IIM / DTU
       │         college_type    → "IIT" | "NIT" | "IIIT" | "BITS" | "IISc" | "IIM" | "CFTI"
       │         college_name    → matched text, e.g. "NIT Raipur"
       │         is_internship   → True if title/tags contain internship/hiring keywords
       │         opportunity_type → "Hackathon" | "Internship" | "Hiring Challenge"
       │
       ├── 4. Dedup + insert
       │       For each hackathon, check if link already exists in MongoDB.
       │       If new → insert_one(). If duplicate → skip.
       │       Race-condition DuplicateKeyError is caught and skipped silently.
       │
       ├── 5. Filter notification-worthy items
       │       Keep only hackathons where is_top_college OR is_internship is True.
       │
       └── 6. Send Telegram batch notifications
               send_batch() sends one message per item with exponential back-off.
               Respects Telegram's 429 retry_after header.

Exit code: 0 on success, 1 on fatal error.
```

---

## API Endpoints

All endpoints return JSON. Rate limits apply per IP.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check — always returns `{"status": "ok"}` |
| `GET` | `/api/hackathons` | Paginated hackathon list with optional filters |
| `GET` | `/api/stats` | Platform statistics |
| `POST` | `/api/refresh` | Clear TTL cache (requires `X-Admin-Secret` header) |

### `/api/hackathons` Query Parameters

| Parameter | Type | Description |
|---|---|---|
| `page` | int | Page number (default: 1) |
| `page_size` | int | Items per page (default: 12, max: 50) |
| `mode` | string | `online` \| `offline` \| `all` |
| `category` | string | `top_college` \| `internship` \| `curated` \| `all` |
| `search` | string | Keyword search across title, tags, and description |
| `sort` | string | `latest` \| `nearest` (requires lat/lon) |
| `lat` | float | User latitude for nearest sort |
| `lon` | float | User longitude for nearest sort |
| `status` | string | `upcoming` \| `missed` |

---

## Module Overview

| File | Responsibility |
|---|---|
| `api.py` | FastAPI app, all HTTP routes, TTLCache, rate limiting, CORS |
| `main.py` | One-shot pipeline orchestrator (scrape → classify → dedup → notify) |
| `unified_server.py` | Render entry point (API + bot + scheduler in one process) |
| `scrape_job.py` | Standalone cron-friendly scraper runner |
| `scrapers/devfolio_scraper.py` | Devfolio scraper (requests + BeautifulSoup) |
| `scrapers/unstop_scraper.py` | Unstop scraper (curl_cffi for Cloudflare bypass) |
| `scrapers/devpost_scraper.py` | Devpost scraper (requests + BeautifulSoup) |
| `scrapers/hackerearth_scraper.py` | HackerEarth scraper (JSON API) |
| `scrapers/devnovate_scraper.py` | Devnovate scraper (requests + BeautifulSoup) |
| `scrapers/geocoder.py` | Nominatim geocoding (1 req/s rate limit enforced) |
| `filters/keyword_filter.py` | College and internship regex classifier |
| `notifier/telegram_bot.py` | Full Telegram bot: send, batch, polling, commands |
| `db/mongo_client.py` | Singleton MongoClient, get_collection(), subscriber CRUD |
| `data/unique_sources.json` | Curated hackathon feed (manually maintained) |

---

## Tests

```bash
# Run full test suite
pytest tests/ -v

# With coverage
pytest tests/ -v --cov=. --cov-report=term-missing

# Run a specific file
pytest tests/test_pipeline.py -v
```

Tests use `mongomock` for in-memory MongoDB — no real Atlas connection required to run them.

CI runs `pytest tests/ -v` automatically on every push to `main` via GitHub Actions.

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

- For our full security policy and vulnerability reporting guidelines, see [**SECURITY.md**](../SECURITY.md).
- `ADMIN_SECRET` is compared using `secrets.compare_digest` (constant-time) — safe against timing attacks.
- Rate limiting is enforced per validated client IP. Cloudflare `CF-Connecting-IP` and `X-Forwarded-For` headers are validated against IPv4/IPv6 format before use.
- All Telegram message content is HTML-escaped before sending to prevent injection.
- MongoDB `link` field has a unique index — duplicate inserts are rejected at the database level.
- The `.env` file is git-ignored. Credentials are never stored in source code.
