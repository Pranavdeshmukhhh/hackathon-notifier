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
| 🧪 | Vitest | 5 | Blazing fast unit test runner |
| 🧪 | React Testing Library | 16 | DOM & component interaction testing |
| 🗄️ | jsdom | 30 | Headless browser DOM environment |
| 🔤 | Inter (Google Fonts) | — | Primary typeface |
| ✏️ | Lucide React | — | SVG icon set |
| 🔍 | oxlint | — | Fast Rust-based JavaScript linter |

---

## Features

- **Apple HIG-inspired design** — clean cards with glassmorphism, category badges, team sizes, and live Unstop participant counts
- **Zero-CLS skeleton loaders** — pulsing card placeholders eliminate layout shifts during data loading
- **Auto dark / light mode** — `@media (prefers-color-scheme: dark)`, zero JS for theming
- **Server-side pagination** — 12 cards/page fetched efficiently from the FastAPI backend
- **Debounced search** — 400 ms delay, minimises redundant API calls
- **Location-aware sorting** — requests device GPS, sends coordinates to backend for Haversine distance sort
- **Category tabs** — All / Online / Offline / Top College / Internship / Curated
- **Upcoming / Missed tabs** — separate views for live and already-expired events
- **Interactive Tech Spec modal** — instant overlay detailing system architecture, data pipeline, and security
- **Toast notification system** — non-intrusive feedback for user actions and error handling
- **Error Boundary resilience** — catches component tree exceptions and provides a recovery UI
- **Floating Scroll-To-Top button** — smooth elevation button with scroll depth tracking
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

# Start development server
npm run dev
# → http://localhost:5173

# Run tests
npm test
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
│   ├── assets/              # Logos and hero illustration assets
│   ├── components/
│   │   ├── ErrorBoundary.jsx # React Error Boundary to catch render failures
│   │   ├── HackathonCard.jsx # Card displaying hackathon details, badges, and tags
│   │   ├── Icons.jsx         # Custom SVG icon set
│   │   ├── Pagination.jsx    # Responsive pagination with ellipsis logic
│   │   ├── ScrollToTop.jsx   # Smooth floating scroll button
│   │   ├── SkeletonCard.jsx  # Zero-CLS pulsing skeleton placeholder
│   │   ├── TechSpecModal.jsx # Architecture & system overlay modal
│   │   └── Toast.jsx         # Ephemeral toast feedback notifications
│   ├── hooks/
│   │   ├── useDarkMode.js    # OS-preference-aware dark mode state
│   │   ├── useGeolocation.js # Browser geolocation access and error handling
│   │   └── useScrollProgress.js # Scroll depth and header blur tracking
│   ├── test/
│   │   └── setup.js          # Vitest and Testing Library matchers setup
│   ├── __tests__/
│   │   ├── HackathonCard.test.jsx # Unit tests for card rendering & interactions
│   │   ├── Pagination.test.jsx    # Unit tests for pagination navigation
│   │   └── SkeletonCard.test.jsx  # Unit tests for loading skeletons
│   ├── App.jsx              # Main composition root, filters, state, modals
│   ├── index.css            # Apple HIG design system tokens & styles
│   └── main.jsx             # React 19 bootstrap wrapped in ErrorBoundary
├── Components/
│   └── hakathoncard.jsx     # Backwards-compatible re-export
├── index.html               # Vite HTML template with SEO meta tags
├── vite.config.js           # Vite configuration with Vitest environment
├── vercel.json              # Vercel SPA rewrites & security headers
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

For our full security policy and vulnerability reporting guidelines, see [**SECURITY.md**](../SECURITY.md).

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

## Build & Test

```bash
# Run unit test suite (13 tests)
npm test

# Run linter (oxlint)
npm run lint

# Production build (outputs to dist/)
npm run build

# Preview production build locally
npm run preview
```

Vercel auto-deploys on every push to `main`. CI runs linter, tests, and build checks before merging.

---

## Notes

- The `dist/` directory is git-ignored and not committed to the repository.
- The app gracefully shows a loading skeleton and cold-start warning while the Render backend wakes from sleep.
- Geolocation is only requested when the user explicitly clicks "Sort by nearest" — never automatically on page load.
