# Third-party attribution

Project code is MIT, copyright 2026 Pranav Deshmukh; see LICENSE. No ownership of
platform event content is claimed. Source permissions are covered separately.

| Distribution | Attribution retained |
|---|---|
| React, React DOM, Scheduler | Full distributed MIT texts in `Frontend/public/THIRD_PARTY_NOTICES.txt` |
| Lucide React | Full package license/attribution text in the same shipped notice |
| Geist | `Frontend/public/fonts/geist-OFL.txt` |
| JetBrains Mono | `Frontend/public/fonts/jetbrainsmono-OFL.txt` |
| RapidFuzz | MIT; installed wheel license retained, source linked in entity-resolution report |
| Python runtime dependencies | Installed distribution licenses retained in the image; versions in `Backend/requirements.lock` |
| Build/test tools | Installed distributions retain their licenses; not copied project implementation |

`python scripts/generate_notices.py --check` verifies the shipped JS notice against
the actual installed packages. Regenerate after a dependency update; the script
fails if the runtime dependency inventory changes without attribution review.
The root project LICENSE is now included in the backend image. Font provenance is
in `Frontend/public/fonts/README.md`.

The Docker base/Python/MongoDB/Gitleaks images retain upstream licenses and require
independent review when redistributed. MongoDB community licensing is distinct
from permissive application licensing. CI tool use is not a paid-service requirement.
Do not treat this notice as approval to copy third-party event content or evade terms.
