import React from 'react';

/**
 * Pagination — Professional page navigator with ellipsis compression
 * and "Page X of Y" position indicator.
 */

const ChevronLeftIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

export default function Pagination({ currentPage, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) pages.push(i);
  }

  const withEllipsis = [];
  let prev = null;
  for (const page of pages) {
    if (prev !== null && page - prev > 1) withEllipsis.push('...');
    withEllipsis.push(page);
    prev = page;
  }

  const btnBase = "h-10 sm:h-11 min-h-[40px] sm:min-h-[44px] rounded-[12px] apple-squircle apple-touch-target apple-spring-press text-xs font-semibold transition-all duration-200 cursor-pointer select-none";
  const btnInactive = "bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.10] text-slate-700 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-white/[0.06] shadow-xs";

  return (
    <div className="flex flex-col items-center gap-3 mt-8">
      {/* Navigation Controls */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          className={`${btnBase} ${btnInactive} px-3 sm:px-4 flex items-center gap-1.5`}
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label="Previous page"
        >
          <ChevronLeftIcon />
          <span className="hidden sm:inline">Previous</span>
        </button>

        {withEllipsis.map((item, i) =>
          item === '...'
            ? <span key={`e-${i}`} className="px-1.5 sm:px-2 text-slate-400 dark:text-slate-500 text-xs select-none">…</span>
            : <button
                key={item}
                className={`${btnBase} w-10 sm:w-11 min-w-[40px] sm:min-w-[44px] flex items-center justify-center ${
                  currentPage === item
                    ? 'bg-[#007AFF] dark:bg-[#0A84FF] text-white shadow-xs shadow-[#007AFF]/25 font-bold border border-transparent'
                    : btnInactive
                }`}
                onClick={() => onPageChange(item)}
                aria-label={`Go to page ${item}`}
                aria-current={currentPage === item ? 'page' : undefined}
              >
                {item}
              </button>
        )}

        <button
          className={`${btnBase} ${btnInactive} px-3 sm:px-4 flex items-center gap-1.5`}
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          aria-label="Next page"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRightIcon />
        </button>
      </div>

      {/* Page Position Indicator */}
      <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500 tabular-nums tracking-tight">
        Page {currentPage} of {totalPages}
      </div>
    </div>
  );
}
