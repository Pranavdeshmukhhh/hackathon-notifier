# Architecture decisions

## ADR 001 — retain MongoDB and immutable canonical read views

Accepted. Filtering raw duplicate rows would change counts/provenance. Publish a
canonical indexed snapshot off the request path and validate source/time watermarks.
No Redis/search service. Trade-off: explicit publication scheduling and O(N) builder
memory; missing/stale large views return 503 rather than stale/truncated success.

## ADR 002 — bounded spawned source adapters

Accepted. Keep source implementations and isolate their timeouts/failures in a small
stdlib process runner, including Windows-compatible spawn. Empty feeds remain distinct
from errors. Trade-off: unfinished page data is lost at timeout; source permission and
end-to-end job budgets remain operator responsibilities.

## ADR 003 — recipient outbox, at-least-once attempts

Accepted. Freeze rosters, claim atomically with leases and persist per-recipient
receipts. Use one-shot jobs instead of mandatory infrastructure. Telegram has no
idempotent send key: acknowledgment uncertainty permits duplicates, and exhausted
budgets become failed. Source-change and deadline-enqueue commits are not atomic.

## ADR 004 — small React boundaries, existing visual system

Accepted. Feed, route and saved-state hooks plus presentation components retain the
working APIs and Blue Orbit style. Scroll state is isolated; no additional UI library.
CSS removal requires reference/cascade evidence and browser checks.

## ADR 005 — measured release floors and explicit manual gates

Accepted. Locked installs, dependency/security checks and critical-module coverage
floors guard regression; they are not a security certification. Full local benchmark
artifacts are synthetic. A green local build does not approve hosted uptime, source
permission, production migrations or a cloud release.
