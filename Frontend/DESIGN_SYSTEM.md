# Blue Orbit / Signal Index — visual identity

The Phase 3 user direction replaces the earlier pine/neutral and blue/pink directions.
The application is an opportunity directory with an observatory identity: signal detection,
registration windows and deliberate navigation. The existing React/Vite architecture,
semantic primitives, API contracts and safety boundaries remain in place.

## Palette and typography

| Role | Dark | Light |
| --- | --- | --- |
| Canvas | Midnight `#080f1d` | Warm grey `#f3f4ef` |
| Content surface | Ink `#0e192b` | White `#ffffff` |
| Primary text | Off-white `#eef2ee` | Navy `#142238` |
| Secondary text | Slate `#a6b5c6` | Slate `#4f5d6b` |
| Navigation / focus | Blue `#90acff` | Cobalt `#264fc8` |
| Energetic emphasis | Citron `#d0f46e` | Citron `#d0f46e` |
| Citron text on canvas | `#d0f46e` | Readable green `#3f6208` |

Geist is the editorial and UI face. JetBrains Mono distinguishes source labels,
calendar metadata and counts. Both are self-hosted variable WOFF2 subsets with OFL
licenses in `public/fonts/`; there is no runtime Google Fonts request. Use editorial
scale for the introduction, compact readable UI text for discovery, and restrained
monospace details. The logo is an original orbit/trajectory SVG, shared by the favicon.

## Composition and components

- Sticky line-based navigation; opacity/blur is limited to navigation and modal scrims.
- Compact split introduction with a functional current-page signal field. No marketing
  feature-card grid, fake chart, decorative particles or simulated scanner.
- An independent closing-windows strip leads into the discovery toolbar.
- Two-column cards at large widths; one column on phones. A compact row view remains
  available on larger screens. Registration dates and organizer links are primary facts.
- Explicit title/details buttons avoid nested interactive cards. Save/share/register
  actions stay separate. Saved opportunities have their own heading and recovery state.
- Details retain the focus-contained dialog, with source provenance, verification and
  freshness context. Long values wrap rather than disappear behind ellipses.
- The field guide, about dialog, terms, contribution entry and footer use the same tokens.
- Initial loading uses structural skeletons. Refreshes retain labeled previous results;
  errors expose retry and identify retained data. Missing values are not success states.

## Signal field semantics

`utils/signalField.js` maps only events returned on the current API page; the caption
states its scope. Radius represents known future **registration** closure, with reference
rings at 5, 14 and 30+ days. Direction represents online, in-person or hybrid format;
unknown format uses a separate sector. Ordering within sectors uses stable IDs.
Date-only values use the source calendar zone, or the API's documented UTC fallback.
Exact instants use remaining time. Local clocks with unknown offsets, invalid dates,
closed records and unconfirmed deadlines are not plotted as future registrations.
Event ends and submission cutoffs never become registration deadlines.

Points open the actual event detail route. Hover/focus updates the selection; a native
select and explicit open action provide access when points are crowded. Unknown/closed
records remain available outside the map and in the directory. The mobile map is
collapsed initially so search and results stay close to the top.

`ClosingWindows.jsx` independently requests the existing public API with
`status=closing&tab=upcoming&sort=deadline&limit=3`; it validates returned registration
facts, aborts on unmount and has its own loading, failure/retry and empty states. Its
view-all action applies the real closing filter. It does not infer a global count from
three results. Phone layouts preview one closing event and expose view-all.

## Motion and accessibility

- Short ease-out card entrances (maximum 175ms stagger), dialog entrances, control
  transitions and point selection feedback. No ambient animation or perpetual sweep.
- `prefers-reduced-motion` removes CSS animation/transitions and smooth navigation.
- Visible keyboard focus, a skip link, named controls, text status badges, native selects,
  inert backgrounds and contained/restored dialog focus.
- Primary coarse-pointer controls have at least 44px targets. Browser checks cover
  320, 390, 768, 1024 and 1440px widths, both themes and reduced motion.
- These are implementation/browser checks, not a claim of a complete accessibility audit.

## Data and verification boundaries

All rendered opportunities come from the existing public API. Sample records are confined
to `scripts/preview_api.py` for local browser QA and are not imported by the application.
No frontend action starts a scanner, bypasses URL safety checks, approves a submission or
sends a Telegram notification. Collection/freshness is never presented as verification.

## Lean frontend maintenance — Phase 6

`index.css` owns shared resets/control primitives and the screen-reader utility;
`orbit.css` owns identity, component layouts and responsive behavior. Remove a
declaration only when its selector/property/context proves it is superseded;
preserve shorthand and conditional cases that have not been established equivalent.
Do not use a static selector search as authority to delete dynamic status classes.

`App.jsx` composes the experience. Feed request/abort/retry behavior, detail route
resolution and bookmark persistence each have their own hook. The header, footer
and listing states have separate components. Scroll progress owns its state outside
App so scrolling does not re-render the directory. Cards use stable callbacks and
memoization; no animation or UI library was added.

The mobile filter disclosure names its controlled panel and closes with Escape,
restoring toggle focus. Global `/` search shortcuts do not interrupt dialogs or
editable content. Phone search/select controls use 16px text, the clear-search
target is 44px, and expanded filters scroll within short viewports. Pending location
requests expose a busy state and ignore callbacks after reset/unmount. Off-page
detail requests have an accessible, cancellable loading dialog and an explicit retry.

Verification details and before/after asset sizes: [lean frontend report](../docs/LEAN_FRONTEND.md).

Run frontend tests/lint/build, then the isolated browser scripts listed in
`UPGRADE_PROGRESS.md`. Screenshots in `artifacts/phase3-*` demonstrate the fixture-backed
layouts; they are not screenshots of production listings.
