import React, { useMemo } from 'react';

const PLATFORM_META = [
  { key: 'devfolio', label: 'Devfolio', color: 'var(--src-devfolio)' },
  { key: 'unstop', label: 'Unstop', color: 'var(--src-unstop)' },
  { key: 'devpost', label: 'Devpost', color: 'var(--src-devpost)' },
  { key: 'hackerearth', label: 'HackerEarth', color: 'var(--src-hackerearth)' },
  { key: 'devnovate', label: 'Devnovate', color: 'var(--src-devnovate)' },
];

export function HomeIntro({
  events = [],
  totalCount = 0,
  openCount = 0,
  closingCount = 0,
  offlineCount = 0,
  onSelectSource,
  onOpenAutoList,
  onOpenTechSpec,
}) {
  const sourceDistribution = useMemo(() => {
    const counts = {};
    PLATFORM_META.forEach((p) => { counts[p.key] = 0; });
    events.forEach((e) => {
      const k = (e.sourceKey || e.source || '').toLowerCase();
      if (counts[k] !== undefined) counts[k] += 1;
    });
    const denom = Math.max(1, events.length);
    return PLATFORM_META.map((p) => ({
      ...p,
      count: counts[p.key] || 0,
      pct: Math.max(6, Math.round(((counts[p.key] || 0) / denom) * 100)),
    }));
  }, [events]);

  return (
    <section className="hn-bento-hero" aria-label="Hackathon index overview">
      <span className="hn-crosshair" style={{ bottom: -5, left: -5 }} />
      <span className="hn-crosshair" style={{ bottom: -5, right: -5 }} />

      {/* Left Column: Mission Control & Action Triggers */}
      <div className="hn-bento-main">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <span className="hn-system-pill">
              <span className="hn-live-dot" />
              <span>AUTONOMOUS SCRAPER PIPELINE</span>
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                color: 'var(--text-tertiary)',
                letterSpacing: '0.04em',
              }}
            >
              VERIFIED GEOCODING · SSRF HARDENED · TELEGRAM DISPATCH
            </span>
          </div>

          <h1
            style={{
              fontSize: 'clamp(1.5rem, 2.6vw, 2.1rem)',
              fontWeight: 600,
              letterSpacing: '-0.035em',
              lineHeight: 1.12,
              color: 'var(--text-primary)',
              marginBottom: '10px',
            }}
          >
            Engineering & Hackathon Intelligence Index
          </h1>

          <p
            style={{
              fontSize: '0.86rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.55,
              maxWidth: '58ch',
            }}
          >
            Real-time normalized aggregation across Devfolio, Unstop, Devpost, HackerEarth, and Devnovate. Filter by execution format, proximity radius, or closing urgency.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {onOpenAutoList && (
            <button type="button" className="hn-btn hn-btn-signal" onClick={onOpenAutoList}>
              + Submit Event URL
            </button>
          )}
          {onOpenTechSpec && (
            <button type="button" className="hn-btn" onClick={onOpenTechSpec}>
              Pipeline Spec
            </button>
          )}
        </div>
      </div>

      {/* Right Column: Bento 2x2 KPI Telemetry + Interactive Platform Spectrum */}
      <div className="hn-bento-telemetry">
        <div className="hn-kpi-matrix">
          <div className="hn-kpi-cell">
            <span className="hn-kpi-label">
              <span>INDEXED EVENTS</span>
              <span>TOTAL</span>
            </span>
            <span className="hn-kpi-number">{totalCount}</span>
          </div>

          <div className="hn-kpi-cell">
            <span className="hn-kpi-label">
              <span>OPEN REGISTRATION</span>
              <span style={{ color: 'var(--status-open-dot)' }}>LIVE</span>
            </span>
            <span className="hn-kpi-number" style={{ color: 'var(--status-open-text)' }}>
              {openCount}
            </span>
          </div>

          <div className="hn-kpi-cell">
            <span className="hn-kpi-label">
              <span>CLOSING &lt; 5 DAYS</span>
              <span style={{ color: 'var(--status-closing-dot)' }}>URGENT</span>
            </span>
            <span className="hn-kpi-number" style={{ color: 'var(--status-closing-text)' }}>
              {closingCount}
            </span>
          </div>

          <div className="hn-kpi-cell">
            <span className="hn-kpi-label">
              <span>IN-PERSON VENUES</span>
              <span>GEOCODED</span>
            </span>
            <span className="hn-kpi-number">{offlineCount}</span>
          </div>
        </div>

        {/* Clickable Source Distribution Bar */}
        <div className="hn-spectrum-box">
          <div className="hn-kpi-label">
            <span>PLATFORM INGESTION SPECTRUM</span>
            <span>CLICK TO ISOLATE</span>
          </div>

          <div className="hn-spectrum-bar" role="group" aria-label="Source distribution">
            {sourceDistribution.map((src) => (
              <div
                key={src.key}
                className="hn-spectrum-seg"
                title={`${src.label}: ${src.count} events`}
                onClick={() => onSelectSource?.(src.key)}
                style={{
                  width: `${src.pct}%`,
                  backgroundColor: src.color,
                }}
              />
            ))}
          </div>

          <div className="hn-spectrum-legend">
            {sourceDistribution.map((src) => (
              <button
                key={src.key}
                type="button"
                className="hn-legend-item"
                onClick={() => onSelectSource?.(src.key)}
              >
                <span className="hn-legend-Swatch" style={{ backgroundColor: src.color }} />
                <span>{src.label.toUpperCase()}</span>
                <span style={{ color: 'var(--text-tertiary)' }}>({src.count})</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default HomeIntro;
