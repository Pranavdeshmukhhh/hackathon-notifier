# Frontend — Hackathon Notifier

React + Vite frontend for the [Hackathon Notifier](https://hackathon-notifier.vercel.app) project.

Deployed to **Vercel** at: [https://hackathon-notifier.vercel.app](https://hackathon-notifier.vercel.app)

---

## Stack

| | |
|---|---|
| **Framework** | React 18 |
| **Bundler** | Vite |
| **Styling** | Vanilla CSS with CSS custom properties (no Tailwind) |
| **Font** | Inter (Google Fonts) |
| **Icons** | Inline SVG |

---

## Features

- **Light / dark mode** — auto-switches via `@media (prefers-color-scheme: dark)`, no JS toggle
- **Server-side pagination** — 12 cards/page, fetched from backend
- **Debounced search** — 400 ms delay, no over-fetching
- **Location-aware sorting** — requests GPS, calculates distance via Haversine on the backend
- **Category tabs** — All / Online / Offline / Top College / Internship / Hackathons / Curated
- **Upcoming / Missed tabs** — separate views for live and expired events
- **Cold-start banner** — warns the user when the Render backend is waking up
- **Dashboard popup** — live stats (total, sources, mode breakdown)

---

## Local Setup

```bash
# From project root
cd Frontend
npm install

# Point at local backend
echo "VITE_API_URL=http://localhost:8000" > .env.local

npm run dev
# → http://localhost:5173
```

### Environment Variables

| Variable | Description |
|---|---|
| `VITE_API_URL` | Base URL of the FastAPI backend (no trailing slash) |

If `VITE_API_URL` is not set, the app falls back to:
- `https://hackathon-notifier.onrender.com` in production
- `http://localhost:8000` in development

---

## Project Structure

```
Frontend/
├── src/
│   ├── App.jsx          # Root component — state, filters, pagination, modals
│   ├── index.css        # Design system: tokens, layout, components, dark mode
│   └── main.jsx         # React entry point
├── Components/
│   └── hakathoncard.jsx # Card component for each hackathon listing
├── index.html
├── vite.config.js
└── package.json
```

---

## Design System

All colors, shadows, and borders are CSS custom properties on `:root`, overridden inside `@media (prefers-color-scheme: dark)`. This means **zero JS for theming** — the browser handles it at parse time.

Key tokens:

```css
--bg-base         /* page background     */
--bg-surface      /* subtle sections     */
--bg-elevated     /* cards, modals       */
--text-primary    /* headings            */
--text-secondary  /* body copy           */
--text-muted      /* labels, captions    */
--accent          /* indigo #6366f1      */
--accent-hover    /* darker indigo       */
--border          /* dividers            */
--card-shadow     /* card elevation      */
```

---

## Build & Deploy

```bash
npm run build        # outputs to dist/
npm run preview      # preview production build locally
```

Vercel auto-deploys on every push to `main`.
Set `VITE_API_URL` in the Vercel dashboard under **Project → Settings → Environment Variables**.
