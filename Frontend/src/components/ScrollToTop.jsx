import React from 'react';

export default function ScrollToTop({ isScrolled, scrollProgress }) {
  if (!isScrolled || scrollProgress <= 10) return null;
  return (
    <button type="button" className="btn btn-ghost back-to-top" aria-label="Scroll to top"
      onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true"><path d="m6 10 6-6 6 6M12 4v16" /></svg>
      Top
    </button>
  );
}
