# Upgrade progress — Phase 1 of 7

Status: functional repairs implemented and locally verified. No UI redesign, deployment,
production write, scanner run or notification send was performed.

## Baseline and architecture established from code

Fresh `git fetch origin --prune` resolved current remote `main` to `b7f8936`.
Worktree: `/workspace/hackathon-phase1`; branch: `codex/phase1-functional-repair`.
The earlier local redesign branch was deliberately not used as this phase's baseline.
The deployed commit and dashboard environment settings cannot be established from this
workspace; live endpoint observations are recorded separately below.

| Area | Actual implementation |
|---|---|
| Frontend | React 19, Vite 8, Tailwind 4, semantic CSS; `src/main.jsx` renders `src/App.jsx`. `Components/hakathoncard.jsx` is a compatibility re-export. |
| API client | `src/utils/api.js`; relative `/api` default. `VITE_API_BASE_URL` precedes legacy `VITE_API_URL`. Values are compiled into the build, not runtime settings. |
| Routes | FastAPI in `Backend/api.py`: `/api/hackathons`, `/api/hackathons/{id}`, `/api/submissions`, with corresponding `/api/v1` router routes. `/api/events` is not a route. |
| Development | Vite proxies `/api` to `127.0.0.1:8000`. Isolated browser server is `scripts/preview_api.py` using mongomock. |
| Production frontend | `Frontend/vercel.json` proxies `/api/:path*` to `https://hackathon-notifier.onrender.com/api/:path*` before SPA fallback to `index.html`. External API hosts must also satisfy CSP and backend CORS. |
| Backend launch | `Backend/Procfile` and Docker launch `unified_server.py`; uvicorn binds `$PORT` or 10000. No Render dashboard configuration/credentials are available for inspection. |
| Database/cache | PyMongo, `MONGO_URI`, database `hackathon_tracker`, collection `hackathons`; unique `link` index, bounded connection pool. Projected public catalog cached in-process; default TTL 10800 seconds. No Redis or shared cache. |
| Paging/search | FastAPI applies search, source/format/status, saved-ID filtering and sorting before pagination; default 12, maximum 100/page. Frontend recognizes server totals and avoids paginating that page again; legacy complete arrays use client filtering/paging. |
| Details/history | Query `event`, legacy query `id`, and SPA `/events/:id` resolve to stored public details. Bookmarks are localStorage IDs, bounded at 200. |
| Geolocation | Browser latitude/longitude become query `lat`/`lng`; backend computes Haversine `distance_km` from stored `lat`/`lng`. |
| Submissions | Public POST `/api/submissions` takes `{url}` and queues review only. Admin auto-list, preview, refresh and scan routes require `require_admin`. |
| Notifications | Unified server runs Telegram polling in a daemon thread; background scanning is explicitly gated by `ENABLE_BACKGROUND_SCANNER`. Standalone scan/main workflows classify/upsert/notify; preserved. |
| Tests/CI | pytest and mongomock; Vitest/Testing Library; oxlint; Vite production build. GitHub Actions runs backend tests and frontend lint/tests/build. Browser QA uses Playwright/Chromium. |

## Confirmed repairs

1. Full historical `/api/events` endpoint environment URLs previously produced paths
   such as `/api/events/api/hackathons`. Normalization now accepts both endpoint spellings,
   versioned roots, trailing slash and blank values, while requests use real hackathon routes.
   `.env.example` now documents precedence, same-origin defaults, rebuilds and public settings.
2. Response envelope parsing selects an actual array among `data`, `events`, `items`.
   Successful HTTP responses with `success:false` now surface the server error. Invalid
   detail responses are rejected. Unconfirmed public submission responses no longer display
   a success message or call the success callback.
3. Only HTTP 404/405 trigger the versioned endpoint fallback. Network errors, timeout,
   abort, malformed payloads and 5xx do not silently repeat requests against another path.
   Existing manual retry and 12-second timeout remain; POSTs are never automatically retried.
4. Closing `/events/:id` or `?id=` now removes the legacy route identity, preserves filters,
   and stays closed after reload. Filter synchronization retains the hash. Late detail fetches
   are cancelled/ignored after history navigation; an old detail is cleared while another loads.
5. Direct detail reads now reject `publication_state=suppressed`, consistent with list reads.
   Existing URL validation, admin dependencies and public projection remain in place.
6. Exact expiry is recomputed from copied cached records on every read, with current active,
   closing and format counts. Exact registration expiry no longer waits for cache TTL/day rollover.
7. Event dates and registration opening timestamps survive database projection and public
   serialization; API schema documents them. Legacy string/dict registration dates remain
   usable without an existing `deadline_iso`. Known event end can archive an ended event
   without inventing a registration deadline. Future registration openings classify as upcoming.
8. Frontend status handles date-only deadlines today after midnight, displays exact structured
   timestamps in Asia/Kolkata, and no longer uses event start/end as deadline-sort substitutes.
9. Physical format aliases (`On-site`, `onsite`, `in person`) normalize consistently; backend
   online filtering/counting now includes `Remote`. Hybrid remains a separate format.
10. Client distance calculation rejects nonfinite/out-of-range coordinates and preserves zero
    coordinates. Backend location fields and zero-distance behavior were verified in regression tests.

## Verified existing behavior retained

Server pagination, searching, source/status filters, registered destination links, bookmarks,
public `{url}` submissions and Vercel proxy ordering already exist in the current revision.
They were inspected/tested rather than replaced with another architecture. The public UI
never calls protected auto-list/scan endpoints. No backend scraper or Telegram file changed.

## Verification results

- Baseline backend: 226 tests passed before repairs.
- Final backend: **229 passed**, one upstream Starlette/httpx deprecation warning.
- Final frontend: **82 passed**, 17 test files.
- `npm --prefix Frontend run lint`: passed, no diagnostics.
- `npm --prefix Frontend run build`: passed; CSS 43.80 kB, JS 251.19 kB.
- `git diff --check`: passed.
- Actual Chromium browser QA: desktop 1440px and mobile 390px, no horizontal overflow;
  search, format, saved persistence, registration destination, focus trap/Escape, server
  pagination, public review queue, theme toggle, reduced motion, loading/error/retry/empty
  states passed with no page errors.
- Additional browser check: both legacy path/id links to an event outside the current
  search open through the detail API, close, and remain closed after reload.
- New regression tests cover 31-record last-page access, saved IDs outside page one,
  suppressed details, cache-time exact expiry, event end separation, structured/legacy dates,
  zero coordinates, aliases, response envelopes, rejected/unconfirmed submissions, stalled
  request timeout, legacy URLs, hash preservation and stale asynchronous details.

Repeat with Python dependencies from `Backend/requirements.txt`, frontend dependencies
from its lockfile, then `pytest Backend/tests -q`, frontend lint/test/build scripts.
For browser QA run `python scripts/preview_api.py` and Vite locally; run
`scripts/browser_qa.mjs` and `scripts/phase1_links_qa.mjs` with Playwright/Chromium installed
(`PLAYWRIGHT_MODULE` can select a preinstalled module). Fixtures remain isolated from production.

## Read-only live observations (30 October 2026)

| URL | Observed result |
|---|---|
| Vercel `/` | HTTP 200 HTML |
| Vercel `/api/hackathons?limit=1` | HTTP 200 JSON with `data`, server totals and stats |
| Vercel `/api/events?limit=1` | HTTP 404 JSON |
| Render `/health` | HTTP 200 JSON |
| Render `/api/hackathons?limit=1` | HTTP 200 JSON with the same response envelope |
| Render `/openapi.json` | HTTP 404; production code disables public OpenAPI/docs |

The proxy and Render connectivity worked at the time of these GET probes. No production
POSTs or database writes were performed. Live submissions/admin mutations/Telegram sends
were intentionally not exercised; local tests cover their boundaries.

## Remaining issues and deployment limits

- Changes are not deployed. Vercel/Render dashboard access and production environment values
  are unavailable. Do not assume either VITE variable's deployed value from documentation.
  Prefer leaving both unset for same-origin `/api`; rebuild if changing either variable.
- Production cold-start latency, source freshness, Telegram delivery and scheduler ownership
  require authorized operational verification. A 12-second client timeout can still expire
  during a long cold start; the UI reports failure and offers retry, not a success state.
- This phase is not a throughput/load certification. Catalog caching is per process; scraper
  coverage and ingestion quality are separate future-phase concerns.
- Original data and historical registration-date semantics were preserved. This phase does
  not rewrite stored source records or infer missing registration dates from event calendars.
- No backend lint tool is configured; the available frontend lint, backend suite and build ran.

## Delivery status

A push of `codex/phase1-functional-repair` was attempted after the local commit.
GitHub returned HTTP 403: the connected account lacks write permission to this repository.
The branch therefore remains local. A source ZIP and patch against remote `main` are
provided as reviewable deliverables; no deployment was attempted.

# Phase 2 of 7 — Event data contract and reliability

Status: implemented on `codex/phase2-event-reliability`, based on Phase 1 commit
`bdb962f`. A fresh remote fetch still resolved `main` to `b7f8936`; all Phase 1
repairs are included. No production scan, migration, database write or notification
send was performed. No UI redesign was made.

## Completed

- Added a typed canonical event model alongside compatible flat API fields, with
  stable existing IDs/aliases, registration destinations, organizer/platform,
  explicit unknowns, format, structured dates/precision/timezone, separate event and
  submission dates, event/registration/publication states, location/coordinate
  evidence, original-currency prizes, team/eligibility, provenance, freshness and
  verification history. Formal JSON Schema and the API contract are in `docs/`.
- Corrected date semantics in all five existing platform parsers: Devpost submission
  period, HackerEarth event end, explicit Devnovate registration deadline, nested
  Unstop registration requirements, and Devfolio registration settings. Event ends
  never substitute for registration dates. Ambiguous legacy provider dates remain
  stored but are no longer advertised as registration facts through read adapters.
- Preserved offsets, local calendar dates and precision through repeated
  normalization. Unknown/DST-ambiguous local clocks are not assigned UTC. Known
  registration opening zones are respected. Exact same-day sorting uses instants.
- Added one ingestion repository shared by scheduled scans, administrator source scans,
  auto-listing, operator import/discovery tools and authorized moderation. It
  reconciles canonical URL aliases, provider IDs and conservative cross-platform
  edition keys; preserves IDs, notification flags, source references and suppression;
  and rejects out-of-order/provider-version regressions.
- Known primary facts survive incomplete updates. Mirror conflicts are exposed and
  retained in the observation ledger; administrator curation has higher authority.
  Possible annual URL reuse is held for review rather than overwriting history.
- Added non-destructive observation/change history. Audit storage failures prevent
  fact replacement. Unique partial/sparse indexes protect concurrent identity claims;
  conflicts fail visibly rather than deleting existing records.
- Replaced lifecycle deletion with archival. Expired, stale and repeatedly dead-link
  records are retained; removal counters remain zero. All-source failure is reported
  as unsuccessful and does not renew source freshness or notify users. Non-network
  housekeeping can still archive genuinely expired/stale records.
- Heuristic screening no longer marks public records verified. Verified state requires
  a credible dated administrator evidence annotation. Publication approval, geocoding,
  HTTP availability, scraping timestamps and heuristic scores are not verification.
- Reconciled duplicate listings before counts/pagination. Provenance platforms remain
  filterable and historical duplicate IDs remain usable as bookmarks/detail links.
  Added `format=Unknown`, cached document search indexes, and non-match-all Unicode search.
- Completed moderation: public URL-only queue, administrator-only paginated queue and
  approve/reject endpoints, immutable submitted destination, idempotent approval,
  private responses, concurrency claims, 15-minute stale lease recovery and failure
  rollback. No URL fetch, scraper or notification is invoked by moderation.
- Removed unsupported default titles/online formats from direct discovery and auto-listing.
  Caption/web dates require explicit registration labels. SPA destination fragments remain
  identity-bearing through public submission and approval.
- Added a read-only operator inventory script. Read adapters preserve existing data;
  no bulk migration/backfill/reconciliation was executed during this phase.

## Contract and repeatable checks

- [API contract](docs/EVENT_API_CONTRACT.md)
- [JSON Schema](docs/canonical-event.schema.json)
- Integration/regression coverage: `Backend/tests/test_event_reliability.py`.
- Frontend compatibility coverage: `Frontend/src/__tests__/Phase2Compatibility.test.jsx`.
- Operator inventory: `python Backend/scripts/audit_event_contract.py` with an explicitly
  configured `MONGO_URI`; it reads records and reports candidate IDs/counts without writes.
  Tests call its pure audit function against mongomock only.

## Actual verification results

- Backend: **266 passed**, including all Phase 1 tests. One upstream Starlette/httpx
  deprecation warning. Source payloads and malformed data are local fixtures.
- Frontend: **84 passed**, 18 files, including duplicate-bookmark compatibility.
- Frontend lint: passed, no diagnostics. Production build: passed.
- Production build: JS 251.68 kB (77.94 kB gzip), CSS 43.80 kB (9.53 kB gzip).
- `git diff --check`: passed.
- Actual Chromium: desktop/mobile search, formats, pagination, persistent saves,
  registration links, detail focus/closing, public submission, loading/error/retry/empty
  states, reduced motion and overflow passed against the isolated sample API.
- Phase 1 legacy path/id detail links outside current results still open, close and
  remain closed on reload. No browser page errors.
- Mocked full scan integration verifies canonical persistence, retained expired
  history, duplicate reconciliation and notification idempotency without real scrapers
  or Telegram sends.

## Deployment and remaining operational checks

- Code and schema are local; no production deployment was changed.
- Staging Mongo validation of partial/multikey unique indexes and concurrent writers
  is still required before production rollout. The automated integration suite uses
  mongomock, not a real Mongo service or a load test.
- Read the operator inventory/backup before adopting indexes. Conflicting pre-existing
  indexed metadata requires explicit operator reconciliation; there is no destructive
  automatic cleanup. Historical IDs and records are retained.
- The observation ledger and public event update are separate Mongo writes, not a
  cross-collection transaction. A failed attempt can leave an audit observation; it is
  not itself proof that a public record update committed. Claims/retries retain identity.
- Reused annual URLs with uncertain edition identity require administrator review.
  The system does not invent a unique registration URL or silently replace that edition.
- Verification coverage and discovery freshness depend on real source evidence and
  authorized operational checks. No claim is made that existing records are verified,
  that every source is reachable, or that production throughput is certified.
- Phase 2 push was attempted and GitHub again returned HTTP 403 for the connected
  account. The branch remains local. Source deliverables preserve both phases; deployment
  needs repository/hosting write access.

---

# Phase 3 — Signal Index frontend redesign (2026-10-30)

Branch: `codex/phase3-signal-design`, based on Phase 2 commit `c9c6689`.
Phase 1–2 functionality is retained. This phase changes the frontend and local QA/docs;
no backend, scraper, database schema, Telegram or authorization code was replaced.

## Implemented experience and design decisions

- Original orbit/trajectory identity with midnight/ink foundations, blue navigation and
  restrained citron emphasis. Warm-grey light mode shares the same hierarchy. The new
  direction supersedes the earlier blue/pink reference and pine visual directions.
- Editorial Geist typography, JetBrains Mono metadata, precise hairlines, opaque cards,
  quiet borders and limited navigation/modal translucency. Fonts are self-hosted WOFF2
  with OFL licenses; runtime external font requests are removed.
- Rebuilt header, compact introduction, two-column event cards, compact row view,
  registration-first facts, separate title/detail/save/share/organizer actions, saved
  directory, footer and informational views. Small screens use one column, collapsible
  filters and a collapsed-by-default signal field.
- Custom interactive SVG/HTML opportunity field uses **only the current API page**,
  explicitly labeled. Radius represents registration timing; direction represents
  format. Rings are reference intervals, not analytics. Stable IDs determine placement.
  A native selector provides access when plotted targets overlap. Points and unknown
  records open the existing deep-linked detail view.
- Date calculations reject malformed dates and clocks without offsets, honor known
  date-only source zones (UTC fallback when unknown), and exclude expired exact instants.
  Event/submission ends never substitute for registration cutoffs. Unknown/closed dates
  stay outside the field rather than becoming fabricated future opportunities.
- Independent closing-windows feed calls the existing public API with
  `status=closing&tab=upcoming&sort=deadline&limit=3`. It validates actual registration
  facts and has its own abort/loading/error/retry/empty behavior. Its view-all action
  clears unrelated filters before opening the directory-wide closing list.
- Detail views retain focus containment/restoration, sharing, saving and official links.
  They show available provenance, stale-source/conflict disclosures and honest
  verification context. Unsafe provenance schemes and credential-bearing links are
  omitted; existing backend URL restrictions remain intact. Long detail values wrap.
- Structural loading skeletons, useful empty/error recovery, labeled retained results
  during refresh/failure, and clearer saved-list states. Unavailable saved events do not
  erase bookmarks or falsely imply that no bookmarks exist.
- Fixed inherited horizontal-overflow rules that prevented sticky navigation. The header
  and search toolbar now stay aligned when scrolling, with responsive offsets.
- Short card/dialog entrances and selection/control transitions; reduced-motion
  preferences remove CSS motion and smooth navigation. Named icon controls, visible
  keyboard focus, a skip link and coarse-pointer touch targets remain supported.

No listings, counts, dates, verification claims or scan activity are invented. Browser
screenshots use the clearly labeled samples in the isolated preview API; those fixtures
are not imported into production frontend code. No production scans, data writes or
Telegram notifications were triggered.

## Files changed

- Identity/tokens: `Frontend/src/orbit.css`, `Frontend/src/index.css`,
  `Frontend/index.html`, `Frontend/public/favicon.svg`, `Frontend/public/fonts/`,
  `Frontend/DESIGN_SYSTEM.md`.
- Discovery: `Frontend/src/App.jsx`, `HomeIntro.jsx`, new `SignalField.jsx`, new
  `ClosingWindows.jsx`, `DiscoveryControls.jsx`, `HackathonCard.jsx`, `SkeletonCard.jsx`
  under `Frontend/src/components/`, and new `Frontend/src/utils/signalField.js`.
- Details/information: `EventDetail.jsx`, `HowItWorks.jsx`, `AboutProject.jsx`,
  `TechSpecModal.jsx`, `TermsAndConditions.jsx`, `ScrollToTop.jsx`; theme metadata in
  `Frontend/src/hooks/useDarkMode.js`.
- Regression coverage: new `SignalDiscovery.test.jsx`; source-evidence, retained-result
  and saved-state cases in existing tests. Existing UI selectors now address result
  headings explicitly because map/list/closing sections can legitimately repeat titles.
- QA: `scripts/browser_qa.mjs`, new `scripts/phase3_browser_qa.mjs`, and screenshots
  under `artifacts/` (Phase 3 named captures include both themes and phone details/map).

## Actual verification results

- Frontend: **98 tests passed in 19 files**, no unhandled errors in the final run.
  Includes all Phase 1–2 compatibility coverage and 14 new regression cases.
- Backend: **266 tests passed**, one existing upstream Starlette/httpx deprecation warning.
  The restricted-environment attempt stalled in the async test harness and was stopped;
  the completed run with required local connectivity passed in 2.76 seconds. Fixtures
  and notification/scanner isolation remained enabled.
- Frontend lint: passed, no diagnostics. Production build: passed.
- Build output: JS **262.07 kB / 81.77 kB gzip**; CSS **60.25 kB / 11.20 kB gzip**.
  Self-hosted font files add approximately 60 kB and retain their license notices.
- Chromium `scripts/browser_qa.mjs`: search, format filters, pagination, persistent
  bookmarks, official links, detail focus trap, public review submission, light/dark,
  mobile filters, reduced motion, loading/outage/retry/empty states passed; no page errors.
- Chromium `scripts/phase3_browser_qa.mjs`: API-backed map membership/selection,
  detail deep links and focus return, global closing action from filtered search,
  row/grid switching, local fonts, theme persistence/metadata, guide/details,
  expanded mobile map, sticky header/toolbar alignment and no document overflow at
  **320, 390, 768, 1024 and 1440px** passed.
- Chromium `scripts/phase1_links_qa.mjs`: legacy path/id details outside the active
  result set still open, close and remain closed after reload.
- Desktop/mobile dark and light captures were visually inspected. This is Chromium
  emulation and local fixture testing, not certification across all physical devices,
  accessibility conformance, production source availability or large-scale throughput.
- `git diff --check`: passed.

Repeat frontend tests/lint/build through `Frontend/package.json`. For browser checks,
start only `scripts/preview_api.py` and local Vite, then run the three browser scripts
with Playwright/Chromium (`PLAYWRIGHT_MODULE` may point to an installed module). Never
substitute a live database or enable scans/notifications for UI QA.

## Remaining deployment and operational issues

- The redesign has not been deployed. The Phase 3 branch push was attempted and GitHub
  returned HTTP 403: the connected account lacks repository write permission. The branch
  remains local; repository/hosting write access is required for rollout. The ZIP handoff
  includes the cumulative Phase 1–3 source, production build, screenshots and check logs.
- Phase 2 staging Mongo index/concurrent-writer validation and source-evidence coverage
  remain operational checks. This UI phase neither certifies listing volume nor marks
  incomplete source records verified. No claim of 400–500 current opportunities is made.
- The current-page field intentionally shows a bounded result set; server pagination and
  global closing discovery remain available through the repaired APIs. It is not a map
  of every event in the database or a geographic distance view.

## Backend Phase 5 — durable notification outbox

Implemented locally on `codex/durable-notification-outbox`, based on the indexed
API branch. No push, deployment, production data access, live Telegram messages
or production scans were performed.

- Added immutable recipient rosters, resumable fan-out, unique event/version/
  channel/recipient delivery records, majority writes, atomic claims and lease tokens.
- Added pending/processing/delivered/retryable/failed states, interrupted-worker
  recovery, exponential bounded retries, persistent Telegram 429 cooldown and
  a one-shot `--notifications-only` worker mode.
- Legacy event flags require a complete acknowledged roster and matching current
  version. Receipt reconciliation survives interrupted flag writes; ingestion
  preserves independently written delivery metadata. Duplicate batches do not
  count old receipts as new sends.
- Added bounded/fair unnotified-event recovery, including valid empty-source runs.
  Opt-outs/preferences are rechecked before delivery. Explicit admin unsubscribe
  persists; `/help` no longer silently re-enables alerts. Setting-write failures
  do not claim success; sensitive exception strings/chat identifiers are omitted.
- Added 65 regression cases covering mocked and actual disposable local MongoDB
  8.0.34 behavior. Telegram transports were mocked throughout.

Verification: **519 backend tests passed, one existing Starlette/httpx warning,
41.06 seconds**. Python compilation and `git diff --check` passed. Hosted CI,
Windows and live Telegram were not tested; no backend lint target is configured.

Changed files and delivery semantics are documented in
[NOTIFICATION_OUTBOX.md](docs/NOTIFICATION_OUTBOX.md). At-least-once attempts can
duplicate messages after uncertain external acknowledgment; attempts are bounded.
Initial ingest-before-enqueue crashes recover through the backlog. The preexisting
deadline-change ingest-before-enqueue gap remains; deadline alerts are durable
once their intent is stored. Terminal failures retain their reason and need
explicit operator review rather than fake delivered flags or automatic resets.

## Frontend Phase 6 — lean Blue Orbit

Implemented locally on `codex/lean-blue-orbit-frontend`; no push, deployment,
production access or notifications. No backend source or public API changed.

- Split feed/detail/bookmark responsibilities into hooks and extracted header,
  footer/listing states. `App.jsx` reduced from 927 to 497 lines. Scroll updates
  no longer re-render discovery cards; auxiliary modals share one active state.
- Removed six confirmed unused/redundant files, unused icon exports, four unused
  direct dependencies, 438 overridden CSS declarations and 16 unused selectors.
  Retained dynamic classes, fonts, all discovery features and both themes.
- Improved mobile filter scrolling/Escape/focus, 16px inputs, 44px clear target,
  dialog/editor shortcut isolation, location pending/reset handling and cancellable
  off-page detail loading/retry. No new project/UI dependencies.
- All requested checks passed: `npm ci`, lint, **104 tests in 20 files (12.28s)**,
  production build and diff checks. Browser QA passed against dev and production
  preview in Chromium 151, 320–1440px, both themes/reduced motion, all fixture-only;
  zero uncaught page errors. Windows/Safari/Firefox and live API remain untested.

Entry assets: JavaScript **262.071 → 263.375 kB**, CSS **60.258 → 50.422 kB**;
combined **322.329 → 313.797 kB**. JavaScript grew slightly with the recovery fixes;
CSS shrank 16.32%. No functionality was removed for metrics. Fonts/HTML unchanged.
Full removals, method, behavior changes and limitations:
[LEAN_FRONTEND.md](docs/LEAN_FRONTEND.md).

## Phase 7 — final release gate (v0.7.0-rc.1)

Local candidate only, branch `codex/release-gate-v0.7.0`. Full locked backend suite
520 passed; frontend 104 passed, lint/coverage/build passed. Audits reported zero
known Python/npm advisories; high/high static findings and tracked-tree secrets zero.
Added enforced coverage and security/image/migration/browser CI gates, locked Python
versions and shipped JS/project license notices. Fixed reproduced nested Docker
secret inclusion, unreadable non-root source, dynamic health-port handling and
missing IANA timezone data. Local synthetic migration/restore and benchmark checks
passed. Hosted CI/native Windows/cloud rollout were not run.

Release is **not production-ready**: source permissions/prohibited discovery paths,
large-view refresh operations, staging/account quota checks and explicit maintainer
approval remain. At-least-once notification limits and the pre-enqueue deadline gap
remain documented. No push/deployment, user data, production scan or live send.
See [the concise versioned release gate](docs/releases/v0.7.0-rc.1.md) for commands,
PASS/FAIL results, benchmark evidence, remaining risks and the required checklist.
