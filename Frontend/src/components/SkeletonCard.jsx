import React from 'react';

/** Mirrors event facts without fake information or animated shimmer. */
export default function SkeletonCard({ viewMode = 'grid' }) {
  return (
    <div className={`hcard event-card${viewMode === 'compact' ? ' event-card-compact' : ''}`} aria-hidden="true">
      <div className="event-heading space-y-4">
        <div className="flex justify-between"><div className="skeleton h-3 w-20" /><div className="skeleton h-3 w-12" /></div>
        <div className="space-y-2"><div className="skeleton h-5 w-5/6" /><div className="skeleton h-5 w-3/5" /></div>
        <div className="skeleton h-3 w-40 max-w-full" />
      </div>
      <div className="event-facts">{['event-deadline', '', 'event-location', '', '', ''].map((className, index) => (
        <div key={index} className={`${className} space-y-2`}><div className="skeleton h-3 w-20 max-w-full" /><div className="skeleton h-4 w-28 max-w-full" /></div>
      ))}</div>
      <div className="event-actions"><div className="skeleton h-11 flex-1" /><div className="skeleton h-11 w-20" /></div>
    </div>
  );
}
