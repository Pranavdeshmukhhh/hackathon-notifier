import { useCallback, useMemo, useState } from "react";

export function useSavedEvents() {
  const [savedIds, setSavedIds] = useState(() => {
    try {
      const value = JSON.parse(
        window.localStorage.getItem("hn-saved-hackathons") || "[]",
      );
      return Array.isArray(value)
        ? value.filter((id) => typeof id === "string").slice(0, 200)
        : [];
    } catch {
      return [];
    }
  });
  const savedSet = useMemo(() => new Set(savedIds), [savedIds]);
  const isEventSaved = useCallback(
    (event) =>
      Boolean(
        event &&
        [event.id, ...(event.raw?.canonical?.aliases || [])].some((id) =>
          savedSet.has(id),
        ),
      ),
    [savedSet],
  );

  const toggleSaveEvent = useCallback((eventOrId) => {
    const event = typeof eventOrId === "object" ? eventOrId : null;
    const id = event?.id ?? eventOrId;
    const identities = new Set([
      String(id),
      ...(event?.raw?.canonical?.aliases || []),
    ]);
    setSavedIds((previous) => {
      const next = previous.some((identity) => identities.has(identity))
        ? previous.filter((identity) => !identities.has(identity))
        : [...previous.slice(-199), String(id)];
      try {
        window.localStorage.setItem(
          "hn-saved-hackathons",
          JSON.stringify(next),
        );
      } catch {
        /* Storage may be disabled. */
      }
      return next;
    });
  }, []);
  return { savedIds, isEventSaved, toggleSaveEvent };
}
