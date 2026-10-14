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
import { SunIcon, MoonIcon, TerminalIcon } from './components/Icons';
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

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('all');
  const [selectedSource, setSelectedSource] = useState('all');
  const [sortBy, setSortBy] = useState('deadline_asc');
  const [currentPage, setCurrentPage] = useState(1);

  const [activeEvent, setActiveEvent] = useState(null);
  const [autoListOpen, setAutoListOpen] = useState(false);
  const [techSpecOpen, setTechSpecOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

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
        userCoords,
      }),
    [rawEvents, searchQuery, selectedFormat, selectedSource, sortBy, userCoords]
  );

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE));
  const paginatedEvents = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredEvents.slice(start, start + PAGE_SIZE);
  }, [filteredEvents, currentPage]);

  const openCount = useMemo(
    () => rawEvents.filter((e) => e.lifecycleKey !== 'closed').length,
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
    setSelectedFormat('all');
    setSelectedSource('all');
    setSortBy('deadline_asc');
    clearLocation();
    setCurrentPage(1);
  };

  return (
    <div className="hn-shell">
      <div className="hn-progress-bar" style={{ width: `${scrollProgress}%` }} />

      <header className="hn-navbar">
        <a href="/" className="hn-brand">
          <span className="hn-brand-mark">HN</span>
          <span>Hackathon Notifier</span>
        </a>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="hn-btn"
            onClick={() => setAboutOpen(true)}
          >
            About
          </button>

          <a
            href="https://t.me/"
            target="_blank"
            rel="noopener noreferrer"
            className="hn-btn"
            title="Telegram Dispatch Feed"
          >
            <TerminalIcon size={14} />
            <span>Telegram Feed</span>
          </a>

          <button
            type="button"
            className="hn-btn"
            onClick={toggleDarkMode}
            aria-label="Toggle color theme"
            style={{ width: '32px', padding: 0 }}
          >
            {darkMode ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      <main style={{ flex: 1 }}>
        <HomeIntro
          totalCount={rawEvents.length}
          openCount={openCount}
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
          onUseLocation={handleToggleLocation}
          locationActive={locationActive}
          resultCount={filteredEvents.length}
          onResetFilters={handleResetFilters}
        />

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
              margin: '32px 0',
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
              <div className="hn-spec-label" style={{ color: 'var(--accent-brand)' }}>
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
              margin: '32px 0',
              padding: '40px 24px',
              textAlign: 'center',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div className="hn-spec-label">ZERO MATCHING EVENTS</div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '8px 0 16px' }}>
              No indexed hackathons match your active filter criteria.
            </p>
            <button type="button" className="hn-btn" onClick={handleResetFilters}>
              Clear Active Filters
            </button>
          </div>
        )}

        {!loading && !error && paginatedEvents.length > 0 && (
          <>
            <div className="hn-card-grid">
              {paginatedEvents.map((ev) => (
                <HackathonCard
                  key={ev.id}
                  event={ev}
                  onSelect={handleSelectEvent}
                  onCopyLink={copyLink}
                  copied={copiedId === ev.id}
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
      </main>

      <footer className="hn-footer">
        <div>HACKATHON NOTIFIER · VERIFIED ENGINEERING EVENT INDEX</div>
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
