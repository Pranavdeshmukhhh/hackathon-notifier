# Explainable entity resolution — Phase 2

Local implementation, based on surgical-hardening commit `1a79d60`. No production
reads, migrations, scans, Telegram sends, pushes or deployments were performed.

## Changed files

- `Backend/entity_resolution.py`: original normalization, blocking, weighted rules,
  reason codes, bounded candidate index and deterministic decisions.
- `Backend/event_repository.py`: indexed lookup, read compatibility, audited decisions,
  safe merges, persistent review markers and existing concurrency/notification safeguards.
- `Backend/event_contract.py`: the read-only coalesced view uses the same matcher so
  a reused annual URL cannot hide a distinct historical edition.
- `Backend/requirements.txt`: RapidFuzz 3.14.3, CPU only, MIT license. No new service.
- `Backend/tests/test_entity_resolution.py` and `Backend/tests/fixtures/entity_resolution.json`.
- `Backend/scripts/benchmark_entity_resolution.py`, `benchmarks/entity-resolution.json`,
  this document and the identity section of `docs/EVENT_API_CONTRACT.md`.

## Rules and explanations

Inputs use Unicode NFKC/casefold, punctuation normalization and explicit organizer
abbreviations (`univ`, `inst`, `tech`). There is no learned alias list or invented
organizer identity. Missing event dates remain missing; registration dates never
substitute for event dates in the score or edition-year inference.

Exact canonical URLs (including meaningful query/SPA destinations) and platform-scoped
source IDs are checked first. Existing exact edition keys remain lookup hints, with
conflict guards. URL safety and public API schemas are unchanged.

Fuzzy retrieval checks the first nonempty tier: organizer + date window, title-token
pairs + date window, then organizer + title tokens for missing/inconsistent dates.
Windows use adjacent 14-day buckets; actual date distance is checked again in scoring.
At most 100 candidate pairs are scored. Dense blocks return REVIEW instead of truncating
and guessing a match. Exact identities bypass unrelated dense fuzzy blocks.

Score = 0.50 title + 0.25 organizer + 0.20 event-date + 0.05 location, each on a 0–100
scale. RapidFuzz token-sort similarity supplies string scores. Event-date scores are
100/95/85/60/30/0 at gaps 0/<=3/<=7/<=14/<=30/>30 days. Online/online contributes known
format agreement to the location component; physical events require actual location.
These weights and scores are evidence rules, not calibrated probabilities.

- MATCH requires score >=91, title >=90, organizer >=94 with matching informative
  organizer tokens, event start dates <=7 days apart, compatible format and location.
  Extra/different title variants, numbered editions and weak token evidence are guarded.
- REVIEW covers plausible but incomplete/conflicting evidence, competing matches within
  five points, and candidate overflow. Diagnostic ties sort by stable ID; tied candidates
  are not arbitrarily auto-merged.
- DISTINCT covers weak evidence and conflicting editions without shared exact identity.
- Explicit title/date year disagreements, disjoint edition years, numbered-edition
  differences and dates >90 days apart override exact identities: a reused URL/source
  ID is held for REVIEW, never allowed to overwrite historical edition facts.

Decisions store component scores, conflict reasons, selected candidate and rule version.
Observations retain the source facts and resolution. Incoming source references/URLs
are retained on MATCH; differing secondary facts remain conflicts rather than silently
replacing primary facts. Current facts are rechecked if a candidate changes after lookup. Interrupted legacy
reads never publish a partial cache; the next attempt reloads the snapshot.

An incoming REVIEW with a distinct URL remains a separate source listing, with an
internal `entity_review` marker that survives exact replays. It is not a new verification
or publication approval. An exact/unique-key collision is held in the observation ledger
without modifying the edition's facts. If no observation collection was supplied, these
held facts use `event_identity_reviews`. No new review UI/approval endpoint was added.

## Backward-compatible migration

There is no bulk data rewrite, ID rekeying, row deletion or physical merge of previously
stored IDs. The first ingestion per repository builds a projected legacy inverted index
in O(L) for L rows lacking metadata. Subsequent observations use bounded postings and
Mongo indexed queries. Reuse a repository for bulk ingestion; creating one per observation
repeats this cold legacy cost. Successfully updated rows lazily gain `_identity_v1` blocks
and retain `_id`, notified/notified_at, suppression, source history and revision checks.

New lookup indexes (blocks, metadata version, link, source+external ID) are nonunique;
existing lookup equivalents and unique URL/edition/source constraints are retained.
Index collisions with contradictory facts are REVIEW, not endless insert retries.
Historical duplicate IDs remain available through the existing read-view aliases.
Mongo index creation and live concurrency still require staging verification before rollout.

## Reproducible labeled evaluation

The fixture file contains 30 entirely synthetic, author-labeled pairs: 14 positives
and 16 hard negatives. It includes annual URL/ID reuse, near-identical organizers,
numbered/Pro variants, missing data, date disagreements, Unicode, physical-location
conflicts and source-ID conflicts. These are invented test scenarios, not real-world
ground truth. Rules were developed with these cases; this is not a held-out accuracy claim.

Baselines:

- `exact_ids`: canonical URL or platform/source-ID equality.
- `legacy_exact_edition`: those identities plus the previous exact edition key and
  its distant-year/source-ID guard, using shared normalization. This evaluates the
  prior key rules, not the old Mongo pipeline end to end.
- `resolver_v1`: candidate blocking plus the weighted/conflict-aware algorithm.

REVIEW counts as non-match. Precision=TP/(TP+FP), recall=TP/(TP+FN), F1 is their
harmonic mean. False-merge rate here is FP / labeled negative pairs (not FP/all merges).
Three true pairs abstain because event dates or physical location are missing/disagree.

| Algorithm | Precision | Recall | F1 | False-merge rate | Cross-year false merges |
| --- | ---: | ---: | ---: | ---: | ---: |
| exact_ids | 0.5714 | 0.2857 | 0.3810 | 0.1875 | 3 |
| legacy_exact_edition | 0.6667 | 0.4286 | 0.5217 | 0.1875 | 2 |
| resolver_v1 | 1.0000 | 0.7857 | 0.8800 | 0.0000 | 0 |

## Measured runtime and memory

Synthetic workloads use N independent invented entities and N known typo variants.
They test index build + query lookup and bounded pair comparisons without MongoDB or
network. Both baselines miss the changed-title/URL/source-ID workload; the resolver
recovers its known pairs. A faster lookup that returns no matches is not equivalent work.

Medians of three runs, Python 3.12.14, RapidFuzz 3.14.3, Linux CPU.
Tracing is enabled during timings. Memory is tracemalloc Python allocation peak, excluding
input construction, native allocations and process RSS. Raw run measurements, platform,
fixture SHA-256 and algorithm SHA-256 are in `benchmarks/entity-resolution.json`.

| N / queries | Algorithm | Build s | Total s | Python peak MiB | Correct | Candidate comparisons |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 200 | exact_ids | 0.0357 | 0.0720 | 0.426 | 0/200 | 0 |
| 200 | legacy_exact_edition | 0.0948 | 0.1906 | 0.462 | 0/200 | 0 |
| 200 | resolver_v1 | 0.0528 | 0.1210 | 1.712 | 200/200 | 200 |
| 1000 | exact_ids | 0.1836 | 0.3741 | 1.915 | 0/1000 | 0 |
| 1000 | legacy_exact_edition | 0.4823 | 0.9665 | 2.050 | 0/1000 | 0 |
| 1000 | resolver_v1 | 0.2788 | 0.6259 | 8.092 | 1000/1000 | 1000 |

The resolver uses more memory than either exact baseline and is slower than exact-ID
lookup. The measured workload scores N candidates rather than N² possible pairs; this is
not a worst-case performance guarantee. Dense/similar catalogs can produce more REVIEWs.

Repeat:

```sh
python Backend/scripts/benchmark_entity_resolution.py --sizes 200 1000 --repeats 3 --output benchmarks/entity-resolution.json
pytest Backend/tests -q
```

## Verification and remaining limits

- Final backend suite: **349 passed, 1 existing Starlette/httpx deprecation warning**, in 2.46s.
  Includes surgical-hardening coverage and 58 new entity-resolution tests.
- Compilation of changed Python modules and benchmark: passed. git diff --check: passed.
- Existing IDs, notification flags, edition history, provenance, API contracts and source
  behavior remain covered by the existing integration suite. No frontend code changed.
- Synthetic results do not establish real-world precision/recall. Unknown edition evidence
  cannot prove annual separation. Blocking, REVIEW thresholds and incomplete/changed
  organizer names trade recall for safer auto-merges.
- Mongo behavior uses mongomock and controlled race tests. Live Mongo index plans,
  multi-process throughput and Windows 11 were not tested. Simultaneous fuzzy ingestions
  on different workers can leave separate rows; no distributed lock or destructive
  reconciliation was introduced. Read-only coalescing preserves their original IDs.
- Cold legacy initialization is per repository, not a global cache/backfill. All-candidate
  overflow abstains. Persistent REVIEW markers require administrator/operator follow-up.

RapidFuzz is an external MIT dependency, not copied project code. License/source:
https://github.com/rapidfuzz/RapidFuzz/blob/v3.14.3/LICENSE . Its distributed license is
retained by normal package installation. Blocking, decisions, fixtures and benchmark
implementation in this phase are original project code.
