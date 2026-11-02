# Architecture

```mermaid
flowchart LR
  S[Explicit source job / permitted sources] --> W[Bounded spawned adapters]
  W --> N[Canonical normalization and entity resolution]
  N --> R[(Mongo source records / observations)]
  U[Public URL submission] --> M[Moderation queue]
  A[Authorized administrator] --> M
  M --> R
  R --> P[Explicit canonical publication]
  P --> V[(Immutable indexed view + manifest)]
  V --> API[FastAPI: freshness checks / bounded pages]
  R -->|small legacy fallback only| API
  API --> UI[React Blue Orbit directory]
  R --> I[(Frozen notification intents)]
  I --> O[(Unique recipient outbox)]
  O --> T[Leased one-shot sender]
  C[(Subscriber consent)] --> T
  T --> TG[Telegram acknowledgment]
  TG --> O
```

The API does not publish views or run scans. Above 2,000 public raw rows a valid
prepared view is required; source writes/time boundaries invalidate it. Search
streams candidates; geographic sorting can scan/spill in Mongo. Publication is an
offline O(N) operation. Provenance/IDs survive canonical read coalescing.

Notification claims and receipts are atomic per row, not a transaction with Telegram.
Consent is checked again before sending. Interrupted fan-out/leases recover; uncertain
external acknowledgments can duplicate messages. Deadline-change enqueue is still a
separate commit from source ingestion. See the phase reports for exact contracts.
