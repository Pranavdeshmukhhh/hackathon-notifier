import React from 'react';
import { GridViewIcon, ListViewIcon, SearchIcon } from './Icons';
import { EVENT_TYPES, FORMATS } from '../utils/discoveryQuery';

export default function DiscoveryControls({
  search, onSearch, category, onCategory, source, onSource, sources,
  format, onFormat, closingSoon, onClosingSoon, tab, onTab,
  counts, loading, pendingSearch, error, onRefresh, onReset,
  sort, onSort, pageSize, onPageSize, viewMode, onViewMode,
  onNearMe, isLocating, hasLocation,
}) {
  const filters = [
    search.trim() && ['Search', search.trim(), () => onSearch('')],
    category !== 'All' && ['Type', EVENT_TYPES.find(([key]) => key === category)?.[1] || category, () => onCategory('All')],
    source !== 'All' && ['Platform', source, () => onSource('All')],
    format !== 'All' && ['Format', FORMATS.find(([key]) => key === format)?.[1] || format, () => onFormat('All')],
    closingSoon && ['Deadline', 'Next 7 days', () => onClosingSoon(false)],
  ].filter(Boolean);
  const platforms = [...new Set([...sources, ...(source !== 'All' ? [source] : [])])].sort((a, b) => a.localeCompare(b));
  return (
    <div className="discovery-controls">
      <div className="discovery-search-row">
        <div>
          <label htmlFor="discovery-search" className="control-label">Search</label>
          <div className="discovery-search-field">
            <SearchIcon />
            <input id="discovery-search" type="search" maxLength={100} value={search} onChange={event => onSearch(event.target.value)} placeholder="Topic, city, campus, or event name" aria-describedby="discovery-search-hint" />
            {search && <button type="button" className="discovery-clear" aria-label="Clear search" onClick={() => onSearch('')}>×</button>}
          </div>
          <p id="discovery-search-hint" className="control-hint">Search across titles, topics, venues, and campuses.</p>
        </div>
        <button className="btn btn-ghost" type="button" disabled={loading} onClick={onRefresh}>Refresh listings</button>
      </div>

      <div className="discovery-filter-row">
        <label className="control-label">Format<select className="field" value={format} onChange={event => onFormat(event.target.value)}>{FORMATS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="control-label">Event type<select className="field" value={category} onChange={event => onCategory(event.target.value)}>{EVENT_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="control-label">Platform<select className="field" value={source} onChange={event => onSource(event.target.value)}><option value="All">All platforms</option>{platforms.map(platform => <option key={platform} value={platform}>{platform === 'Unique Sources' ? 'Curated sources' : platform === 'Web Discovery' ? 'Open web' : platform}</option>)}</select></label>
      </div>
      <div className="discovery-options-row">
        <label className="discovery-deadline-toggle"><input type="checkbox" checked={closingSoon} disabled={tab === 'missed'} onChange={event => onClosingSoon(event.target.checked)} />Closes within 7 days</label>
        <button type="button" className="home-text-link" disabled={isLocating} onClick={onNearMe}>{isLocating ? 'Finding location…' : hasLocation ? 'Sort near me' : 'Find events near me'}</button>
      </div>
      {closingSoon && <p className="control-hint deadline-hint">Includes listed deadlines from today through the next 7 calendar days. The feed uses UTC dates; confirm the organizer’s closing time.</p>}
      {filters.length > 0 && (
        <div className="discovery-active-filters" role="group" aria-label="Selected filters">
          {filters.map(([label, value, remove]) => <button key={label} type="button" className="selected-filter" onClick={remove} aria-label={`Remove ${label.toLowerCase()} filter: ${value}`}><span>{label}: {value}</span><span aria-hidden="true">×</span></button>)}
          <button type="button" className="home-text-link" onClick={onReset}>Clear filters</button>
        </div>
      )}

      <div className="discovery-toolbar">
        <div className="discovery-status" role="group" aria-label="Event status">
          {[['upcoming', 'Upcoming'], ['missed', 'Past'], ['all', 'All']].map(([key, label]) => <button key={key} type="button" aria-pressed={tab === key} onClick={() => onTab(key)}>{label}{!loading && !pendingSearch && !error && !(closingSoon && key === 'missed') && <span>{counts[key].toLocaleString('en-IN')}</span>}</button>)}
        </div>
        <div className="discovery-display-controls">
          <label className="control-label">Sort by<select className="field" value={sort} onChange={event => onSort(event.target.value)}>
            <option value="deadline">{tab === 'missed' ? 'Deadline: most recent' : 'Deadline: soonest'}</option><option value="newest">Recently added</option><option value="name">Name A–Z</option><option value="distance">Nearest (uses location)</option>
          </select></label>
          <label className="control-label">Per page<select className="field" value={pageSize} onChange={event => onPageSize(Number(event.target.value))}>{[12, 24, 48, 96].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <div className="seg" role="group" aria-label="Results layout">
            <button type="button" aria-label="Card grid view" aria-pressed={viewMode === 'grid'} onClick={() => onViewMode('grid')}><GridViewIcon /></button>
            <button type="button" aria-label="Compact list view" aria-pressed={viewMode === 'compact'} onClick={() => onViewMode('compact')}><ListViewIcon /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
