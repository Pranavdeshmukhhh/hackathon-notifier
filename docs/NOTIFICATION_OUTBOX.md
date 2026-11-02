# Durable Telegram delivery

Phase 5 adds a Mongo-only outbox. Existing public event/API schemas, scanner
opt-in safeguards and Telegram command names are preserved. No production data,
Telegram endpoint, deployment or scheduled production scan was used to verify it.
Event batches and deadline-change alerts use the outbox. Interactive replies,
administrator broadcasts and operational warning alerts remain direct sends.

## Stored contract

| Collection | Purpose |
|---|---|
| `notification_intents` | Immutable event snapshot, version, kind and frozen recipient roster; resumable fan-out |
| `notification_outbox` | One delivery per event ID, event version, channel and recipient |
| `notification_control` | Persistent Telegram channel cooldown after HTTP/API 429 |

Delivery tuples have a unique compound index and deterministic hashed `_id`.
Concurrent upserts reuse the winning immutable roster. Event versions hash
notification fields, message-format version and notification kind/context;
observation timestamps and notification flags do not create new versions.
BSON UTC millisecond normalization keeps versions stable across datetime decoding.
Scans use the existing event `_id`; legacy callers without IDs use a hashed,
safety-checked canonical registration URL. No existing event IDs are replaced.

The intent is written before its delivery rows. Only fully persisted fan-out
becomes claimable. A later worker repairs interrupted planning/readiness without
resetting receipts. New subscribers are not retroactively added to an old roster.

Delivery states:

- `pending`: durable, never claimed.
- `processing`: atomically claimed with a unique ownership token and lease.
- `retryable`: uncertain/transient failure with a persisted next-attempt time.
- `delivered`: Telegram returned HTTP 200 with explicit `ok: true` and the receipt
  was committed. An available Telegram message ID is retained.
- `failed`: permanent rejection, opt-out, superseded/unavailable event, or exhausted
  attempt budget. The safe machine-readable reason remains on the row.

Default policy is a 60-second lease, five claims/attempts and exponential delays
of 2, 4, 8 and 16 seconds (general cap 3,600 seconds). Lease recovery consumes an
attempt as well. Atomic `find_one_and_update` claims and token-checked completion
prevent another worker from acknowledging a stolen lease. Expired final attempts
become failed, never delivered. Writes use majority acknowledgment; no multi-row
transactions or replica-set-only feature is required by the outbox itself.

The durable sender makes one HTTP attempt with a 10-second requests timeout;
it does not nest tenacity retries. API/HTTP 429 persists `retry_after` for the job
and a shared channel cooldown, then stops that drain. Other already-in-flight
workers may still finish. Malformed retry values use five seconds. Transport
timeouts, connection errors, server errors and uncertain responses are retryable;
client rejections are terminal. Workers pace attempts by 1.5 seconds locally.

## Consent, flags and recovery

Preference matching happens when planning and again immediately before sending.
Inactive/deleted subscribers and changed preferences prevent an old queued send.
The configured default admin remains a recipient only while no explicit opt-out
or conflicting saved preference exists. An unsubscribe now persists even if that
chat had no previous subscriber record. `/help` preserves opt-outs/preferences;
`/start` and explicit preference changes can re-enable alerts. Failed setting
writes no longer display a successful unsubscribe acknowledgment.

Only a nonempty complete roster of delivered receipts can set legacy `notified`.
Reconciliation checks the current event version/publication state and uses the
ingest revision for compare-and-swap. Ingestion cannot overwrite independently
written notification versions or backlog timestamps. A crash after committing
all receipts but before the event flag is repaired without another send; receipt
reconciliation can also run without Telegram credentials. Deadline-change
receipts never mark the initial-event flag.

`fully_sent_links` represents complete durable rosters. `sent` counts event
versions receiving a new committed delivery during that call, not old receipts
recounted on a duplicate scan. `total`, `sent`, `failed`, `fully_sent_links` remain
available. Optional `pending` and `errors` expose incomplete work. Pending is the
larger of unfinished row/intent counts, an outstanding-work indicator rather
than a count of distinct events. A previously completed batch can have zero
new sends and zero failures while retaining its confirmed link.

Scans recover up to 100 unnotified eligible events committed before enqueue,
even on valid empty source runs. A persisted `notification_checked_at` rotates
the bounded backlog so terminal failures cannot starve newer events. Only
top-college/internship opportunities retain the scanner's automatic alert
eligibility. Existing queued work drains even when the new-event list is empty.
Source-failure-only empty scans retain their previous behavior; a separate worker
can recover delivery independently of scraping.

Each drain claims at most 100 jobs and starts no further job after its 60-second
budget. One in-flight HTTP call/pacing can exceed that soft boundary. Planning
large recipient rosters and individual Mongo operations are outside the send-loop
budget. Every drain is one-shot; no always-on worker is required:

```sh
python Backend/run_scan.py --notifications-only
```

This command uses the existing Mongo/Telegram configuration and can be invoked
by an existing scheduler. It does not scrape. It exits nonzero for unresolved
pending work or a current delivery/persistence failure. No automatic production
schedule was enabled. `--dry-run` cannot be combined with `--notifications-only`.
Normal dry-run scanning does not create outbox data or send notifications.

Terminal failures remain queryable by administrators in Mongo, with per-recipient
reasons and attempts. They are not silently reset by another scan. Correct the
underlying cause before an authorized operator considers a targeted requeue;
there is no public requeue endpoint and no automatic receipt deletion/TTL.
Historical failures do not make every empty worker invocation fail forever.

## Delivery limits

This is **at-least-once attempted delivery with bounded retries**, not exactly-once
delivery or a guarantee that a recipient eventually receives a message.
Telegram `sendMessage` provides no client idempotency key. If Telegram accepts a
message and the worker crashes before committing its receipt, or an HTTP timeout
hides the acknowledgment, lease recovery may send it again. A final uncertain
attempt can exhaust the budget without a delivered receipt. Successful known
recipients are never deliberately resent within the same event version.

The subscription read and external send cannot be one atomic Mongo operation:
an unsubscribe racing after the final consent check may overlap an in-flight
message. Workers need reasonably synchronized UTC clocks; a pause beyond the
lease can also produce an uncertain duplicate. Meaningfully changed notification
content creates a separate version; stale pending snapshots are rejected.

Source ingestion and outbox creation are separate commits. Initial unnotified
events recover through the bounded backlog. Deadline-change alerts become
durable once their intent is committed; a crash between the source change and
that enqueue can still lose that particular change alert. Closing that existing
ingest/change-log gap would need separate transactional/change-ledger work.
Legacy `notified=True` rows are preserved without inventing per-recipient receipts;
old partially delivered rows may be resent once during adoption because their
historical recipient acknowledgment is unknowable.

Chat IDs are necessary in private delivery/consent records. Notification errors
log only fixed codes or exception class names, without response bodies, request
URLs, chat selectors or exception strings. Existing database access restrictions
remain unchanged. No Telegram token is stored in a delivery row.

## Verification

Final local backend suite: **519 passed, one existing Starlette/httpx deprecation
warning, 41.06 seconds**. This includes **65 new outbox regression cases**.
Python compilation and `git diff --check` passed. No backend lint target is
configured; frontend files were unchanged and frontend checks were not run.

Tests use synthetic events, Mongo doubles, a disposable local MongoDB 8.0.34
replica set, and mocked Telegram transports. Covered cases include duplicate
fan-out, compound uniqueness, concurrent claims, lost ownership, crashes before
and after send, interrupted fan-out, partial delivery, restart, timeout, 429,
attempt exhaustion, BSON versions, opt-out/settings commands, fair backlog
recovery and reconciliation after flag-write failures. The crash cases simulate
interruption by withholding acknowledgment/recreating worker instances; they do
not certify live Telegram behavior or actual operating-system process kills.

```sh
PHASE4_TEST_MONGO='mongodb://127.0.0.1:27028/?directConnection=true&replicaSet=phase4' python -m pytest Backend/tests -q
```

The existing CI loopback Mongo fixture is reused; Phase 5 database names are
random `benchmark_phase5_*` names dropped on teardown. Integration cases skip if
that explicit local test URI is absent. No production URI is accepted by them.
Windows and hosted CI have not been run; there are no added dependencies.

Changed files: `Backend/notifier/outbox.py`, `Backend/notifier/telegram_bot.py`,
`Backend/run_scan.py`, `Backend/db/mongo_client.py`, `Backend/event_repository.py`,
`Backend/tests/test_notification_outbox.py`, `Backend/tests/test_telegram.py`,
`Backend/tests/test_surgical_hardening.py`, `Backend/tests/test_event_reliability.py`,
`Backend/tests/test_source_ingestion.py`, `Backend/tests/conftest.py`, this document
and `UPGRADE_PROGRESS.md`.
