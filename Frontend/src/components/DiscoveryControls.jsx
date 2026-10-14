import React, { useState, useEffect, useRef } from 'react';
import {
  SearchIcon,
  CompassIcon,
  FilterIcon,
  CloseIcon,
  GridIcon,
  RowsIcon,
  BookmarkIcon,
} from './Icons';

const FORMAT_OPTIONS = [
  { id: 'all', label: 'All formats' },
  { id: 'online', label: 'Online' },
  { id: 'offline', label: 'In-person' },
  { id: 'hybrid', label: 'Hybrid' },
];

const STATUS_OPTIONS = [
  { id: 'all', label: 'Any status' },
  { id: 'open', label: 'Open' },
  { id: 'closing', label: 'Closing soon' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'closed', label: 'Closed' },
];

const SORT_OPTIONS = [
  { id: 'deadline_asc', label: 'Deadline: soonest' },
  { id: 'newest', label: 'Recently added' },
  { id: 'distance_asc', label: 'Nearest location' },
];

export function DiscoveryControls({
  searchQuery = '',
  onSearchChange,
  selectedFormat = 'all',
  onFormatChange,
  selectedStatus = 'all',
  onStatusChange,
  selectedSource = 'all',
  onSourceChange,
  availableSources = ['devfolio', 'unstop', 'devpost', 'hackerearth', 'devnovate'],
  sortBy = 'deadline_asc',
  onSortChange,
  savedOnly = false,
  onToggleSavedOnly,
  savedCount = 0,
  layoutMode = 'grid',
  onLayoutModeChange,
  onUseLocation,
  locationActive = false,
  resultCount = 0,
  onResetFilters,
}) {
  const searchInputRef = useRef(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

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

  const activeFilterChips = [];
  if (selectedFormat !== 'all') {
    const fmt = FORMAT_OPTIONS.find((f) => f.id === selectedFormat);
    activeFilterChips.push({
      key: 'format',
      label: fmt ? fmt.label : selectedFormat,
      onRemove: () => onFormatChange?.('all'),
    });
  }
  if (selectedStatus !== 'all') {
    const st = STATUS_OPTIONS.find((s) => s.id === selectedStatus);
    activeFilterChips.push({
      key: 'status',
      label: st ? st.label : selectedStatus,
      onRemove: () => onStatusChange?.('all'),
    });
  }
  if (selectedSource !== 'all') {
    activeFilterChips.push({
      key: 'source',
      label: `Platform: ${selectedSource}`,
      onRemove: () => onSourceChange?.('all'),
    });
  }
  if (savedOnly) {
    activeFilterChips.push({
      key: 'saved',
      label: 'Saved only',
      onRemove: () => onToggleSavedOnly?.(false),
    });
  }
  if (locationActive) {
    activeFilterChips.push({
      key: 'location',
      label: 'Near my location',
      onRemove: () => onUseLocation?.(),
    });
  }

  const hasActiveFilters = Boolean(searchQuery?.trim()) || activeFilterChips.length > 0;

  return (
    <div className="hn-controls" role="region" aria-label="Search and filter hackathons">
      {/* Primary Search & Quick Controls Row */}
      <div className="hn-controls-primary">
        <div className="hn-search-field">
          <span className="hn-search-icon">
            <SearchIcon size={15} />
          </span>
          <input
            ref={searchInputRef}
            type="search"
            className="hn-search-input"
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder="Search by hackathon name, city, organizer, or topic..."
            aria-label="Search hackathons"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => onSearchChange?.('')}
              aria-label="Clear search query"
              style={{
                position: 'absolute',
                right: '8px',
                border: 'none',
                background: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'inline-flex',
                padding: '4px',
              }}
            >
              <CloseIcon size={14} />
            </button>
          ) : (
            <kbd className="hn-kbd-hint" aria-hidden="true">/</kbd>
          )}
        </div>

        {/* Mobile Filter Drawer Toggle */}
        <button
          type="button"
          className="hn-btn hn-mobile-filter-toggle"
          onClick={() => setMobileFiltersOpen((prev) => !prev)}
          aria-expanded={mobileFiltersOpen}
        >
          <FilterIcon size={14} />
          <span>Filters</span>
          {activeFilterChips.length > 0 && (
            <span className="hn-count-pill">{activeFilterChips.length}</span>
          )}
        </button>

        {onUseLocation && (
          <button
            type="button"
            className="hn-btn"
            onClick={onUseLocation}
            aria-pressed={locationActive}
            style={{
              borderColor: locationActive ? 'var(--accent-primary)' : undefined,
              color: locationActive ? 'var(--accent-primary)' : undefined,
            }}
          >
            <CompassIcon size={14} />
            <span className="hn-nav-label-hide-sm">
              {locationActive ? 'Near me' : 'Nearby'}
            </span>
          </button>
        )}

        {onLayoutModeChange && (
          <div className="hn-segmented" role="group" aria-label="Listing layout">
            <button
              type="button"
              className={`hn-segment ${layoutMode === 'grid' ? 'active' : ''}`}
              aria-pressed={layoutMode === 'grid'}
              onClick={() => onLayoutModeChange('grid')}
              aria-label="Card grid view"
              title="Card view"
            >
              <GridIcon size={14} />
            </button>
            <button
              type="button"
              className={`hn-segment ${layoutMode === 'rows' ? 'active' : ''}`}
              aria-pressed={layoutMode === 'rows'}
              onClick={() => onLayoutModeChange('rows')}
              aria-label="Compact row view"
              title="Row view"
            >
              <RowsIcon size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Secondary Filter Strip (Collapsible on small mobile screens) */}
      <div className={`hn-controls-secondary ${mobileFiltersOpen ? '' : 'mobile-collapsed'}`}>
        <div className="hn-filter-group">
          <div className="hn-segmented" role="group" aria-label="Filter by format">
            {FORMAT_OPTIONS.map((fmt) => {
              const active = selectedFormat === fmt.id;
              return (
                <button
                  key={fmt.id}
                  type="button"
                  className={`hn-segment ${active ? 'active' : ''}`}
                  aria-pressed={active}
                  onClick={() => onFormatChange?.(fmt.id)}
                >
                  {fmt.label}
                </button>
              );
            })}
          </div>

          {onStatusChange && (
            <select
              aria-label="Filter by registration status"
              className="hn-select"
              value={selectedStatus}
              onChange={(e) => onStatusChange(e.target.value)}
            >
              {STATUS_OPTIONS.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.label}
                </option>
              ))}
            </select>
          )}

          <select
            aria-label="Filter by platform source"
            className="hn-select"
            value={selectedSource}
            onChange={(e) => onSourceChange?.(e.target.value)}
          >
            <option value="all">All platforms</option>
            {availableSources.map((src) => (
              <option key={src} value={src}>
                {src.charAt(0).toUpperCase() + src.slice(1)}
              </option>
            ))}
          </select>

          {onToggleSavedOnly && (
            <button
              type="button"
              className="hn-btn"
              aria-pressed={savedOnly}
              onClick={() => onToggleSavedOnly(!savedOnly)}
              style={{
                height: '32px',
                borderColor: savedOnly ? 'var(--accent-primary)' : undefined,
                backgroundColor: savedOnly ? 'var(--accent-subtle)' : undefined,
              }}
            >
              <BookmarkIcon size={13} filled={savedOnly} />
              <span>Saved</span>
              <span className="hn-count-pill">{savedCount}</span>
            </button>
          )}
        </div>

        <div className="hn-filter-group">
          <select
            aria-label="Sort hackathons"
            className="hn-select"
            value={sortBy}
            onChange={(e) => onSortChange?.(e.target.value)}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Active Filter Indicators & Accurate Result Count */}
      <div className="hn-active-filters">
        <div className="hn-chip-list">
          {activeFilterChips.map((chip) => (
            <span key={chip.key} className="hn-active-chip">
              <span>{chip.label}</span>
              <button
                type="button"
                onClick={chip.onRemove}
                aria-label={`Remove ${chip.label} filter`}
              >
                <CloseIcon size={12} />
              </button>
            </span>
          ))}

          {hasActiveFilters && onResetFilters && (
            <button
              type="button"
              className="hn-btn hn-btn-ghost"
              onClick={onResetFilters}
              style={{ height: '26px', padding: '0 8px', fontSize: '0.75rem' }}
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="hn-result-count" aria-live="polite">
          {resultCount} {resultCount === 1 ? 'matching hackathon' : 'matching hackathons'}
        </div>
      </div>
    </div>
  );
}

export default DiscoveryControls;
