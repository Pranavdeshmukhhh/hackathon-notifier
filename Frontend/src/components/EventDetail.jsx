import React, { useEffect } from 'react';
import { normalizeEventPresentation, buildGoogleCalendarUrl } from '../utils/eventPresentation';
import { ExternalArrowIcon, CopyIcon, CheckIcon, CloseIcon, CalendarIcon, BookmarkIcon } from './Icons';

export function EventDetail({
  event,
  isOpen = true,
  onClose,
  onCopyLink,
  copied = false,
  onPrev,
  onNext,
  isSaved = false,
  onToggleSave,
}) {
  useEffect(() => {
    if (!isOpen || !event) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if ((e.key === 'j' || e.key === 'ArrowRight') && onNext) onNext();
      if ((e.key === 'k' || e.key === 'ArrowLeft') && onPrev) onPrev();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, event, onClose, onNext, onPrev]);

  if (!event || !isOpen) return null;
  const spec = event.sourceLabel ? event : normalizeEventPresentation(event);
  const gcalUrl = buildGoogleCalendarUrl(spec);

  return (
    <div
      className="hn-drawer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={spec.title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <aside className="hn-drawer-panel">
        {/* Top Inspector Bar with J/K Stepper */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: '1px solid var(--border-default)',
            background: 'var(--bg-surface)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="hn-platform-badge">
              <span className="hn-platform-dot" style={{ background: spec.sourceColor }} />
              <span>{spec.sourceLabel}</span>
            </span>
            <span className={`hn-status-badge ${spec.lifecycleKey}`}>
              {spec.lifecycleLabel}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {(onPrev || onNext) && (
              <div style={{ display: 'flex', gap: '4px', marginRight: '6px' }}>
                <button
                  type="button"
                  className="hn-btn"
                  onClick={onPrev}
                  disabled={!onPrev}
                  title="Previous event (K)"
                  style={{ padding: '0 8px', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}
                >
                  ↑ K
                </button>
                <button
                  type="button"
                  className="hn-btn"
                  onClick={onNext}
                  disabled={!onNext}
                  title="Next event (J)"
                  style={{ padding: '0 8px', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}
                >
                  ↓ J
                </button>
              </div>
            )}

            {onToggleSave && (
              <button
                type="button"
                className="hn-btn hn-icon-btn"
                onClick={() => onToggleSave(spec.id)}
                aria-label="Save event"
                style={{ color: isSaved ? 'var(--accent-signal)' : undefined }}
              >
                <BookmarkIcon size={14} filled={isSaved} />
              </button>
            )}

            <button
              type="button"
              className="hn-btn hn-icon-btn"
              onClick={onClose}
              aria-label="Close modal"
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        {/* Scrollable Specification Sheet */}
        <div style={{ padding: '24px 22px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '22px' }}>
          <div>
            <div className="hn-spec-label" style={{ marginBottom: '6px' }}>
              VERIFIED COMPETITION DOSSIER
            </div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.25 }}>
              {spec.title}
            </h2>
          </div>

          {/* 6-Cell Telemetry Matrix */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '12px',
              padding: '16px',
              background: 'var(--bg-inset)',
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
              <span className="hn-spec-label">EVENT SCHEDULE</span>
              <span className="hn-spec-value">{spec.dateRangeLabel}</span>
            </div>
            <div className="hn-spec-cell">
              <span className="hn-spec-label">BOUNTY / PRIZE POOL</span>
              <span className="hn-spec-value" style={{ color: 'var(--status-open-text)' }}>
                {spec.prizeLabel}
              </span>
            </div>
            <div className="hn-spec-cell">
              <span className="hn-spec-label">HOST / SQUAD LIMIT</span>
              <span className="hn-spec-value">{spec.organizer} · {spec.teamSizeLabel}</span>
            </div>
          </div>

          {/* Track Overview */}
          <div>
            <div className="hn-spec-label" style={{ marginBottom: '8px' }}>
              OVERVIEW & PROBLEM STATEMENT
            </div>
            <p
              style={{
                fontSize: '0.86rem',
                lineHeight: 1.68,
                color: 'var(--text-secondary)',
                whiteSpace: 'pre-line',
              }}
            >
              {spec.description}
            </p>
          </div>

          {/* Indexed Tags */}
          {spec.tags?.length > 0 && (
            <div>
              <div className="hn-spec-label" style={{ marginBottom: '8px' }}>
                INDEXED TECHNICAL TRACKS
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {spec.tags.map((tag) => (
                  <span key={tag} className="hn-platform-badge">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Calendar & Utility Tools */}
          <div
            style={{
              padding: '14px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div className="hn-spec-label">DEADLINE REMINDER</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Add registration cutoff to your engineering calendar
              </div>
            </div>
            <a
              href={gcalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hn-btn"
            >
              <CalendarIcon size={13} />
              <span>Add to Calendar</span>
            </a>
          </div>
        </div>

        {/* Sticky Drawer Footer */}
        <footer
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--border-default)',
            background: 'var(--bg-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
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
              className="hn-btn hn-btn-signal"
              style={{ height: '34px', padding: '0 16px' }}
            >
              <span>Open Official Registration</span>
              <ExternalArrowIcon />
            </a>
          )}
        </footer>
      </aside>
    </div>
  );
}

export default EventDetail;
