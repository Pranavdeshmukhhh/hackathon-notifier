import React from 'react';

/** Compatibility exports for older callers. Product surfaces stay static. */
export function CursorSpotlight() { return null; }
export function TiltCard({ children, className = '' }) {
  return <div className={`w-full h-full flex flex-col ${className}`}>{children}</div>;
}
export function CountUp({ value, format = String }) { return <>{format(Number(value) || 0)}</>; }
export function ScrollBar({ progress = 0 }) {
  return <div aria-hidden="true" className="header-progress" style={{ transform: `scaleX(${Math.min(1, Math.max(0, progress))})` }} />;
}
