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
import { SunIcon, MoonIcon, BookmarkIcon } from './components/Icons';
import { useDarkMode } from './hooks/useDarkMode';
import { useCopyLink } from './hooks/useCopyLink';
import { useGeolocation } from './hooks/useGeolocation';
import { useScrollProgress } from './hooks/useScrollProgress';
import { fetchPublicEvents } from './utils/api';
import {
  filterAndSortEvents,
  parseDiscoveryStateFromUrl,
  syncDiscoveryStateToUrl,
} from './utils/discoveryQuery';
import { normalizeEventPresentation } from './utils/eventPresentation';
import { getEventIdFromUrl, pushEventRoute } from './utils/eventRoute';

const PAGE_SIZE = 12;

export function App() {
  const [darkMode, toggleDarkMode] = useDarkMode(false);
  const { copiedId, copyLink } = useCopyLink(2000);
  const {
    coords: userCoords,
    geoError,
    requestLocation,
    clearLocation,
    isActive: locationActive,
  } = useGeolocation();
  const scrollProgress = useScrollProgress();

  // Initialize discovery state from URL parameters
  const initialUrlState = useMemo(() => parseDiscoveryStateFromUrl(), []);

  const [rawEvents, setRawEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchQuery, setSearchQuery] = useState(initialUrlState.search);
  const [debouncedSearch, setDebouncedSearch] = useState(initialUrlState.search);
  const [selectedFormat, setSelectedFormat] = useState(initialUrlState.format);
  const [selectedStatus, setSelectedStatus] = useState(initialUrlState.status);
  const [selectedSource, setSelectedSource] = useState(initialUrlState.source);
  const [sortBy, setSortBy] = useState(initialUrlState.sort);
  const [savedOnly, setSavedOnly] = useState(initialUrlState.savedOnly);
  const [currentPage, setCurrentPage] = useState(initialUrlState.page);
  const [layoutMode, setLayoutMode] = useState('grid');

  // Persisted Saved Hackathons
  const [savedIds, setSavedIds] = useState(() => {
    try {
      const stored = window.localStorage.getItem('hn-saved-hackathons');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Modals
  const [activeEvent, setActiveEvent] = useState(null);
  const [autoListOpen, setAutoListOpen] = useState(false);
  const [techSpecOpen, setTechSpecOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  // Debounce search input slightly for smooth typing while keeping tests responsive
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 120);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Synchronize filter state to URL query parameters
  useEffect(() => {
    syncDiscoveryStateToUrl({
      search: debouncedSearch,
      format: selectedFormat,
      status: selectedStatus,
      source: selectedSource,
      sort: sortBy,
      savedOnly,
      page: currentPage,
    });
  }, [debouncedSearch, selectedFormat, selectedStatus, selectedSource, sortBy, savedOnly, currentPage]);

  // Handle Browser Back / Forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const nextState = parseDiscoveryStateFromUrl();
      setSearchQuery(nextState.search);
      setDebouncedSearch(nextState.search);
      setSelectedFormat(nextState.format);
      setSelectedStatus(nextState.status);
      setSelectedSource(nextState.source);
      setSortBy(nextState.sort);
      setSavedOnly(nextState.savedOnly);
      setCurrentPage(nextState.page);

      const eventId = getEventIdFromUrl();
      if (eventId && rawEvents.length > 0) {
        const found = rawEvents.find((e) => String(e.id) === String(eventId));
        setActiveEvent(found || null);
      } else {
        setActiveEvent(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [rawEvents]);

  const toggleSaveEvent = useCallback((id) => {
    setSavedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      try {
        window.localStorage.setItem('hn-saved-hackathons', JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { events } = await fetchPublicEvents();
      const normalized = events.map(normalizeEventPresentation);
      setRawEvents(normalized);

      const deepLinkedId = getEventIdFromUrl();
      if (deepLinkedId) {
        const found = normalized.find((e) => String(e.id) === String(deepLinkedId));
        if (found) setActiveEvent(found);
      }
    } catch (err) {
      setError(err?.message || 'Unable to load hackathons right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Dynamically derive available sources from actual data when present
  const availableSources = useMemo(() => {
    const base = ['devfolio', 'unstop', 'devpost', 'hackerearth', 'devnovate'];
    const fromData = rawEvents
      .map((e) => e.sourceKey)
      .filter((s) => s && s !== 'web_discovery');
    return Array.from(new Set([...base, ...fromData]));
  }, [rawEvents]);

  const filteredEvents = useMemo(
    () =>
      filterAndSortEvents(rawEvents, {
        search: searchQuery,
        format: selectedFormat,
        status: selectedStatus,
        source: selectedSource,
        sort: sortBy,
        savedOnly,
        savedIds,
        userCoords,
      }),
    [rawEvents, searchQuery, selectedFormat, selectedStatus, selectedSource, sortBy, savedOnly, savedIds, userCoords]
  );

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE));
  const paginatedEvents = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredEvents.slice(start, start + PAGE_SIZE);
  }, [filteredEvents, currentPage, totalPages]);

  const openCount = useMemo(
    () => rawEvents.filter((e) => e.lifecycleKey === 'open' || e.lifecycleKey === 'closing').length,
    [rawEvents]
  );
  const closingCount = useMemo(
    () => rawEvents.filter((e) => e.lifecycleKey === 'closing').length,
    [rawEvents]
  );

  const handleSelectEvent = (ev) => {
    setActiveEvent(ev);
    pushEventRoute(ev?.id || null);
  };

  const handleCloseDetail = () => {
    setActiveEvent(null);
    pushEventRoute(null);
  };

  const handleToggleLocation = () => {
    requestLocation();
    if (!locationActive) setSortBy('distance_asc');
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    setSelectedFormat('all');
    setSelectedStatus('all');
    setSelectedSource('all');
    setSortBy('deadline_asc');
    setSavedOnly(false);
    clearLocation();
    setCurrentPage(1);
  };

  return (
    <div className="hn-app-shell">
      <div className="hn-scroll-progress" style={{ width: `${scrollProgress}%` }} />

      {/* Header */}
      <header className="hn-header">
        <div className="hn-container hn-header-inner">
          <a
            href="/"
            className="hn-brand-link"
            onClick={(e) => {
              if (!e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                handleResetFilters();
              }
            }}
          >
            <span className="hn-wordmark-badge">HN</span>
            <span>Hackathon Notifier</span>
          </a>

          <nav className="hn-nav" aria-label="Primary navigation">
            <button
              type="button"
              className={`hn-nav-btn ${!savedOnly && selectedStatus === 'all' ? 'active' : ''}`}
              onClick={() => {
                setSavedOnly(false);
                setSelectedStatus('all');
                setCurrentPage(1);
              }}
            >
              Browse
            </button>

            <button
              type="button"
              className={`hn-nav-btn ${selectedStatus === 'closing' ? 'active' : ''}`}
              onClick={() => {
                setSavedOnly(false);
                setSelectedStatus((prev) => (prev === 'closing' ? 'all' : 'closing'));
                setCurrentPage(1);
              }}
            >
              <span>Closing soon</span>
              {closingCount > 0 && <span className="hn-count-pill">{closingCount}</span>}
            </button>

            <button
              type="button"
              className={`hn-nav-btn ${savedOnly ? 'active' : ''}`}
              onClick={() => {
                setSavedOnly((prev) => !prev);
                setCurrentPage(1);
              }}
            >
              <BookmarkIcon size={13} filled={savedOnly} />
              <span>Saved</span>
              {savedIds.length > 0 && <span className="hn-count-pill">{savedIds.length}</span>}
            </button>

            <button
              type="button"
              className="hn-nav-btn hn-nav-label-hide-sm"
              onClick={() => setAboutOpen(true)}
            >
              About
            </button>

            <button
              type="button"
              className="hn-btn hn-icon-btn"
              onClick={toggleDarkMode}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              title={darkMode ? 'Light mode' : 'Dark mode'}
            >
              {darkMode ? <SunIcon size={15} /> : <MoonIcon size={15} />}
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="hn-container" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <HomeIntro
          totalCount={rawEvents.length}
          openCount={openCount}
          closingCount={closingCount}
          onFilterStatus={(statusKey) => {
            setSavedOnly(false);
            setSelectedStatus((prev) => (prev === statusKey ? 'all' : statusKey));
            setCurrentPage(1);
          }}
          onOpenAutoList={() => setAutoListOpen(true)}
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
          selectedStatus={selectedStatus}
          onStatusChange={(st) => {
            setSelectedStatus(st);
            setCurrentPage(1);
          }}
          selectedSource={selectedSource}
          onSourceChange={(src) => {
            setSelectedSource(src);
            setCurrentPage(1);
          }}
          availableSources={availableSources}
          sortBy={sortBy}
          onSortChange={setSortBy}
          savedOnly={savedOnly}
          onToggleSavedOnly={(val) => {
            setSavedOnly(val);
            setCurrentPage(1);
          }}
          savedCount={savedIds.length}
          layoutMode={layoutMode}
          onLayoutModeChange={setLayoutMode}
          onUseLocation={handleToggleLocation}
          locationActive={locationActive}
          resultCount={filteredEvents.length}
          onResetFilters={handleResetFilters}
        />

        {geoError && (
          <div
            role="status"
            style={{
              marginTop: '12px',
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--status-closing-bg)',
              color: 'var(--status-closing-text)',
              border: '1px solid var(--status-closing-border)',
              fontSize: '0.8125rem',
            }}
          >
            {geoError}
          </div>
        )}

        <section className="hn-directory-section" aria-label="Hackathon listings">
          {/* Loading State */}
          {loading && (
            <div className="hn-card-grid" aria-live="polite">
              {Array.from({ length: 6 }).map((_, idx) => (
                <SkeletonCard key={idx} />
              ))}
            </div>
          )}

          {/* Error Recovery State */}
          {!loading && error && (
            <div
              role="alert"
              style={{
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
                <h2 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '4px' }}>
                  Unable to load hackathons
                </h2>
                <p style={{ fontSize: '0.84375rem', color: 'var(--text-secondary)' }}>
                  {error}
                </p>
              </div>
              <button type="button" className="hn-btn hn-btn-primary" onClick={loadEvents}>
                Try again
              </button>
            </div>
          )}

          {/* Empty Filter Recovery State */}
          {!loading && !error && filteredEvents.length === 0 && (
            <div
              style={{
                padding: '44px 24px',
                textAlign: 'center',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '6px' }}>
                {savedOnly ? 'No saved hackathons yet' : 'No matching hackathons'}
              </h2>
              <p
                style={{
                  fontSize: '0.84375rem',
                  color: 'var(--text-secondary)',
                  maxWidth: '42ch',
                  margin: '0 auto 16px',
                }}
              >
                {savedOnly
                  ? 'Bookmark hackathons while browsing to keep track of upcoming registration deadlines here.'
                  : 'Try adjusting your search terms or clearing active filters to see more opportunities.'}
              </p>
              <button type="button" className="hn-btn" onClick={handleResetFilters}>
                Reset filters
              </button>
            </div>
          )}

          {/* Listings (Grid or Structured Rows) */}
          {!loading && !error && paginatedEvents.length > 0 && (
            <>
              <div className={layoutMode === 'rows' ? 'hn-row-list' : 'hn-card-grid'}>
                {paginatedEvents.map((ev) => (
                  <HackathonCard
                    key={ev.id}
                    event={ev}
                    layoutMode={layoutMode}
                    onSelect={handleSelectEvent}
                    onCopyLink={copyLink}
                    copied={copiedId === ev.id}
                    isSaved={savedIds.includes(ev.id)}
                    onToggleSave={toggleSaveEvent}
                  />
                ))}
              </div>

              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={(page) => {
                  setCurrentPage(page);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="hn-footer">
        <div className="hn-container hn-footer-inner">
          <div>Hackathon Notifier — Verified student & developer opportunity directory</div>
          <div className="hn-footer-links">
            <button type="button" className="hn-footer-link" onClick={() => setAutoListOpen(true)}>
              Submit a hackathon
            </button>
            <button type="button" className="hn-footer-link" onClick={() => setTechSpecOpen(true)}>
              How it works
            </button>
            <button type="button" className="hn-footer-link" onClick={() => setAboutOpen(true)}>
              About
            </button>
            <button type="button" className="hn-footer-link" onClick={() => setTermsOpen(true)}>
              Terms & Conditions
            </button>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <EventDetail
        event={activeEvent}
        isOpen={Boolean(activeEvent)}
        onClose={handleCloseDetail}
        onCopyLink={copyLink}
        copied={Boolean(activeEvent && copiedId === activeEvent.id)}
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
      <Toast visible={Boolean(copiedId)} message="Link copied to clipboard" />
      <ScrollToTop />
    </div>
  );
}

export default App;
