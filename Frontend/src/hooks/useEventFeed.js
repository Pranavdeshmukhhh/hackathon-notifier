import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPublicEvents } from "../utils/api";
import { normalizeEventPresentation } from "../utils/eventPresentation";

export function useEventFeed(queryParams) {
  const [rawEvents, setRawEvents] = useState([]);
  const [feedMeta, setFeedMeta] = useState({
    total: 0,
    paginated: false,
    stats: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestRef = useRef(null);

  const loadEvents = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const { events, total, paginated, stats } = await fetchPublicEvents(
        queryParams,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setRawEvents(events.map(normalizeEventPresentation));
      setFeedMeta({ total, paginated, stats });
    } catch (err) {
      if (!controller.signal.aborted)
        setError(err?.message || "Unable to load hackathons right now.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => {
    loadEvents();
    return () => requestRef.current?.abort();
  }, [loadEvents]);

  return { rawEvents, feedMeta, loading, error, loadEvents };
}
