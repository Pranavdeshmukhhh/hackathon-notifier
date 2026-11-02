export function scrollToSection(id) {
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
}

export function scrollBehavior() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
    ? "instant"
    : "smooth";
}
