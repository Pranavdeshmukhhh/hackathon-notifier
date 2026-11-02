# Setup and deployment

Use Python **3.12** and Node **22.12+**. The tested runtime versions and limits are
in the release checklist. No GPU or paid API is required. Windows execution still
needs a native CI/manual run; timezone data is included for portability.

## Development

From the repository root:

```sh
python -m venv .venv
```

Activate with `.venv\Scripts\Activate.ps1` in PowerShell, or `source .venv/bin/activate`
in bash.
If PowerShell blocks activation, use `.venv\Scripts\python.exe` instead of `python`;
no machine-wide execution-policy change is required.

```sh
python -m pip install -r Backend/requirements.lock
python -m pip check
python scripts/preview_api.py
```

In a second terminal, `cd Frontend`, `npm ci`, `npm run dev`. The browser is at
`http://localhost:5173`. Preview records are labeled fixtures in memory, not real
opportunities or production seeds. No scanner or Telegram worker starts.

For an initially empty real local database, use your own local MongoDB or the
`mongo` service in `docker-compose.yml`; copy `Backend/.env.example` to
`Backend/.env` (`Copy-Item` in PowerShell, `cp` in bash), keep Telegram/tracking/scans
disabled, and run:

```sh
python -m uvicorn api:app --app-dir Backend --host 127.0.0.1 --port 8000 --no-proxy-headers
```

Standalone Mongo supports the bounded small-catalog path. Large catalogs require
a replica set, change streams and explicit publication. Never attach tests to
an existing database or reuse a production volume as a test fixture.

## Complete verification

Docker Desktop/local Docker is needed for the disposable integration fixture:

```sh
python scripts/start_test_mongo.py
```

This creates a labeled, ephemeral `release-ci-mongo`, refuses an existing container,
waits for a primary and prints the test URI. Select it explicitly:

- PowerShell: `$env:PHASE4_TEST_MONGO='mongodb://127.0.0.1:27028/?directConnection=true&replicaSet=phase4'`
- bash: `export PHASE4_TEST_MONGO='mongodb://127.0.0.1:27028/?directConnection=true&replicaSet=phase4'`

```sh
python -m pytest Backend/tests -q --cov --cov-report=json:coverage.json
python scripts/check_coverage.py coverage.json
python Backend/scripts/verify_release_migrations.py --output benchmarks/local/migrations.json
cd Frontend
npm ci
npm run lint
npm run test:coverage
npm run build
npx playwright install chromium
```

With preview API and Vite preview running on 8000/5173, from the repository root:
`node scripts/phase3_browser_qa.mjs` and `node scripts/phase6_browser_qa.mjs`.
`CHROMIUM_PATH` may select an installed browser; otherwise Playwright's downloaded
browser is used. Run `python scripts/start_test_mongo.py --stop` afterward. Coverage
reports/build output are ignored; benchmark evidence is intentional versioned data.

## Deployment settings and rollback

- **API:** build `python -m pip install -r Backend/requirements.lock`; start API-only
  with `python -m uvicorn api:app --app-dir Backend --host 0.0.0.0 --port <host-PORT> --no-proxy-headers`.
  Configure the host's actual port expansion. `Backend/Procfile` instead uses the
  existing unified server: a configured Telegram token enables polling there.
- **Docker:** `docker build -t hackathon-notifier .`; run with a private environment
  file and the configured `PORT`. The non-root image's health check follows `PORT`.
  Optional enterprise proxy CA: BuildKit `--secret id=proxy_ca,src=<CA-bundle>`;
  never disable TLS verification or copy the CA/credentials into an image.
- **Frontend:** Vercel root `Frontend`, build `npm ci && npm run build`, output `dist`.
  Existing rewrites proxy `/api/*` to the Render hostname before SPA fallback.
  Update that hostname if your API differs. Leave VITE API variables unset for the
  proxy; otherwise `VITE_API_BASE_URL` wins over legacy `VITE_API_URL`. Never put
  server secrets in VITE variables. Set exact production CORS/WEBAPP origins.
- **Production:** `ENVIRONMENT=production`, strong private `ADMIN_SECRET`, least-
  privilege Mongo credentials, explicit trusted proxy CIDRs only. Tracking and
  in-server scanning stay false. Check provider current free quotas/sleep/storage;
  the 512MiB local empty-database smoke is not a cloud capacity guarantee.
- **Large views:** publish after writes and before `valid_until`, using an operator
  job with enough build memory. No automatic publication schedule exists. This is
  a rollout blocker above 2,000 public raw rows. Do not publish stale data as success.
- **Migrations:** plan first with `prepare_catalog.py` (no flags), stage a backup
  restore, then explicitly apply metadata/publication. The release drill preserves
  IDs, facts, flags, receipts and checksums; it never reads production.
- **Rollback:** retain the previous application/image and validated backup. Metadata
  is additive and can be read through legacy adapters; do not delete outbox receipts
  or downgrade/rekey raw records. Restore only into a new empty `phase0_restore_...`
  database, republish derived views (old change-stream tokens are not portable),
  verify it, then switch the application URI by an approved operator action.

No deployment, production restore or hosted quota validation was performed here.
