import React, { useMemo, useState, useId } from "react";
import { ArrowUpRight, ChevronDown, ScanLine } from "lucide-react";
import { buildSignalField } from "../utils/signalField";

export function SignalField({
  events = [],
  onSelect,
  loading = false,
  error = false,
}) {
  const [expanded, setExpanded] = useState(false);
  const [focusedId, setFocusedId] = useState(null);
  const uid = useId();
  const { points, unknown } = useMemo(() => buildSignalField(events), [events]);
  const focused = points.find((point) => point.id === focusedId) || points[0];
  return (
    <section
      className={`hn-signal ${expanded ? "is-expanded" : ""}`}
      aria-label="Opportunity signal map"
    >
      <div className="hn-signal-heading">
        <span>
          <ScanLine size={14} /> THE OPPORTUNITY FIELD
        </span>
        <span>
          {loading
            ? "Loading"
            : error
              ? "Unavailable"
              : `${events.length} on this page`}
        </span>
      </div>
      <button
        className="hn-signal-expand"
        type="button"
        aria-expanded={expanded}
        aria-controls={uid}
        onClick={() => setExpanded((value) => !value)}
      >
        Explore the deadline map <ChevronDown size={15} />
      </button>
      <div className="hn-signal-content" id={uid}>
        <div className="hn-orbit-map">
          <svg
            viewBox="0 0 460 300"
            className="hn-orbit-grid"
            aria-hidden="true"
          >
            <defs>
              <pattern
                id={`${uid}-grid`}
                width="23"
                height="23"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 23 0 L 0 0 0 23"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth=".45"
                />
              </pattern>
            </defs>
            <rect
              width="460"
              height="300"
              fill={`url(#${uid}-grid)`}
              opacity=".3"
            />
            {[75, 99, 128].map((r, i) => (
              <g key={r}>
                <circle cx="230" cy="150" r={r} />
                <text x="234" y={150 - r - 5}>
                  {[5, 14, "30+"][i]}d
                </text>
              </g>
            ))}
            <path d="M 44 150H 416 M230 18V282" className="hn-orbit-axis" />
            <circle cx="230" cy="150" r="24" className="hn-orbit-origin" />
            <text x="230" y="153" textAnchor="middle" className="hn-orbit-now">
              NOW
            </text>
            <text x="16" y="139">
              IN PERSON
            </text>
            <text x="395" y="139">
              ONLINE
            </text>
            <text x="247" y="29">
              HYBRID
            </text>
            <text x="247" y="285">
              UNCONFIRMED
            </text>
          </svg>
          {!loading &&
            !error &&
            points.map((point) => (
              <button
                key={point.id}
                type="button"
                className={`hn-signal-point ${point.signalDays <= 5 ? "is-urgent" : ""} ${point.id === focused?.id ? "is-focused" : ""}`}
                style={{
                  left: `${(point.x / 460) * 100}%`,
                  top: `${(point.y / 300) * 100}%`,
                }}
                aria-label={`Open ${point.title}, ${point.signalDays === 0 ? "registration closes today" : `registration closes in ${point.signalDays} days`}`}
                onFocus={() => setFocusedId(point.id)}
                onMouseEnter={() => setFocusedId(point.id)}
                onClick={() => onSelect?.(point)}
              >
                <span />
              </button>
            ))}
          {(loading || error || points.length === 0) && (
            <div className="hn-signal-message">
              {loading
                ? "Resolving registration windows…"
                : error
                  ? "The field will return when listings reconnect."
                  : "No confirmed future registration dates on this page."}
            </div>
          )}
        </div>
        <div className="hn-signal-readout">
          {focused && !loading && !error ? (
            <div className="hn-signal-choice">
              <span>
                {focused.formatLabel || "Format unconfirmed"} /{" "}
                {focused.signalDays === 0
                  ? "Closes today"
                  : `${focused.signalDays} days left`}
              </span>
              <select
                aria-label="Choose a mapped opportunity"
                value={focused.id}
                onChange={(event) => setFocusedId(event.target.value)}
              >
                {points.map((point) => (
                  <option key={point.id} value={point.id}>
                    {point.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onSelect?.(focused)}
                aria-label="Open selected opportunity"
              >
                <ArrowUpRight size={17} />
              </button>
            </div>
          ) : (
            <p>Known dates become signals. Unknown dates stay unknown.</p>
          )}
        </div>
        <div className="hn-signal-legend">
          <span>
            <i /> Nearer = sooner registration
          </span>
          <span>Outer ring: 30+ days</span>
        </div>
        {!loading && !error && unknown.length > 0 && (
          <div className="hn-signal-unknown">
            <span>
              {unknown.length} outside the map · date unconfirmed or closed
            </span>
            {unknown.slice(0, 2).map((event) => (
              <button
                type="button"
                key={event.id}
                onClick={() => onSelect?.(event)}
                aria-label={`Open ${event.title}`}
              >
                {event.title}
                <ArrowUpRight size={12} />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
