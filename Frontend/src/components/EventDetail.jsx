import React from "react";
import {
  ArrowUpRight,
  Bookmark,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";
import { Dialog } from "./Dialog";
import {
  normalizeEventPresentation,
  formatEventDate,
} from "../utils/eventPresentation";

export function EventDetail({
  event,
  isOpen = true,
  onClose,
  onCopyLink,
  copied = false,
  isSaved = false,
  onToggleSave,
}) {
  if (!event || !isOpen) return null;
  const spec = event.sourceLabel ? event : normalizeEventPresentation(event);
  const canonical = spec.raw?.canonical;
  const verified = canonical?.verification?.status === "verified";
  const sources = (canonical?.provenance || []).filter((source) => {
    try {
      const url = new URL(source.url);
      return (
        ["https:", "http:"].includes(url.protocol) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  });
  const fields = [
    ["Organizer", spec.organizer],
    ["Format", spec.formatLabel || "Not listed"],
    ["Location", spec.locationLabel],
    [
      "Registration deadline",
      spec.deadlineDateFormatted ||
        spec.deadlineLabel ||
        "Not confirmed by source",
    ],
    [
      "Registration opens",
      canonical?.registration_opens?.at || canonical?.registration_opens?.date
        ? formatEventDate(
            canonical.registration_opens.at ||
              canonical.registration_opens.date,
          )
        : null,
    ],
    ["Event dates", spec.dateRangeLabel],
    ["Prize pool", spec.prizeLabel],
    ["Team size", spec.teamLabel],
    ["Eligibility", spec.eligibilityLabel],
    [
      "Source checked",
      canonical?.freshness?.last_seen_at
        ? formatEventDate(canonical.freshness.last_seen_at)
        : null,
    ],
  ].filter(([, value]) => value);
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={spec.title}
      subtitle={`${spec.sourceLabel}${spec.organizer ? ` · ${spec.organizer}` : ""}`}
      maxWidth="770px"
      footer={
        <>
          <div style={{ display: "flex", gap: 7 }}>
            {onToggleSave && (
              <button
                type="button"
                className="hn-btn"
                onClick={() => onToggleSave(spec.id)}
                aria-pressed={isSaved}
              >
                <Bookmark size={15} fill={isSaved ? "currentColor" : "none"} />
                {isSaved ? "Saved" : "Save for later"}
              </button>
            )}
            <button
              type="button"
              className="hn-btn"
              onClick={() => onCopyLink?.(spec)}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              <span>{copied ? "Link copied" : "Share link"}</span>
            </button>
          </div>
          {spec.url && (
            <a
              className="hn-btn hn-btn-primary"
              href={spec.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {spec.lifecycleKey === "closed"
                ? `View event on ${spec.sourceLabel}`
                : `Register on ${spec.sourceLabel}`}
              <ArrowUpRight size={15} />
            </a>
          )}
        </>
      }
    >
      <div
        className="hn-detail-content"
        style={{ display: "flex", flexDirection: "column", gap: 23 }}
      >
        <div className="hn-detail-lead">
          <span className={`hn-status ${spec.lifecycleKey}`}>
            <i className="hn-status-dot" />
            {spec.lifecycleLabel}
          </span>
          <span>
            {spec.raw?.canonical?.publication_state === "archived"
              ? "ARCHIVED OPPORTUNITY"
              : "CHECK THE DETAILS. THEN MAKE YOUR MOVE."}
          </span>
        </div>
        <div className="hn-detail-facts">
          {fields.map(([label, value]) => (
            <div key={label} className="hn-meta-item">
              <span className="hn-meta-label">{label}</span>
              <span className="hn-meta-value">{value}</span>
            </div>
          ))}
        </div>
        {spec.description && (
          <div>
            <span className="hn-section-kicker">THE BRIEF</span>
            <p className="hn-detail-description">{spec.description}</p>
          </div>
        )}
        {spec.tags?.length > 0 && (
          <div>
            <span className="hn-section-kicker">THEMES & TRACKS</span>
            <div className="hn-event-tags">
              {spec.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </div>
        )}
        <div className="hn-detail-evidence">
          <strong>
            <ExternalLink size={13} /> Source facts, in context
          </strong>
          <p>
            {verified
              ? "This listing has an evidence-backed administrator verification record."
              : "This listing is not independently verified. Check the organizer’s rules, eligibility and current registration status before joining."}
          </p>
          {canonical?.freshness?.state === "stale" && (
            <p>
              The source has not been seen recently. Details may have changed.
            </p>
          )}
          {canonical?.conflicting_fields?.length > 0 && (
            <p>
              Some source details disagree. Confirm them with the organizer.
            </p>
          )}
          {sources.length > 0 && (
            <div className="hn-detail-source-list">
              {sources.map((source, index) => (
                <a
                  key={`${source.url}-${index}`}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {source.platform || "Source"} <ArrowUpRight size={12} />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
export default EventDetail;
