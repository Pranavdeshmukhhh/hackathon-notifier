import React, { useState, useEffect } from 'react';
import { ArrowUpIcon } from './Icons';

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 420);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      className="hn-btn hn-icon-btn"
      aria-label="Scroll to top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        zIndex: 50,
      }}
    >
      <ArrowUpIcon size={15} />
    </button>
  );
}

export default ScrollToTop;
