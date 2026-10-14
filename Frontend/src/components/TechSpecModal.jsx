import React from 'react';
import { Dialog } from './Dialog';

export function TechSpecModal({ isOpen, onClose }) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      subtitle="SYSTEM ARCHITECTURE & PIPELINE TELEMETRY"
      title="Hackathon Notifier Technical Specification"
      maxWidth="620px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '12px',
            padding: '12px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <div className="hn-spec-cell">
            <span className="hn-spec-label">INGESTION SCRAPERS</span>
            <span className="hn-spec-value">Devfolio, Unstop, Devpost, HackerEarth, Devnovate</span>
          </div>
          <div className="hn-spec-cell">
            <span className="hn-spec-label">DEDUPLICATION & STORAGE</span>
            <span className="hn-spec-value">MongoDB + Deterministic Slug & URL Hashing</span>
          </div>
          <div className="hn-spec-cell">
            <span className="hn-spec-label">GEOCODING & LIFECYCLE</span>
            <span className="hn-spec-value">Automated Venue Resolution & Expiry Sweeps</span>
          </div>
          <div className="hn-spec-cell">
            <span className="hn-spec-label">REALTIME DISPATCH</span>
            <span className="hn-spec-value">Telegram Bot Subscriber Broadcast</span>
          </div>
        </div>

        <p style={{ lineHeight: 1.6 }}>
          Events are continuously polled across primary hackathon platforms, verified against SSRF and schema constraints, normalized into a unified lifecycle state machine, and exposed via a resilient public JSON feed.
        </p>
      </div>
    </Dialog>
  );
}

export default TechSpecModal;
