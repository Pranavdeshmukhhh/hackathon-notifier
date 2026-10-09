<div align="center">

# ⚡ Hackathon Notifier

**Never miss a hackathon again.**

A hackathon discovery product using React, FastAPI and MongoDB. It collects platform and community listings, classifies opportunities with deterministic rules, and supports discovery, filtering, event details and Telegram subscriptions. Background collection and delivery require explicit operator configuration.

Phase 5 data reliability and its staged migration requirements are documented in [Backend/PHASE5.md](Backend/PHASE5.md). Deploying code does not migrate live records or enable notification delivery.

[![Live Demo](https://img.shields.io/badge/🌍_Live_Demo-Vercel-black?style=for-the-badge)](https://hackathon-notifier.vercel.app)
[![Backend API](https://img.shields.io/badge/⚡_Backend_API-Render-46E3B7?style=for-the-badge)](https://hackathon-notifier.onrender.com)
[![Telegram Bot](https://img.shields.io/badge/🤖_Telegram_Bot-Active-2CA5E0?style=for-the-badge)](#telegram-bot-commands)
[![OpenAPI Docs](https://img.shields.io/badge/📖_OpenAPI_Docs-Interactive-009688?style=for-the-badge)](https://hackathon-notifier.onrender.com/docs)

<div style="margin-top: 8px;">

[![CI Pipeline](https://github.com/Pranavdeshmukhhh/hackathon-notifier/actions/workflows/ci.yml/badge.svg)](https://github.com/Pranavdeshmukhhh/hackathon-notifier/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Python 3.12](https://img.shields.io/badge/python-3.12-blue.svg?style=flat-square&logo=python)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-v1.0.0-009688.svg?style=flat-square&logo=fastapi)](https://hackathon-notifier.onrender.com/docs)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg?style=flat-square&logo=docker)](Dockerfile)

</div>

*Built by [Pranav Deshmukh](https://github.com/Pranavdeshmukhhh) — B.Tech 2nd year.*

</div>

---

## 📸 What It Does

| Feature | Description |
|---|---|
| 🕷️ **8 Scrapers & Discovery Modules** | Devfolio, Unstop, Devpost, HackerEarth, Devnovate, Instagram Scraper, Web Discovery (Google, MLH, Eventbrite, KonfHub), and Continuous Autonomous Internet Scanner |
| 🛡️ **7-Signal Verification Engine** | Automated heuristic verification (title, domain authority, content validity, dates, spam penalty, source reputation, URL reachability) ensuring scam & phishing listings are rejected |
| 📸 **Instagram Hackathon Scanner** | Scrapes 20+ top developer communities & hashtags for hidden hackathon reels & posts with direct Instagram post links |
| 🌐 **Multi-Engine Web Discovery** | Proactively searches Google, MLH, Eventbrite, and KonfHub for upcoming coding competitions |
| ⚡ **Auto-Discovery & Listing Dashboard** | On-demand scanner modal in UI allowing one-click background sweeps and instant verification |
| 🏛 **Smart Classification** | Auto-detects IIT / NIT / IIIT / BITS / IISc / IIM events + internship listings using regex patterns |
| 📍 **Location-Aware Sorting** | Haversine great-circle distance for offline events; sort results by nearest to your GPS location |
| 🔢 **Live Registration Counts** | Displays exact participant registrations pulled from Unstop |
| 👤 **Team Size Range** | Shows min–max team size from each listing |
| ⭐ **Curated Sources** | Hand-picked unique opportunity feeds alongside scraped data |
| 🌐 / 📍 **Online / Offline Tabs** | Separate filters for remote and in-person hackathons |
| 📲 **Telegram Bot** | Push notifications + interactive commands with inline keyboard pagination |
| 📜 **Code of Student Practice** | Built-in Terms & Conditions and Student Ethical Charter |
| 🌓 **Auto Dark Mode** | CSS `prefers-color-scheme` — no toggle, no JS, no cookies |
| 🔒 **Rate Limiting** | Per-IP rate limits via SlowAPI to prevent abuse |
| 📦 **TTL Cache** | In-memory 3-hour cache so MongoDB isn't hit on every request |

---

## 🏗 Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                         DATA PIPELINE & VERIFICATION                   │
│                                                                        │
│  Devfolio       ─┐                                                     │
│  Unstop         ─┤                                                     │
│  Devpost        ─┤                                                     │
│  HackerEarth    ─┼──► ThreadPoolExecutor ──► 7-Signal   ──► Classify  │
│  Devnovate      ─┤     (8 workers)            Verifier        (IIT/NIT/│
│  Instagram      ─┤                         (domain, spam,    intern)  │
│  Web Discovery  ─┤                          date, score)        │     │
│  Autonomous Scan─┘                                              ▼     │
│                                                            MongoDB    │
│                                                            (dedup     │
│                                                            insert)    │
│                                                                 │     │
│                                                       Geocode locations│
│                                                     (Nominatim, 1.1s) │
└────────────────────────────────────────────────────────────────────────┘
           │                                     │
           ▼                                     ▼
   FastAPI + TTLCache                    Telegram Bot
   (Render free tier)               (push alerts, polling)
           │
           ▼
   React 19 + Vite
   (Vercel CDN)
```

### Key Design Decisions

| Decision | Reason |
|---|---|
| **One-shot scraper** | `main.py` runs once and exits. No while-loops, no memory leaks, easier crash recovery. Scheduler (Render Cron / GitHub Actions) re-triggers it. |
| **7-signal verification** | Automatically filters scam / fake hackathons from untrusted open-web & social media sources before database persistence. |
| **TTL in-memory cache** | 3-hour TTL avoids hammering MongoDB on every API hit without needing Redis. Deliberate trade-off for single-instance scale. |
| **`curl_cffi` for Unstop** | Spoofs a real browser TLS fingerprint to bypass Cloudflare bot detection. |
| **Tenacity retry** | Exponential back-off (2s → 4s → 8s) on Telegram 429 / 5xx, with `retry_after` respected. |
| **Server-side pagination** | Backend slices results (12/page); frontend never loads the full dataset at once. |
| **Unified server** | `unified_server.py` runs FastAPI + Telegram polling + scheduled scraping in one Render dyno to minimise free-tier cost. |

---

## 🛠 Tech Stack

### Backend

| | Library | Version | Purpose |
|---|---|---|---|
| 🐍 | Python | 3.11+ | Core language |
| ⚡ | FastAPI + Uvicorn | latest | REST API server |
| 🌿 | PyMongo | latest | MongoDB driver |
| 🕷️ | curl_cffi | latest | Cloudflare-bypass scraping (Unstop) |
| 🍲 | BeautifulSoup4 | latest | HTML parsing (Devfolio, Devpost, Devnovate, Web Discovery) |
| 🛡️ | Hackathon Verifier | internal | 7-signal automated authenticity & spam verification |
| 📸 | Instagram Scraper | internal | Scrapes 20+ Instagram dev communities & hashtags |
| 🌐 | Web Discovery | internal | Multi-engine open web search (Google, MLH, Eventbrite, KonfHub) |
| 📲 | pyTelegramBotAPI | latest | Telegram bot framework |
| 📦 | Pydantic | 2.13+ | Strongly typed OpenAPI schemas & response models |
| 🔁 | Tenacity | latest | Retry with exponential back-off |
| 🧰 | cachetools TTLCache | latest | In-memory API response cache |
| 🚦 | SlowAPI | latest | Per-IP rate limiting |
| 📡 | Requests | latest | HTTP client (geocoder, HackerEarth, Web Discovery) |
| 🔐 | python-dotenv | latest | Environment variable loading |
| 🌐 | Certifi | latest | TLS CA bundle |
| 🧪 | pytest + pytest-cov | latest | Backend regression and isolated MongoDB integration tests |
| 🗄️ | mongomock | latest | In-memory MongoDB for unit tests |

### Frontend

| | Library | Version | Purpose |
|---|---|---|---|
| ⚛️ | React | 19 | UI framework |
| ⚡ | Vite | 8 | Build tool + dev server |
| 🎨 | Tailwind CSS | 4 | Utility-first styling |
| 🧪 | Vitest | 5 | Frontend regression tests |
| 🧪 | React Testing Library | 16 | DOM & component interaction testing |
| 🔤 | Inter (Google Fonts) | — | Typography |
| ✏️ | Lucide React | — | Icon set |
| 🔍 | oxlint | — | Fast Rust-based linter |

### Infrastructure & DevOps

| Service / Tool | Purpose |
|---|---|
| **Render** | `unified_server.py` — API and separately configured polling, scanning and delivery roles |
| **Vercel** | React frontend (CDN, global edge, auto-deploy on push to `main`) |
| **MongoDB Atlas** | Existing events/subscribers plus persistent leases, delivery ledger and cache generation; production writes require transactions |
| **Docker & Compose** | Containerized reproducible environment for local dev & production |
| **GitHub Actions** | Backend/frontend workflow configuration in `.github/workflows/ci.yml`; confirm the current workflow run before relying on CI |

---

## 📁 Project Structure

```
hackathon-notifier/
├── .github/
│   ├── SECURITY.md              # Vulnerability disclosure policy
│   └── workflows/
│       └── ci.yml               # CI: Backend tests + Frontend lint, test, build
│
├── Dockerfile                   # Multi-stage container build with health checks
├── docker-compose.yml           # Turnkey local full-stack dev with MongoDB
├── CONTRIBUTING.md              # Contributor guidelines, standards, and workflows
├── LICENSE                      # MIT Open Source License
│
├── Backend/
│   ├── api.py                   # FastAPI app, /api and /api/v1 routes, rate limiting, telemetry
│   ├── schemas.py               # Pydantic models (HackathonOut, StatsOut, Responses)
│   ├── main.py                  # Compatibility entry point for the shared scan pipeline
│   ├── unified_server.py        # API and explicitly configured background roles
│   ├── scrape_job.py            # Standalone cron-safe scrape runner
│   ├── Procfile                 # web: python unified_server.py
│   ├── requirements.txt         # Pinned Python dependencies with upper bounds
│   ├── .env.example             # Environment template
│   │
│   ├── scrapers/
│   │   ├── __init__.py          # Scraper package exports (__all__)
│   │   ├── devfolio_scraper.py  # Devfolio scraper (BeautifulSoup)
│   │   ├── unstop_scraper.py    # Unstop scraper (curl_cffi TLS bypass)
│   │   ├── devpost_scraper.py   # Devpost scraper (BeautifulSoup)
│   │   ├── hackerearth_scraper.py # HackerEarth scraper (JSON API)
│   │   ├── devnovate_scraper.py # Devnovate scraper (BeautifulSoup)
│   │   ├── instagram_scraper.py # Instagram scraper (20+ communities & hashtags)
│   │   ├── web_discovery_scraper.py # Multi-engine web search (Google, MLH, Eventbrite, KonfHub)
│   │   ├── hackathon_verifier.py# 7-signal automated authenticity & spam verification engine
│   │   ├── internet_scanner.py  # Continuous autonomous scanner (IIT/NIT/Pune/FAANG)
│   │   └── geocoder.py          # Nominatim geocoding with 1.1s rate limiting
│   │
│   ├── filters/
│   │   ├── __init__.py          # Filter package exports (__all__)
│   │   └── keyword_filter.py    # Classify: IIT/NIT/BITS/internship regex detector
│   │
│   ├── notifier/
│   │   ├── __init__.py          # Notifier package exports (__all__)
│   │   └── telegram_bot.py      # send_notification / send_batch / start_polling
│   │
│   ├── db/
│   │   ├── __init__.py          # Database package exports (__all__)
│   │   └── mongo_client.py      # MongoClient, get_collection(), subscriber CRUD
│   │
│   ├── data/
│   │   └── unique_sources.json  # Curated hackathon feed (hand-picked links)
│   │
│   ├── scripts/
│   │   ├── auto_discover_hackathons.py # CLI discovery & auto-listing utility
│   │   └── import_unique_sources.py    # Seed curated hackathons into MongoDB
│   │
│   └── tests/
│       ├── conftest.py          # Shared fixtures (mongomock, sample data)
│       ├── test_api_security.py # Security, rate limits, v1 routes, OpenAPI tests
│       ├── test_pipeline.py     # Pipeline integration & concurrent scraper tests
│       └── ...                  # Regression and reliability tests
│
└── Frontend/
    ├── src/
    │   ├── components/
    │   │   ├── HackathonCard.jsx # Premium Apple HIG card with verification & Instagram badges
    │   │   ├── AutoListModal.jsx # Auto-discovery & verification control modal
    │   │   ├── TermsAndConditions.jsx # Student Code of Practice & Terms dialog
    │   │   ├── SkeletonCard.jsx  # Zero-CLS pulsing skeleton placeholder
    │   │   ├── Pagination.jsx    # Page navigation with ellipsis
    │   │   ├── TechSpecModal.jsx # Architecture overlay dialog
    │   │   ├── ErrorBoundary.jsx # React Error Boundary to catch render failures
    │   │   ├── ScrollToTop.jsx   # Floating smooth-scroll button
    │   │   ├── Toast.jsx         # Ephemeral notifications
    │   │   └── Icons.jsx         # Hand-crafted SVG icons
    │   ├── hooks/
    │   │   ├── useDarkMode.js    # OS-preference-aware dark mode
    │   │   ├── useGeolocation.js # Browser geolocation + error handling
    │   │   └── useScrollProgress.js # Scroll depth and header blur tracking
    │   ├── test/
    │   │   └── setup.js          # Vitest and Testing Library matchers setup
    │   ├── __tests__/
    │   │   ├── HackathonCard.test.jsx
    │   │   ├── AutoListModal.test.jsx
    │   │   ├── TermsAndConditions.test.jsx
    │   │   ├── Pagination.test.jsx
    │   │   └── SkeletonCard.test.jsx
    │   ├── App.jsx              # Composition root (~500 lines)
    │   ├── index.css            # Apple HIG design system tokens & glassmorphism
    │   └── main.jsx             # React 19 entry wrapped in ErrorBoundary
    ├── Components/
    │   └── hakathoncard.jsx     # Backwards-compatible re-export
    ├── index.html               # Vite HTML shell
    ├── vite.config.js           # Vite config with Vitest test runner
    ├── vercel.json              # Vercel SPA rewrites + security headers
    └── package.json
```

---

## 🚀 Local Development

### Prerequisites

- **Python 3.11+** — [python.org](https://www.python.org/downloads/)
- **Node.js 18+** — [nodejs.org](https://nodejs.org/)
- **MongoDB Atlas** free M0 cluster — [mongodb.com/atlas](https://www.mongodb.com/atlas/database)
- **Telegram bot** — create one via [@BotFather](https://t.me/BotFather) on Telegram

---

### 1. Clone the Repository

```bash
git clone https://github.com/Pranavdeshmukhhh/hackathon-notifier.git
cd hackathon-notifier
```

---

### 2. Backend Setup

```bash
cd Backend

# Create and activate a virtual environment
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# → Now open .env and fill in your credentials (see below)
```

**`.env` file contents** (copy from `.env.example`, fill real values):

```env
# MongoDB Atlas connection string (from Atlas dashboard → Connect → Drivers)
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?appName=<appName>

# Telegram bot token (from @BotFather → /newbot)
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Your Telegram chat ID (send a message to your bot, then check getUpdates)
TELEGRAM_CHAT_ID=your_chat_id_here

# Optional: Frontend URL for CORS and Telegram bot "Open App" links
WEBAPP_URL=https://hackathon-notifier.vercel.app

# Optional: Admin secret for the /api/refresh endpoint (any random string)
ADMIN_SECRET=some-random-secret

# Optional: API dataset cache TTL (default/max: 60 seconds)
CACHE_TTL_SECONDS=60

# Keep all background side effects off until the Phase 5 rollout is reviewed.
PHASE5_WRITE_TRANSACTIONS=false
ENABLE_BACKGROUND_SCANNER=false
ENABLE_NOTIFICATION_DELIVERY=false
ENABLE_TELEGRAM_POLLING=false
ENABLE_GEOCODING=false
```

**Start the backend:**

```bash
# FastAPI server only (API at http://localhost:8000)
uvicorn api:app --reload --port 8000

# API with separately configured polling/scanning/delivery roles
python unified_server.py

# Run the scraper pipeline once — writes events and durable delivery intents
python -m main

# Dry run — scrapes only, no DB writes, no Telegram messages
python -m main --dry-run
```

---

### 3. Frontend Setup

```bash
cd Frontend
npm install

# Point at your local backend
echo "VITE_API_URL=http://localhost:8000" > .env.local

npm run dev
# → Opens at http://localhost:5173
```

> If `VITE_API_URL` is not set, the frontend falls back to `https://hackathon-notifier.onrender.com` in production and `http://localhost:8000` in development.

---

## 🤖 Telegram Bot Commands

The bot responds to these commands (also available as a tap-able reply keyboard):

| Command | Description |
|---|---|
| `/start` `/help` | Welcome message + full command list |
| `/latest` | 5 newest upcoming hackathons |
| `/top` | Top college events (IIT / NIT / IIIT / BITS) |
| `/internships` | Upcoming internship & hiring challenge listings |
| `/online` | Online-only hackathons |
| `/offline` | Offline / in-person hackathons |
| `/nearest` | Offline events sorted by distance (prompts for your GPS location) |
| `/prizes` | Hackathons with the highest prize pools |
| `/closing_soon` | Events with deadlines in the next 48 hours |
| `/search <query>` | Full-text keyword search across all hackathons |
| `/devfolio` `/unstop` `/devpost` `/hackerearth` `/devnovate` | Filter by platform source |
| `/stats` | Live platform statistics (total, sources, mode breakdown, subscribers) |
| `/subscribe` `/unsubscribe` | Opt in/out of push notifications |

**Admin-only commands** (restricted to `TELEGRAM_CHAT_ID`):

| Command | Description |
|---|---|
| `/scrape_now` | Trigger an immediate scrape pipeline run |
| `/broadcast <message>` | Send a custom message to all subscribers |
| `/subscribers` | View total active subscriber count |

**Push notifications** for new top-college or internship events use a durable recipient delivery queue. Sending requires `ENABLE_NOTIFICATION_DELIVERY=true`; see [the Phase 5 rollout guide](Backend/PHASE5.md) before enabling it.

---

## 🔒 Security

For our full security policy, vulnerability reporting guidelines, and coordinated disclosure process, please see [**SECURITY.md**](SECURITY.md).

### Backend (`Backend/api.py`)

- **OWASP Security Response Headers** — All API responses automatically include `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-XSS-Protection: 1; mode=block`, `Permissions-Policy: geolocation=(self)`, and `X-Permitted-Cross-Domain-Policies: none`.
- **Per-IP Rate Limiting** — SlowAPI enforces strict limits (60 req/min for hackathons, health, and metrics; 5 req/min for cache refresh) to prevent scraping spam and DoS attacks.
- **Client IP Verification** — Reverse-proxy headers (`CF-Connecting-IP`, `X-Forwarded-For`) are strictly validated against IPv4/IPv6 address syntax using Python's `ipaddress` standard library before being trusted.
- **Pydantic Bounds & Query Sanitization** — Query parameters are strongly typed and validated: pagination bounds (`page` 1–1000, `limit` 1–100), coordinate ranges (`lat` ±90.0, `lng` ±180.0), and string length caps (`search` ≤ 100 chars, `category` ≤ 30 chars).
- **Constant-Time Admin Authentication** — Protected admin actions (such as `POST /api/refresh`) require an `ADMIN_SECRET` validated using `secrets.compare_digest` to prevent side-channel timing attacks.
- **Database Error Masking** — The `/health` probe verifies live database connectivity via an admin ping, but swallows exceptions into a generic JSON error (`{"status": "unhealthy", "reason": "database unavailable"}`) to prevent database URI, credential, or stack-trace leakage.
- **Production API Protection** — Swagger UI (`/docs`) and ReDoc (`/redoc`) documentation endpoints can be completely disabled in production environments via `ENVIRONMENT=production`.
- **Database Unique Indexing** — MongoDB enforces a unique compound index on the `link` field, guaranteeing idempotence and eliminating race-condition duplicate inserts.
- **Tenacity Back-off & Rate-Limit Handling** — Telegram notifications use exponential back-off retries with full jitter and honor HTTP 429 `retry_after` headers.
- **Message Content Escaping** — All Telegram notifications and bot responses undergo HTML escaping (`html.escape`) prior to dispatch to prevent injection.
- **Zero Hardcoded Secrets** — All API tokens, chat IDs, and database strings are loaded from `.env` or container environment variables; `.env` is blocked by `.gitignore`.

### Frontend (`Frontend/vercel.json`)

- **Strict Content Security Policy (CSP)** — Whitelists trusted script, font, and style origins (`https://fonts.googleapis.com`, `https://fonts.gstatic.com`), while locking down `object-src 'none'`, `frame-ancestors 'none'`, and restricting API endpoints to self, Render, and local dev.
- **HSTS (`Strict-Transport-Security`)** — Enforces TLS encryption with a 2-year duration (`max-age=63072000; includeSubDomains; preload`).
- **Clickjacking Defense** — `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'` prevent embedding within external iframes.
- **MIME-Type Sniffing Protection** — `X-Content-Type-Options: nosniff` forces modern browsers to strictly adhere to declared content types.
- **Hardware & API Isolation** — `Permissions-Policy` completely disables unauthorized browser hardware APIs (`camera=()`, `microphone=()`, `payment=()`, `usb=()`).
- **On-Demand Geolocation** — Geolocation permissions are requested only when the user clicks "Sort by nearest" — never on initial page load, and coordinates are never persisted to a database.

### Privacy & Data Stewardship

- **No User Accounts** — Zero passwords, sessions, or personal user profiles are stored in any database.
- **Zero Third-Party Trackers** — Completely free of Google Analytics, tracking pixels, marketing beacons, and third-party advertising cookies.
- **Telegram Notification Privacy** — Telegram subscribers are stored solely as numeric chat IDs associated with notification preferences.
- **Server-Side Telemetry** — Lightweight visitor telemetry (anonymized IP, country, user-agent device info) is processed server-side with strict in-memory debouncing (max 1 alert per IP every 6 hours; max 1 globally every 15s) purely for uptime monitoring and traffic spike notifications.

---

## 🧪 Tests

```bash
# Backend tests (real MongoDB cases skip unless explicitly configured)
cd Backend
pytest tests/ -v

# Run with coverage report
pytest tests/ -v --cov=. --cov-report=term-missing

# Frontend tests
cd ../Frontend
npm test
```

For isolated real MongoDB transaction and recovery checks, follow [Backend/PHASE5.md](Backend/PHASE5.md). Local verification and a passing GitHub workflow are separate checks; inspect the branch's actual Actions result.

---

## 🌓 Dark / Light Mode

The UI automatically adapts to your OS or browser preference:

- **Light mode** — clean white `#ffffff` background, high contrast text.
- **Dark mode** — deep navy background, auto-applied via `@media (prefers-color-scheme: dark)`.

No toggle button. No JavaScript. No cookies. Just CSS custom properties.

---

## 🔁 Keeping the Backend Alive (Render Free Tier)

Render's free tier spins down after 15 minutes of inactivity (cold start ~30s).
To prevent cold starts, use any of the following:

1. **UptimeRobot** (free) — set an HTTP monitor to ping `/health` every 5 minutes.
2. **cron-job.org** (free) — no account needed, configure a cron to hit your health endpoint.
3. **GitHub Actions cron** — add to your workflow:
   ```yaml
   - name: Keep backend alive
     run: curl https://hackathon-notifier.onrender.com/health
   ```

---

## 📈 Roadmap

- [ ] Personalized Telegram subscriptions (filter by tag / mode / college type)
- [ ] Async scrapers with `asyncio` + `aiohttp` for faster pipeline runs
- [ ] Webhook mode for Telegram (replaces long-polling; more reliable on Render)
- [ ] Celery + Redis worker queue for Telegram at scale
- [ ] Email digest option alongside Telegram

---

## 🤝 Contributing

1. Fork the repo.
2. Create a feature branch: `git checkout -b feat/your-feature`.
3. Make your changes and run tests: `pytest tests/ -v`.
4. Push and open a pull request against `main`.

Please keep commits descriptive and do not commit `.env` files.

---

## 📄 License

MIT — use it, modify it, ship it. Just don't sell it as your own SaaS without crediting the original.

---

<div align="center">
  Built with 🔥 by <strong>Pranav Deshmukh</strong><br>
  <sub>AI-accelerated, not AI-generated. The architecture runs on human ingenuity.</sub>
</div>
