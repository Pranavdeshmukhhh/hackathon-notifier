# Phase 0: recovery and safety

This branch preserves React/Vite, FastAPI, MongoDB, scraper adapters, event
classification, event discovery, and the Telegram subscription workflow. It
does not implement a redesign or migrate the database schema.

## Completed safeguards

- Local full-history Git bundle: `backups/phase-0-baseline.bundle`, verified with
  `git bundle verify`. Private backups are excluded from Git and Docker contexts.
- All seven operational POST routes, including their `/api/v1` aliases, require
  `ADMIN_SECRET`. Missing configuration disables them in every environment.
  Send `X-Admin-Secret` or an `Authorization: Bearer` header from an administrator
  client. Never put the secret in a Vite variable, browser bundle, or localStorage.
- Public scanner controls show status but cannot initiate scans or insert events.
- User-supplied/discovered page fetches and event link probes check URL syntax,
  public DNS answers, redirects, standard ports, TLS hostnames, and response sizes.
  Connections pin the validated IP. Private, loopback, metadata-service addresses,
  credentials, HTTPS downgrades, compression, and excessive redirects are rejected.
  OS DNS resolution can exceed the HTTP time budget; this is not a hard process
  deadline. Known platform feed adapters retain their existing implementation.
- Forwarded client IP headers are ignored unless the direct peer belongs to an
  explicitly configured `TRUSTED_PROXY_CIDRS` range. Cloudflare-specific headers
  require a second explicit opt-in. Uvicorn automatic proxy rewriting is disabled
  in the unified entry point. Alternate launchers must use `--no-proxy-headers`.
- The API lifespan does not start a second scanner. The unified server's scheduler
  defaults off; tokenless Telegram polling returns instead of spinning indefinitely.
- Application visit metrics default off. When enabled, new records omit IP,
  full user agent, referrer, country, and query strings. Visitor Telegram alerts
  are removed. Existing visitor records are preserved. Hosting logs are separate.
- Local Compose MongoDB binds to loopback; it is development infrastructure,
  not a production database deployment.
- CI installs dependencies and runs backend tests plus frontend lint, tests, build.
  Test imports override live credentials before loading application modules.

## Recovery procedure

No live database export or deployment is implied by adding these tools. A complete
export includes subscriber/visitor data and needs an approved private destination.
Treat backups as sensitive, restrict access, and keep an encrypted off-machine copy.

1. Pause every writer before exporting: unified scheduler, external cron jobs,
   manual scan commands, Telegram administrative commands, and administrative API
   writes. The script performs a logical export, not a transaction-consistent snapshot.
   Use Atlas/native snapshots for workloads that cannot pause writers.
2. With `MONGO_URI` configured privately in `Backend/.env`, run from the repo root:

   ```powershell
   python Backend/scripts/backup_database.py export --output backups/mongo-phase-0-baseline
   python Backend/scripts/backup_database.py verify --output backups/mongo-phase-0-baseline
   ```

   Export refuses an existing destination, preserves BSON types, collection options,
   and indexes, and checks file hashes/document counts. Views are unsupported.
   A partial export without a manifest is not a valid backup. Do not reuse that directory.

3. Configure `STAGING_MONGO_URI` to a **separate staging MongoDB deployment**, then:

   ```powershell
   python Backend/scripts/backup_database.py restore --output backups/mongo-phase-0-baseline --database phase0_restore_baseline
   ```

   Restore requires an empty database named `phase0_restore_*`, verifies hashes first,
   recreates indexes, and checks counts. It never drops or overwrites a database.
   A failed restore may leave a partial staging database; use a fresh recovery name.
   Unit tests exercise BSON and unique-index restoration with an in-memory database;
   they do not establish that a real production backup is recoverable.

4. Check restored collections, counts, indexes, and representative records in staging.
   Record the drill result privately. Database users, credentials, cluster settings,
   Atlas search indexes, and deployment settings need separate recovery records.

Git recovery: clone the verified bundle into a separate directory with
`git clone backups/phase-0-baseline.bundle ../hackathon-recovery`. Do not reset a
working checkout with uncommitted changes.

## Deployment gate

Before merging/deploying, confirm a verified live backup and real staging restore,
the previous production commit/build, and a private inventory of Render/Vercel/Atlas
configuration **names and owners** (never commit values). Configure `ADMIN_SECRET`,
`FRONTEND_URL`, `MONGO_URI`, and the intended Telegram credentials. Production must
set `ENVIRONMENT=production`. Record the real reverse-proxy ranges; never trust
`0.0.0.0/0` or `::/0`. Without trusted proxy configuration, clients behind a proxy
share a rate-limit key and can hit limits together.

Choose exactly one scheduling owner. For the existing single-process unified
server, explicitly set `ENABLE_BACKGROUND_SCANNER=true` and
`SCAN_INTERVAL_MINUTES=30` (minimum five). Keep one application process/replica if
using in-process scheduling and Telegram long polling. Multiple replicas/workers
need separate scheduler/bot ownership and shared coordination, which is later work.
Enabling scheduling without completing recovery safeguards is not part of Phase 0.
The frontend's legacy scan countdown is not evidence of a deployed scheduler.

Retain the working scraper adapters, event fields, existing MongoDB collections,
unique indexes, Telegram preferences, and deployment providers. Reverting this
branch restores the prior code but also restores its public administrative access;
disable administrative ingress before such a rollback.

## Verification

```powershell
python -m pytest Backend/tests -q
cd Frontend
npm run lint
npm test
npm run build
```

Tests require local loopback support for Python's Windows asyncio runtime; a
restricted sandbox may prevent its event loop from starting. CI uses Linux.
Use blank Telegram credentials and disabled scheduling for local smoke tests.
Never launch a preview against the live database before the recovery gate.
