import React from 'react';
import { normalizeEventPresentation } from '../utils/eventPresentation';
import { ExternalArrowIcon, CopyIcon, CheckIcon } from './Icons';

export function HackathonCard({
  event,
  onSelect,
  onCopyLink,
  copied = false,
}) {
  if (!event) return null;

  const spec = event.sourceLabel ? event : normalizeEventPresentation(event);

  const handleCardClick = (e) => {
    if (e.target.closest('button') || e.target.closest('a')) return;
    onSelect?.(spec);
  };

  return (
    <article
      className="hn-card"
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
        <div className="hn-card-header">
          <span className="hn-source-tag">{spec.sourceLabel}</span>
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
        </div>

        <h2 className="hn-card-title">{spec.title}</h2>
        <p className="hn-card-summary">{spec.summary}</p>
      </div>

      <div>
        <div className="hn-spec-grid">
          <div className="hn-spec-cell">
            <span className="hn-spec-label">FORMAT</span>
            <span className="hn-spec-value">{spec.formatLabel}</span>
          </div>
          <div className="hn-spec-cell">
            <span className="hn-spec-label">LOCATION</span>
            <span className="hn-spec-value" title={spec.locationLabel}>
              {spec.distanceKm != null
                ? `${spec.locationLabel} (${spec.distanceKm} km)`
                : spec.locationLabel}
            </span>
          </div>
          <div className="hn-spec-cell">
            <span className="hn-spec-label">DEADLINE / SCHEDULE</span>
            <span className="hn-spec-value">{spec.deadlineLabel}</span>
          </div>
          <div className="hn-spec-cell">
            <span className="hn-spec-label">BOUNTY / TRACK</span>
            <span className="hn-spec-value">{spec.prizeLabel}</span>
          </div>
        </div>

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
