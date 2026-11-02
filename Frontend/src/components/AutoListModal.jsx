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
      const parsed = new URL(trimmed);
      if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Invalid URL');
    } catch {
      setStatus('error');
      setMessage('Please enter a valid URL starting with https://');
      return;
    }

    setStatus('loading');
    setMessage('');
    try {
      const result = await submitAutoListUrl(trimmed);
      setStatus('success');
      setMessage(result?.message || 'Thanks! Your event link has been submitted for review.');
      setUrl('');
      onSuccess?.(result);
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'Could not verify that URL. Please check the link and try again.');
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      subtitle="Community contribution"
      title="Submit a hackathon"
      maxWidth="500px"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <p style={{ fontSize: '0.84375rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          Share a public event link from Devfolio, Unstop, Devpost, HackerEarth, or an official university page. Your suggestion goes to a review queue. It is not published automatically.
        </p>

        <div>
          <label
            htmlFor="autolist-url-input"
            style={{
              display: 'block',
              fontSize: '0.78125rem',
              fontWeight: 500,
              color: 'var(--text-primary)',
              marginBottom: '6px',
            }}
          >
            Event registration URL
          </label>
          <input
            id="autolist-url-input"
            type="url"
            required
            maxLength={2048}
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
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.8125rem',
              backgroundColor: status === 'error' ? 'var(--danger-bg)' : 'var(--status-open-bg)',
              color: status === 'error' ? 'var(--danger-text)' : 'var(--status-open-text)',
              border: `1px solid ${status === 'error' ? 'var(--danger-border)' : 'var(--status-open-border)'}`,
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
            {status === 'loading' ? 'Submitting...' : 'Submit link'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export default AutoListModal;
