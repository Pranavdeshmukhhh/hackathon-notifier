import React from 'react';
import Dialog from './Dialog';

export default function TechSpecModal({ onClose }) {
  return (
    <Dialog label="System Architecture" onClose={onClose} className="dialog-compact">
      <header className="dialog-heading mb-6">
        <p className="eyebrow mb-2">Behind the listings</p>
        <h2 className="text-xl font-semibold">System Architecture</h2>
      </header>
      <div className="dialog-body space-y-6">
        <p className="text-sm text-ink-2">Platform scrapers collect event information. MongoDB stores the listings, FastAPI serves search results, and the React app helps students compare opportunities.</p>
        <div className="inset-surface p-4 mono text-sm leading-relaxed">Scrapers → MongoDB → FastAPI → React</div>
        <dl className="space-y-1 text-sm">
          <div className="dl-row"><dt>Frontend</dt><dd>React 19 · Vite 8</dd></div>
          <div className="dl-row"><dt>Backend</dt><dd>FastAPI · Python 3.12</dd></div>
          <div className="dl-row"><dt>Event storage</dt><dd>MongoDB</dd></div>
          <div className="dl-row"><dt>Notifications</dt><dd>Telegram</dd></div>
          <div className="dl-row"><dt>Location lookup</dt><dd>Nominatim</dd></div>
        </dl>
        <p className="text-sm text-muted">Scan schedules are configured by the operator. Registration and final eligibility details are managed by each event organizer.</p>
      </div>
    </Dialog>
  );
}
