# Phase 5: data reliability and rollout

This phase keeps FastAPI, MongoDB, the current source adapters, API routes, event
IDs, frontend, registration links, and Telegram subscription commands. No live
database migration or notifications are part of development verification.

## Write and delivery boundaries

`run_scan.execute_scan` owns scheduled publication. `main`, `scrape_job`, the
internet scanner, administrator submissions/scans, and import scripts use
`IngestionService`. Source adapters return observations rather than writing data.

- Known source ID plus platform and canonical public URL identify an event.
  Only tracking parameters are removed. Path case, edition queries and fragments
  remain significant. Similar titles never merge automatically.
- Existing `_id` values survive updates. Conflicting identities need operator
  review. Reviewed migration aliases keep older detail links working.
- Field provenance records source, authority and observation time. Explicit
  administrator facts outrank structured platform facts, which outrank discovery
  guesses. Unknown or absent observations do not erase facts. Explicit admin nulls
  can clear optional facts; inferred metadata cannot override protected fields.
- Registration dates, event ends and submission dates are distinct. Unlabelled,
  ambiguous or invalid dates remain unknown. An explicit offset timestamp retains
  UTC precision; a calendar date remains a date. Closure/cancellation evidence is
  retained. A future deadline alone does not reopen a cancelled event.
- Routine maintenance archives or suppresses events and retains IDs. It never
  purges them or runs external link requests inside a scan transaction.
- Scan workers and manual source scans acquire a renewable, token-fenced MongoDB
  lease. Each source process has a 90-second budget, at most 2,000 observations,
  and an 8 MB result budget. Timed-out children are terminated and reaped. Sources
  report `ok`, `partial`, `zero_results`, `empty_unconfirmed` or `error`. Empty HTML
  or a swallowed provider failure is not proof of zero available events. Provider
  markup and APIs can still change; source status needs operational monitoring.
- Production publication requires a replica set (or Atlas),
  `PHASE5_WRITE_TRANSACTIONS=true`, and migrated records. A transaction touches the
  lease, writes the event and durable intent, and increments the dataset generation
  with snapshot reads and majority writes. Development standalone MongoDB uses
  ownership checks and revision comparison only; it cannot offer those guarantees.

Discovery creates bounded intents embedded with each event. The separate delivery
worker expands them into a unique record per intent and recipient, then removes
the intent. Reconciliation is idempotent if interrupted. Subscribers joining after
discovery do not receive the historical discovery. Eligibility/preferences are
checked again immediately before sending. Queued sends use current facts;
deadline corrections go only to recipients with a confirmed prior delivery and
are suppressed when they already received the current revision.

Delivery states are `pending`, `sending`, `sent`, `failed`, and `uncertain`. A real
Telegram response stores `message_id`. Provider rate limits pause the entire
worker persistently. Ambiguous network/server outcomes and a worker stopped while
sending become `uncertain` and are not blindly resent. Telegram provides no
idempotency key, so exactly-once external delivery cannot be promised. Review an
uncertain outcome before deliberately requeuing it. Legacy `notified` remains a
compatibility field; it cannot prove delivery to every subscriber. It is never
used to mark old events for rebroadcast. Three consecutive failed/unconfirmed
source runs queue one administrator health alert per failure episode.

The API polls the shared dataset generation at most once per five seconds and
expires its local dataset cache within 60 seconds. HTTP caching permits another
60 seconds and requires revalidation after expiry. Public reads never mutate
events, create indexes, geocode, or send messages. Public projections hide backups,
provenance, leases and delivery records; scan telemetry omits stored exceptions.

Geocoding is optional (`ENABLE_GEOCODING`). Exact location queries share a persistent
positive/negative cache and provider lease, with at least 1.1 seconds between
requests. No country fallback is invented. A geocoded point has unknown precision
unless a source explicitly supplies venue/city precision. Configure a contact
`GEOCODER_USER_AGENT` before enabling public Nominatim use.

## Collections and indexes

Existing: `hackathons`, `subscribers`, `visitors`, `scan_history`.
Additional: `job_leases`, `event_aliases`, `dataset_state`,
`notification_deliveries`, `delivery_state`, `geocode_cache`.

`ensure_indexes` manages unique links, unique multikey identity keys, unique
delivery keys and subscriber chat IDs, delivery state/next-attempt lookup, alias
targets, and scan history timestamps. Index creation is an explicit migration or
write/startup operation. It refuses unmigrated production records. Do not add a
TTL index to deliveries or event history before agreeing on a retention policy.

## Restore, inspect and migrate

1. Freeze **all** event writers, including cron, manual scans/imports, bot
   `/scrape_now`, delivery and polling roles. Use the Phase 0 backup utility or a
   database-native snapshot. Store backups privately; a logical export is
   consistent only while writers are stopped. Verify checksums and restore into
   an empty `phase0_restore_*` database on a separate staging deployment.
2. Keep staging delivery, polling, scanning, geocoding and tracking disabled.
   Use explicit staging environment variables. Never preview with live credentials.
3. Run the report first. It prints record IDs and categories rather than private
   documents. Review uncertain dates and invalid records against organizer sources.
   If duplicates collide, choose the retained event manually; preserve any richer
   facts in that retained record before applying. Alias application does not merge
   facts from another record automatically.

```powershell
$env:STAGING_MONGO_URI = 'mongodb://127.0.0.1:27019/?replicaSet=phase5test'
python Backend/scripts/migrate_phase5.py --database phase0_restore_review
```

4. Create a **private**, reviewed JSON mapping from old IDs to retained IDs if
   needed. Each group must map directly to one retained event with the same
   canonical URL or a known source identity. Prior URLs remain identity keys on
   the retained event. Chains, unrelated mappings, invalid records and oversized BSON backups fail before
   application. The tool applies only to restored database names; it never loads
   credentials from `.env`.

```powershell
python Backend/scripts/migrate_phase5.py --database phase0_restore_review --apply
# For reviewed collisions, append: --aliases <private-reviewed-json-path>
```

5. Verify counts, indexes, preserved IDs, unknown fields, aliases, cancellation,
   list/detail/filter contracts and zero new notification intents. Rerunning apply
   skips already migrated records. Rollback is allowed only on an unchanged clone:

```powershell
python Backend/scripts/migrate_phase5.py --database phase0_restore_review --apply --rollback
```

   The migration stores each original record privately with a digest of its
   migrated state. Rollback refuses to erase subsequent writes. For a changed
   clone, restore the verified original backup into a fresh recovery namespace.
6. Before live cutover, repeat the backup/restore/migration under a writer freeze
   to capture the final data. Deploy code with background roles disabled. Point
   `MONGO_URI` and `MONGO_DB_NAME` at the reviewed migrated namespace after the
   operator approves promotion. The default database remains `hackathon_tracker`.
   Do not apply a rehearsal migration to an active database.
7. Verify a transactional write and cache invalidation against controlled staging
   records first. Enable `PHASE5_WRITE_TRANSACTIONS=true` for production writes.
   Enable exactly one scheduler: in-server `ENABLE_BACKGROUND_SCANNER=true` or an
   external cron calling `Backend/run_scan.py`, never both. Start one Telegram
   polling role (`ENABLE_TELEGRAM_POLLING=true`) and opt into the durable worker
   (`ENABLE_NOTIFICATION_DELIVERY=true`) separately. Leave delivery off until
   inspecting pending intents, active recipients, and any legacy queues.
8. Monitor `scan_history` source outcomes, lease expiry, pending/uncertain delivery
   counts, failed attempts, database transaction errors, and dataset generation.
   Stop writers before reverting code/database configuration. Keep the original
   snapshot until the operator accepts the cutover. No infrastructure or live data
   promotion is performed by this code change.

## Verification

The default tests explicitly disable real credentials and background side effects.
Real MongoDB integration tests require an isolated **loopback replica set on port
27019**, generate fresh `phase5_restore_*`/`phase0_restore_*` databases, and remove
only those test namespaces afterwards. Never substitute a production URI.

```powershell
$env:PHASE5_INTEGRATION_URI = 'mongodb://127.0.0.1:27019/?replicaSet=phase5test'
python -m pytest Backend/tests -q
cd Frontend
npm test
npm run lint
npm run build
```

Without that variable, five real-database tests explicitly skip. Unit tests alone
do not verify MongoDB transaction rollback, lease contention or multikey indexes.
The integration suite also rehearses a BSON backup, restore, migration and rollback.
No test sends Telegram messages or scrapes live provider data. Live source smoke
checks, production deployment, notification outcome reconciliation, and further
pagination/performance work remain separate operator tasks.
