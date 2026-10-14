import React, { useState } from 'react';
import { Dialog } from './Dialog';
import { submitAutoListUrl } from '../utils/api';

export function AutoListModal({ isOpen, onClose, onSuccess }) {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    try {
      new URL(trimmed);
    } catch {
      setStatus('error');
      setMessage('Enter a valid https:// event URL.');
      return;
    }

    setStatus('loading');
    setMessage('');
    try {
      const result = await submitAutoListUrl(trimmed);
      setStatus('success');
      setMessage(result?.message || 'Event URL queued for verification and indexing.');
      setUrl('');
      onSuccess?.(result);
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'Verification failed. Ensure the URL points to a public hackathon page.');
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      subtitle="AUTONOMOUS INGESTION PIPELINE"
      title="Submit Hackathon URL for Verification"
      maxWidth="520px"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Paste a public event link from Devfolio, Unstop, Devpost, HackerEarth, or an official university domain. The verifier extracts deadlines, geocodes the venue, and publishes to the index.
        </p>

        <div>
          <label htmlFor="autolist-url-input" className="hn-spec-label" style={{ display: 'block', marginBottom: '6px' }}>
            EVENT REGISTRATION URL
          </label>
          <input
            id="autolist-url-input"
            type="url"
            required
            className="hn-search-input"
            style={{ paddingLeft: '12px', paddingRight: '12px' }}
            placeholder="https://devfolio.co/hackathons/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>

        {message && (
          <div
            role="status"
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-xs)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              backgroundColor: status === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'var(--status-open-bg)',
              color: status === 'error' ? '#ef4444' : 'var(--status-open-text)',
              border: '1px solid var(--border-default)',
            }}
          >
            {message}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
          <button type="button" className="hn-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="hn-btn hn-btn-primary"
            disabled={status === 'loading'}
          >
            {status === 'loading' ? 'Verifying URL...' : 'Verify & Index'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export default AutoListModal;
