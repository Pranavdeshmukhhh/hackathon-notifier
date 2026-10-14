import React, { useState, useEffect, useMemo, useCallback } from 'react';
import './App.css';
import { HomeIntro } from './components/HomeIntro';
import { DiscoveryControls } from './components/DiscoveryControls';
import { HackathonCard } from './components/HackathonCard';
import { SkeletonCard } from './components/SkeletonCard';
import { EventDetail } from './components/EventDetail';
import { AutoListModal } from './components/AutoListModal';
import { TechSpecModal } from './components/TechSpecModal';
import { AboutProject } from './components/AboutProject';
import { TermsAndConditions } from './components/TermsAndConditions';
import { Pagination } from './components/Pagination';
import { Toast } from './components/Toast';
import { ScrollToTop } from './components/ScrollToTop';
import {
  SunIcon,
  MoonIcon,
  TerminalIcon,
  SearchIcon,
  ExternalArrowIcon,
  BookmarkIcon,
  CommandIcon,
} from './components/Icons';
import { useDarkMode } from './hooks/useDarkMode';
import { useCopyLink } from './hooks/useCopyLink';
import { useGeolocation } from './hooks/useGeolocation';
import { useScrollProgress } from './hooks/useScrollProgress';
import { fetchPublicEvents } from './utils/api';
import { filterAndSortEvents } from './utils/discoveryQuery';
import { normalizeEventPresentation } from './utils/eventPresentation';
import { getEventIdFromUrl, pushEventRoute } from './utils/eventRoute';

const PAGE_SIZE = 12;

export function App() {
  const [darkMode, toggleDarkMode] = useDarkMode(true);
  const { copiedId, copyLink } = useCopyLink(2000);
  const { coords: userCoords, requestLocation, clearLocation, isActive: locationActive } = useGeolocation();
  const scrollProgress = useScrollProgress();

  const [rawEvents, setRawEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Workspace Controls
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('all');
  const [selectedSource, setSelectedSource] = useState('all');
  const [sortBy, setSortBy] = useState('deadline_asc');
  const [scope, setScope] = useState('all'); // 'all' | 'closing' | 'saved'
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'
  const [currentPage, setCurrentPage] = useState(1);

  // Persisted Shortlist Bookmarks
  const [savedIds, setSavedIds] = useState(() => {
    try {
      const raw = window.localStorage.getItem('hn-saved-ids');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Modals & Command Palette
  const [activeEvent, setActiveEvent] = useState(null);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState('');
  const [autoListOpen, setAutoListOpen] = useState(false);
  const [techSpecOpen, setTechSpecOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  const toggleSaveEvent = useCallback((id) => {
    setSavedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        window.localStorage.setItem('hn-saved-ids', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Global Cmd+K / Ctrl+K Listener
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { events } = await fetchPublicEvents();
      const normalized = events.map(normalizeEventPresentation);
      setRawEvents(normalized);

      const initialId = getEventIdFromUrl();
      if (initialId) {
        const match = normalized.find((e) => String(e.id) === String(initialId));
        if (match) setActiveEvent(match);
      }
    } catch (err) {
      setError(err?.message || 'Unable to synchronize hackathon index.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const filteredEvents = useMemo(
    () =>
      filterAndSortEvents(rawEvents, {
        search: searchQuery,
        format: selectedFormat,
        source: selectedSource,
        sort: sortBy,
        scope,
        savedIds,
        userCoords,
      }),
    [rawEvents, searchQuery, selectedFormat, selectedSource, sortBy, scope, savedIds, userCoords]
  );

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE));
  const paginatedEvents = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredEvents.slice(start, start + PAGE_SIZE);
  }, [filteredEvents, currentPage]);

  // Telemetry Counters
  const openCount = useMemo(() => rawEvents.filter((e) => e.lifecycleKey !== 'closed').length, [rawEvents]);
  const closingCount = useMemo(() => rawEvents.filter((e) => e.lifecycleKey === 'closing').length, [rawEvents]);
  const offlineCount = useMemo(() => rawEvents.filter((e) => e.formatKey === 'offline').length, [rawEvents]);

  const handleSelectEvent = (ev) => {
    setActiveEvent(ev);
    pushEventRoute(ev?.id || null);
  };

  const handleCloseDetail = () => {
    setActiveEvent(null);
    pushEventRoute(null);
  };

  // J / K Stepping inside Inspector Drawer
  const activeIndex = useMemo(
    () => (activeEvent ? filteredEvents.findIndex((e) => e.id === activeEvent.id) : -1),
    [activeEvent, filteredEvents]
  );

  const handlePrevEvent = activeIndex > 0 ? () => handleSelectEvent(filteredEvents[activeIndex - 1]) : null;
  const handleNextEvent =
    activeIndex >= 0 && activeIndex < filteredEvents.length - 1
      ? () => handleSelectEvent(filteredEvents[activeIndex + 1])
      : null;

  const handleToggleLocation = () => {
    requestLocation();
    if (!locationActive) setSortBy('distance_asc');
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedFormat('all');
    setSelectedSource('all');
    setSortBy('deadline_asc');
    setScope('all');
    clearLocation();
    setCurrentPage(1);
  };

  // Command Palette Matches
  const cmdMatches = useMemo(() => {
    const q = cmdQuery.trim().toLowerCase();
    if (!q) return rawEvents.slice(0, 5);
    return rawEvents
      .filter((e) => [e.title, e.sourceLabel, e.locationLabel, e.organizer].join(' ').toLowerCase().includes(q))
      .slice(0, 6);
  }, [rawEvents, cmdQuery]);

  return (
    <div className="hn-shell">
      <div className="hn-progress-bar" style={{ width: `${scrollProgress}%` }} />

      {/* Sticky Industrial Top Bar */}
      <header className="hn-navbar">
        <div className="hn-brand-group">
          <a href="/" className="hn-brand">
            <span className="hn-brand-mark">HN</span>
            <span>Hackathon Notifier</span>
          </a>
          <span className="hn-nav-divider" />
          <span className="hn-system-pill">
            <span className="hn-live-dot" />
            <span>v2.4 INDEX</span>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="hn-btn"
            onClick={() => setCmdOpen(true)}
            title="Open Command Palette (Cmd+K)"
          >
            <CommandIcon size={13} />
            <span>Command</span>
            <kbd className="hn-kbd" style={{ marginLeft: '4px' }}>⌘K</kbd>
          </button>

          <button type="button" className="hn-btn" onClick={() => setAboutOpen(true)}>
            About
          </button>

          <a
            href="https://t.me/"
            target="_blank"
            rel="noopener noreferrer"
            className="hn-btn"
            title="Telegram Dispatch Bot"
          >
            <TerminalIcon size={14} />
            <span>Telegram</span>
          </a>

          <button
            type="button"
            className="hn-btn hn-icon-btn"
            onClick={toggleDarkMode}
            aria-label="Toggle color theme"
          >
            {darkMode ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <HomeIntro
          events={rawEvents}
          totalCount={rawEvents.length}
          openCount={openCount}
          closingCount={closingCount}
          offlineCount={offlineCount}
          onSelectSource={(srcKey) => {
            setSelectedSource((prev) => (prev === srcKey ? 'all' : srcKey));
            setCurrentPage(1);
          }}
          onOpenAutoList={() => setAutoListOpen(true)}
          onOpenTechSpec={() => setTechSpecOpen(true)}
        />

        <DiscoveryControls
          searchQuery={searchQuery}
          onSearchChange={(q) => {
            setSearchQuery(q);
            setCurrentPage(1);
          }}
          selectedFormat={selectedFormat}
          onFormatChange={(fmt) => {
            setSelectedFormat(fmt);
            setCurrentPage(1);
          }}
          selectedSource={selectedSource}
          onSourceChange={(src) => {
            setSelectedSource(src);
            setCurrentPage(1);
          }}
          sortBy={sortBy}
          onSortChange={setSortBy}
          scope={scope}
          onScopeChange={(sc) => {
            setScope(sc);
            setCurrentPage(1);
          }}
          savedCount={savedIds.length}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onUseLocation={handleToggleLocation}
          locationActive={locationActive}
          resultCount={filteredEvents.length}
          onResetFilters={handleResetFilters}
        />

        <div className="hn-workspace">
          {loading && (
            <div className="hn-card-grid" aria-live="polite">
              {Array.from({ length: 6 }).map((_, idx) => (
                <SkeletonCard key={idx} />
              ))}
            </div>
          )}

          {!loading && error && (
            <div
              role="alert"
              style={{
                margin: '24px 0',
                padding: '24px',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div className="hn-spec-label" style={{ color: 'var(--accent-signal)' }}>
                  INDEX SYNCHRONIZATION ERROR
                </div>
                <p style={{ fontSize: '0.88rem', marginTop: '4px', color: 'var(--text-primary)' }}>
                  {error}
                </p>
              </div>
              <button type="button" className="hn-btn hn-btn-primary" onClick={loadEvents}>
                Retry Connection
              </button>
            </div>
          )}

          {!loading && !error && filteredEvents.length === 0 && (
            <div
              style={{
                margin: '24px 0',
                padding: '44px 24px',
                textAlign: 'center',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div className="hn-spec-label">ZERO MATCHING EVENTS</div>
              <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', margin: '8px 0 16px' }}>
                No indexed hackathons match your active filter parameters.
              </p>
              <button type="button" className="hn-btn" onClick={handleResetFilters}>
                Reset Active Filters
              </button>
            </div>
          )}

          {/* MODE 1: Tactile Bento Card Grid */}
          {!loading && !error && paginatedEvents.length > 0 && viewMode === 'grid' && (
            <div className="hn-card-grid">
              {paginatedEvents.map((ev) => (
                <HackathonCard
                  key={ev.id}
                  event={ev}
                  onSelect={handleSelectEvent}
                  onCopyLink={copyLink}
                  copied={copiedId === ev.id}
                  isSaved={savedIds.includes(ev.id)}
                  onToggleSave={toggleSaveEvent}
                />
              ))}
            </div>
          )}

          {/* MODE 2: High-Density Linear-Style Terminal Table */}
          {!loading && !error && paginatedEvents.length > 0 && viewMode === 'table' && (
            <div className="hn-table-wrap">
              <table className="hn-table">
                <thead>
                  <tr>
                    <th>STATUS</th>
                    <th>COMPETITION & HOST</th>
                    <th>SOURCE</th>
                    <th>FORMAT</th>
                    <th>VENUE / REGION</th>
                    <th>DEADLINE</th>
                    <th>BOUNTY</th>
                    <th style={{ textAlign: 'right' }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedEvents.map((ev) => {
                    const saved = savedIds.includes(ev.id);
                    return (
                      <tr key={ev.id} onClick={() => handleSelectEvent(ev)}>
                        <td>
                          <span className={`hn-status-badge ${ev.lifecycleKey}`}>
                            {ev.lifecycleLabel}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{ev.title}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                            {ev.organizer}
                          </div>
                        </td>
                        <td>
                          <span className="hn-platform-badge">
                            <span className="hn-platform-dot" style={{ background: ev.sourceColor }} />
                            <span>{ev.sourceLabel}</span>
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem' }}>
                          {ev.formatLabel}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                          {ev.locationLabel}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', fontVariantNumeric: 'tabular-nums' }}>
                          {ev.deadlineLabel}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--status-open-text)' }}>
                          {ev.prizeLabel}
                        </td>
                        <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="hn-btn hn-icon-btn"
                              onClick={() => toggleSaveEvent(ev.id)}
                              style={{ color: saved ? 'var(--accent-signal)' : undefined }}
                            >
                              <BookmarkIcon size={13} filled={saved} />
                            </button>
                            {ev.url && (
                              <a
                                href={ev.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hn-btn hn-btn-primary"
                              >
                                <span>Register</span>
                                <ExternalArrowIcon />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !error && paginatedEvents.length > 0 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={(page) => {
                setCurrentPage(page);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          )}
        </div>
      </main>

      {/* Raycast-Style Cmd+K Command Palette */}
      {cmdOpen && (
        <div
          className="hn-cmd-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCmdOpen(false);
          }}
        >
          <div className="hn-cmd-box" role="dialog" aria-label="Command Palette">
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{ position: 'absolute', left: '14px', color: 'var(--text-tertiary)', display: 'inline-flex' }}>
                <SearchIcon size={16} />
              </span>
              <input
                type="text"
                autoFocus
                className="hn-cmd-input"
                placeholder="Type a command or search hackathons..."
                value={cmdQuery}
                onChange={(e) => setCmdQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setCmdOpen(false);
                }}
              />
            </div>

            <div className="hn-cmd-list">
              <div className="hn-spec-label" style={{ padding: '6px 10px' }}>QUICK ACTIONS</div>
              <button
                type="button"
                className="hn-cmd-item"
                onClick={() => {
                  setCmdOpen(false);
                  setAutoListOpen(true);
                }}
              >
                <span>+ Submit Hackathon URL for Verification</span>
                <kbd className="hn-kbd">INGEST</kbd>
              </button>
              <button
                type="button"
                className="hn-cmd-item"
                onClick={() => {
                  setViewMode((v) => (v === 'grid' ? 'table' : 'grid'));
                  setCmdOpen(false);
                }}
              >
                <span>Switch Layout ({viewMode === 'grid' ? 'Terminal Table' : 'Bento Grid'})</span>
                <kbd className="hn-kbd">VIEW</kbd>
              </button>
              <button
                type="button"
                className="hn-cmd-item"
                onClick={() => {
                  toggleDarkMode();
                  setCmdOpen(false);
                }}
              >
                <span>Toggle Carbon Dark / Drafting Light Theme</span>
                <kbd className="hn-kbd">THEME</kbd>
              </button>

              {cmdMatches.length > 0 && (
                <>
                  <div className="hn-spec-label" style={{ padding: '10px 10px 4px' }}>INDEXED HACKATHONS</div>
                  {cmdMatches.map((ev) => (
                    <button
                      key={ev.id}
                      type="button"
                      className="hn-cmd-item"
                      onClick={() => {
                        setCmdOpen(false);
                        handleSelectEvent(ev);
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ev.title}
                      </span>
                      <span className="hn-platform-badge">{ev.sourceLabel}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <footer className="hn-footer">
        <div>HACKATHON NOTIFIER · AUTONOMOUS ENGINEERING EVENT TELEMETRY</div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <button
            type="button"
            onClick={() => setTechSpecOpen(true)}
            style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer' }}
          >
            Architecture
          </button>
          <button
            type="button"
            onClick={() => setTermsOpen(true)}
            style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer' }}
          >
            Terms & Conditions
          </button>
        </div>
      </footer>

      <EventDetail
        event={activeEvent}
        isOpen={Boolean(activeEvent)}
        onClose={handleCloseDetail}
        onCopyLink={copyLink}
        copied={Boolean(activeEvent && copiedId === activeEvent.id)}
        onPrev={handlePrevEvent}
        onNext={handleNextEvent}
        isSaved={Boolean(activeEvent && savedIds.includes(activeEvent.id))}
        onToggleSave={toggleSaveEvent}
      />

      <AutoListModal
        isOpen={autoListOpen}
        onClose={() => setAutoListOpen(false)}
        onSuccess={() => loadEvents()}
      />

      <TechSpecModal isOpen={techSpecOpen} onClose={() => setTechSpecOpen(false)} />
      <AboutProject isOpen={aboutOpen} onClose={() => setAboutOpen(false)} />
      <TermsAndConditions isOpen={termsOpen} onClose={() => setTermsOpen(false)} />
      <Toast visible={Boolean(copiedId)} message="Event permalink copied to clipboard" />
      <ScrollToTop />
    </div>
  );
}

export default App;
