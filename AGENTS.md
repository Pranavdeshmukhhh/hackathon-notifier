# Hackathon Notifier working rules

Preserve existing discovery, filtering, registration links, and Telegram workflows.
Keep Phase 0 administrator authorization, public URL restrictions, and opt-in
scanning/tracking safeguards. Never preview against live data or send notifications
as a side effect of UI work. Do not publish credentials, private backups, or records.

For frontend work, read `Frontend/DESIGN_SYSTEM.md` and extend the existing React,
Vite, Tailwind, and semantic CSS system. Work within the phases the user authorizes.

## Product and visual rules

- Start with the student's task: find an event, compare deadline/format/location,
  check requirements, and reach the organizer. Every added element needs a purpose.
- Use the project's semantic tokens and shared primitives. Do not paste a landing
  page template, invent a parallel palette, or choose a layout because it is trendy.
- Keep surfaces opaque, borders quiet, spacing deliberate, and typography legible.
  Use the pine accent sparingly. Mountain inspiration means restraint, not scenery.
- No decorative gradients, glass panels, glow, cursor spotlights, 3D tilt, floating
  blobs, marquees, confetti, repeated emoji, oversized pills, or ambient animation.
  One restrained shadow is appropriate for a floating dialog or notification.
- Icons clarify actions or information; they are not filler. Status badges require
  real data and must be understandable without color.
- Never invent counts, deadlines, eligibility, prizes, speed claims, scan activity,
  security guarantees, or "AI-powered" copy. Show unknown information honestly.
- Preserve readable light/dark themes, visible keyboard focus, keyboard-contained
  dialogs, reduced-motion behavior, and at least 44px primary touch controls.
- Validate the actual browser at narrow and wide widths, including empty/loading/
  error states. Check behavior and contrast; do not equate a passing build with QA.
- Prefer deterministic product features. Add an LLM only for a concrete need that
  simpler logic cannot adequately meet.
