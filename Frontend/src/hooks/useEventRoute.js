import { useCallback, useEffect, useRef, useState } from "react";
import { fetchEventById } from "../utils/api";
import { normalizeEventPresentation } from "../utils/eventPresentation";
import { getEventIdFromUrl, pushEventRoute } from "../utils/eventRoute";

export function useEventRoute(events) {
  const [activeEvent, setActiveEvent] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const requestRef = useRef(null);

  const handleSelectEvent = useCallback((event) => {
    requestRef.current?.abort();
    setActiveEvent(event);
    setDetailError(null);
    setDetailLoading(false);
    pushEventRoute(event?.id || null);
  }, []);

  const handleCloseDetail = useCallback(() => {
    requestRef.current?.abort();
    setActiveEvent(null);
    setDetailError(null);
    setDetailLoading(false);
    pushEventRoute(null);
  }, []);

  useEffect(() => {
    let controller;
    const resolve = async () => {
      controller?.abort();
      requestRef.current?.abort();
      controller = new AbortController();
      requestRef.current = controller;
      const current = controller;
      const id = getEventIdFromUrl();
      setDetailError(null);
      if (!id) {
        setActiveEvent(null);
        setDetailLoading(false);
        return;
      }
      const local = events.find(
        (event) =>
          event.id === id || event.raw?.canonical?.aliases?.includes(id),
      );
      setActiveEvent(local || null);
      setDetailLoading(!local);
      if (local) return;
      try {
        const event = await fetchEventById(id, { signal: current.signal });
        if (!current.signal.aborted)
          setActiveEvent(normalizeEventPresentation(event));
      } catch {
        if (!current.signal.aborted)
          setDetailError(
            "This event could not be opened. The link may have expired.",
          );
      } finally {
        if (!current.signal.aborted) setDetailLoading(false);
      }
    };
    resolve();
    window.addEventListener("popstate", resolve);
    return () => {
      controller?.abort();
      window.removeEventListener("popstate", resolve);
    };
  }, [events, retry]);

  const retryDetail = useCallback(() => setRetry((value) => value + 1), []);
  return {
    activeEvent,
    detailError,
    detailLoading,
    handleSelectEvent,
    handleCloseDetail,
    retryDetail,
  };
}
