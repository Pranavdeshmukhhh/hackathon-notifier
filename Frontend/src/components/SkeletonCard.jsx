import React from 'react';

/** Shares event-card geometry without fake event information or animated shimmer. */
export default function SkeletonCard() {
  return (
    <div className="hcard" aria-hidden="true">
      <div className="hcard-body">
        <div className="flex justify-between"><div className="skeleton h-3 w-20" /><div className="skeleton h-3 w-12" /></div>
        <div className="min-h-[2.7em] space-y-2 text-[21px]"><div className="skeleton h-5 w-5/6" /><div className="skeleton h-5 w-3/5" /></div>
        <div className="min-h-[22px]"><div className="skeleton h-5 w-16" /></div>
        <div className="min-h-[62px] space-y-2"><div className="skeleton h-3 w-16" /><div className="skeleton h-8 w-32" /></div>
        <div className="min-h-[22px]"><div className="skeleton h-4 w-40 max-w-full" /></div>
        <div className="hcard-meta">{[0, 1, 2, 3].map(item => <div key={item} className="space-y-2"><div className="skeleton h-3 w-16" /><div className="skeleton h-4 w-20 max-w-full" /></div>)}</div>
        <div className="min-h-[22px] flex gap-2"><div className="skeleton h-5 w-14" /><div className="skeleton h-5 w-16" /></div>
      </div>
      <div className="hcard-foot h-[54px] items-center px-6"><div className="skeleton h-4 w-28" /></div>
    </div>
  );
}
