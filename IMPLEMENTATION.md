> Historical delivery notes, not current release certification. See [the versioned release gate](docs/releases/v0.7.0-rc.1.md) and [setup](docs/SETUP.md) for current behavior and limits.

# Blue Orbit redesign — delivery notes

Source: https://github.com/Pranavdeshmukhhh/hackathon-notifier
Original commit: `527dc626c65cf10f0cd75f64129d5aa7431758d0`
Working branch: `codex/blue-orbit-redesign`

The complete repository was copied before editing. The original source archive is
outside the checkout at `/workspace/backups/hackathon-notifier-original.tar.gz`.
No live database, scanner, Telegram notification, or visitor tracking was used for UI QA.

## Changes

- User-requested blue/pink reference direction, glass navigation, responsive layouts,
  floating accents, card transitions, dark theme, and reduced-motion support.
- Reused semantic tokens and shared React components. Metadata remains data-backed;
  unknown registration status is shown as “Check registration.”
- Repaired the API route, API base URL configuration, response parsing, structured
  deadlines, backend description fields, coordinates, team requirements, and share links.
- Query/filter/sort/pagination now go to the server. The client loads 12 rows per page.
  Saved IDs are filtered before server pagination, including events outside the first page.
  Requests abort when replaced, so slow older responses cannot overwrite newer results.
- Public community submissions are separate from admin-only auto-list/scanner routes.
  Suggestions are syntax-validated, rate-limited, deduplicated in `community_submissions`,
  and stored as `pending`. The route performs no URL fetch, publishing, or notification.
  Operators review pending suggestions and use the existing protected listing workflow.
- Cold-cache dataset loading and invalidation are protected by a per-worker lock.
- Dialogs trap focus, make the background inert, lock scrolling, close on Escape,
  and restore focus. Clipboard failures no longer report false success.

## Run locally

```sh
cd Frontend
npm ci
npm run dev
```

Vite proxies `/api` only to `http://127.0.0.1:8000`. For isolated sample-data QA:

```sh
# From the repository root, in another terminal:
python -m venv .venv
.venv/bin/pip install -r Backend/requirements.txt
.venv/bin/python scripts/preview_api.py
```

This preview server uses in-memory mongomock and sample events explicitly titled
“Sample · …”. No fixtures are shipped in the production frontend. Restarting it
clears its records. Screenshots in `artifacts/` show this isolated sample dataset.

## Production deployment

1. Deploy `Backend/` to the existing backend service first. Reuse its configured
   MongoDB/admin/Telegram environment. No credentials are included in this checkout.
2. Deploy `Frontend/` to Vercel (build `npm run build`, output `dist`). The new
   `/api/:path*` rewrite must precede the SPA rewrite. It proxies to the existing
   `https://hackathon-notifier.onrender.com/api/:path*` service.
3. `VITE_API_URL` and `VITE_API_BASE_URL` accept a server root, `/api`, `/api/v1`, or
   `/api/hackathons`. Default is same-origin `/api`. Set custom origins in the backend
   `FRONTEND_URL` and the frontend CSP if bypassing the same-origin proxy.
4. Review a pending community suggestion and verify discovery, saved views,
   registration links, and backend health after deployment.

The original GitHub connection reports **read-only** access. No changes were pushed
or deployed to the original GitHub/Vercel/Render project. Sites build/source helpers
are unavailable in this environment; no separate Sites deployment was created.
The source branch, downloadable archive, patch, and screenshots are the reviewable result.

## Scaling boundary

This is a working redesign and integration repair, not a national-traffic capacity
certification. The client is bounded to a page of data. The existing backend still
holds a projected catalog and TTL cache per process, scans/filter-sorts it in memory,
and uses process-local rate counters by default. Those are material limits.

Before a national launch, measure expected traffic and catalog size with a staging
load test, provision MongoDB capacity and query indexes for the actual access pattern,
move filtering/pagination into indexed database queries if catalog growth warrants it,
use shared rate counters/cache invalidation across replicas, and run scraper/Telegram
workers separately from API replicas. Establish latency/error budgets, backups and
restore checks, monitoring, and an operator process for the suggestion queue.
Do not claim capacity until those checks pass with the intended infrastructure.
