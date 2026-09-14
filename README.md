<div align="center">

# ⚡ Hackathon Notifier

**Never miss a hackathon again.**

A full-stack, production-grade hackathon aggregation platform — scraping Devfolio, Unstop, Devpost, HackerEarth, and Devnovate in real-time, classifying opportunities with smart metadata, and delivering them straight to your Telegram and a sleek web dashboard.

[![Live Demo](https://img.shields.io/badge/🌍_Live_Demo-Vercel-black?style=for-the-badge)](https://hackathon-notifier.vercel.app)
[![Backend API](https://img.shields.io/badge/⚡_Backend_API-Render-46E3B7?style=for-the-badge)](https://hackathon-notifier.onrender.com)
[![Telegram Bot](https://img.shields.io/badge/🤖_Telegram_Bot-Active-2CA5E0?style=for-the-badge)](#telegram-bot-commands)

*Built by [Pranav Deshmukh](https://github.com/Pranavdeshmukhhh) — B.Tech 2nd year.*

</div>

---

## 📸 What It Does

| Feature | Description |
|---|---|
| 🕷️ **5 Concurrent Scrapers** | Devfolio, Unstop, Devpost, HackerEarth, Devnovate — all scraped in parallel via `ThreadPoolExecutor` |
| 🏛 **Smart Classification** | Auto-detects IIT / NIT / IIIT / BITS / IISc / IIM events + internship listings using regex patterns |
| 📍 **Location-Aware Sorting** | Haversine great-circle distance for offline events; sort results by nearest to your GPS location |
| 🔢 **Live Registration Counts** | Displays exact participant registrations pulled from Unstop |
| 👤 **Team Size Range** | Shows min–max team size from each listing |
| ⭐ **Curated Sources** | Hand-picked unique opportunity feeds alongside scraped data |
| 🌐 / 📍 **Online / Offline Tabs** | Separate filters for remote and in-person hackathons |
| 📲 **Telegram Bot** | Push notifications + interactive commands with inline keyboard pagination |
| 🌓 **Auto Dark Mode** | CSS `prefers-color-scheme` — no toggle, no JS, no cookies |
| 🔒 **Rate Limiting** | Per-IP rate limits via SlowAPI to prevent abuse |
| 📦 **TTL Cache** | In-memory 3-hour cache so MongoDB isn't hit on every request |

---

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                       DATA PIPELINE                           │
│                                                               │
│  Devfolio   ─┐                                                │
│  Unstop     ─┤                                                │
│  Devpost    ─┼──► ThreadPoolExecutor ──► Classify ──► MongoDB │
│  HackerEarth─┤       (5 workers)        (IIT/NIT/   (dedup   │
│  Devnovate  ─┘                          internship)  insert)  │
│                                               │               │
│                                      Geocode locations        │
│                                     (Nominatim, 1 req/s)      │
└──────────────────────────────────────────────────────────────┘
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
| 🍲 | BeautifulSoup4 | latest | HTML parsing (Devfolio, Devpost, Devnovate) |
| 📲 | pyTelegramBotAPI | latest | Telegram bot framework |
| 🔁 | Tenacity | latest | Retry with exponential back-off |
| 🧰 | cachetools TTLCache | latest | In-memory API response cache |
| 🚦 | SlowAPI | latest | Per-IP rate limiting |
| 📡 | Requests | latest | HTTP client (geocoder, HackerEarth) |
| 🔐 | python-dotenv | latest | Environment variable loading |
| 🌐 | Certifi | latest | TLS CA bundle |
| 🧪 | pytest + pytest-cov | latest | Test suite + coverage |
| 🗄️ | mongomock | latest | In-memory MongoDB for unit tests |

### Frontend

| | Library | Version | Purpose |
|---|---|---|---|
| ⚛️ | React | 19 | UI framework |
| ⚡ | Vite | 8 | Build tool + dev server |
| 🎨 | Tailwind CSS | 4 | Utility-first styling |
| 🔤 | Inter (Google Fonts) | — | Typography |
| ✏️ | Lucide React | — | Icon set |
| 🔍 | oxlint | — | Fast Rust-based linter |

### Infrastructure

| Service | What runs there |
|---|---|
| **Render** | `unified_server.py` — FastAPI API + Telegram polling bot + hourly scraper |
| **Vercel** | React frontend (CDN, global edge, auto-deploy on push to `main`) |
| **MongoDB Atlas** | Free-tier M0 cluster (512 MB), two collections: `hackathons` + `subscribers` |

---

## 📁 Project Structure

```
hackathon-notifier/
├── .github/
│   └── workflows/
│       └── ci.yml               # CI: pytest on every push to main
│
├── Backend/
│   ├── api.py                   # FastAPI routes, TTLCache, distance calc, rate limiting
│   ├── main.py                  # One-shot pipeline: scrape → classify → dedup → notify
│   ├── unified_server.py        # Render entry point: API + bot polling + hourly scraper
│   ├── scrape_job.py            # Standalone cron-safe scrape runner
│   ├── Procfile                 # web: python unified_server.py
│   ├── requirements.txt         # All Python dependencies
│   ├── .env.example             # Template — copy to .env and fill values
│   │
│   ├── scrapers/
│   │   ├── devfolio_scraper.py  # Scrapes devfolio.co (BeautifulSoup + requests)
│   │   ├── unstop_scraper.py    # Scrapes unstop.com (curl_cffi TLS bypass)
│   │   ├── devpost_scraper.py   # Scrapes devpost.com (BeautifulSoup)
│   │   ├── hackerearth_scraper.py  # Scrapes hackerearth.com (JSON API)
│   │   ├── devnovate_scraper.py # Scrapes devnovate.com (BeautifulSoup)
│   │   └── geocoder.py          # Nominatim geocoding (lat/lon for offline events)
│   │
│   ├── filters/
│   │   └── keyword_filter.py    # Classify: IIT/NIT/BITS/internship regex detector
│   │
│   ├── notifier/
│   │   └── telegram_bot.py      # send_notification / send_batch / start_polling
│   │
│   ├── db/
│   │   └── mongo_client.py      # Singleton MongoClient, get_collection(), subscriber CRUD
│   │
│   ├── data/
│   │   └── unique_sources.json  # Curated hackathon feed (hand-picked links)
│   │
│   └── tests/
│       ├── conftest.py          # Shared fixtures (mongomock, sample data)
│       ├── test_api_security.py # Rate limiting, CORS, header security tests
│       ├── test_pipeline.py     # Full pipeline integration tests
│       └── ...                  # Per-scraper unit tests
│
└── Frontend/
    ├── src/
    │   ├── App.jsx              # Root component — state, filters, pagination, modals
    │   ├── index.css            # Design system: tokens, layout, dark mode
    │   └── main.jsx             # React entry point
    ├── Components/
    │   └── hakathoncard.jsx     # Card component for each hackathon listing
    ├── index.html               # HTML shell (Vite entry)
    ├── vite.config.js           # Vite + React plugin config
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

# Optional: Cache TTL in seconds (default 10800 = 3 hours)
CACHE_TTL_SECONDS=10800
```

**Start the backend:**

```bash
# FastAPI server only (API at http://localhost:8000)
uvicorn api:app --reload --port 8000

# Full unified server (API + Telegram bot + hourly scraper)
python unified_server.py

# Run the scraper pipeline once — writes to DB, sends Telegram alerts
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

**Push notifications** are sent automatically for every new top-college or internship event discovered during a scheduled scrape.

---

## 🔒 Security

### Backend

- **Per-IP rate limiting** — SlowAPI enforces request limits, with Cloudflare `CF-Connecting-IP` and `X-Forwarded-For` header validation.
- **Admin endpoints** protected by `ADMIN_SECRET` checked with `secrets.compare_digest` (constant-time comparison prevents timing attacks).
- **No credentials in code** — all secrets loaded from `.env` / environment variables; `.env` is git-ignored.
- **MongoDB unique index** on `link` field prevents duplicate inserts even under race conditions.
- **Tenacity retries** prevent Telegram API hammering; respects `retry_after` on 429 responses.
- **Input sanitisation** — all Telegram message text is HTML-escaped before sending.

### Frontend

- **Content Security Policy (CSP)** enforced via `vercel.json` headers.
- **HSTS** (`Strict-Transport-Security`) with 2-year max-age and preload.
- **`X-Frame-Options: DENY`** — prevents clickjacking.
- **`X-Content-Type-Options: nosniff`** — prevents MIME sniffing.
- **Permissions Policy** restricts access to camera, microphone, payment, and USB APIs.
- **Geolocation** is only requested when the user explicitly clicks "Sort by nearest" — never on page load.

### What the app does NOT collect

- No user accounts or login system.
- No analytics or tracking scripts.
- Telegram subscribers are stored only as chat IDs with notification preferences.

---

## 🧪 Tests

```bash
cd Backend

# Run all tests
pytest tests/ -v

# Run with coverage report
pytest tests/ -v --cov=. --cov-report=term-missing

# Run a specific test file
pytest tests/test_pipeline.py -v
```

All 98 tests pass on every push (enforced by GitHub Actions CI — see `.github/workflows/ci.yml`).

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
