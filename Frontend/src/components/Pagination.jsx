import React from 'react';

export function Pagination({
  currentPage = 1,
  totalPages = 1,
  onPageChange,
}) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="Pagination"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 0 36px',
        borderTop: '1px solid var(--border-default)',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.76rem',
      }}
    >
      <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
        PAGE {currentPage} OF {totalPages}
      </span>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          type="button"
          className="hn-btn"
          disabled={currentPage <= 1}
          onClick={() => onPageChange?.(currentPage - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          className="hn-btn"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange?.(currentPage + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  );
}

export default Pagination;
