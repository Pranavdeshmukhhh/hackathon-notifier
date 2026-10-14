import React, { useEffect } from 'react';
import { CloseIcon } from './Icons';

export function Dialog({
  isOpen,
  onClose,
  title,
  subtitle,
  maxWidth = '640px',
  children,
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Dialog'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        backgroundColor: 'rgba(9, 9, 11, 0.74)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth,
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-modal)',
          overflow: 'hidden',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-default)',
          }}
        >
          <div>
            {subtitle && (
              <div className="hn-spec-label" style={{ marginBottom: '2px' }}>
                {subtitle}
              </div>
            )}
            <h2 style={{ fontSize: '1.05rem', fontWeight: 600, letterSpacing: '-0.015em' }}>
              {title}
            </h2>
          </div>
          <button
            type="button"
            className="hn-btn"
            onClick={onClose}
            aria-label="Close modal"
            style={{ width: '32px', padding: 0 }}
          >
            <CloseIcon />
          </button>
        </header>

        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>{children}</div>
      </div>
    </div>
  );
}

export default Dialog;
