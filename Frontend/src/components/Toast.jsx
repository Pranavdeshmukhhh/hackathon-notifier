import React from 'react';

export function Toast({ message, visible = false, onClose }) {
  if (!visible || !message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onClose}
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 90,
        padding: '10px 14px',
        backgroundColor: 'var(--bg-elevated)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-sm)',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.76rem',
        boxShadow: 'var(--shadow-modal)',
        cursor: 'pointer',
      }}
    >
      {message}
    </div>
  );
}

export default Toast;
