# Phase 6 — lean Blue Orbit frontend

Implemented on `codex/lean-blue-orbit-frontend`, based on `f438611`. Backend,
deployment, API contracts and notification behavior were not changed. No push,
deployment, production API/data access or Telegram sends were performed.

## Structure and behavior

- `App.jsx`: 927 → **497 lines**, composing the existing directory rather than
  owning every request, route, storage operation and presentation state.
- `useEventFeed`: abortable requests, retained results, retry and feed metadata.
- `useEventRoute`: one detail resolver for history, local/alias IDs and off-page
  requests. Late responses cannot reopen a closed detail. Added a cancellable
  loading dialog and explicit detail retry.
- `useSavedEvents`: browser persistence and alias-aware saved-state checks.
- `SiteHeader`, `SiteFooter`, `EventDirectory`: cohesive presentation boundaries;
  submission drafts remain mounted/preserved when their dialog is closed.
- `ScrollProgress`: owns scroll state outside App. The regression reproduces a
  card render on scroll before this change and no discovery-card render afterward.
  Stable selection callbacks and memoized cards/footer avoid unrelated updates.
- Replaced four auxiliary-modal booleans with one active-modal value. All existing
  submission, guide, about and terms dialogs remain available.

Mobile filters expose `aria-controls`, close with Escape and restore toggle focus.
Global `/` shortcuts leave dialogs, editable content and modified shortcuts alone.
Search-clear keeps input focus and has a 44px target. Phone search/select text is
16px; expanded filters scroll within short viewports. Pending location requests
have a disabled/busy control, suppress duplicate requests and ignore callbacks
after reset/unmount. Colors, typography families, the real-data orbital field,
closing windows, grid/row discovery, pagination, saved events and both themes remain.

## Confirmed removals

Repository import/test/reference searches found no consumers for these files:

- `Frontend/Components/hakathoncard.jsx`: unused compatibility re-export.
- `Frontend/src/components/MotionKit.jsx`: unused passthrough wrapper.
- `Frontend/src/assets/hero.png`, `react.svg`, `vite.svg`: unreferenced assets;
  they were already absent from the baseline production bundle.
- `Frontend/src/App.css`: its screen-reader utility moved to `index.css`, where
  the loading state uses it. The utility itself was not deleted.

Removed unused icon exports/default barrel and four unused direct dependency
declarations: `motion`, `autoprefixer`, `@tailwindcss/postcss`, `postcss`. The
actual Vite/Tailwind plugin and its transitive requirements remain locked.
Motion was already tree-shaken out: its removal is dependency cleanup, not a
claim that a bundled animation runtime disappeared. No new project dependency
or UI library was added.

CSS cleanup removed **438 provably superseded declarations** and **16 unused
selectors**. Unused class families were the old intro layout/summary chips,
organizer metadata, signal readout label, controls summary/filter chips, and
unattached pagination/toast styling. Dynamic status classes were retained.
Exact selector/property/context overrides were removed without reordering the
cascade; unproven shorthand/conditional cases were preserved. `index.css` and
`orbit.css` remain separate shared-primitives/identity layers. CSS source totals
fell from 4,002 to 3,393 lines, including responsive readability/state styles.

Before intentional mobile/control changes, computed styles matched across
320/390/768/1024/1440px in both themes: **10 states, zero differences**. This was
a cleanup-stage comparison, not a claim that all final pixels are unchanged.

## Measured production assets

Same local Vite 8.2.2 production configuration, baseline commit `f438611` versus
this revision. Decimal kB; gzip uses Python level 9 and fixed `mtime=0` for both
measurements. This differs slightly from Vite's default gzip estimate.

| Entry assets | Before kB | After kB | Before gzip kB | After gzip kB |
|---|---:|---:|---:|---:|
| JavaScript | 262.071 | 263.375 | 80.680 | 81.290 |
| CSS | 60.258 | 50.422 | 10.977 | 9.615 |
| Combined | 322.329 | 313.797 | 91.657 | 90.905 |

CSS shrank **16.32%**; combined entry bytes shrank **2.65%**. JavaScript increased
1,304 bytes with the loading/keyboard/location recovery behavior and cohesive
hooks. No feature was removed to obtain a smaller number. Fonts and HTML are
unchanged and excluded from these entry-asset totals. These are asset sizes,
not measured network latency, device CPU improvements or cloud performance.
Raw asset names/bytes and check metadata: [frontend-bundle.json](../benchmarks/frontend-bundle.json).

## Verification

Final commands, all passed:

```sh
# A writable temporary npm cache was used in this sandbox.
npm ci
npm run lint
npm test
npm run build
```

**104 tests passed in 20 files, 12.28 seconds**; baseline was 98 tests in 19 files.
The six new regressions first failed against the original behavior. They cover
scroll renders, dialog/editor shortcut isolation, filter Escape/focus behavior,
duplicate/stale geolocation callbacks and cancellable deep-linked detail loading.
`git diff --check` passed. Informational Vitest environment-timing advice is not
a failed check.

Existing Phase 3 browser flows and `scripts/phase6_browser_qa.mjs` passed against
both development and production-preview servers in Chromium **151.0.7922.173**,
using only `scripts/preview_api.py` and synthetic in-memory records. Verified:

- 320–1440px overflow/sticky navigation, light/dark persistence, local fonts,
  closing filters, orbital selection, grid/row layouts and reduced motion.
- Saved persistence/removal and detail Back/Forward history; dialog focus trap,
  restoration and shortcut isolation.
- Short mobile viewports, scrolling filters, 16px controls and the 44px search-clear target.
- Initial loading, failed requests, retry, retained results, empty recovery and
  cancellation of a delayed detail response. **Zero uncaught browser errors.**

For isolated browser reproduction, run `scripts/preview_api.py`, then local Vite
or Vite preview on port 5173, and invoke the existing Phase 3 script plus the new
Phase 6 script. `PLAYWRIGHT_MODULE` can point to an installed Playwright module;
Phase 6 artifacts default to `/tmp/phase6-browser-artifacts`. The Phase 6 browser
context blocks requests outside the loopback frontend origin. Never point these
scripts at production. Fixture records are not imported into the frontend build.

Windows, Safari, Firefox, assistive-technology interoperability and production
connectivity were not tested. These checks are not a complete accessibility audit.
No backend tests were rerun because no backend source changed.
