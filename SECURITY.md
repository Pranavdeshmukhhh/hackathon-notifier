# Security and privacy

Report vulnerabilities privately using GitHub private vulnerability reporting where
available, or contact the maintainer privately. Do not post credentials or database
exports in public issues. No response-time SLA or independent security certification
is claimed.

Administrator HTTP routes fail closed without `ADMIN_SECRET`. The frontend never
receives that secret. Rate-limit IP attribution trusts only explicitly configured
proxy peers. Public event URLs retain URL validation, DNS pinning, redirect checks
and response-size limits; source adapters are not a general-purpose fetch proxy.

Public submissions require administrator moderation before publication. Tracking is
opt-in and stores coarse device/path facts, not raw IP, full user-agent or referrer.
Subscribers and outbox rows contain necessary private chat IDs; restrict Mongo roles
and backups. Durable-send errors omit raw transport exception strings and responses.
Legacy interactive replies/broadcasts are outside the outbox's durability guarantee.

Build contexts exclude nested environment/key files. CI uses no production secrets,
least-privilege read permissions, pinned actions, audits and redacted tracked-file
scanning. Scanning does not certify the entire git history or a hosting account.

Use TLS, exact production origins, least-privilege database credentials and protected
admin routes. Do not trust arbitrary forwarded headers or enable scans to test a
release. See [source policies](docs/SOURCE_POLICY.md) and the release checklist.
