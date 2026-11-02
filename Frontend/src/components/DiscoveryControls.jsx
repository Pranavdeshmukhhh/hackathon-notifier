import React, { useState, useEffect, useRef, useId } from "react";
import {
  SearchIcon,
  CompassIcon,
  FilterIcon,
  CloseIcon,
  GridIcon,
  RowsIcon,
  BookmarkIcon,
} from "./Icons";

const FORMAT_OPTIONS = [
  { id: "all", label: "All formats" },
  { id: "online", label: "Online" },
  { id: "offline", label: "In-person" },
  { id: "hybrid", label: "Hybrid" },
];

const STATUS_OPTIONS = [
  { id: "all", label: "Any status" },
  { id: "open", label: "Open" },
  { id: "closing", label: "Closing soon" },
  { id: "upcoming", label: "Upcoming" },
  { id: "closed", label: "Closed" },
  { id: "unknown", label: "Check with organizer" },
];

const SORT_OPTIONS = [
  { id: "deadline_asc", label: "Deadline: soonest" },
  { id: "newest", label: "Recently added" },
  { id: "distance_asc", label: "Nearest location" },
];

export function DiscoveryControls({
  searchQuery = "",
  onSearchChange,
  selectedFormat = "all",
  onFormatChange,
  selectedStatus = "all",
  onStatusChange,
  selectedSource = "all",
  onSourceChange,
  availableSources = [
    "devfolio",
    "unstop",
    "devpost",
    "hackerearth",
    "devnovate",
  ],
  sortBy = "deadline_asc",
  onSortChange,
  savedOnly = false,
  onToggleSavedOnly,
  savedCount = 0,
  layoutMode = "grid",
  onLayoutModeChange,
  onUseLocation,
  locationActive = false,
  locationLoading = false,
  resultCount = 0,
  loading = false,
  onResetFilters,
}) {
  const searchInputRef = useRef(null);
  const filtersToggleRef = useRef(null);
  const filtersId = useId();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const active = document.activeElement;
      if (
        e.defaultPrevented ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        active?.closest('[role="dialog"]')
      )
        return;
      if (
        e.key === "/" &&
        active !== searchInputRef.current &&
        !active?.closest('[contenteditable]:not([contenteditable="false"])') &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(active?.tagName)
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (
        e.key === "Escape" &&
        document.activeElement === searchInputRef.current
      ) {
        searchInputRef.current?.blur();
      }
      if (e.key === "Escape" && mobileFiltersOpen) {
        e.preventDefault();
        setMobileFiltersOpen(false);
        filtersToggleRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileFiltersOpen]);

  const activeFilterChips = [];
  if (selectedFormat !== "all") {
    const fmt = FORMAT_OPTIONS.find((f) => f.id === selectedFormat);
    activeFilterChips.push({
      key: "format",
      label: fmt ? fmt.label : selectedFormat,
      onRemove: () => onFormatChange?.("all"),
    });
  }
  if (selectedStatus !== "all") {
    const st = STATUS_OPTIONS.find((s) => s.id === selectedStatus);
    activeFilterChips.push({
      key: "status",
      label: st ? st.label : selectedStatus,
      onRemove: () => onStatusChange?.("all"),
    });
  }
  if (selectedSource !== "all") {
    activeFilterChips.push({
      key: "source",
      label: `Platform: ${selectedSource}`,
      onRemove: () => onSourceChange?.("all"),
    });
  }
  if (savedOnly) {
    activeFilterChips.push({
      key: "saved",
      label: "Saved only",
      onRemove: () => onToggleSavedOnly?.(false),
    });
  }
  if (locationActive) {
    activeFilterChips.push({
      key: "location",
      label: "Near my location",
      onRemove: () => onUseLocation?.(),
    });
  }

  const hasActiveFilters =
    Boolean(searchQuery?.trim()) || activeFilterChips.length > 0;

  return (
    <div
      className="hn-controls"
      role="region"
      aria-label="Search and filter hackathons"
    >
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
            placeholder="Search hackathons, themes or places"
            maxLength={100}
            aria-label="Search hackathons"
            aria-keyshortcuts="/"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => {
                onSearchChange?.("");
                searchInputRef.current?.focus();
              }}
              aria-label="Clear search query"
              className="hn-search-clear"
            >
              <CloseIcon size={14} />
            </button>
          ) : (
            <kbd className="hn-kbd-hint" aria-hidden="true">
              /
            </kbd>
          )}
        </div>

        {/* Mobile Filter Drawer Toggle */}
        <button
          type="button"
          className="hn-btn hn-mobile-filter-toggle"
          ref={filtersToggleRef}
          onClick={() => setMobileFiltersOpen((prev) => !prev)}
          aria-expanded={mobileFiltersOpen}
          aria-controls={filtersId}
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
            disabled={locationLoading}
            aria-busy={locationLoading}
            aria-label={
              locationLoading
                ? "Finding location"
                : locationActive
                  ? "Near me"
                  : "Nearby"
            }
            aria-pressed={locationActive}
            style={{
              borderColor: locationActive ? "var(--accent-primary)" : undefined,
              color: locationActive ? "var(--accent-primary)" : undefined,
            }}
          >
            <CompassIcon size={14} />
            <span className="hn-nav-label-hide-sm">
              {locationLoading
                ? "Locating…"
                : locationActive
                  ? "Near me"
                  : "Nearby"}
            </span>
          </button>
        )}

        {onLayoutModeChange && (
          <div
            className="hn-segmented"
            role="group"
            aria-label="Listing layout"
          >
            <button
              type="button"
              className={`hn-segment ${layoutMode === "grid" ? "active" : ""}`}
              aria-pressed={layoutMode === "grid"}
              onClick={() => onLayoutModeChange("grid")}
              aria-label="Card grid view"
              title="Card view"
            >
              <GridIcon size={14} />
            </button>
            <button
              type="button"
              className={`hn-segment ${layoutMode === "rows" ? "active" : ""}`}
              aria-pressed={layoutMode === "rows"}
              onClick={() => onLayoutModeChange("rows")}
              aria-label="Compact row view"
              title="Row view"
            >
              <RowsIcon size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Secondary Filter Strip (Collapsible on small mobile screens) */}
      <div
        id={filtersId}
        className={`hn-controls-secondary ${mobileFiltersOpen ? "" : "mobile-collapsed"}`}
      >
        <div className="hn-filter-group">
          <div
            className="hn-segmented"
            role="group"
            aria-label="Filter by format"
          >
            {FORMAT_OPTIONS.map((fmt) => {
              const active = selectedFormat === fmt.id;
              return (
                <button
                  key={fmt.id}
                  type="button"
                  className={`hn-segment ${active ? "active" : ""}`}
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
                height: "32px",
                borderColor: savedOnly ? "var(--accent-primary)" : undefined,
                backgroundColor: savedOnly ? "var(--accent-subtle)" : undefined,
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
              style={{ height: "26px", padding: "0 8px", fontSize: "0.75rem" }}
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="hn-result-count" aria-live="polite">
          {loading
            ? "Finding your next opportunity…"
            : resultCount == null
              ? "Listings unavailable"
              : `${resultCount} ${resultCount === 1 ? "matching hackathon" : "matching hackathons"}`}
        </div>
      </div>
    </div>
  );
}

export default DiscoveryControls;
