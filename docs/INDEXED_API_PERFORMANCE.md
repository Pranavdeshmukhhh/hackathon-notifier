# Indexed catalog execution — Phase 4

## Query behavior and compatibility

Raw Mongo filters cannot safely precede canonical coalescing: secondary source
aliases, fuzzy duplicates and global statistics would disappear. An explicit
operator publication creates an immutable canonical read collection with the
existing `public_event`, coalescing, sorting and statistics implementations.
Source records, historical IDs, notification flags and provenance are preserved.
Public parameters, payload fields, totals and pagination remain unchanged.

Mongo predicates now handle source/provenance, format, registration state,
category, deadline windows, saved IDs/aliases and upcoming/missed tabs. Deadline,
name and newest sorts run in Mongo, with the existing deterministic tie order.
Filtered totals use a two-group aggregation; global statistics are published
with the canonical generation. Default counts need no collection scan.

Substring/synonym/fuzzy search retains the original matcher. It streams sorted
candidates in batches of 32 and retains only the requested page plus counters.
It is deliberately not replaced with Mongo text search, whose semantics differ.
Distance uses the existing 6,371 km Haversine calculation and 0.1 km rounding in
Mongo expressions, preserving unknown coordinates and ties. Search, geographic
sorting and filtered counts can still examine many candidates. `allowDiskUse`
permits Mongo server sorting to spill; these operations are not all index seeks.

Canonical view indexes are `deadline`, `format_deadline`, `source_deadline`,
`name`, `newest`, and `saved_ids`. They are created only on derived collections.
Actual unhinted execution plans are included with the benchmark, rather than
assuming every filter combination benefits from a compound index.

## Preparation and freshness requirements

This change has not been deployed. Production data has not been accessed.
Large catalogs require a Mongo replica set/change streams and an explicitly
prepared view before this API version is enabled. No Redis or new service is
required, but standalone Mongo cannot validate these snapshots.

Operator commands (substitute authorized database settings locally; do not put
credentials in source control or shared terminal logs):

```sh
# Read-only identity backfill plan by default:
python Backend/scripts/prepare_catalog.py --uri "$CATALOG_URI" --database "$CATALOG_DB"
# Explicit metadata backfill, then publish the canonical read model:
python Backend/scripts/prepare_catalog.py --uri "$CATALOG_URI" --database "$CATALOG_DB" --apply-identity --publish
# Subsequent publication without an identity write:
python Backend/scripts/prepare_catalog.py --uri "$CATALOG_URI" --database "$CATALOG_DB" --publish
```

Publication is an offline O(N) memory operation, never a public request side
effect. A compare-and-swap activates one complete generation; a failed build
keeps the active generation. One previous view is retained. Only named derived
views are retired, never source collections.

Requests validate source change-stream checkpoints before and after reading,
require a primary majority-committed watermark, and recheck active generation.
The token LRU is limited to eight entries. A source mutation, expired resume
token, unsupported topology or time boundary invalidates the view. Exact event
timestamps, date-only timezone midnights, freshness transitions and future
verification timestamps bound validity. HTTP cache policy is `max-age=0,
must-revalidate`; clients cannot continue serving the old listing for five minutes.

Republication must be integrated into the operator's existing ingestion schedule
after source writes and before the reported `valid_until`. This phase does not
automatically rebuild views from public requests or change scan scheduling.
Consequently a stale/missing view with more than 2,000 public source rows returns
503 using the existing error envelope, not a stale or truncated 200. Small
catalogs retain compatibility: at most 2,001 rows are read to enforce the cap,
with a typed BSON fingerprint checked on every request. The normalization cache
expires on source edits and time boundaries. This availability prerequisite must
be addressed before deployment; the local benchmark uses prepared views.

Ordinary request client memory is bounded by the page, batch size, response
statistics and the fixed compatibility cap, not total catalog size. Large
provenance arrays/global-statistic cardinality still contribute to payload size
and remain subject to Mongo's document limit. Server sort memory and offline
publication memory are outside that claim.

## Identity backfill

Private `_identity_v1` metadata advances to version 2 with canonical URL and
normalized source-ID lookup arrays. Existing public IDs and matching weights
are unchanged. Nonunique URL, source-ID, block and version indexes avoid new
uniqueness assumptions about historical records. Ingestion can resolve migrated
identities without building a legacy collection snapshot on each repository.

Default backfill is a read-only plan. Explicit application uses batches of 200
(maximum 500), compare-and-swap checks every metadata input including absent
fields, reports races, and writes only derived metadata. Raced rows require a
later retry. Until backfilled, repository initialization still loads legacy
identities; this cost is not hidden by the API benchmark.

On 10,000 local synthetic rows: 10,000 metadata updates, zero races, 2.235 seconds
(one run). SHA-256 of all non-metadata source facts was unchanged. The legacy
probe changed from 10,000 documents/zero keys examined to zero documents/one key;
URL and source-ID lookups each examined one document/one key. Full results:
[identity-backfill-plan.json](../benchmarks/identity-backfill-plan.json).

## Measured comparison

Local Python 3.12.14, Linux x86-64, MongoDB 8.0.34, disposable single-node replica
set, synthetic records only. Baseline API is commit `f93b226`. Each algorithm
runs in a fresh process against the same data. Publication is excluded. After
one cold default request, three repeats of four modes (default, source+format,
fuzzy search, distance) produce 12 sequential direct-handler samples. Timings
include Mongo round trips and serialization, exclude ASGI/HTTP/rate-limiter
transport, and are neither concurrent load nor cloud measurements. p95 uses
nearest rank; with 12 samples it is the largest sample.

| Records | p50 ms before → after | p95 ms before → after | Sequential requests/s before → after |
|---:|---:|---:|---:|
| 1,000 | 40.537 → 7.958 | 74.845 → 26.018 | 21.835 → 85.305 |
| 10,000 | 656.767 → 22.317 | 785.904 → 176.399 | 1.497 → 18.128 |
| 100,000 | 7,895.208 → 239.096 | 9,708.983 → 1,769.872 | 0.125 → 1.884 |

| Records | Default request Python peak MiB before → after | Process peak RSS MiB before → after | Cold default seconds before → after |
|---:|---:|---:|---:|
| 1,000 | 4.091 → 0.331 | 80.48 → 61.47 | 0.437 → 0.010 |
| 10,000 | 39.962 → 0.331 | 252.45 → 61.67 | 4.928 → 0.011 |
| 100,000 | 399.774 → 0.331 | 1,929.09 → 61.29 | 54.149 → 0.012 |

Python peak is tracemalloc during one warm default request, not retained cache.
RSS includes client process state/imports/cache, excludes the Mongo server and
its filesystem cache. RSS is Linux-only; no Windows or cloud measurements were
run. These are one local experiment, not capacity guarantees.

For all three sizes, baseline cold loading was COLLSCAN over N documents. The
new deadline/format/source/name/newest page plans each examined 12 documents
and 12 keys for a 12-row page; saved IDs examined one document/one key. These
are page lookup plans, not claims that counts/search/distance inspect 12 rows.
All 12 measured response checks matched IDs, totals, source counts and prize
statistics. Complete samples and explain plans:
[indexed-api.json](../benchmarks/indexed-api.json).

Reproduce against a disposable Mongo replica set on loopback port 27028:

```sh
python Backend/scripts/benchmark_indexed_api.py --output benchmarks/indexed-api.json
python Backend/scripts/benchmark_identity_backfill.py
PHASE4_TEST_MONGO='mongodb://127.0.0.1:27028/?directConnection=true&replicaSet=phase4' python -m pytest Backend/tests -q
```

Benchmark scripts own random `benchmark_phase4_*` databases, reject non-loopback
Mongo endpoints and drop their synthetic databases. The API benchmark obtains
the baseline from git; `--baseline-file` can supply the original API file if
the commit is unavailable. No production environment URI is used.

## Verification and changed files

Full local backend suite: **454 passed, one existing Starlette/httpx deprecation
warning, 16.39 seconds**. This includes 75 indexed-catalog tests covering filter
and sort payload parity, pagination, source aliases, geographic edge cases,
freshness, publication failure, cache bounds and safe backfill races. CI now
provisions an isolated Mongo replica set; hosted CI has not been run. Python
compilation, CI YAML/embedded-Python validation and `git diff --check` were also
run locally. Frontend files and frontend behavior were not changed or tested.

Changed files:

- `.github/workflows/ci.yml`
- `Backend/api.py`
- `Backend/catalog_query.py`
- `Backend/entity_resolution.py`
- `Backend/event_repository.py`
- `Backend/identity_backfill.py`
- `Backend/scripts/prepare_catalog.py`
- `Backend/scripts/benchmark_indexed_api.py`
- `Backend/scripts/benchmark_identity_backfill.py`
- `Backend/tests/test_entity_resolution.py`
- `Backend/tests/test_indexed_catalog.py`
- `benchmarks/indexed-api.json`
- `benchmarks/identity-backfill-plan.json`
- `docs/EVENT_API_CONTRACT.md`
- `docs/INDEXED_API_PERFORMANCE.md`
