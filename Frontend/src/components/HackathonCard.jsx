import React, { memo } from "react";
import { ArrowUpRight, MapPin, Globe2, Layers, ArrowRight } from "lucide-react";
import { normalizeEventPresentation } from "../utils/eventPresentation";
import { CopyIcon, CheckIcon, BookmarkIcon } from "./Icons";

export const HackathonCard = memo(function HackathonCard({
  event,
  onSelect,
  onCopyLink,
  copied = false,
  isSaved = false,
  onToggleSave,
  layoutMode = "grid",
  index = 0,
}) {
  if (!event) return null;
  const spec = event.sourceLabel ? event : normalizeEventPresentation(event);
  const FormatIcon =
    spec.formatKey === "offline"
      ? MapPin
      : spec.formatKey === "hybrid"
        ? Layers
        : Globe2;
  const closed = spec.lifecycleKey === "closed";
  return (
    <article
      className={`hn-card ${layoutMode === "rows" ? "hn-card-row-mode" : ""} ${isSaved ? "is-saved" : ""}`}
      aria-label={spec.title}
      style={{ "--entry-delay": `${Math.min(index, 5) * 35}ms` }}
    >
      <div className="hn-card-topline">
        <span className="hn-card-sequence">
          {String(index + 1).padStart(2, "0")} <span>/</span>{" "}
          <FormatIcon size={13} />
          <span className="hn-format-title">
            {spec.formatLabel || "FORMAT UNCONFIRMED"}
          </span>
        </span>
        <span className={`hn-status ${spec.lifecycleKey}`}>
          <span className="hn-status-dot" />
          {spec.lifecycleLabel}
        </span>
      </div>
      <div className="hn-card-content">
        <div className="hn-card-header">
          <span className="hn-platform-tag">{spec.sourceLabel}</span>
          {spec.organizer &&
            spec.organizer.toLowerCase() !== spec.sourceLabel.toLowerCase() && (
              <span className="hn-card-organizer">{spec.organizer}</span>
            )}
        </div>
        <h2 className="hn-card-title">
          <button type="button" onClick={() => onSelect?.(spec)}>
            {spec.title}
            <ArrowUpRight size={20} />
          </button>
        </h2>
        {spec.tags?.length > 0 && (
          <div className="hn-event-tags">
            {spec.tags.slice(0, 3).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        )}
        {layoutMode !== "rows" && spec.summary && (
          <p className="hn-card-description">{spec.summary}</p>
        )}
      </div>
      <div className="hn-card-facts">
        <div className="hn-card-window">
          <span className="hn-meta-label">REGISTRATION WINDOW</span>
          <strong
            className={spec.lifecycleKey === "closing" ? "is-closing" : ""}
          >
            {spec.deadlineLabel ||
              (closed ? "Registration closed" : "Date unconfirmed")}
          </strong>
        </div>
        <dl className="hn-meta-grid">
          {spec.locationLabel && (
            <div>
              <dt>Location</dt>
              <dd>
                {spec.locationLabel}
                {Number.isFinite(spec.distanceKm)
                  ? ` · ${spec.distanceKm} km`
                  : ""}
              </dd>
            </div>
          )}
          {spec.prizeLabel && (
            <div>
              <dt>Prizes</dt>
              <dd>{spec.prizeLabel}</dd>
            </div>
          )}
          {!spec.prizeLabel && spec.teamLabel && (
            <div>
              <dt>Team</dt>
              <dd>{spec.teamLabel}</dd>
            </div>
          )}
        </dl>
      </div>
      <div className="hn-card-actions">
        <button
          type="button"
          className="hn-card-detail"
          onClick={() => onSelect?.(spec)}
        >
          Details <ArrowRight size={13} />
        </button>
        <div className="hn-card-tools">
          {onToggleSave && (
            <button
              type="button"
              className="hn-btn hn-card-save"
              onClick={() => onToggleSave(spec.id)}
              aria-pressed={isSaved}
              aria-label={isSaved ? "Remove from saved" : "Save for later"}
            >
              <BookmarkIcon size={15} filled={isSaved} />
              <span>{isSaved ? "Saved" : "Save"}</span>
            </button>
          )}
          {onCopyLink && (
            <button
              type="button"
              className="hn-btn hn-icon-btn"
              onClick={() => onCopyLink(spec)}
              aria-label="Copy link to hackathon"
            >
              {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
            </button>
          )}
          {spec.url && (
            <a
              href={spec.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hn-btn hn-btn-primary"
            >
              {closed ? "View event" : "Register"}
              <ArrowUpRight size={14} />
            </a>
          )}
        </div>
      </div>
    </article>
  );
});
export default HackathonCard;
