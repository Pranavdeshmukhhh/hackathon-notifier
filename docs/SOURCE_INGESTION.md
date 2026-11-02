# Phase 3 — resilient source ingestion

Local branch `codex/resilient-source-ingestion`, based on `2eaf1c9`.
No production reads/writes, live scans, notifications, pushes or deployments were run.
All new source tests use invented fixtures and mocked/offline fetch functions.

## Changes

- `Backend/source_ingestion.py`: typed SourceAdapter protocol with source_id, name,
  fetch, parse and health; a callable bridge for the eight existing implementations.
  Existing platform fetchers/parsers remain in use. The bridge normalizes records with
  the existing canonical adapter and retains source-provided event IDs.
- `Backend/run_scan.py`: shared source orchestration; existing display-name keys retained,
  stable machine source IDs added. Healthy results survive another source's failure;
  any unsuccessful source makes the overall run fail. Genuine all-empty success exits 0.
  Valid empty feeds no longer contribute to failure streaks.
- `Backend/scrape_job.py`: consumes the actual execution summary and propagates its
  failure exit code, rather than turning a pipeline's failure-as-zero-count into exit 0.
- Four scraper modules: validate recognized JSON envelopes for Devpost/Unstop/HackerEarth;
  distinguish a confirmed empty Devfolio hydration feed from malformed/missing HTML.
  Existing parsing, URL restrictions, pagination and enrichment implementations retained.
- `.github/workflows/scheduled-scan.yml`: bounded manual workflow. The requested file and
  a cron schedule did **not** exist in this checkout; only `ci.yml` existed. CI is unchanged.
  No recurring schedule was invented. The manual workflow defaults to dry-run, has a
  15-minute job timeout, read-only repository permissions and a single scan concurrency group.
- `Backend/tests/test_source_ingestion.py`, four synthetic HTML/JSON fixture files, and
  the existing source-failure test updated to use spawn-picklable test callbacks.
  Existing IDs, Mongo idempotence, notification receipts and entity resolution remain covered.

## Bounds and cancellation

Each source runs in its own subprocess using multiprocessing spawn (also available on
Windows). The parent starts at most SOURCE_WORKERS processes and monitors them without
waiting on an executor shutdown. A timed-out, crashed or cancelled worker is terminated,
joined and, if necessary, killed. Queued sources are not started after cancellation or
exhaustion of the overall budget. Explicit cancellation uses an Event; Python interruption
also runs worker cleanup. IPC is bounded to 8 MB and 2,000 normalized rows by default.
The source ordering and outcome ordering are stable regardless of completion order.

| Environment variable | Default | Allowed |
| --- | ---: | --- |
| SOURCE_WORKERS | 4 | integer 1–8 |
| SOURCE_TIMEOUT_SECONDS | 60 | >0–300 seconds, whole source including startup/retries |
| SOURCE_BUDGET_SECONDS | 240 | >0–600 seconds, whole source batch |
| SOURCE_ATTEMPTS | 2 | integer 1–4, whole-source attempts |
| SOURCE_BACKOFF_SECONDS | 0.5 | 0–5 seconds |
| SOURCE_JITTER_SECONDS | 0.25 | 0–5 seconds |

Backoff is exponential, capped at five seconds, plus uniform random jitter. Attempts
share the source's hard timeout; retrying cannot extend it. Legacy HTTP-level retry
policies remain inside their source process and are also constrained by the wall clock.
No Redis, Celery, browser automation, crawler migration or new dependency was introduced.
`safe_http.py` safety checks remain unchanged; process deadlines also bound an otherwise
stuck fetch/DNS call within a source job.

## Structured health and freshness

Outcomes contain source_id, found, status, safe error code, attempts, rejected,
finished_at, last_success_at and stale. Status values are ok, zero_results, partial,
error, timeout or cancelled. Attempts is explicitly unknown for externally stopped jobs.
HTTP status codes are retained when available; exception text/URLs are not copied into
public telemetry. Existing scraper console logging is unchanged.

The legacy bridge observes scraper warning/error records for reported failures, malformed
schemas and swallowed exceptions. A valid empty list with no failure signal is successful.
Malformed canonical rows are rejected and a partially usable feed reports partial.
Successful retries clear transient health errors. Good rows from a partial source remain
available for canonical ingestion; incomplete timed-out worker results are discarded.

Freshness uses the latest successful fetch, including a valid empty fetch. Failed/partial
sources retain the previous success time; older than 24 hours is stale. Never-seen or
future-clock history remains explicitly unknown. Stable source IDs support display-name
changes, with legacy display names as fallback. History reads use at most 50 recent runs;
older successes can therefore remain unknown rather than falsely fresh or broken.
Source freshness is separate from an individual event's last_seen_at.

## Actual verification

`/workspace/hackathon-venv/bin/pytest Backend/tests -q`:
**379 passed, 1 existing Starlette/httpx deprecation warning, in 9.02 seconds.**

Includes 30 new cases: spawn workers, timeout with healthy sibling, cleanup, queued and
active cancellation, overall deadline, HTTP 429 recovery, malformed payload/HTML/JSON,
partial errors, repeated runs with stable IDs and idempotent Mongo writes, configured
worker cap, invalid configuration, valid empty/stale health and both scheduled exit codes.
All earlier backend regressions remain included. Compilation of changed Python modules
and `git diff --check` passed. Final diff reviewed; frontend and API schemas are unchanged.

## Remaining limitations

- No live source availability, MongoDB service, Windows 11 machine, production throughput
  or GitHub Actions run was tested. Spawn behavior was exercised on Linux with local fixtures.
- Legacy fetch and platform parsing remain coupled; adapter parse performs shared canonical
  normalization. Failure observation cannot discover a legacy error silently swallowed
  without any diagnostic. Some intentionally filtered records do not have rejection counts.
- Retry budgets count source attempts, not every internal HTTP request. Slow enrichment or
  pagination may need larger configured limits. Timeouts lose unfinished page output;
  completed partial batches are retained when the legacy fetcher returns them.
- The 15-minute workflow limit bounds the whole job. Source limits do not independently
  bound subsequent Mongo/lifecycle/Telegram operations; those can exhaust the remaining job
  budget. No claim is made that every production source completes within the defaults.
- Scheduling remains manual-only until an operator supplies the intended recurring schedule.
  This task did not enable automatic production scans or trigger the manual workflow.
