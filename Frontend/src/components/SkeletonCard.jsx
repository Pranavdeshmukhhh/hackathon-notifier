import React from 'react';

/**
 * SkeletonCard — High-fidelity pulsing placeholder card.
 * Matches exact geometry of HackathonCard to prevent layout shift during loading.
 */
export default function SkeletonCard() {
  return (
    <div className="relative overflow-hidden rounded-[24px] apple-squircle border border-black/[0.06] dark:border-white/[0.08] bg-white/70 dark:bg-[#1C1C1E]/60 backdrop-blur-xl p-0 flex flex-col justify-between h-full shadow-xs animate-pulse">
      {/* Top accent bar placeholder */}
      <div className="h-1 w-full bg-slate-200 dark:bg-white/[0.06]" />

      <div className="p-5 sm:p-6 flex flex-col gap-3.5 flex-1">
        {/* Badges row */}
        <div className="flex items-center gap-2 min-h-[26px]">
          <div className="h-5 w-16 rounded-[8px] bg-slate-200 dark:bg-white/[0.08]" />
          <div className="h-5 w-12 rounded-[8px] bg-slate-200 dark:bg-white/[0.08]" />
        </div>

        {/* Title placeholder */}
        <div className="min-h-[46px] flex flex-col justify-center gap-1.5">
          <div className="h-4 w-5/6 rounded-[6px] bg-slate-200 dark:bg-white/[0.08]" />
          <div className="h-4 w-3/5 rounded-[6px] bg-slate-200 dark:bg-white/[0.08]" />
        </div>

        {/* Prize placeholder */}
        <div className="min-h-[30px] flex items-center">
          <div className="h-6 w-32 rounded-[10px] bg-slate-200 dark:bg-white/[0.08]" />
        </div>

        {/* Location placeholder */}
        <div className="min-h-[22px] flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded-full bg-slate-200 dark:bg-white/[0.08]" />
          <div className="h-3.5 w-40 rounded-[4px] bg-slate-200 dark:bg-white/[0.08]" />
        </div>

        {/* Meta grid 2x2 placeholder */}
        <div className="grid grid-cols-2 gap-y-2.5 gap-x-4 mt-auto pt-3.5 border-t border-black/[0.06] dark:border-white/[0.08]">
          <div className="h-3.5 w-24 rounded-[4px] bg-slate-200 dark:bg-white/[0.08]" />
          <div className="h-3.5 w-20 rounded-[4px] bg-slate-200 dark:bg-white/[0.08]" />
          <div className="h-3.5 w-28 rounded-[4px] bg-slate-200 dark:bg-white/[0.08]" />
          <div className="h-3.5 w-20 rounded-[4px] bg-slate-200 dark:bg-white/[0.08]" />
        </div>

        {/* Tags placeholder */}
        <div className="flex gap-1.5 pt-1 min-h-[26px]">
          <div className="h-4 w-14 rounded-[6px] bg-slate-200 dark:bg-white/[0.08]" />
          <div className="h-4 w-16 rounded-[6px] bg-slate-200 dark:bg-white/[0.08]" />
          <div className="h-4 w-12 rounded-[6px] bg-slate-200 dark:bg-white/[0.08]" />
        </div>
      </div>

      {/* Footer CTA placeholder */}
      <div className="px-5 py-3.5 bg-[#F2F2F7]/50 dark:bg-[#2C2C2E]/30 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between gap-3">
        <div className="h-11 flex-1 rounded-[14px] bg-slate-200 dark:bg-white/[0.08]" />
        <div className="h-11 w-11 rounded-[14px] bg-slate-200 dark:bg-white/[0.08]" />
      </div>
    </div>
  );
}
