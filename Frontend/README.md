# Frontend — Hackathon Notifier

React 19 + Vite frontend for the [Hackathon Notifier](https://hackathon-notifier.vercel.app) platform.

**Live URL:** [https://hackathon-notifier.vercel.app](https://hackathon-notifier.vercel.app)  
**Backend API:** [https://hackathon-notifier.onrender.com](https://hackathon-notifier.onrender.com)

---

## Tech Stack

| | Library | Version | Purpose |
|---|---|---|---|
| ⚛️ | React | 19 | UI component framework |
| ⚡ | Vite | 8 | Build tool + dev server with HMR |
| 🎨 | Tailwind CSS | 4 | Utility-first styling |
| 🔤 | Inter (Google Fonts) | — | Primary typeface |
| ✏️ | Lucide React | — | SVG icon set |
| 🔍 | oxlint | — | Fast Rust-based JavaScript linter |

---

## Features

- **Auto dark / light mode** — `@media (prefers-color-scheme: dark)`, zero JS for theming
- **Server-side pagination** — 12 cards/page fetched from the FastAPI backend
- **Debounced search** — 400 ms delay, minimises redundant API calls
- **Location-aware sorting** — requests device GPS, sends coordinates to backend for Haversine distance sort
- **Category tabs** — All / Online / Offline / Top College / Internship / Curated
- **Upcoming / Missed tabs** — separate views for live and already-expired events
- **Cold-start banner** — notifies users when the Render free-tier backend is waking up
- **Stats dashboard popup** — live platform stats (total hackathons, per-source breakdown, mode split)
- **Inline "Open App" Telegram button** — links directly to the Telegram bot

---

## Local Setup

```bash
# From project root
cd Frontend
npm install

# Point the app at your local backend
echo "VITE_API_URL=http://localhost:8000" > .env.local

npm run dev
# → http://localhost:5173
```

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_URL` | No | `https://hackathon-notifier.onrender.com` | Base URL of the FastAPI backend (no trailing slash) |

In production (Vercel), set `VITE_API_URL` in **Project → Settings → Environment Variables** in the Vercel dashboard.

---

## Project Structure

```
Frontend/
├── src/
│   ├── App.jsx          # Root component — state, filters, pagination, modals, API calls
│   ├── index.css        # Design system: CSS tokens, layout, components, dark mode
│   └── main.jsx         # React entry point (ReactDOM.createRoot)
├── Components/
│   └── hakathoncard.jsx # Individual card for each hackathon listing
├── index.html           # HTML shell with meta tags and Vite entry
├── vite.config.js       # Vite + @vitejs/plugin-react config
├── vercel.json          # SPA rewrites + security response headers
└── package.json
```

---

## Design System

All colors, shadows, and spacing are CSS custom properties on `:root`, overridden inside `@media (prefers-color-scheme: dark)`. **Zero JavaScript is needed for theming** — the browser applies it at parse time.

Key tokens:

```css
--bg-base           /* page background */
--bg-surface        /* subtle section backgrounds */
--bg-elevated       /* cards, modals, dropdowns */
--text-primary      /* headings and important labels */
--text-secondary    /* body copy */
--text-muted        /* captions and timestamps */
--accent            /* primary indigo action color */
--accent-hover      /* darker indigo for hover states */
--border            /* dividers and outlines */
--card-shadow       /* card elevation shadow */
```

---

## Security Headers

`vercel.json` sets the following security headers on every response:

| Header | Value |
|---|---|
| `Content-Security-Policy` | Restricts scripts, styles, fonts, and connections to known origins |
| `Strict-Transport-Security` | 2-year HSTS with subdomain coverage and preload |
| `X-Frame-Options` | `DENY` — prevents clickjacking |
| `X-Content-Type-Options` | `nosniff` — prevents MIME-type sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | Blocks access to camera, microphone, payment, USB |

---

## Build & Deploy

```bash
# Production build (outputs to dist/)
npm run build

# Preview production build locally
npm run preview

# Lint
npm run lint
```

Vercel auto-deploys on every push to `main`. No manual build step needed.

---

## Notes

- The `dist/` directory is git-ignored and not committed to the repository.
- The app gracefully shows a loading skeleton and cold-start warning while the Render backend wakes from sleep.
- Geolocation is only requested when the user explicitly clicks "Sort by nearest" — never automatically on page load.
