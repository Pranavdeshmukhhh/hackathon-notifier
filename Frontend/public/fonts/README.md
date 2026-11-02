# Self-hosted typefaces

- Geist variable Latin WOFF2, SIL Open Font License (see `geist-OFL.txt`).
- JetBrains Mono variable Latin WOFF2, SIL Open Font License (see `jetbrainsmono-OFL.txt`).

Font subsets were obtained from the Google Fonts CSS distribution on 2026-10-30.
License sources: https://github.com/google/fonts/tree/main/ofl/geist and
https://github.com/google/fonts/tree/main/ofl/jetbrainsmono.

Only these local WOFF2 files are requested at runtime. Geist is preloaded by index.html;
font-display: swap preserves readable fallback text while fonts load.
