# Hackathon Notifier design system

Phase 1 establishes a quiet editorial utility for students. Phase 2 uses this
foundation for the homepage. Discovery and detail-page changes remain separate.

## Visual foundation

All tokens live in `src/index.css`; `.dark` supplies the alternate values.

| Role | Light | Dark |
| --- | --- | --- |
| Canvas | `#F5F4EF` | `#171D19` |
| Surface | `#FFFFFF` | `#1E2721` |
| Inset | `#ECEDE7` | `#28332B` |
| Primary text | `#202721` | `#EDF1E9` |
| Secondary text | `#454F47` | `#C7D2C5` |
| Muted text | `#5E695F` | `#ACBBAD` |
| Accent | `#305D46` | `#A4C9AD` |
| Accent foreground | `#FFFFFF` | `#182B1E` |

Use `bg-paper`, `bg-surface`, `bg-sunken`, `text-ink`, `text-ink-2`, `text-muted`,
`text-accent-text`, and `border-line`. Success/warning/error have dedicated semantic
roles plus readable labels. Never remap named Tailwind palettes to different hues.
Use `border-line-strong` for control boundaries; faint dividers are decorative.

Geist is the interface face, Instrument Serif is reserved for editorial headings,
and the system monospace stack is used for dates/counts. Body text is 16px, secondary
information 14px, and short labels 12px. Card titles use 21px semibold interface text.
Avoid all-caps paragraphs and light gray explanatory copy. Web fonts have local
fallbacks; font hosting optimization belongs to the later performance phase.

Spacing follows 4, 8, 12, 16, 24, 32, 48, and 64px. Controls use 6px corners,
surfaces 10px, dialogs 12px. Buttons and inputs are at least 44px high; readable
text badges are small labels, not interactive controls. The content shell caps at
1280px with fluid side padding. Theme choices persist without overriding a
student's explicit preference when OS appearance changes.

## Primitives

- `.btn` + `.btn-accent`, `.btn-ink`, or `.btn-ghost`: one size/interaction contract.
- `.icon-btn`: 44px square, always with an accessible name.
- `.field`, `.search`: 16px input text, visible focus, meaningful associated labels.
- `.chip`, `.tab`, `.seg`, `.page-btn`: selected states include labels/ARIA state.
- `.surface`, `.inset-surface`, `.panel`: flat surfaces with restrained borders.
- `.hcard`, `.hrow`, `.tag`: existing event presentation, with clear data hierarchy.
- `Dialog`: portal surface, background inertness, scroll lock, Escape, Tab wrap,
  initial focus, and focus restoration. Use it rather than building another modal.
- `Toast`: polite status announcement, readable multiline text, no pulsing capsule.
- `SkeletonCard`: shares event-card geometry and is hidden from assistive technology.

Use icons only when they clarify an action or information. Keep existing behavior
and business data intact when applying tokens. Legacy MotionKit exports are static
compatibility wrappers; they are not the motion policy for new UI.

## Interaction and review rules

Only short opacity feedback (140ms), functional loading indicators, and state changes
use motion. Reduced-motion preference disables transitions/animations and smooth
scrolling. No visual effect should compete with event information. Floating overlays
may use the single overlay shadow; cards and ordinary sections do not need shadows.

Aim for at least 4.5:1 normal text contrast and 3:1 essential control/focus boundaries.
Check real rendered colors, including inactive/archive states. Avoid reducing opacity
on a whole content section. Forced-color mode must retain control boundaries and focus.

Before shipping a phase, run frontend lint/tests/build, inspect real light/dark and
mobile/desktop views, and exercise keyboard navigation, theme persistence, search,
pagination, registration links, and modal dismissal. Use clearly identified sample
data for isolated previews; never present sample records as real scraped events.

## Phase 2 homepage contract

Lead with event discovery and working format/campus shortcuts. Keep the collection
timestamp distinct from a promised scan schedule. Refresh retrieves existing
listings; it does not start a scraper. Explain organizer verification briefly,
then provide a practical registration guide and the existing Telegram entry point.

The homepage has stable home, discovery, listing-information, and about anchors.
Navigation must remain readable at 320px and support Escape/focus restoration.
Loading, empty results, and API failure are separate states. An aborted request
must not overwrite a newer request; an explicitly configured API must not silently
fall back to production. Format counts and filters recognize Virtual/Online and
Offline/In-person/Onsite consistently without guessing an unknown format.

Phase 2 QA covers 320, 375, 768, 1024, and 1440px, persisted light/dark appearance,
keyboard dialogs/navigation, search recovery, shortcuts, and a delayed 503 fixture.
Discovery controls and event cards receive their product changes in later phases.

## Phase 3 discovery contract

Format, event type, platform, and deadline are independent facets. Keep the labelled
native controls and removable filters. Status counts describe the filtered set;
the collection timestamp describes the dataset. A seven-day window includes today
through today plus seven UTC calendar days, excludes unknown dates and closed events,
and never promises an organizer's closing time. Hybrid remains its own format.

Searches and pagination restore from shareable query strings. Never include a user's
coordinates in those links. Grid/list preference stays local. Manual page changes
move keyboard focus to Results; typing or selecting filters must not steal focus.
Loading, no matches, an unavailable API, and failed refresh of cached data are
different states. Keep cancellation protection, conditional requests, and bounded
query caching. An explicit preview API must remain authoritative.

Cards preserve full titles and known facts. Do not infer a location, free entry,
prize, participant count, eligibility, or team rules from missing fields. Show
partial team bounds as partial bounds. Automated source checks are not organizer
endorsement. Unsafe registration URLs are unavailable, never clickable placeholders.
Copy feedback requires a successful clipboard write. Registration opens the source
page in a new tab and must not report a copy action.

Phase 3 QA uses labelled, in-memory sample events and a separate delayed 503 fixture.
Review 320, 375, 768, 1024, and 1440px layouts, light/dark appearance, keyboard focus,
combined facets, search recovery, shareable URL restoration, pagination, and copy
feedback. Responsive frames may be used when the browser ignores viewport overrides.
Eligibility extraction and internal event detail pages remain later-phase work.
