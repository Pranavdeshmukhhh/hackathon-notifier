import React, { useEffect, useRef } from 'react';
import { SearchIcon, CompassIcon } from './Icons';

const FORMAT_OPTIONS = [
  { id: 'all', label: 'All Formats' },
  { id: 'offline', label: 'In-Person' },
  { id: 'online', label: 'Remote' },
  { id: 'hybrid', label: 'Hybrid' },
];

const SORT_OPTIONS = [
  { id: 'deadline_asc', label: 'Closing Soonest' },
  { id: 'newest', label: 'Recently Indexed' },
  { id: 'distance_asc', label: 'Nearest Venue' },
];

export function DiscoveryControls({
  searchQuery = '',
  onSearchChange,
  selectedFormat = 'all',
  onFormatChange,
  selectedSource = 'all',
  onSourceChange,
  availableSources = ['devfolio', 'unstop', 'devpost', 'hackerearth', 'devnovate'],
  sortBy = 'deadline_asc',
  onSortChange,
  onUseLocation,
  locationActive = false,
  resultCount = 0,
  onResetFilters,
}) {
  const searchInputRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (
        e.key === '/' &&
        document.activeElement !== searchInputRef.current &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const hasActiveFilters =
    Boolean(searchQuery?.trim()) ||
    selectedFormat !== 'all' ||
    selectedSource !== 'all' ||
    locationActive;

  return (
    <div className="hn-controls-bar" role="region" aria-label="Discovery filters">
      <div className="hn-search-row">
        <div className="hn-input-wrapper">
          <span
            style={{
              position: 'absolute',
              left: '12px',
              color: 'var(--text-tertiary)',
              display: 'inline-flex',
              pointerEvents: 'none',
            }}
          >
            <SearchIcon size={15} />
          </span>
          <input
            ref={searchInputRef}
            type="search"
            className="hn-search-input"
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder="Filter by title, city, college, stack, or organizer..."
            aria-label="Search hackathons"
          />
          <kbd className="hn-kbd">/</kbd>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onUseLocation && (
            <button
              type="button"
              className="hn-btn"
              onClick={onUseLocation}
              aria-pressed={locationActive}
              style={{
                height: '38px',
                borderColor: locationActive ? 'var(--accent-brand)' : undefined,
              }}
            >
              <CompassIcon size={14} />
              <span>{locationActive ? 'Near Me Active' : 'Locate'}</span>
            </button>
          )}
        </div>
      </div>

      <div className="hn-filter-strip">
        <div className="hn-segmented-group" role="group" aria-label="Event format">
          {FORMAT_OPTIONS.map((fmt) => {
            const active = selectedFormat === fmt.id;
            return (
              <button
                key={fmt.id}
                type="button"
                className={`hn-segment-btn ${active ? 'active' : ''}`}
                aria-pressed={active}
                onClick={() => onFormatChange?.(fmt.id)}
              >
                {fmt.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <select
            aria-label="Filter by platform source"
            value={selectedSource}
            onChange={(e) => onSourceChange?.(e.target.value)}
            className="hn-btn"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem' }}
          >
            <option value="all">SOURCE: ALL</option>
            {availableSources.map((src) => (
              <option key={src} value={src}>
                SOURCE: {src.toUpperCase()}
              </option>
            ))}
          </select>

          <select
            aria-label="Sort events"
            value={sortBy}
            onChange={(e) => onSortChange?.(e.target.value)}
            className="hn-btn"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem' }}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                SORT: {opt.label.toUpperCase()}
              </option>
            ))}
          </select>

          {hasActiveFilters && onResetFilters && (
            <button
              type="button"
              className="hn-btn"
              onClick={onResetFilters}
              style={{ color: 'var(--accent-brand)' }}
            >
              Reset
            </button>
          )}

          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.74rem',
              color: 'var(--text-tertiary)',
              marginLeft: '4px',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {resultCount} {resultCount === 1 ? 'EVENT' : 'EVENTS'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default DiscoveryControls;
