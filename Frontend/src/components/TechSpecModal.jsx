import React from 'react';
import { Dialog } from './Dialog';

export function TechSpecModal({ isOpen, onClose }) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      subtitle="Platform architecture"
      title="How Hackathon Notifier works"
      maxWidth="580px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.84375rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        <p>
          Hackathon Notifier aggregates public listings across major hackathon platforms, normalizes dates and locations, and removes duplicate entries so you can browse active opportunities in one place.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '12px',
            padding: '14px',
            backgroundColor: 'var(--bg-subtle)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div className="hn-meta-item">
            <span className="hn-meta-label">Supported platforms</span>
            <span className="hn-meta-value" style={{ whiteSpace: 'normal' }}>
              Devfolio, Unstop, Devpost, HackerEarth, Devnovate
            </span>
          </div>
          <div className="hn-meta-item">
            <span className="hn-meta-label">Status verification</span>
            <span className="hn-meta-value" style={{ whiteSpace: 'normal' }}>
              Derived from verified registration and event timestamps
            </span>
          </div>
          <div className="hn-meta-item">
            <span className="hn-meta-label">Saved opportunities</span>
            <span className="hn-meta-value" style={{ whiteSpace: 'normal' }}>
              Stored locally in your browser for quick access
            </span>
          </div>
          <div className="hn-meta-item">
            <span className="hn-meta-label">Telegram notifications</span>
            <span className="hn-meta-value" style={{ whiteSpace: 'normal' }}>
              Automated alerts dispatched via our Telegram bot
            </span>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

export default TechSpecModal;
