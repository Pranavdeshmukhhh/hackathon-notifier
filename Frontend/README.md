# Hackathon Notifier frontend

React 19, Vite 8, Tailwind 4, and semantic CSS. The visual and accessibility rules
are in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md). Extend these primitives instead of
introducing a separate theme or landing-page template.

Students can search titles, topics, campuses, and venues; combine format, platform,
and event filters; browse upcoming and past listings; and open a shareable event
detail page. Registration remains on the organizer's website. Unknown facts are
shown explicitly. Telegram subscriptions remain available through the existing bot.

## Local development

Run `npm ci`, then `npm run dev` in `Frontend/`. Development defaults to the local
API at `http://localhost:8000`. It never falls back to production. For UI QA, use an
isolated API with labeled sample events and disable scanning, tracking, geocoding,
and notification delivery. Do not point a UI preview at live records.

Copy `.env.example` to `.env.local` if a different isolated port is needed.
`VITE_API_URL` accepts a server root, `/api`, `/api/v1`, or the full listings endpoint.
It is public build-time configuration; never place credentials in a `VITE_` variable.

## Verification

- `npm test`: mocked API regression tests.
- `npm run lint`: static checks.
- `npm run build`: production build.
- Browser QA: narrow and wide layouts, light/dark, keyboard focus, filtering,
  details, loading, empty, failed requests, retry, and blocked clipboard access.

Requests have bounded timeouts. Failed refreshes preserve previously loaded
listings with a notice. A failed initial request is an unavailable state, not an
empty result. Local query caching and HTTP ETags reduce repeat loading.

## Vercel deployment

Use `Frontend` as the project root, `npm ci` as the install command,
`npm run build` as the build command, and `dist` as the output directory.
Production defaults to `https://hackathon-notifier.onrender.com`; explicitly set
`VITE_API_URL` if the backend differs. Rebuild after changing it, and update
`vercel.json`'s CSP and the backend CORS origins for a different server.

The production branch must contain the desired frontend commit. Pushing a phase
branch alone does not update a Vercel production deployment following `main`.
Confirm the deployed commit and call the public listing endpoint: `/health` only
confirms database connectivity, not the complete listings read path.

`vercel.json` provides SPA rewrites and security headers. Event details use
`#event/<MongoDB ID>`, preserving the existing routing and discovery URL filters.
Scanner status is read-only; administrative write operations require the API's
existing authorization. Opening a dialog or refreshing listings never starts a scan.
