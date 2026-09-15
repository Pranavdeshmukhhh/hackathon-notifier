import React from 'react';

/**
 * Pagination — Apple HIG–styled page navigator with ellipsis compression.
 * Extracted from App.jsx to keep the main component lean.
 */
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

  const btnBase = "h-11 min-h-[44px] rounded-[12px] apple-squircle apple-touch-target apple-spring-press apple-dual-bevel text-xs font-semibold transition-all cursor-pointer";
  const btnInactive = "bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.10] text-slate-700 dark:text-slate-300 disabled:opacity-30 disabled:pointer-events-none hover:bg-slate-50 dark:hover:bg-white/[0.06] shadow-xs";

  return (
    <div className="flex justify-center items-center gap-2 mt-8">
      <button
        className={`${btnBase} ${btnInactive} px-4`}
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
      >
        Previous
      </button>

      {withEllipsis.map((item, i) =>
        item === '...'
          ? <span key={`e-${i}`} className="px-2 text-slate-400 dark:text-slate-500 text-xs">…</span>
          : <button
              key={item}
              className={`${btnBase} w-11 min-w-[44px] flex items-center justify-center ${
                currentPage === item
                  ? 'bg-[#007AFF] text-white shadow-xs font-bold'
                  : btnInactive
              }`}
              onClick={() => onPageChange(item)}
            >
              {item}
            </button>
      )}

      <button
        className={`${btnBase} ${btnInactive} px-4`}
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
      >
        Next
      </button>
    </div>
  );
}
