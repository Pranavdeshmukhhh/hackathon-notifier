import React from 'react';

/**
 * Toast — Apple Dynamic Island–style notification capsule.
 * Renders at fixed bottom-right when visible.
 */
export default function Toast({ message, visible }) {
  if (!visible) return null;

  return (
    <div className="fixed bottom-6 right-6 max-w-[90vw] bg-black/90 dark:bg-white/95 text-white dark:text-black px-4.5 py-2.5 rounded-full shadow-[0_12px_40px_rgba(0,0,0,0.5)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.25)] backdrop-blur-2xl flex items-center gap-3 z-[100] animate-island-toast font-semibold text-xs border border-white/15 dark:border-black/10 select-none">
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#007AFF] opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#007AFF]"></span>
      </span>
      <span className="line-clamp-1">{message}</span>
    </div>
  );
}
