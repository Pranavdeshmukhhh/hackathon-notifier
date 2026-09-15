import React from 'react';

/**
 * ScrollToTop — Floating back-to-top capsule with circular progress ring.
 * Appears after scrolling past 10% of the page.
 */
export default function ScrollToTop({ isScrolled, scrollProgress }) {
  if (!isScrolled || scrollProgress <= 10) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-6 left-6 z-40 animate-island-toast pl-2.5 pr-4 py-1.5 rounded-full bg-white/85 dark:bg-[#1C1C1E]/85 backdrop-blur-2xl border border-black/10 dark:border-white/12 shadow-[0_4px_20px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.6)] text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2.5 active:scale-90 hover:scale-105 hover:-translate-y-0.5 transition-all cursor-pointer apple-touch-layer group crystal-pill crystal-chamfer"
      title="Scroll back to top"
      aria-label="Scroll to top"
    >
      <div className="relative w-6 h-6 flex items-center justify-center">
        <svg className="w-6 h-6 -rotate-90" viewBox="0 0 36 36">
          <path
            className="text-black/[0.08] dark:text-white/[0.12]"
            strokeWidth="3.5"
            stroke="currentColor"
            fill="none"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          />
          <path
            className="text-[#007AFF] dark:text-[#0A84FF] transition-all duration-150 ease-out"
            strokeDasharray={`${scrollProgress}, 100`}
            strokeWidth="3.5"
            strokeLinecap="round"
            stroke="currentColor"
            fill="none"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-[#007AFF] dark:text-[#0A84FF] group-hover:-translate-y-0.5 transition-transform duration-200">
          ▲
        </span>
      </div>
      <div className="flex items-center gap-1.5 font-mono">
        <span className="text-[11px] font-bold text-slate-900 dark:text-white group-hover:text-[#007AFF] dark:group-hover:text-[#0A84FF] transition-colors">Top</span>
        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">{Math.round(scrollProgress)}%</span>
      </div>
    </button>
  );
}
