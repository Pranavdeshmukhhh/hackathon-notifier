import React from 'react';
import { normalizeEventPresentation } from '../utils/eventPresentation';
import { ExternalArrowIcon, CopyIcon, CheckIcon, BookmarkIcon } from './Icons';

export function HackathonCard({
  event,
  onSelect,
  onCopyLink,
  copied = false,
  isSaved = false,
  onToggleSave,
  layoutMode = 'grid',
}) {
  if (!event) return null;

  const spec = event.sourceLabel ? event : normalizeEventPresentation(event);

  const handleCardClick = (e) => {
    if (e.target.closest('button') || e.target.closest('a')) return;
    onSelect?.(spec);
  };

  // Build only verified metadata items present in the event data
  const metadataItems = [];
  if (spec.formatLabel) {
    metadataItems.push({ label: 'Format', value: spec.formatLabel });
  }
  if (spec.locationLabel) {
    const locValue =
      spec.distanceKm !== null
        ? `${spec.locationLabel} · ${spec.distanceKm} km`
        : spec.locationLabel;
    metadataItems.push({ label: 'Location', value: locValue });
  }
  if (spec.deadlineLabel) {
    metadataItems.push({ label: 'Deadline', value: spec.deadlineLabel });
  } else if (spec.dateRangeLabel) {
    metadataItems.push({ label: 'Dates', value: spec.dateRangeLabel });
  }
  if (spec.prizeLabel) {
    metadataItems.push({ label: 'Prizes', value: spec.prizeLabel });
  } else if (spec.eligibilityLabel) {
    metadataItems.push({ label: 'Eligibility', value: spec.eligibilityLabel });
  }

  return (
    <article
      className={`hn-card ${layoutMode === 'rows' ? 'hn-card-row-mode' : ''}`}
      onClick={handleCardClick}
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('button, a')) {
          e.preventDefault();
          onSelect?.(spec);
        }
      }}
      aria-label={spec.title}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header: Organizer/Platform + Derived Status */}
        <div className="hn-card-header">
          <div className="hn-organizer-meta">
            <span className="hn-platform-tag">{spec.sourceLabel}</span>
            {spec.organizer && spec.organizer.toLowerCase() !== spec.sourceLabel.toLowerCase() && (
              <span
                style={{
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {spec.organizer}
              </span>
            )}
          </div>

          <span className={`hn-status ${spec.lifecycleKey}`}>
            <span className="hn-status-dot" />
            <span>{spec.lifecycleLabel}</span>
          </span>
        </div>

        {/* Hackathon Name */}
        <h2 className="hn-card-title">{spec.title}</h2>

        {/* Concise Description (Only if available and in Grid mode) */}
        {layoutMode !== 'rows' && spec.summary && (
          <p className="hn-card-description">{spec.summary}</p>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        {/* Verified Metadata Cells */}
        {metadataItems.length > 0 && (
          <div
            className="hn-meta-grid"
            style={
              layoutMode === 'rows'
                ? { borderTop: 'none', paddingTop: 0, display: 'flex', gap: '20px', flexWrap: 'wrap' }
                : undefined
            }
          >
            {metadataItems.slice(0, 4).map((item) => (
              <div key={item.label} className="hn-meta-item">
                <span className="hn-meta-label">{item.label}</span>
                <span className="hn-meta-value" title={item.value}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Card Footer Controls */}
        <div
          className="hn-card-actions"
          style={
            layoutMode === 'rows'
              ? { borderTop: 'none', marginTop: 0, paddingTop: '8px', justifyContent: 'flex-end' }
              : undefined
          }
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              className="hn-btn"
              onClick={() => onSelect?.(spec)}
            >
              Details
            </button>

            {onToggleSave && (
              <button
                type="button"
                className="hn-btn"
                onClick={() => onToggleSave(spec.id)}
                aria-pressed={isSaved}
                aria-label={isSaved ? 'Remove from saved' : 'Save for later'}
                title={isSaved ? 'Saved' : 'Save for later'}
              >
                <BookmarkIcon size={13} filled={isSaved} />
                <span>{isSaved ? 'Saved' : 'Save'}</span>
              </button>
            )}

            {onCopyLink && (
              <button
                type="button"
                className="hn-btn hn-icon-btn"
                onClick={() => onCopyLink(spec)}
                aria-label="Copy link to hackathon"
                title="Copy link"
              >
                {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
              </button>
            )}
          </div>

          {spec.url && (
            <a
              href={spec.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hn-btn hn-btn-primary"
            >
              <span>Register</span>
              <ExternalArrowIcon size={13} />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export default HackathonCard;
