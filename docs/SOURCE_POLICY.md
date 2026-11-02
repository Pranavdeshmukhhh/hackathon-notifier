# Source access and privacy review

The release review fetched fixed public robots/policy URLs only, with a descriptive
user agent, TLS verification, bounded bodies, no redirects/login and no event scans.
Statuses/directives/hashes are in the release `source-policies.json`. They do not
establish contractual permission or current availability of a source endpoint.

- Google robots disallows `/search`; legacy web/internet discovery uses that path.
  **Do not enable those discovery paths without an approved compliant replacement
  or documented provider permission.** No bypass was added in this release.
- HackerEarth robots returned 403; MLH redirected and was not followed. Their policy
  review is incomplete. Instagram has restricted crawler rules; operator approval
  of its applicable terms is also unresolved.
- Devfolio/API, Unstop, Devpost, Devnovate, Eventbrite and KonfHub returned policy
  responses. A 200 or empty disallow does not grant scraping/redistribution rights.
  Review the exact endpoints, applicable user-agent groups and terms first.
- Nominatim policy was reachable. Respect its identification, caching, attribution
  and aggregate request limits; per-process sleeps do not cap multiple workers.
  Do not perform bulk geocoding merely because one request path is reachable.

Existing fetchers include legacy browser impersonation. This review does not
approve defeating access controls, CAPTCHAs, denied access or source rate limits.
Keep scans disabled until an operator approves each enabled source/path. The
manual workflow remains opt-in, with dry-run default; dry-run still accesses sources.

Directory records retain source links/provenance and explicit unknowns. Do not
redistribute source images/full descriptions beyond permission or label heuristic
scores as verification. Sample fixtures are never production listings.

Bookmarks/theme live in the browser; coordinates are requested only by user action
and sent to the listing API for sorting. Subscriber/outbox chat IDs are private
operational data, not public event fields. Tracking defaults off; enabled visit
metrics are coarse and omit raw IP/full UA/referrer. Maintain an operator retention,
backup and deletion policy before enabling collection. No user records were reviewed.
Transport/host access logs can contain IP addresses independently of optional app
metrics; configure their retention/redaction separately. Hosting accounts were not audited.
