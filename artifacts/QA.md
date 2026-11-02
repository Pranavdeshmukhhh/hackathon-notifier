# Verification

All screenshots use isolated, in-memory sample events. They do not represent live
hackathons, prizes, deadlines, or user records. Production code contains no sample feed.

- Production Vite build: passed. JavaScript ~250 kB / 78 kB gzip, CSS ~44 kB / 10 kB gzip.
- Frontend: 73 tests passed (15 files).
- Backend: 226 tests passed. One upstream Starlette/httpx deprecation warning.
- Chromium desktop 1440px and mobile 390px: no page errors or horizontal overflow.
- Search, format filtering, server pagination, saved list persistence, details,
  organizer registration links, dialog focus trap/Escape/restore, theme toggle,
  suggestion queue, empty state, outage/retry, and loading state checked.
- Mobile filter drawer and reduced-motion preference checked.
- Pink label/action foreground colors adjusted after contrast sampling.

Run isolated API: `python scripts/preview_api.py`, then frontend: `cd Frontend && npm run dev`.
The optional browser script needs Playwright and system Chromium. Run it from the
repository with `node scripts/browser_qa.mjs`; this workspace used its preinstalled
Playwright module through `PLAYWRIGHT_MODULE`.

Production infrastructure capacity has not been load-tested. See IMPLEMENTATION.md.
