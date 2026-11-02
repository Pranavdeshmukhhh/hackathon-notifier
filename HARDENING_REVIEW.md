# Phase 1: surgical correctness hardening — 2026-11-02

Base: local Phase 3 commit `873c38d`; branch `codex/surgical-correctness-hardening`.
No remote fetch/push, deployment, real user data, live scraper execution or Telegram
sends were used. Tests use mongomock, mocked transports and the in-process ASGI app.

## Reproductions and repairs

| Confirmed defect | Regression / repair |
| --- | --- |
| Positional delivery marking could mark an undelivered event notified; pending events never retried | Failed delivery/retry test; consume explicit fully_sent_links, require all matching recipients, retry pending published events and deduplicate candidates by ID |
| Subscriber lookup hid database failures as an empty subscriber list | Actual unavailable-collection and failed-query tests; optional strict lookup for delivery, preserving the existing default for other callers |
| Failure monitor counted newly inserted current run as historical; duplicate history inflated streak | Two/three-run and duplicated-history tests; monitor before inserting, count distinct prior run timestamps |
| Ingestion overwrote concurrently written notification flags | Deterministic interleaving test; ingestion never writes delivery flags on updates |
| Equal-timestamp ingestions lost concurrent facts/aliases | Revision interleaving and threaded duplicate-insert tests; optimistic revision comparison, compatible with legacy rows without revisions |
| Telemetry/database/notification failures reported success | Persistence, unavailable history, flag-write and deadline-alert tests; failed summaries retain nonzero CLI exit behavior |
| Scan-history outage appeared idle | Both unavailable collection and raised-error tests; return sanitized 503; genuine empty history retains its existing idle contract |
| Stale moderation worker finalized/released another worker's lease | Both API-prefix tests; fence finalization/rollback by lease timestamp, reject unmatched finalization and protect rollback error handling |

The supplied local base contained CLI failure exit codes, but not the named
fully_sent_links and distinct-run monitoring protections; those were restored with
regression coverage. Public successful API schemas remain unchanged. Batch receipts
are additive internal metadata. The scan-status error response now correctly uses 503.

## Changed files

- Backend/run_scan.py
- Backend/api.py
- Backend/event_repository.py
- Backend/notifier/telegram_bot.py
- Backend/db/mongo_client.py (strict subscriber lookup only)
- Backend/tests/test_surgical_hardening.py (25 targeted cases)
- Backend/tests/test_event_reliability.py (mock now supplies actual delivery receipts)
- Backend/tests/test_telegram.py (empty batch includes the receipt field)
- This review record.

## Verification

- Initial reproduction suite before repairs: **8 failed, 3 passed**.
- Subsequent lease/deadline/subscriber regressions reproduced before their fixes.
  The real subscriber helper's hidden failure was separately reproduced: **2 failed**.
- Final command: `/workspace/hackathon-venv/bin/pytest Backend/tests -q`:
  **291 passed, 1 warning in 2.18s**. Existing Starlette/httpx deprecation warning.
- Included security tests cover public URL restrictions, private/mixed DNS resolution,
  redirect destination revalidation, TLS/IP pinning, body limits and admin fail-closed
  behavior. New HTTP rate-limit test confirms forged forwarding headers cannot evade
  the public submission quota and invalid private URLs cannot be queued.
- New source runner test distinguishes a raised source failure from an empty result;
  scan tests distinguish all-failed, genuine empty and successful ingestion runs.
- Python compileall for the five changed production modules: passed.
- git diff --check: passed. Final diff reviewed; no frontend/dependency changes.

## Limits and unresolved risks

- Concurrency tests use mongomock and controlled interleavings, not a live Mongo
  server. Real Mongo multikey indexes/concurrent processes and Windows 11 were not run.
- Delivery remains at least once: retrying a partial batch can resend to recipients
  who already received it. Concurrent scanners are not a distributed delivery lock.
- Failed deadline-change alerts now fail the scan visibly, but do not have a durable
  automatic retry queue; operators must replay them if needed.
- Source adapters that internally swallow exceptions into [] cannot be distinguished
  from genuine emptiness by this runner. No unrelated scraper rewrite was attempted.
- Existing rate limits are process-local; they are not a global multi-worker quota.
  DNS resolution has no portable hard cancellation deadline. No new SSRF bypass was
  reproduced and URL restrictions were not weakened.
- Moderation's event write and queue finalization remain separate Mongo operations;
  lease loss after publication can require administrator reconciliation. No transactions
  or new infrastructure were introduced.
