<div align="center">

# ⚡ Hackathon Notifier

**Never miss a hackathon again.**

A full-stack, production-grade hackathon aggregation platform — scraping Devfolio, Unstop, Devpost & HackerEarth in real-time, classifying opportunities with smart metadata, and delivering them straight to your Telegram and a sleek web dashboard.

[![Live Demo](https://img.shields.io/badge/🌍_Live_Demo-Vercel-black?style=for-the-badge)](https://hackathon-notifier.vercel.app)
[![Backend](https://img.shields.io/badge/⚡_Backend-Render-46E3B7?style=for-the-badge)](https://hackathon-notifier.onrender.com)
[![Telegram Bot](https://img.shields.io/badge/🤖_Telegram_Bot-Active-2CA5E0?style=for-the-badge)](#telegram-bot)

*Built by [Pranav Deshmukh](https://github.com/Pranavdeshmukhhh) — B.Tech 2nd year.*
*LLMs acted as a pair programmer, not the engineer.*

</div>

---

## 📸 What it does

| Feature | Description |
|---|---|
| 🕷️ **4 Concurrent Scrapers** | Devfolio, Unstop, Devpost, HackerEarth — fetched in parallel via `ThreadPoolExecutor` |
| 🏛 **Smart Classification** | Auto-detects IIT / NIT / IIIT / BITS events + internship listings |
| 📍 **Location-Aware** | Haversine distance calculation for offline events; sort by nearest |
| 🔢 **Real Registrations** | Displays exact registration counts from Unstop |
| 👤 **Team Size Range** | Shows min–max team size from each listing |
| ⭐ **Curated Sources** | Hand-picked unique opportunity feeds alongside scraped data |
| 🌐 / 📍 **Mode Tabs** | Separate filters for Online / Offline hackathons |
| 📲 **Telegram Bot** | Push notifications + `/latest`, `/top`, `/nearest`, `/stats`, `/internships` |
| 🌓 **Dark Mode** | Auto-switches based on OS preference — no toggle needed |

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      DATA PIPELINE                           │
│                                                              │
│  Devfolio ─┐                                                 │
│  Unstop   ─┼──► ThreadPoolExecutor ──► Classify ──► MongoDB  │
│  Devpost  ─┤        (4 workers)         (IIT/NIT/  (dedup    │
│  HackerEarth─┘                          internship) insert)  │
│                                              │               │
│                                     Geocode locations        │
│                                    (Nominatim, 1 req/s)      │
└─────────────────────────────────────────────────────────────┘
           │                                    │
           ▼                                    ▼
   FastAPI + TTLCache                   Telegram Bot
   (Render free tier)                (push new alerts)
           │
           ▼
   React + Vite
   (Vercel, CDN)
```

### Key design decisions

- **One-shot scraper** — `main.py` runs once and exits. The scheduler (Render Cron or GitHub Actions) re-triggers it. No while-loops, no memory leaks, easier crash recovery.
- **TTL in-memory cache** — 1-hour TTL avoids hammering MongoDB on every API request without needing Redis.
- **TLS fingerprint bypass** — `curl_cffi` spoofs a real browser TLS handshake to bypass Cloudflare on Unstop.
- **Tenacity retry** — exponential back-off (2s → 4s → 8s) on Telegram 429 / 5xx, with `retry_after` respected.
- **Server-side pagination** — backend slices results (12/page), frontend never loads all data at once.

---

## 🛠 Tech Stack

### Backend
| | Library | Purpose |
|---|---|---|
| 🐍 | Python 3.11 | Core language |
| ⚡ | FastAPI + Uvicorn | REST API server |
| 🌿 | PyMongo (MongoDB) | Primary database |
| 🕷️ | curl_cffi | Cloudflare bypass scraping |
| 🍲 | BeautifulSoup4 | HTML parsing |
| 📲 | pyTelegramBotAPI | Telegram bot |
| 🔁 | Tenacity | Retry with exponential back-off |
| 🗺️ | geopy (Nominatim) | Geocoding for offline events |
| 🧰 | cachetools TTLCache | In-memory API response cache |
| 🚦 | slowapi | API rate limiting |

### Frontend
| | Library | Purpose |
|---|---|---|
| ⚛️ | React 18 + Vite | UI framework |
| 🎨 | Vanilla CSS + CSS Variables | Light/dark mode theming |
| 🔤 | Inter (Google Fonts) | Typography |

### Infrastructure
| Service | What runs there |
|---|---|
| **Render** | FastAPI backend + Telegram polling bot (unified_server.py) |
| **Vercel** | React frontend (CDN, global edge) |
| **MongoDB Atlas** | Free-tier M0 cluster (512 MB) |

---

## 📁 Project Structure

```
hackathon-notifier/
├── Backend/
│   ├── api.py                 # FastAPI routes + TTLCache + distance calc
│   ├── main.py                # One-shot scrape → classify → notify pipeline
│   ├── unified_server.py      # Starts FastAPI + Telegram bot in one Render dyno
│   ├── scrape_job.py          # Standalone cron-safe scrape runner
│   ├── Procfile               # web: python unified_server.py
│   ├── requirements.txt
│   ├── scrapers/
│   │   ├── devfolio_scraper.py
│   │   ├── unstop_scraper.py  # curl_cffi TLS bypass
│   │   ├── devpost_scraper.py
│   │   └── hackerearth_scraper.py
│   ├── filters/
│   │   └── keyword_filter.py  # IIT/NIT/BITS/internship classifier
│   ├── notifier/
│   │   └── telegram_bot.py    # send_notification / send_batch / start_polling
│   ├── db/
│   │   └── mongo_client.py
│   └── data/
│       └── unique_sources.json # Curated hackathon feed
│
└── Frontend/
    ├── src/
    │   ├── App.jsx            # Main app, state, filters, pagination
    │   ├── index.css          # Design system (light + dark mode tokens)
    │   └── main.jsx
    ├── Components/
    │   └── hakathoncard.jsx   # Hackathon card component
    ├── index.html
    ├── vite.config.js
    └── package.json
```

---

## 🚀 Local Development

### Prerequisites
- Python 3.11+
- Node.js 18+
- MongoDB Atlas URI (free tier)
- Telegram Bot Token + Chat ID

### Backend

```bash
cd Backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux

pip install -r requirements.txt

# Create .env
cp .env.example .env            # then fill in values
```

**`.env` file:**
```env
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/hackathons
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
WEBAPP_URL=https://hackathon-notifier.vercel.app
```

```bash
# Run the API server only
uvicorn api:app --reload --port 8000

# Run the full unified server (API + Telegram bot)
python unified_server.py

# Run scraper pipeline once (dry-run — no DB writes)
python -m main --dry-run

# Run scraper pipeline (real insert + Telegram notify)
python -m main
```

### Frontend

```bash
cd Frontend
npm install

# Create .env.local
echo "VITE_API_URL=http://localhost:8000" > .env.local

npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## 🤖 Telegram Bot

The bot responds to the following commands:

| Command | Description |
|---|---|
| `/start` `/help` | Welcome message + command list |
| `/latest` | 5 newest upcoming hackathons |
| `/top` | Top College events (IIT / NIT / BITS) |
| `/internships` | Upcoming internship listings |
| `/online` | Online-only hackathons |
| `/offline` | Offline hackathons |
| `/nearest` | Offline events sorted by distance (prompts for location) |
| `/stats` | Live platform statistics |

**Push notifications** are sent automatically for every new top-college or internship event discovered during a scrape run.

> The bot also has a **persistent reply keyboard** so you can tap commands instead of typing them.

---

## 🌓 Dark / Light Mode

The UI automatically adapts to your OS preference:
- **Light mode** — white `#ffffff` background, high contrast
- **Dark mode** — deep navy `#0b0f1a`, auto-applied via `@media (prefers-color-scheme: dark)`

No toggle button. No cookies. Just CSS variables.

---

## 🔁 Keeping the Backend Alive (Free Tier)

Render's free tier spins down after 15 minutes of inactivity (cold start ~30s).  
To keep it warm 24/7 for free, use any of:

1. **UptimeRobot** — free HTTP monitor, pings your `/health` every 5 min
2. **GitHub Actions cron** — hits your API on a schedule:
   ```yaml
   - name: Keep backend alive
     run: curl https://hackathon-notifier.onrender.com/health
   ```
3. **Cron-job.org** — free cron service, no account needed

---

## 🧪 Tests

```bash
cd Backend
pytest tests/ -v --cov=. --cov-report=term-missing
```

---

## 📈 Roadmap

- [ ] Personalized Telegram subscriptions (filter by tag / mode / college)
- [ ] Async scrapers with `asyncio` + `aiohttp` for faster pipeline runs  
- [ ] Celery + Redis worker queue for Telegram at scale  
- [ ] GitHub Actions CI — pytest on every push  
- [ ] Webhook mode for Telegram (replaces polling)

---

## 📄 License

MIT — do whatever you want, just don't sell it as your own SaaS without crediting the source.

---

<div align="center">
  Built with 🔥 by <strong>Pranav Deshmukh</strong><br>
  <sub>AI-accelerated, not AI-generated. The architecture runs on human ingenuity.</sub>
</div>
