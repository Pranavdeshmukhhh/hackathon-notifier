/**
 * App.jsx — Root composition component for Hackathon Notifier.
 *
 * All heavy logic is extracted into custom hooks (useDarkMode, useGeolocation,
 * useScrollProgress) and UI into dedicated components (Pagination, Toast,
 * TechSpecModal, ScrollToTop, ErrorBoundary, HackathonCard, TermsAndConditions).
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import HackathonCard from './components/HackathonCard';
import HomeIntro from './components/HomeIntro';
import AboutProject from './components/AboutProject';
import DiscoveryControls from './components/DiscoveryControls';
import { readDiscoveryQuery, writeDiscoveryQuery, buildDiscoveryParams } from './utils/discoveryQuery';
import SkeletonCard  from './components/SkeletonCard';
import './index.css';

// ── Extracted Components ────────────────────────────────────────────────────
import Pagination         from './components/Pagination';
import TechSpecModal      from './components/TechSpecModal';
import AutoListModal      from './components/AutoListModal';
import Toast              from './components/Toast';
import ScrollToTop        from './components/ScrollToTop';
import TermsAndConditions from './components/TermsAndConditions';
import {
  PinIcon,
  SunIcon, MoonIcon, HamburgerIcon,
  LogoIcon, ArrowUpRightIcon,
} from './components/Icons';

// ── Extracted Hooks ─────────────────────────────────────────────────────────
import useDarkMode       from './hooks/useDarkMode';
import useGeolocation    from './hooks/useGeolocation';
import useScrollProgress from './hooks/useScrollProgress';

// ── Constants ───────────────────────────────────────────────────────────────
const PROD_API_URL = 'https://hackathon-notifier.onrender.com/api/hackathons';
const LOCAL_API_URL = 'http://localhost:8000/api/hackathons';
// Keep explicitly configured APIs authoritative, including isolated previews.
const ALLOW_DEFAULT_DEV_FALLBACK = !import.meta.env.VITE_API_URL && !import.meta.env.PROD;
let DEFAULT_API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? PROD_API_URL : LOCAL_API_URL);
if (DEFAULT_API_URL.endsWith('/')) DEFAULT_API_URL = DEFAULT_API_URL.slice(0, -1);
if (!DEFAULT_API_URL.endsWith('/api/hackathons')) DEFAULT_API_URL += '/api/hackathons';

const COLD_START_WARN_MS = 6_000;
const AUTO_REFRESH_MS = 15 * 60 * 1000; // Refresh listings; this does not trigger a scraper.

// ── Helpers ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
function App() {
  const [initialQuery] = useState(() => readDiscoveryQuery());
  // ── Hooks ───────────────────────────────────────────────────────────────
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const { userLocation, isLocating, locationError, setLocationError, requestLocation } = useGeolocation();
  const { isScrolled, scrollProgress } = useScrollProgress();

  // ── Routing & View State ────────────────────────────────────────────────
  const [currentView, setCurrentView]         = useState('radar'); // 'radar' | 'terms'
  const [viewMode, setViewMode]               = useState(() => {
    try { return localStorage.getItem('hackathon_view_mode') === 'compact' ? 'compact' : 'grid'; }
    catch { return 'grid'; }
  });

  // ── State ───────────────────────────────────────────────────────────────
  const [hackathons, setHackathons]           = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState(null);
  const [activeCategory, setActiveCategory]   = useState(initialQuery.category);
  const [activeSource, setActiveSource]       = useState(initialQuery.source);
  const [activeFormat, setActiveFormat]       = useState(initialQuery.format);
  const [closingSoon, setClosingSoon]         = useState(initialQuery.closingSoon && initialQuery.tab !== 'missed');
  const [sortBy, setSortBy]                   = useState(initialQuery.sort);
  const [pageSize, setPageSize]               = useState(initialQuery.limit);
  const [searchQuery, setSearchQuery]         = useState(initialQuery.search);
  const [debouncedSearch, setDebouncedSearch] = useState(initialQuery.search);
  const [refreshing, setRefreshing]           = useState(false);
  const [refreshNotice, setRefreshNotice]     = useState('');
  const [activeSection, setActiveSection]     = useState('home');
  const [mobileMenuOpen, setMobileMenuOpen]   = useState(false);
  const menuToggleRef = useRef(null);
  const mobileNavigationRef = useRef(null);
  const [showColdStartBanner, setShowColdStartBanner] = useState(false);
  const [showTechSpecModal, setShowTechSpecModal] = useState(false);
  const [showAutoListModal, setShowAutoListModal] = useState(false);
  const [activeTab, setActiveTab]             = useState(initialQuery.tab);
  const [currentPage, setCurrentPage]         = useState(initialQuery.page);
  const [totalPages, setTotalPages]           = useState(1);
  const [upcomingTotal, setUpcomingTotal]     = useState(0);
  const [missedTotal, setMissedTotal]         = useState(0);
  const [allTotal, setAllTotal]               = useState(0);
  const [toast, setToast]                     = useState({ message: '', visible: false });

  const [stats, setStats] = useState({
    total: 0, active_count: 0, lost_opportunities_count: 0, all_total: 0,
    unique_tags: 0, last_scraped: '', sources: [], source_counts: {},
    top_college_count: 0, internship_count: 0, college_types: [],
    online_count: 0, offline_count: 0, unique_sources_count: 0, hackathon_count: 0,
    total_prize_pool_inr: 0, total_prize_pool_formatted: '',
    total_registrations: 0, total_registrations_formatted: '',
    p50_latency_ms: null, recalculated_cadence: null
  });

  // ── Refs ────────────────────────────────────────────────────────────────
  const homeRef            = useRef(null);
  const dashboardRef       = useRef(null);
  const featuresRef        = useRef(null);
  const eventsRef          = useRef(null);
  const aboutRef           = useRef(null);
  const queryCacheRef      = useRef(new Map());
  const abortControllerRef = useRef(null);
  const coldStartTimerRef  = useRef(null);
  const intervalRef        = useRef(null);
  const resultsHeadingRef  = useRef(null);
  const focusResultsRef    = useRef(false);
  const wantsDistanceRef   = useRef(false);

  // ── Hash routing synchronization ────────────────────────────────────────
  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#terms') {
        setCurrentView('terms');
      } else {
        setCurrentView('radar');
      }
    };
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigateToTerms = useCallback(() => {
    window.location.hash = '#terms';
    setCurrentView('terms');
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, []);

  const navigateToRadar = useCallback((section = 'home') => {
    const nextHash = section === 'home' ? '' : `#${section}`;
    if (window.location.hash !== nextHash) window.location.hash = nextHash;
    setCurrentView('radar');
    setMobileMenuOpen(false);
    if (section && section !== 'home') {
      setTimeout(() => {
        const refMap = { home: homeRef, dashboard: dashboardRef, features: featuresRef, events: eventsRef, about: aboutRef };
        refMap[section]?.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      }, 60);
    } else {
      window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
  }, []);

  // ── Callbacks ───────────────────────────────────────────────────────────
  const showToast = useCallback((msg) => {
    setToast({ message: msg, visible: true });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 3200);
  }, []);

  const buildQueryParams = buildDiscoveryParams;
  const getCacheKey = buildDiscoveryParams;
  const rememberResult = useCallback((key, result) => {
    const cache = queryCacheRef.current;
    cache.delete(key);
    cache.set(key, result);
    if (cache.size > 64) cache.delete(cache.keys().next().value);
  }, []);

  const prefetchQuery = useCallback(async (params) => {
    const key = getCacheKey(params);
    if (queryCacheRef.current.has(key)) return;
    const qParams = buildQueryParams(params);
    const url = `${DEFAULT_API_URL}${qParams}`;
    try {
      let res;
      try { res = await fetch(url); }
      catch { if (ALLOW_DEFAULT_DEV_FALLBACK) { res = await fetch(`${PROD_API_URL}${qParams}`); } else { return; } }
      if (res && res.ok) {
        const etag = res.headers.get('ETag');
        const result = await res.json();
        if (result.success) rememberResult(key, { ...result, etag, cachedAt: Date.now() });
      }
    } catch { /* Quiet fail for idle background prefetch */ }
  }, [buildQueryParams, getCacheKey, rememberResult]);

  // ── Data Fetching ─────────────────────────────────────────────────────
  const fetchHackathons = useCallback(async (isAutoRefresh = false) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const requestController = new AbortController();
    abortControllerRef.current = requestController;
    setRefreshing(true);
    setRefreshNotice('');

    const currentParams = {
      page: currentPage, limit: pageSize, category: activeCategory,
      source: activeSource, sort: sortBy, tab: activeTab,
      format: activeFormat, closingSoon, search: debouncedSearch,
      lat: sortBy === 'distance' ? userLocation?.lat : undefined,
      lng: sortBy === 'distance' ? userLocation?.lng : undefined,
    };
    const cacheKey = getCacheKey(currentParams);
    const cachedEntry = queryCacheRef.current.get(cacheKey);

    // SWR — instant cache hit
    if (cachedEntry) {
      setHackathons(cachedEntry.data || []);
      if (cachedEntry.stats) setStats(cachedEntry.stats);
      const ut = cachedEntry.upcoming_total || 0;
      const mt = cachedEntry.missed_total   || 0;
      const at = cachedEntry.all_total      ?? (ut + mt);
      setUpcomingTotal(ut); setMissedTotal(mt); setAllTotal(at);
      const targetCount = activeTab === 'upcoming' ? ut : activeTab === 'all' ? at : mt;
      setTotalPages(Math.max(1, Math.ceil(targetCount / pageSize)));
      setLoading(false); setError(null);
    } else if (!isAutoRefresh) {
      setLoading(true); setError(null); setShowColdStartBanner(false);
      coldStartTimerRef.current = setTimeout(() => setShowColdStartBanner(true), COLD_START_WARN_MS);
    }

    try {
      const queryParams = buildQueryParams(currentParams);
      let url = `${DEFAULT_API_URL}${queryParams}`;
      const headers = {};
      if (cachedEntry?.etag) headers['If-None-Match'] = cachedEntry.etag;

      let res;
      try {
        if (ALLOW_DEFAULT_DEV_FALLBACK) {
          // Fast localhost failover: if local backend not running, don't stall for 10s
          const localCtrl = new AbortController();
          const timer = setTimeout(() => localCtrl.abort(), 1200);
          try {
            res = await fetch(url, { signal: AbortSignal.any([localCtrl.signal, requestController.signal]), headers });
            clearTimeout(timer);
          } catch {
            clearTimeout(timer);
            if (requestController.signal.aborted) return;
            res = await fetch(`${PROD_API_URL}${queryParams}`, { signal: requestController.signal, headers });
          }
        } else {
          res = await fetch(url, { signal: requestController.signal, headers });
        }
      } catch (networkErr) {
        if (networkErr.name === 'AbortError') return;
        if (ALLOW_DEFAULT_DEV_FALLBACK) {
          res = await fetch(`${PROD_API_URL}${queryParams}`, { signal: requestController.signal, headers });
        } else { throw networkErr; }
      }

      if (requestController.signal.aborted || abortControllerRef.current !== requestController) return;
      if (res.status === 304) { return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const etag = res.headers.get('ETag');
      const result = await res.json();
      if (requestController.signal.aborted || abortControllerRef.current !== requestController) return;
      if (result.success) {
        rememberResult(cacheKey, { ...result, etag, cachedAt: Date.now() });
        setHackathons(result.data || []);
        if (result.stats) setStats(result.stats);
        const ut = result.upcoming_total || 0;
        const mt = result.missed_total   || 0;
        const at = result.all_total      ?? (ut + mt);
        setUpcomingTotal(ut); setMissedTotal(mt); setAllTotal(at);
        const targetCount = activeTab === 'upcoming' ? ut : activeTab === 'all' ? at : mt;
        const newTotalPages = Math.max(1, Math.ceil(targetCount / pageSize));
        setTotalPages(newTotalPages);
        if (currentPage > newTotalPages) setCurrentPage(newTotalPages);

        // Preload next page
        const idleCallback = window.requestIdleCallback || ((cb) => setTimeout(cb, 200));
        idleCallback(() => {
          if (currentPage < newTotalPages) prefetchQuery({ ...currentParams, page: currentPage + 1 });
        });
      } else { throw new Error(result.error || 'Unknown API error'); }
    } catch (e) {
      if (e.name === 'AbortError' || requestController.signal.aborted || abortControllerRef.current !== requestController) return;
      if (!cachedEntry) setError('Could not load listings. Please try again.');
      else setRefreshNotice('Could not refresh. Showing previously loaded listings.');
    } finally {
      // A canceled request must not clear a newer request's loading state.
      if (abortControllerRef.current === requestController && !requestController.signal.aborted) {
        clearTimeout(coldStartTimerRef.current);
        setShowColdStartBanner(false);
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [activeCategory, activeSource, activeFormat, closingSoon, sortBy, pageSize, debouncedSearch, activeTab, currentPage, userLocation, buildQueryParams, getCacheKey, prefetchQuery, rememberResult]);

  // ── Effects ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (searchQuery.trim() === debouncedSearch) return;
    const h = setTimeout(() => { setDebouncedSearch(searchQuery.trim()); setCurrentPage(1); }, 350);
    return () => clearTimeout(h);
  }, [searchQuery, debouncedSearch]);

  useEffect(() => {
    const query = writeDiscoveryQuery({ search: debouncedSearch, category: activeCategory, source: activeSource, format: activeFormat, closingSoon, tab: activeTab, sort: sortBy, limit: pageSize, page: currentPage });
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }, [debouncedSearch, activeCategory, activeSource, activeFormat, closingSoon, activeTab, sortBy, pageSize, currentPage]);

  useEffect(() => {
    if (!loading && !refreshing && focusResultsRef.current) {
      resultsHeadingRef.current?.focus();
      focusResultsRef.current = false;
    }
  }, [loading, refreshing]);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Request status synchronizes with external API work.
    fetchHackathons();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      fetchHackathons(true);
    }, AUTO_REFRESH_MS);
    return () => { clearInterval(intervalRef.current); abortControllerRef.current?.abort(); clearTimeout(coldStartTimerRef.current); };
  }, [fetchHackathons]);

  // Intersection observer for active nav highlight
  useEffect(() => {
    if (currentView === 'terms') return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          if (entry.target === homeRef.current) setActiveSection('home');
          else if (entry.target === eventsRef.current) setActiveSection('events');
          else if (entry.target === aboutRef.current) setActiveSection('about');
        }
      });
    }, { rootMargin: '-20% 0px -60% 0px' });
    [homeRef, eventsRef, aboutRef].forEach(ref => { if (ref.current) observer.observe(ref.current); });
    return () => observer.disconnect();
  }, [currentView]);

  // Auto-trigger location sort
  useEffect(() => {
    if (userLocation && wantsDistanceRef.current) {
      wantsDistanceRef.current = false;
      setSortBy('distance'); setCurrentPage(1);
    }
  }, [userLocation]);

  // Lock body scroll when mobile navigation drawer is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    mobileNavigationRef.current?.querySelector('a')?.focus();
    const dismiss = (event) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
        menuToggleRef.current?.focus();
      }
    };
    const leaveHeader = (event) => {
      if (!event.target.closest('.site-header')) setMobileMenuOpen(false);
    };
    document.addEventListener('keydown', dismiss);
    document.addEventListener('focusin', leaveHeader);
    return () => {
      document.removeEventListener('keydown', dismiss);
      document.removeEventListener('focusin', leaveHeader);
    };
  }, [mobileMenuOpen]);

  // ── Event Handlers ────────────────────────────────────────────────────
  const handleCategoryChange = (cat) => { setActiveCategory(cat); setCurrentPage(1); };
  const handleSourceChange   = (src) => { setActiveSource(src); setCurrentPage(1); };
  const handleSortChange     = (v)   => {
    if (v === 'distance' && !userLocation) { wantsDistanceRef.current = true; requestLocation(); return; }
    wantsDistanceRef.current = false;
    setSortBy(v); setCurrentPage(1);
  };
  const handlePageSizeChange = (value) => { setPageSize(value); setCurrentPage(1); };
  const handleTabChange = (tab) => { setActiveTab(tab); setCurrentPage(1); if (tab === 'missed') setClosingSoon(false); };
  const handlePageChange = (page) => {
    setCurrentPage(page); focusResultsRef.current = true;
    resultsHeadingRef.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };

  const scrollToSection = (section) => {
    setActiveSection(section); setMobileMenuOpen(false);
    const refMap = { home: homeRef, dashboard: dashboardRef, features: featuresRef, events: eventsRef, about: aboutRef };
    const target = refMap[section]?.current;
    if (target) {
      const headerOffset = 76;
      const elementPosition = target.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
      window.scrollTo({ top: Math.max(0, offsetPosition), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
  };

  const handleFormatChange = (format) => {
    setActiveFormat(format); setCurrentPage(1);
    if (format === 'Online' && sortBy === 'distance') setSortBy('deadline');
  };
  const resetFilters = () => {
    setSearchQuery(''); setDebouncedSearch(''); setActiveCategory('All');
    setActiveSource('All'); setActiveFormat('All'); setClosingSoon(false);
    setActiveTab('upcoming'); setCurrentPage(1);
    wantsDistanceRef.current = false;
  };
  const handleHomeShortcut = (kind) => {
    resetFilters(); setSortBy('deadline');
    if (kind === 'college') setActiveCategory('Top College');
    else setActiveFormat(kind === 'online' ? 'Online' : 'Offline');
    scrollToSection('events');
  };
  const handleViewMode = (mode) => {
    setViewMode(mode);
    try { localStorage.setItem('hackathon_view_mode', mode); } catch { /* Storage unavailable. */ }
  };

  const handleHackathonListed = (newHackathon) => {
    showToast(`Listed "${newHackathon?.title || 'Hackathon'}" on the radar`);
    queryCacheRef.current.clear();
    fetchHackathons(true);
    if (currentView === 'terms') navigateToRadar('events');
    else scrollToSection('events');
  };

  // ── Derived Data ──────────────────────────────────────────────────────

  const activeTabTotal = activeTab === 'upcoming' ? upcomingTotal : activeTab === 'all' ? allTotal : missedTotal;
  const pendingSearch = searchQuery.trim() !== debouncedSearch;
  const hasFilters = Boolean(searchQuery.trim()) || activeCategory !== 'All' || activeSource !== 'All' || activeFormat !== 'All' || closingSoon;
  const rangeStart = (currentPage - 1) * pageSize + 1;
  const resultsMessage = loading ? 'Loading listings…' : pendingSearch ? 'Updating search…' : error ? 'Results unavailable' : activeTabTotal === 0 ? 'No events found' : `${rangeStart}–${rangeStart + hackathons.length - 1} of ${activeTabTotal.toLocaleString('en-IN')} events`;

  const navItems = [
    { key: 'events',    label: 'Discover' },
    { key: 'dashboard', label: 'Updates' },
    { key: 'about',     label: 'About' },
    { key: 'terms',     label: 'Terms' },
  ];
  const isNavActive = (key) =>
    (currentView === 'terms' && key === 'terms') ||
    (currentView === 'radar' && activeSection === key && key !== 'terms');
  const handleNav = (e, key) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    if (key === 'terms') navigateToTerms();
    else navigateToRadar(key);
  };
  const handleNearMe = () => {
    if (currentView === 'terms') navigateToRadar('events');
    if (userLocation) { setSortBy('distance'); setCurrentPage(1); }
    else { wantsDistanceRef.current = true; requestLocation(); }
  };
  const handleSync = () => {
    if (currentView === 'terms') navigateToRadar('events');
    fetchHackathons();
  };
  const openScanner = () => { setMobileMenuOpen(false); setShowAutoListModal(true); };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col relative">
      <a className="skip-link" href="#main-content">Skip to content</a>
      {showTechSpecModal && <TechSpecModal onClose={() => setShowTechSpecModal(false)} />}
      {showAutoListModal && (
        <AutoListModal
          onClose={() => setShowAutoListModal(false)}
          onSuccess={handleHackathonListed}
          apiBase={DEFAULT_API_URL}
        />
      )}

      {/* ── MOBILE BACKDROP ── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* ── NAVIGATION ── */}
      <header className="site-header">
        <div className="header-progress" style={{ transform: `scaleX(${isScrolled ? scrollProgress / 100 : 0})` }} />
        <div className="shell flex items-center justify-between gap-3 sm:gap-6 h-16">
          <a
            href="#"
            className="brand min-w-0"
            aria-label="Hackathon Notifier — home"
            onClick={(e) => { e.preventDefault(); navigateToRadar('home'); }}
          >
            <LogoIcon />
            <span className="truncate">Hackathon Notifier</span>
          </a>

          <nav className="hidden lg:flex items-center gap-7" aria-label="Primary">
            {navItems.map(({ key, label }) => (
              <a
                key={key}
                href={`#${key}`}
                onClick={(e) => handleNav(e, key)}
                className="nav-link"
                aria-current={isNavActive(key) ? 'true' : undefined}
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button className="icon-btn" onClick={toggleDarkMode} title="Toggle theme" aria-label="Toggle theme" aria-pressed={isDarkMode}>
              {isDarkMode ? <SunIcon /> : <MoonIcon />}
            </button>
            <button className="btn btn-ghost header-near-me" data-on={Boolean(userLocation)} onClick={handleNearMe}>
              <PinIcon /> {isLocating ? 'Locating…' : 'Near me'}
            </button>
            <button className="btn btn-ink header-refresh min-w-[76px]" onClick={handleSync} disabled={loading || refreshing}>
              {loading || refreshing ? (
                <>
                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Loading
                </>
              ) : 'Refresh'}
            </button>
            <button
              ref={menuToggleRef}
              className="icon-btn header-menu"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
            >
              <HamburgerIcon />
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden absolute top-full left-0 right-0 bg-paper border-b border-line-strong animate-sheet-pop max-h-[calc(100dvh-4rem)] overflow-y-auto">
            <nav ref={mobileNavigationRef} id="mobile-navigation" className="shell py-2" aria-label="Mobile">
              {navItems.map(({ key, label }) => (
                <a
                  key={key}
                  href={`#${key}`}
                  onClick={(e) => handleNav(e, key)}
                  className={`flex items-center justify-between py-3.5 border-b border-line display text-[26px] ${isNavActive(key) ? 'text-accent-text' : 'text-ink'}`}
                >
                  {label}
                  <ArrowUpRightIcon size={18} />
                </a>
              ))}
            </nav>
            <div className="shell pb-5 pt-3 grid grid-cols-3 gap-2">
              <button className="btn btn-ghost !px-2 !text-xs truncate" onClick={openScanner}>Status</button>
              <button className="btn btn-ghost !px-2 !text-xs truncate" onClick={() => { setMobileMenuOpen(false); handleNearMe(); }}>
                {isLocating ? 'Locating…' : 'Near me'}
              </button>
              <button className="btn btn-ink !px-2 !text-xs truncate" disabled={loading || refreshing} onClick={() => { setMobileMenuOpen(false); handleSync(); }}>
                {loading || refreshing ? 'Loading…' : 'Refresh'}
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ── COLD START BANNER ── */}
      {showColdStartBanner && (
        <div className="border-b border-line bg-sunken text-muted mono text-xs px-4 py-2.5 flex items-center justify-center gap-3">
          <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          The server is taking longer to respond. Loading listings…
        </div>
      )}

      {/* ── MAIN CONTENT (RADAR or TERMS) ── */}
      <main id="main-content" tabIndex={-1} className="flex-1 w-full">
        {currentView === 'terms' ? (
          <div className="shell py-10 md:py-14">
            <TermsAndConditions onBack={() => navigateToRadar('home')} onShowToast={showToast} />
          </div>
        ) : (
          <>
            <HomeIntro
              homeRef={homeRef} updatesRef={dashboardRef}
              onBrowse={() => scrollToSection('events')}
              onShortcut={handleHomeShortcut}
              loading={loading} error={error} lastCollected={stats.last_scraped}
            />

            {/* ── RADAR ── */}
            <section ref={eventsRef} id="events" className="shell discovery-section scroll-mt-20">
              <div className="discovery-heading">
                <h2 className="text-[28px] font-semibold tracking-tight">Discover hackathons</h2>
                <p className="text-sm text-muted mt-2">Find an event that fits your interests, schedule, and team.</p>
              </div>
              <DiscoveryControls
                search={searchQuery} onSearch={setSearchQuery}
                category={activeCategory} onCategory={handleCategoryChange}
                source={activeSource} onSource={handleSourceChange}
                sources={(stats.sources || []).filter(value => typeof value === 'string' && value.trim())}
                format={activeFormat} onFormat={handleFormatChange}
                closingSoon={closingSoon} onClosingSoon={(value) => { setClosingSoon(value); setCurrentPage(1); }}
                tab={activeTab} onTab={handleTabChange}
                counts={{ upcoming: upcomingTotal, missed: missedTotal, all: allTotal }}
                loading={loading || refreshing} pendingSearch={pendingSearch} error={error}
                onRefresh={handleSync} onReset={resetFilters}
                sort={sortBy} onSort={handleSortChange}
                pageSize={pageSize} onPageSize={handlePageSizeChange}
                viewMode={viewMode} onViewMode={handleViewMode}
                onNearMe={handleNearMe} isLocating={isLocating} hasLocation={Boolean(userLocation)}
              />
              <div className="discovery-results-summary">
                <h3 ref={resultsHeadingRef} tabIndex={-1}>Results</h3>
                <p role="status" aria-live="polite" aria-atomic="true">{resultsMessage}{refreshing && !loading && !pendingSearch ? ' · Refreshing…' : ''}</p>
              </div>
              <p className="control-hint results-guidance">Deadline dates follow UTC. Confirm closing times, eligibility, and team requirements with the organizer.</p>
              {refreshNotice && <p role="alert" className="discovery-notice">{refreshNotice}</p>}

              {/* Notices */}
              {locationError && (
                <div className="mb-4 border border-line border-l-2 border-l-accent px-4 py-3 text-sm flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2"><PinIcon /> {locationError}</span>
                  <button onClick={() => setLocationError(null)} className="btn btn-ghost">Dismiss</button>
                </div>
              )}
              {error && (
                <div role="alert" className="mb-4 border border-line border-l-2 border-l-bad px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>Connection notice: {error}</div>
                  <button className="btn btn-ink" onClick={() => fetchHackathons()}>Retry</button>
                </div>
              )}

              {activeTab === 'missed' && (
                <p className="discovery-notice">Past listings are kept for reference. Registration may have closed; check the organizer’s page.</p>
              )}

              {/* Results ledger */}
              <div className={`discovery-ledger ${viewMode === 'grid' ? 'discovery-grid' : 'discovery-list'}`} aria-busy={loading || refreshing || pendingSearch}>
                {loading || pendingSearch ? (
                  Array.from({ length: Math.min(pageSize, viewMode === 'grid' ? 12 : 6) }).map((_, i) => (
                    <div key={i} className="ledger-cell"><SkeletonCard viewMode={viewMode} /></div>
                  ))
                ) : !error && hackathons.length > 0 ? (
                  hackathons.map((h) => (
                    <div
                      key={h._id || h.link}
                      className="ledger-cell"
                    >
                      <HackathonCard hackathon={h} onShare={(title) => showToast(`Copied link for ${title}`)} viewMode={viewMode} />
                    </div>
                  ))
                ) : null}
              </div>

              {!loading && !pendingSearch && !error && <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} disabled={refreshing} />}

              {!loading && !pendingSearch && !error && hackathons.length === 0 && (
                <div className="discovery-empty">
                  <h3>{hasFilters ? 'No events match these filters.' : activeTab === 'missed' ? 'No past listings available.' : 'No events listed yet.'}</h3>
                  <p>{hasFilters ? 'Try a broader search or remove a filter. Some events do not list a format or deadline.' : 'Refresh the listings or browse another event status.'}</p>
                  <button type="button" className="btn btn-ghost" onClick={resetFilters}>{hasFilters ? 'Reset all filters' : 'Browse upcoming events'}</button>
                </div>
              )}
            </section>

            <AboutProject sectionRef={aboutRef} onTerms={navigateToTerms} />
          </>
        )}
      </main>

      {/* ── FOOTER ── */}
      <footer className="border-t border-line overflow-hidden relative">
        <div className="shell pt-14 pb-10 grid grid-cols-2 md:grid-cols-12 gap-x-6 gap-y-10">
          <div className="col-span-2 md:col-span-6">
            <a
              href="#"
              className="brand"
              onClick={(e) => { e.preventDefault(); navigateToRadar('home'); }}
              aria-label="Hackathon Notifier — back to top"
            >
              <LogoIcon />
              <span>Hackathon Notifier</span>
            </a>
            <p className="mt-5 text-sm text-muted max-w-[34ch] leading-relaxed">
              Hackathon discovery for students. Find an opportunity, check the requirements, and start building.
            </p>
          </div>
          <nav className="md:col-span-3 flex flex-col gap-3" aria-label="Explore">
            <span className="eyebrow mb-1">Explore</span>
            <button className="foot-link" onClick={() => navigateToRadar('events')}>Discover hackathons</button>
            <button className="foot-link" onClick={() => navigateToRadar('dashboard')}>Listing updates</button>
            <button className="foot-link" onClick={() => navigateToRadar('about')}>About the project</button>
          </nav>
          <nav className="md:col-span-3 flex flex-col gap-3" aria-label="Project">
            <span className="eyebrow mb-1">Project</span>
            <button className="foot-link" onClick={navigateToTerms}>Terms &amp; Conditions</button>
            <button className="foot-link" onClick={() => setShowTechSpecModal(true)}>How the system works</button>
            <button className="foot-link" onClick={openScanner}>Scanner status</button>
            <button className="foot-link" onClick={toggleDarkMode}>Theme: {isDarkMode ? 'Dark' : 'Light'}</button>
          </nav>
        </div>
        <div className="shell py-5 mt-6 border-t border-line flex flex-col sm:flex-row justify-between gap-2 mono text-[11px] text-faint">
          <span>© 2026 Hackathon Notifier</span>
          <span>Created by Pranav Deshmukh</span>
        </div>
      </footer>

      <ScrollToTop isScrolled={isScrolled} scrollProgress={scrollProgress} />
      <Toast message={toast.message} visible={toast.visible} />
    </div>
  );
}

export default App;
