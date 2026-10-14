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
        zIndex: 120,
        padding: '10px 14px',
        backgroundColor: 'var(--text-primary)',
        color: 'var(--bg-canvas)',
        borderRadius: 'var(--radius-sm)',
        fontSize: '0.8125rem',
        fontWeight: 500,
        boxShadow: 'var(--shadow-modal)',
        cursor: 'pointer',
      }}
    >
      {message}
    </div>
  );
}

export default Toast;
