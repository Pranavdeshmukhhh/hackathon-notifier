import React, { useEffect } from 'react';
import { CloseIcon } from './Icons';

export function Dialog({
  isOpen,
  onClose,
  title,
  subtitle,
  maxWidth = '620px',
  children,
  footer,
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
      className="hn-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Dialog'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="hn-modal-surface" style={{ maxWidth }}>
        <header className="hn-modal-header">
          <div>
            {subtitle && (
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  color: 'var(--text-muted)',
                  marginBottom: '4px',
                }}
              >
                {subtitle}
              </div>
            )}
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, letterSpacing: '-0.015em' }}>
              {title}
            </h2>
          </div>

          <button
            type="button"
            className="hn-btn hn-icon-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <CloseIcon size={16} />
          </button>
        </header>

        <div className="hn-modal-body">{children}</div>

        {footer && <footer className="hn-modal-footer">{footer}</footer>}
      </div>
    </div>
  );
}

export default Dialog;
