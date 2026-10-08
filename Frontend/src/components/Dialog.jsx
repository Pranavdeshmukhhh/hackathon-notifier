import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/** Shared modal surface with keyboard containment and focus restoration. */
export default function Dialog({ label, onClose, children, className = '' }) {
  const surface = useRef(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const appRoot = document.getElementById('root');
    const previousInert = appRoot?.inert;
    document.body.style.overflow = 'hidden';
    if (appRoot) appRoot.inert = true;
    surface.current.querySelector('[data-dialog-close]').focus();

    const handleKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const controls = [...surface.current.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'
      )].filter(element => element.getClientRects().length && !element.closest('[hidden], [inert]'));
      const first = controls[0];
      const last = controls.at(-1);
      if (!first) { event.preventDefault(); surface.current.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === surface.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
      if (appRoot) appRoot.inert = previousInert;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return createPortal(
    <div className="dialog-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={surface} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
        className={`dialog-surface animate-sheet-pop ${className}`}>
        <button type="button" className="icon-btn dialog-close" data-dialog-close onClick={onClose} aria-label="Close dialog">×</button>
        {children}
      </section>
    </div>, document.body
  );
}
