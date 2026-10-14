# Hackathon Notifier — Design System & UX Architecture

## 1. Design Philosophy
Inspired by Linear (interaction precision), Vercel (restraint), Raycast (compact utility), and Stripe (typographic hierarchy). Designed as a fast, trustworthy opportunity directory for students, solo builders, and developers.

## 2. Visual Tokens
- **Neutral-First Palette**:
  - Light Mode: Warm editorial alabaster (`#FAF9F6`), pure white surface (`#FFFFFF`), subtle stone inset (`#F3F2EE`), near-black primary ink (`#141413`), muted slate secondary (`#575653`), crisp hairline border (`#E6E4DD`).
  - Dark Mode: Deep carbon (`#0C0C0E`), elevated surface (`#121215`), inset surface (`#18181C`), off-white primary text (`#F2F2F0`), muted ash secondary (`#9A9A96`), subtle hairline border (`#252529`).
- **Single Functional Accent**: Deep Teal (`#0F766E` light / `#14B8A6` dark) used strictly for primary actions, focus rings, and active filter states.
- **Typography**: `Inter` for UI and editorial hierarchy; `JetBrains Mono` with `font-variant-numeric: tabular-nums` for dates, deadlines, counts, and distances.
- **Data Integrity**: Never fabricate missing data. Optional fields (prize, eligibility, venue, event dates) render only when present in the API response.
