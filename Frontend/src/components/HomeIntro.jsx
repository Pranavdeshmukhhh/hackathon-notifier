import React from 'react';

export function HomeIntro({
  totalCount = 0,
  openCount = 0,
  sourcesCount = 6,
  onOpenAutoList,
  onOpenTechSpec,
}) {
  return (
    <section
      aria-label="Hackathon index overview"
      style={{
        padding: '28px 0 22px',
        borderBottom: '1px solid var(--border-default)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: '20px',
      }}
    >
      <div style={{ maxWidth: '660px' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '10px',
            flexWrap: 'wrap',
          }}
        >
          <span className="hn-telemetry-badge">
            <span className="hn-pulse-dot" />
            <span>LIVE TELEMETRY INDEX</span>
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.7rem',
              color: 'var(--text-tertiary)',
              letterSpacing: '0.04em',
            }}
          >
            DEVFOLIO · UNSTOP · DEVPOST · HACKEREARTH · DEVNOVATE
          </span>
        </div>

        <h1
          style={{
            fontSize: 'clamp(1.45rem, 2.5vw, 1.95rem)',
            fontWeight: 600,
            letterSpacing: '-0.03em',
            lineHeight: 1.15,
            color: 'var(--text-primary)',
            marginBottom: '8px',
          }}
        >
          Verified Engineering & Hackathon Directory
        </h1>

        <p
          style={{
            fontSize: '0.875rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.55,
          }}
        >
          Normalized, deduplicated competition feed with automated deadline verification, venue geocoding, and real-time Telegram dispatch.
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '10px',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, auto)',
            gap: '18px',
            padding: '8px 14px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <div>
            <div className="hn-spec-label">INDEXED</div>
            <div className="hn-spec-value">{totalCount}</div>
          </div>
          <div>
            <div className="hn-spec-label">ACTIVE</div>
            <div className="hn-spec-value" style={{ color: 'var(--status-open-text)' }}>
              {openCount}
            </div>
          </div>
          <div>
            <div className="hn-spec-label">SOURCES</div>
            <div className="hn-spec-value">{sourcesCount}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {onOpenTechSpec && (
            <button type="button" className="hn-btn" onClick={onOpenTechSpec}>
              System Architecture
            </button>
          )}
          {onOpenAutoList && (
            <button type="button" className="hn-btn hn-btn-primary" onClick={onOpenAutoList}>
              + Submit Event URL
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

export default HomeIntro;
