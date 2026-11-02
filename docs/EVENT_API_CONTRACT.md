# Canonical event contract — schema version 2

This phase preserves `/api/hackathons` and `/api/v1/hackathons` and their existing
`data`, totals, stats, status codes, ETags, pagination, filters, and flat fields.
Each public event additionally has a typed `canonical` object. It is the reliable
contract for new clients. Formal schema: [canonical-event.schema.json](canonical-event.schema.json).
No frontend change is required. For catalogs above 2,000 public source rows,
Phase 4 requires an explicitly published canonical MongoDB read model; see
[query preparation and measurements](INDEXED_API_PERFORMANCE.md). Missing or stale
large read models return the existing 503 error contract rather than partial data.
ETags remain supported; listing responses now require cache revalidation.

## Identity and URLs

`canonical.id` is the existing Mongo `_id` string. New records receive an ObjectId
once; updates and detected duplicates retain it. Historical duplicate IDs remain
addressable through detail routes and appear in the primary listing's `aliases`.
Bookmarks saved under aliases remain usable and removable.

`registration_url` is a public HTTP(S) source-reported registration/destination URL,
not a claim of official ownership. `registration_url_status` is `source_reported` or
`unknown`. Missing/unsafe URLs are null. URL processing retains meaningful query
parameters and SPA fragments, removes known tracking parameters, normalizes host/default
ports and orders query keys. URL syntax restrictions and DNS-pinned safe fetching remain
in force. Canonicalizing a URL never fetches it or weakens destination checks.

Identity reconciliation uses canonical URL/source IDs first, followed by blocked,
weighted evidence matching. Explicit edition-year and numbered-edition conflicts
prevent automatic merging even when a URL or provider ID is reused. The outcomes are
MATCH, REVIEW and DISTINCT; ambiguous candidates never cause a fuzzy auto-merge.
See [entity resolution](ENTITY_RESOLUTION.md) for thresholds, provenance, migration,
review behavior and measured synthetic evaluation. No public schema fields changed.

A title alone never causes a merge. Exact-identity conflicts are retained as observations
for administrator review (`possible_new_edition` for edition conflicts), leaving the
historical event intact. Distinct URLs under REVIEW remain separate records with an
internal review marker. No historical rows are deleted or physically merged.

## Canonical fields

| Field | Meaning |
|---|---|
| `schema_version` | `2` |
| `id`, `aliases` | Stable primary ID and historical duplicate IDs |
| `title`, `source`, `organizer` | Source facts or null |
| `registration_url`, `registration_url_status` | Source-reported safe destination and its evidentiary status |
| `format` | `online`, `offline`, `hybrid`, `unknown` |
| `registration_opens`, `registration_closes` | Registration dates; never substituted from an event calendar |
| `submission_closes` | Submission cutoff, separate from registration |
| `event_starts`, `event_ends` | Event calendar dates |
| `event_status` | `scheduled`, `live`, `ended`, `cancelled`, `unknown`; calendar/source event state |
| `event_status_source` | Explicit source event status when supplied; independent of registration state |
| `registration_state` | `open`, `closing`, `upcoming`, `closed`, `cancelled`, `unknown` |
| `publication_state` | `published`, `archived`, `suppressed`, `pending` |
| `location` | Text, venue, city, country, coordinates |
| `location.coordinates` | Latitude/longitude, precision (`venue`/`city`/`unknown`), verification boolean |
| `prize` | Original source string, original currency code or null, exact decimal amount string or null |
| `team` | Positive minimum/maximum or null; contradictory ranges become unknown |
| `eligibility` | Source requirements or null |
| `provenance[]` | Platform, source URL, external ID, observation time, source update time |
| `verification` | `verified`/`unverified`, confidence or null, last successful evidence-backed check, method |
| `freshness` | Last seen, last fact update time, `fresh`/`stale`/`unknown` |
| `conflicting_fields` | Facts reported differently by secondary sources or requiring edition review |

Every optional canonical field has an explicit null/unknown value. The compatibility
flat fields remain sparse. Unknown data is never populated with sample values.

## Date precision and timezones

A date object has `at`, `date`, `precision`, `timezone`, and `local_value`:

- `timestamp`: an aware instant normalized to UTC in `at`, with the source timezone/offset
  and original local calendar date retained. Known explicit IANA zones can resolve local
  timestamps when unambiguous.
- `date`: a complete calendar date, with no invented clock time. Date-only expiry occurs
  after that stated day in its known zone, or the documented UTC calendar fallback when
  the source zone is unknown. It is never converted into an exact midnight deadline.
- `local_datetime`: the clock value is known but its zone is unknown or DST-ambiguous.
  It retains `local_value` and does not pretend to be a precise UTC instant.
- `unknown`: all date values are null.

Repeated normalization preserves precision, offset and calendar date. Invalid/ranged dates
remain unknown. Exact deadlines expire at their instant, including on warm API caches.
Future registration opening dates classify as upcoming. Known event/submission completion
can close an opportunity without inventing a registration deadline. Cancellation remains
explicit. Exact deadline ordering uses instants; missing deadlines sort last.

Devpost's `submission_period_dates` is a submission period. HackerEarth's `end_date` is
an event end. Devnovate `registrationDeadline`, Unstop `regnRequirements.end_regn_dt`, and
Devfolio settings `reg_ends_at` are registration facts; their event ends are separate.
Generic Devfolio card "Starts/Ends" dates have unknown registration meaning. Missing
mode is not guessed from the platform. Malformed source items are isolated.

Legacy flat dates from these providers without a registration label or structured
registration fact are ambiguous. Read adapters keep their stored records intact, but do
not advertise those dates as registration cutoffs. Known legacy Devpost/HackerEarth date
meaning is retained as submission/event data. Other established legacy/manual flat deadline
records retain compatibility. No bulk rewrite is performed.

## Verification and freshness

Heuristic scoring is screening only. It does not mark a listing verified. The existing
administrator `/hackathons/verify` endpoint now returns `screening_passed` and
`heuristic_score`; its deprecated `is_verified` is false and `confidence` is null.

Evidence-backed existing administrator annotations can populate verification only when
`verification_method=administrator_evidence`, a nonfuture successful verification time,
and an explicit evidence record are present. Normal scraper ingestion cannot manufacture
these annotations. Material changes/conflicts invalidate the current verified flag.
Collection timestamps, successful URL probes, geocoding and moderator publication approval
are not successful event verification. Ordinary listings remain unverified.

Coordinates are marked verified only with explicit evidence and a successful dated
coordinate-verification annotation. Legacy city geocoding can remain available for
compatibility distance estimates but is explicitly unverified in the canonical object.

Freshness describes successful source observation, not truth or official ownership.
After 14 days without observation it is stale; a source's known update timestamp is
preserved separately. Failed sources do not renew freshness. Older provider versions and
out-of-order observations do not overwrite newer facts. Unknown dates remain unknown.

## Updates, duplicates, archival and history

The write repository is shared by scans and moderation. It uses partial/sparse unique
indexes for URL aliases, source identity keys and strong edition keys. Existing `_id`,
notification flags and suppressed publication state are retained. Index conflicts fail
ingestion visibly; they do not trigger automatic deletion or destructive reconciliation.

The primary source wins conflicting known facts. Secondary sources fill gaps, add provenance
and expose conflicting field names; their full reports remain in the administrator-only
observation ledger. Administrator curation has higher authority. Empty/unknown values do
not erase known facts. A source-ID-confirmed URL rename can update the primary destination
while retaining old URL aliases.

`event_observations` records normalized facts and before/after changes before replacing
existing facts. A ledger failure prevents the update. Ledger attempts may be present for
an unsuccessful compare-and-swap/write; they are observations, not guaranteed commits.
Cross-collection writes are not Mongo transactions. Retries retain identity and notification
flags. Possible new editions sharing a URL are held for manual review.

Lifecycle functions retain their names for callers, but no longer permanently delete
expired, stale or repeatedly dead-link records. Removed counters stay zero; archive counts
report the actual operation. Pending/suppressed rows cannot be publicly read. A timeout,
403, or other inconclusive URL check never proves an event invalid. All-source failure can
still run non-network archival housekeeping without renewing source freshness.

## List and detail behavior

- Listing and `/hackathons/{id}` expose the same canonical model.
- Format accepts `All`, `Online`, `Offline`, `Hybrid`, `Unknown`.
- Registration filters retain existing options. The closed filter also covers cancelled
  registrations, while the canonical object preserves the cancellation distinction.
- Source filters include provenance platforms on merged listings. IDs include historical
  aliases for saved views. Counts and pagination apply after reconciliation and filtering.
- `upcoming_total`, `missed_total`, `all_total` describe the filtered set; stats describe
  the catalog. Source counts can overlap because one event can have multiple sources.
- Search indexes are built once per catalog-cache fill, reused for warm searches, and never
  serialized into API responses. Existing campus aliases/fuzzy behavior are preserved;
  Unicode queries no longer turn into match-all queries.

## Moderated submissions

Public `POST /api/submissions` still accepts `{ "url": "https://…" }` only, deduplicates
tracking URL variants and returns HTTP 202. Publicly supplied state/verification/event
facts cannot publish anything. No fetch, scraper or notification runs during submission.

Authorized administrators use the existing `require_admin` boundary:

- `GET /api/admin/submissions?page=1&limit=20`: paginated private review queue.
- `POST /api/admin/submissions/{sha256_id}/review`:
  `{ "decision": "approve", "event": { "title": "…", "mode": "Online",
  "registration_deadline": {"at":"2027-01-01T18:00:00+05:30"} }, "note": "…" }`.
- Reject using `{ "decision": "reject", "note": "…" }`.

The original submitted URL is immutable for approval. Curated event facts are normalized;
missing title/unsafe facts return 422. Approval does not imply verification or send Telegram.
Only authorized approval writes to the public event collection, subject to expiry/suppression
and duplicate policy. Completed/rejected decisions cannot be silently changed. Repeated
approval returns the original event ID. Concurrent claims return 409; crashed review leases
can be reclaimed after 15 minutes. Storage failures return 503 and restore a pending claim.
Equivalent `/api/v1/admin/...` routes exist. Review responses are private/no-store.

## Adoption and operator audit

No production migration or scan was executed. Read adapters support existing records;
normal authorized writes enrich only records they actually observe. The optional
`python Backend/scripts/audit_event_contract.py` reads the configured Mongo database and
prints counts/candidate IDs without modifying data or indexes. It requires explicit
`MONGO_URI`. It is not run as part of tests against production.

Before rollout, review an audit/backup, deploy the backend, and validate identity indexes
on a staging Mongo instance. Existing duplicate indexed metadata requires operator
reconciliation; this phase will not erase or merge historical stored rows automatically.
Live Mongo index behavior, production scheduler ownership and notification delivery remain
operational verification steps. UI fixtures and source payload tests use isolated databases.
