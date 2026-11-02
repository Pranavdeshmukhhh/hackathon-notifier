import React, { useState, useEffect, useCallback } from "react";
import { ArrowUpRight, ArrowRight } from "lucide-react";
import { fetchPublicEvents } from "../utils/api";
import { normalizeEventPresentation } from "../utils/eventPresentation";
import { deadlineDays } from "../utils/signalField";

export function ClosingWindows({ onSelect, onViewAll }) {
  const [state, setState] = useState({
    loading: true,
    events: [],
    error: false,
    total: 0,
  });
  const [retry, setRetry] = useState(0);
  const refresh = useCallback(() => setRetry((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setState((previous) => ({ ...previous, loading: true, error: false }));
    fetchPublicEvents("status=closing&tab=upcoming&sort=deadline&limit=3", {
      signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        const events = result.events
          .map(normalizeEventPresentation)
          .filter(
            (event) =>
              event.lifecycleKey === "closing" &&
              deadlineDays(event) !== null &&
              deadlineDays(event) >= 0,
          );
        setState({ loading: false, events, error: false, total: result.total });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ loading: false, events: [], error: true, total: 0 });
      });
    return () => controller.abort();
  }, [retry]);
  return (
    <section
      className="hn-closing-windows"
      aria-label="Closing registration windows"
    >
      <div className="hn-closing-heading">
        <span className="hn-section-kicker">THE SHORT WINDOW</span>
        <h2>
          Closing soon.
          <span>
            <ArrowUpRight size={17} />
          </span>
        </h2>
        <button type="button" onClick={onViewAll}>
          View closing soon <ArrowRight size={14} />
        </button>
      </div>
      <div className="hn-closing-events" aria-busy={state.loading}>
        {state.loading ? (
          <p className="hn-closing-note">Checking registration windows…</p>
        ) : state.error ? (
          <p className="hn-closing-note">
            Deadline feed unavailable.{" "}
            <button type="button" onClick={refresh}>
              Try deadlines again
            </button>
          </p>
        ) : state.events.length === 0 ? (
          <p className="hn-closing-note">
            No confirmed closing windows right now. Explore the full directory.
          </p>
        ) : (
          state.events.map((event) => (
            <button
              className="hn-closing-event"
              type="button"
              key={event.id}
              onClick={() => onSelect?.(event)}
            >
              <span className="hn-closing-days">
                <strong>
                  {deadlineDays(event) === 0
                    ? "TODAY"
                    : String(deadlineDays(event)).padStart(2, "0")}
                </strong>
                <small>
                  {deadlineDays(event) === 0 ? "CLOSES" : "DAYS LEFT"}
                </small>
              </span>
              <span className="hn-closing-title">
                <strong>{event.title}</strong>
                <small>
                  {event.sourceLabel} ·{" "}
                  {event.formatLabel || "Format unconfirmed"}
                </small>
              </span>
              <ArrowUpRight size={17} />
            </button>
          ))
        )}
      </div>
    </section>
  );
}
