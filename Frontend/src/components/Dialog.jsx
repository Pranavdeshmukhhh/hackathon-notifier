import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './Icons';

export function Dialog({ isOpen, onClose, title, subtitle, maxWidth = '620px', children, footer }) {
  const surfaceRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const inertSiblings = [...document.body.children].filter((node) => !node.contains(surfaceRef.current));
    const originalInert = inertSiblings.map((node) => node.inert);
    inertSiblings.forEach((node) => { node.inert = true; });
    const focusables = () => [...(surfaceRef.current?.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || [])];
    (focusables()[0] || surfaceRef.current)?.focus();
    const handleKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current?.(); }
      if (event.key !== 'Tab') return;
      const nodes = focusables();
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (!first) { event.preventDefault(); surfaceRef.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !surfaceRef.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !surfaceRef.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
      inertSiblings.forEach((node, i) => { node.inert = originalInert[i]; });
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen]);
  if (!isOpen) return null;
  return createPortal(
    <div className="hn-modal-backdrop" role="dialog" aria-modal="true" aria-label={title || 'Dialog'} onClick={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div className="hn-modal-surface" style={{ maxWidth }} ref={surfaceRef} tabIndex={-1}>
        <header className="hn-modal-header">
          <div>{subtitle && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '5px' }}>{subtitle}</div>}<h2 style={{ fontSize: '1.25rem', fontWeight: 550, letterSpacing: '-0.025em' }}>{title}</h2></div>
          <button type="button" className="hn-btn hn-icon-btn" onClick={onClose} aria-label="Close dialog"><CloseIcon size={17} /></button>
        </header>
        <div className="hn-modal-body">{children}</div>
        {footer && <footer className="hn-modal-footer">{footer}</footer>}
      </div>
    </div>, document.body);
}
export default Dialog;
