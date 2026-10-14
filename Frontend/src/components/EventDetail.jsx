import React from 'react';
import { Dialog } from './Dialog';
import { normalizeEventPresentation } from '../utils/eventPresentation';
import { ExternalArrowIcon, CopyIcon, CheckIcon, BookmarkIcon } from './Icons';

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

  const detailFields = [
    { label: 'Status', value: spec.lifecycleLabel },
    { label: 'Platform', value: spec.sourceLabel },
    { label: 'Organizer', value: spec.organizer },
    { label: 'Format', value: spec.formatLabel },
    { label: 'Location', value: spec.locationLabel },
    { label: 'Registration deadline', value: spec.deadlineDateFormatted || spec.deadlineLabel },
    { label: 'Event dates', value: spec.dateRangeLabel },
    { label: 'Prize pool', value: spec.prizeLabel },
    { label: 'Eligibility', value: spec.eligibilityLabel },
  ].filter((item) => Boolean(item.value));

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      subtitle={`${spec.sourceLabel}${spec.organizer ? ` · ${spec.organizer}` : ''}`}
      title={spec.title}
      maxWidth="660px"
      footer={
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {onToggleSave && (
              <button
                type="button"
                className="hn-btn"
                onClick={() => onToggleSave(spec.id)}
                aria-pressed={isSaved}
              >
                <BookmarkIcon size={14} filled={isSaved} />
                <span>{isSaved ? 'Saved' : 'Save for later'}</span>
              </button>
            )}

            <button
              type="button"
              className="hn-btn"
              onClick={() => onCopyLink?.(spec)}
            >
              {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
              <span>{copied ? 'Link copied' : 'Share link'}</span>
            </button>
          </div>

          {spec.url && (
            <a
              href={spec.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hn-btn hn-btn-primary"
            >
              <span>Register on {spec.sourceLabel}</span>
              <ExternalArrowIcon size={13} />
            </a>
          )}
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Verified Metadata Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: '12px',
            padding: '14px',
            backgroundColor: 'var(--bg-subtle)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          {detailFields.map((field) => (
            <div key={field.label} className="hn-meta-item">
              <span className="hn-meta-label">{field.label}</span>
              <span className="hn-meta-value" style={{ whiteSpace: 'normal' }}>
                {field.value}
              </span>
            </div>
          ))}
        </div>

        {/* Description */}
        {spec.description && (
          <div>
            <h3
              style={{
                fontSize: '0.78rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '8px',
              }}
            >
              About this hackathon
            </h3>
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
        )}

        {/* Themes / Tags */}
        {spec.tags?.length > 0 && (
          <div>
            <h3
              style={{
                fontSize: '0.78rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '8px',
              }}
            >
              Topics & tracks
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {spec.tags.map((tag) => (
                <span key={tag} className="hn-platform-tag">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

export default EventDetail;
