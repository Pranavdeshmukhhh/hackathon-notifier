# Hackathon Notifier — Industrial UI Design System

## 1. Strict Anti-AI-Slop Ruleset (Enforced)
1. **Zero Neon Gradients**: No purple-to-cyan or indigo-to-pink gradients on text, buttons, or borders.
2. **Zero Blur Blobs**: No floating `filter: blur(120px)` decorative background circles.
3. **Zero Emoji Clutter**: No emojis in UI buttons, badges, filter controls, or section headers. Use 1.5px monoline SVG geometry (`Icons.jsx`).
4. **Zero Bouncy Card Hovers**: Cards never scale or float upward (`translateY(-8px)`). Hover states use a 120ms border and surface luminance shift.
5. **Strict Tabular Monospace Telemetry**: Dates, countdowns, distances, pagination counters, and platform sources use `JetBrains Mono` with `font-variant-numeric: tabular-nums`.
6. **Zero Marketing Fluff**: Copywriting is direct, technical, and utilitarian.
7. **Deterministic Normalization**: Raw `null`, `undefined`, or unparsed ISO timestamps never leak into the DOM (`eventPresentation.js`).
