import React, { useEffect, useRef } from 'react';
import { SearchIcon, CompassIcon, GridIcon, TableListIcon, BookmarkIcon } from './Icons';

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
  scope = 'all',
  onScopeChange,
  savedCount = 0,
  viewMode = 'grid',
  onViewModeChange,
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
    scope !== 'all' ||
    locationActive;

  return (
    <div className="hn-controls-deck" role="region" aria-label="Discovery filters">
      <div className="hn-controls-top">
        <div className="hn-search-box">
          <span
            style={{
              position: 'absolute',
              left: '11px',
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
            placeholder="Filter by title, city, college, stack (e.g. Rust, eBPF, Mumbai)..."
            aria-label="Search hackathons"
          />
          <div className="hn-kbd-group">
            <kbd className="hn-kbd">/</kbd>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {onUseLocation && (
            <button
              type="button"
              className="hn-btn"
              onClick={onUseLocation}
              aria-pressed={locationActive}
              style={{
                height: '36px',
                borderColor: locationActive ? 'var(--accent-signal)' : undefined,
                color: locationActive ? 'var(--accent-signal)' : undefined,
              }}
            >
              <CompassIcon size={14} />
              <span>{locationActive ? 'Near Me Active' : 'Proximity'}</span>
            </button>
          )}

          {/* Grid vs Table View Switcher */}
          {onViewModeChange && (
            <div className="hn-segmented" role="group" aria-label="Display layout" style={{ height: '36px', alignItems: 'center' }}>
              <button
                type="button"
                className={`hn-seg-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => onViewModeChange('grid')}
                title="Bento Card Grid"
                aria-label="Grid view"
              >
                <GridIcon />
              </button>
              <button
                type="button"
                className={`hn-seg-btn ${viewMode === 'table' ? 'active' : ''}`}
                onClick={() => onViewModeChange('table')}
                title="Terminal Table View"
                aria-label="Table view"
              >
                <TableListIcon />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="hn-controls-bottom">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Format Segmented Control */}
          <div className="hn-segmented" role="group" aria-label="Event format">
            {FORMAT_OPTIONS.map((fmt) => {
              const active = selectedFormat === fmt.id;
              return (
                <button
                  key={fmt.id}
                  type="button"
                  className={`hn-seg-btn ${active ? 'active' : ''}`}
                  aria-pressed={active}
                  onClick={() => onFormatChange?.(fmt.id)}
                >
                  {fmt.label}
                </button>
              );
            })}
          </div>

          {/* Scope Tabs: All vs Closing Soon vs Saved Shortlist */}
          {onScopeChange && (
            <div className="hn-segmented" role="group" aria-label="Feed scope">
              <button
                type="button"
                className={`hn-seg-btn ${scope === 'all' ? 'active' : ''}`}
                onClick={() => onScopeChange('all')}
              >
                All
              </button>
              <button
                type="button"
                className={`hn-seg-btn ${scope === 'closing' ? 'active' : ''}`}
                onClick={() => onScopeChange('closing')}
              >
                Closing Soon
              </button>
              <button
                type="button"
                className={`hn-seg-btn ${scope === 'saved' ? 'active' : ''}`}
                onClick={() => onScopeChange('saved')}
              >
                <BookmarkIcon size={12} filled={scope === 'saved'} />
                <span>Saved</span>
                <span className="hn-seg-count">{savedCount}</span>
              </button>
            </div>
          )}
        </div>

        {/* Right Controls: Source Select, Sort Select, Reset & Counter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <select
            aria-label="Filter by platform source"
            value={selectedSource}
            onChange={(e) => onSourceChange?.(e.target.value)}
            className="hn-btn"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}
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
            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}
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
              style={{ color: 'var(--accent-signal)', borderColor: 'var(--accent-signal)' }}
            >
              Reset
            </button>
          )}

          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              color: 'var(--text-tertiary)',
              fontVariantNumeric: 'tabular-nums',
              paddingLeft: '4px',
            }}
          >
            {resultCount} {resultCount === 1 ? 'MATCH' : 'MATCHES'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default DiscoveryControls;
