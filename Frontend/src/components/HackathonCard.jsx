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
}) {
  if (!event) return null;

  const spec = event.sourceLabel ? event : normalizeEventPresentation(event);

  const handleCardClick = (e) => {
    if (e.target.closest('button') || e.target.closest('a')) return;
    onSelect?.(spec);
  };

  const gaugeColor =
    spec.lifecycleKey === 'closed'
      ? 'var(--status-closed-dot)'
      : spec.lifecycleKey === 'closing'
        ? 'var(--status-closing-dot)'
        : 'var(--status-open-dot)';

  return (
    <article
      className="hn-card"
      style={{ '--card-accent': spec.sourceColor }}
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
      <div>
        {/* Top Telemetry Bar */}
        <div className="hn-card-top">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span className="hn-platform-badge">
              <span className="hn-platform-dot" />
              <span>{spec.sourceLabel}</span>
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.66rem',
                color: 'var(--text-tertiary)',
                padding: '1px 5px',
                border: '1px solid var(--border-hairline)',
                borderRadius: '3px',
              }}
            >
              {spec.formatLabel}
            </span>
          </div>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span className={`hn-status-badge ${spec.lifecycleKey}`}>
              <span
                style={{
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  backgroundColor: 'currentColor',
                }}
              />
              {spec.lifecycleLabel}
            </span>

            {onToggleSave && (
              <button
                type="button"
                className="hn-btn hn-icon-btn"
                onClick={() => onToggleSave(spec.id)}
                aria-label={isSaved ? 'Remove from saved shortlist' : 'Save to shortlist'}
                title={isSaved ? 'Saved in Shortlist' : 'Save to Shortlist'}
                style={{
                  width: '24px',
                  height: '24px',
                  color: isSaved ? 'var(--accent-signal)' : 'var(--text-tertiary)',
                }}
              >
                <BookmarkIcon size={13} filled={isSaved} />
              </button>
            )}
          </div>
        </div>

        {/* Title & Summary */}
        <h2 className="hn-card-title">{spec.title}</h2>
        <p className="hn-card-summary">{spec.summary}</p>

        {/* Tags Strip */}
        {spec.tags?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '12px' }}>
            {spec.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.64rem',
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-subtle)',
                  padding: '1px 6px',
                  borderRadius: '2px',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        {/* Registration Window Urgency Bar */}
        <div className="hn-urgency-track" title={`Registration urgency: ${spec.lifecycleLabel}`}>
          <div
            className="hn-urgency-fill"
            style={{ width: `${spec.urgencyPct}%`, backgroundColor: gaugeColor }}
          />
        </div>

        {/* 2x2 Spec Matrix */}
        <div className="hn-spec-grid">
          <div className="hn-spec-cell">
            <span className="hn-spec-label">VENUE / REGION</span>
            <span className="hn-spec-value" title={spec.locationLabel}>
              {spec.distanceKm != null
                ? `${spec.locationLabel} (${spec.distanceKm} km)`
                : spec.locationLabel}
            </span>
          </div>
          <div className="hn-spec-cell">
            <span className="hn-spec-label">DEADLINE</span>
            <span className="hn-spec-value">{spec.deadlineLabel}</span>
          </div>
          <div className="hn-spec-cell">
            <span className="hn-spec-label">BOUNTY POOL</span>
            <span className="hn-spec-value">{spec.prizeLabel}</span>
          </div>
          <div className="hn-spec-cell">
            <span className="hn-spec-label">HOST / SQUAD</span>
            <span className="hn-spec-value" title={spec.organizer}>
              {spec.organizer}
            </span>
          </div>
        </div>

        {/* Action Bar */}
        <div className="hn-card-footer">
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className="hn-btn"
              onClick={() => onSelect?.(spec)}
            >
              Inspect Spec
            </button>
            {onCopyLink && (
              <button
                type="button"
                className="hn-btn"
                onClick={() => onCopyLink(spec)}
                aria-label="Copy event link"
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
                <span>{copied ? 'Copied' : 'Share'}</span>
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
              <ExternalArrowIcon />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export default HackathonCard;
