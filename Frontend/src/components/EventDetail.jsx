import React from 'react';
import { Dialog } from './Dialog';
import { normalizeEventPresentation } from '../utils/eventPresentation';
import { ExternalArrowIcon, CopyIcon, CheckIcon } from './Icons';

export function EventDetail({
  event,
  isOpen = true,
  onClose,
  onCopyLink,
  copied = false,
}) {
  if (!event || !isOpen) return null;
  const spec = event.sourceLabel ? event : normalizeEventPresentation(event);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      subtitle={`${spec.sourceLabel} · ${spec.lifecycleLabel}`}
      title={spec.title}
      maxWidth="680px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
            padding: '14px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <div className="hn-spec-cell">
            <span className="hn-spec-label">EXECUTION FORMAT</span>
            <span className="hn-spec-value">{spec.formatLabel}</span>
          </div>
          <div className="hn-spec-cell">
            <span className="hn-spec-label">VENUE / LOCATION</span>
            <span className="hn-spec-value">{spec.locationLabel}</span>
          </div>
          <div className="hn-spec-cell">
            <span className="hn-spec-label">REGISTRATION DEADLINE</span>
            <span className="hn-spec-value">{spec.deadlineLabel}</span>
          </div>
          <div className="hn-spec-cell">
            <span className="hn-spec-label">SCHEDULE WINDOW</span>
            <span className="hn-spec-value">{spec.dateRangeLabel}</span>
          </div>
          <div className="hn-spec-cell">
            <span className="hn-spec-label">BOUNTY / PRIZE POOL</span>
            <span className="hn-spec-value">{spec.prizeLabel}</span>
          </div>
          <div className="hn-spec-cell">
            <span className="hn-spec-label">ORGANIZER / HOST</span>
            <span className="hn-spec-value">{spec.organizer}</span>
          </div>
        </div>

        <div>
          <div className="hn-spec-label" style={{ marginBottom: '6px' }}>
            OVERVIEW & TRACK SPECIFICATION
          </div>
          <p
            style={{
              fontSize: '0.875rem',
              lineHeight: 1.65,
              color: 'var(--text-secondary)',
              whiteSpace: 'pre-line',
            }}
          >
            {spec.description}
          </p>
        </div>

        {spec.tags?.length > 0 && (
          <div>
            <div className="hn-spec-label" style={{ marginBottom: '6px' }}>
              INDEXED TAGS
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {spec.tags.map((tag) => (
                <span key={tag} className="hn-source-tag">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '14px',
            borderTop: '1px solid var(--border-default)',
          }}
        >
          <button
            type="button"
            className="hn-btn"
            onClick={() => onCopyLink?.(spec)}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            <span>{copied ? 'Permalink Copied' : 'Copy Permalink'}</span>
          </button>

          {spec.url && (
            <a
              href={spec.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hn-btn hn-btn-primary"
            >
              <span>Open Official Registration</span>
              <ExternalArrowIcon />
            </a>
          )}
        </div>
      </div>
    </Dialog>
  );
}

export default EventDetail;
