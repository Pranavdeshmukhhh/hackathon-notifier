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
  PinIcon, EmptySearchIcon,
  SunIcon, MoonIcon, HamburgerIcon,
  LogoIcon, GridViewIcon, ListViewIcon, ArrowUpRightIcon, SearchIcon,
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
const PAGE_SIZE = 12;
const AUTO_REFRESH_MS = 15 * 60 * 1000; // Refresh listings; this does not trigger a scraper.

// ── Helpers ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
function App() {
  // ── Hooks ───────────────────────────────────────────────────────────────
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const { userLocation, isLocating, locationError, setLocationError, requestLocation } = useGeolocation();
  const { isScrolled, scrollProgress } = useScrollProgress();

  // ── Routing & View State ────────────────────────────────────────────────
  const [currentView, setCurrentView]         = useState('radar'); // 'radar' | 'terms'
  const [viewMode, setViewMode]               = useState(() => {
    try { return localStorage.getItem('hackathon_view_mode') || 'grid'; }
    catch { return 'grid'; }
  });

  // ── State ───────────────────────────────────────────────────────────────
  const [hackathons, setHackathons]           = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState(null);
  const [activeCategory, setActiveCategory]   = useState('All');
  const [activeSource, setActiveSource]       = useState('All');
  const [sortBy, setSortBy]                   = useState('deadline');
  const [pageSize, setPageSize]               = useState(PAGE_SIZE);
  const [searchQuery, setSearchQuery]         = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeSection, setActiveSection]     = useState('home');
  const [mobileMenuOpen, setMobileMenuOpen]   = useState(false);
  const menuToggleRef = useRef(null);
  const mobileNavigationRef = useRef(null);
  const [showColdStartBanner, setShowColdStartBanner] = useState(false);
  const [showTechSpecModal, setShowTechSpecModal] = useState(false);
  const [showAutoListModal, setShowAutoListModal] = useState(false);
  const [activeTab, setActiveTab]             = useState('upcoming'); // 'upcoming' | 'missed' | 'all'
  const [currentPage, setCurrentPage]         = useState(1);
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

  const buildQueryParams = useCallback((params) => {
    const {
      page = 1, limit = pageSize, category = 'All', source = 'All',
      sort = 'deadline', tab = 'upcoming', search = '', lat = '', lng = ''
    } = params;
    let q = `?page=${page}&limit=${limit}&category=${encodeURIComponent(category)}&sort=${sort}&tab=${tab}`;
    if (source && source !== 'All') q += `&source=${encodeURIComponent(source)}`;
    if (search) q += `&search=${encodeURIComponent(search)}`;
    if (lat && lng) q += `&lat=${lat}&lng=${lng}`;
    return q;
  }, [pageSize]);

  const getCacheKey = useCallback((params) => {
    return `${params.category || 'All'}|${params.source || 'All'}|${params.sort || 'deadline'}|${params.tab || 'upcoming'}|${params.limit || PAGE_SIZE}|${params.page || 1}|${params.search || ''}|${params.lat || ''}|${params.lng || ''}`;
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
        if (result.success) queryCacheRef.current.set(key, { ...result, etag, cachedAt: Date.now() });
      }
    } catch { /* Quiet fail for idle background prefetch */ }
  }, [buildQueryParams, getCacheKey]);

  // ── Data Fetching ─────────────────────────────────────────────────────
  const fetchHackathons = useCallback(async (isAutoRefresh = false) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const requestController = new AbortController();
    abortControllerRef.current = requestController;

    const currentParams = {
      page: currentPage, limit: pageSize, category: activeCategory,
      source: activeSource, sort: sortBy, tab: activeTab,
      search: debouncedSearch, lat: userLocation?.lat ?? '', lng: userLocation?.lng ?? '',
    };
    const cacheKey = getCacheKey(currentParams);
    const cachedEntry = queryCacheRef.current.get(cacheKey);

    // SWR — instant cache hit
    if (cachedEntry) {
      setHackathons(cachedEntry.data || []);
      if (cachedEntry.stats) setStats(cachedEntry.stats);
      const ut = cachedEntry.upcoming_total || 0;
      const mt = cachedEntry.missed_total   || 0;
      const at = cachedEntry.all_total      || (ut + mt);
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
        queryCacheRef.current.set(cacheKey, { ...result, etag, cachedAt: Date.now() });
        setHackathons(result.data || []);
        if (result.stats) setStats(result.stats);
        const ut = result.upcoming_total || 0;
        const mt = result.missed_total   || 0;
        const at = result.all_total      || (ut + mt);
        setUpcomingTotal(ut); setMissedTotal(mt); setAllTotal(at);
        const targetCount = activeTab === 'upcoming' ? ut : activeTab === 'all' ? at : mt;
        const newTotalPages = Math.max(1, Math.ceil(targetCount / pageSize));
        setTotalPages(newTotalPages);

        // Preload next page
        const idleCallback = window.requestIdleCallback || ((cb) => setTimeout(cb, 200));
        idleCallback(() => {
          if (currentPage < newTotalPages) prefetchQuery({ ...currentParams, page: currentPage + 1 });
        });
      } else { throw new Error(result.error || 'Unknown API error'); }
    } catch (e) {
      if (e.name === 'AbortError' || requestController.signal.aborted || abortControllerRef.current !== requestController) return;
      if (!cachedEntry) setError('Could not load listings. Please try again.');
    } finally {
      // A canceled request must not clear a newer request's loading state.
      if (abortControllerRef.current === requestController && !requestController.signal.aborted) {
        clearTimeout(coldStartTimerRef.current);
        setShowColdStartBanner(false);
        setLoading(false);
      }
    }
  }, [activeCategory, activeSource, sortBy, pageSize, debouncedSearch, activeTab, currentPage, userLocation, buildQueryParams, getCacheKey, prefetchQuery]);

  // ── Effects ───────────────────────────────────────────────────────────
  useEffect(() => {
    const h = setTimeout(() => { setDebouncedSearch(searchQuery); setCurrentPage(1); }, 350);
    return () => clearTimeout(h);
  }, [searchQuery]);

  useEffect(() => {
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
    if (userLocation && sortBy !== 'distance') { setSortBy('distance'); setCurrentPage(1); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const handleSearchChange   = (e)   => setSearchQuery(e.target.value);
  const handleSortChange     = (e)   => {
    const v = e.target.value;
    if (v === 'distance' && !userLocation) { setSortBy('distance'); requestLocation(); return; }
    setSortBy(v); setCurrentPage(1);
  };
  const smoothScrollToEvents = useCallback(() => {
    if (eventsRef.current) {
      const headerOffset = 76;
      const elementPosition = eventsRef.current.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
      if (Math.abs(window.pageYOffset - offsetPosition) > 60) {
        window.scrollTo({
          top: Math.max(0, offsetPosition),
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
        });
      }
    }
  }, []);

  const handlePageSizeChange = (e)   => { setPageSize(Number(e.target.value)); setCurrentPage(1); };
  const handleTabChange      = (tab) => { setActiveTab(tab); setCurrentPage(1); smoothScrollToEvents(); };
  const handlePageChange     = (p)   => { setCurrentPage(p); smoothScrollToEvents(); };

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

  const handleQuickFilter = (type) => {
    if (type === 'prizes')   { setSortBy('newest'); setActiveCategory('All'); setActiveSource('All'); setSearchQuery(''); showToast('Filter: highest cash pools'); }
    if (type === 'college')  { setSearchQuery('IIT'); setActiveCategory('All'); setActiveSource('All'); showToast('Filter: premier colleges (IIT / NIT / BITS)'); }
    if (type === 'faang')    { setSearchQuery('faang'); setActiveCategory('All'); setActiveSource('All'); showToast('Filter: FAANG & MANGO global hackathons'); }
    if (type === 'pune')     { setSearchQuery('pune'); setActiveCategory('All'); setActiveSource('All'); showToast('Filter: Pune engineering hackathons (COEP / PICT)'); }
    if (type === 'iiit')     { setSearchQuery('iiit hyderabad'); setActiveCategory('All'); setActiveSource('All'); showToast('Filter: IIIT Hyderabad & premier campus hackathons'); }
    if (type === 'inperson') { setActiveCategory('Offline'); setActiveSource('All'); setSearchQuery(''); showToast('Showing in-person events'); }
    if (type === 'online')   { setActiveCategory('Online'); setActiveSource('All'); setSearchQuery(''); showToast('Showing online events'); }
    if (currentView === 'terms') navigateToRadar('events');
    else scrollToSection('events');
  };

  const handleHackathonListed = (newHackathon) => {
    showToast(`Listed "${newHackathon?.title || 'Hackathon'}" on the radar`);
    queryCacheRef.current.clear();
    fetchHackathons(true);
    if (currentView === 'terms') navigateToRadar('events');
    else scrollToSection('events');
  };

  // ── Derived Data ──────────────────────────────────────────────────────

  const categories = [
    { key: 'All',            label: 'All Categories', count: stats.total },
    { key: 'Online',         label: 'Online',         count: stats.online_count || 0 },
    { key: 'Offline',        label: 'In-person',      count: stats.offline_count || 0 },
    { key: 'Top College',    label: 'Top college',    count: stats.top_college_count || 0 },
    { key: 'Internship',     label: 'Internships',    count: stats.internship_count || 0 },
    { key: 'Hackathon',      label: 'Hackathons',     count: stats.hackathon_count || 0 },
    { key: 'Unique Sources', label: 'Curated',        count: stats.unique_sources_count || 0 },
  ];

  const platformSources = [
    { key: 'All',            label: 'All Platforms',   count: stats.total },
    { key: 'Unstop',         label: 'Unstop',          count: stats.source_counts?.['Unstop'] || 0 },
    { key: 'Devpost',        label: 'Devpost',         count: stats.source_counts?.['Devpost'] || 0 },
    { key: 'Devnovate',      label: 'Devnovate',       count: stats.source_counts?.['Devnovate'] || 0 },
    { key: 'Devfolio',       label: 'Devfolio',        count: stats.source_counts?.['Devfolio'] || 0 },
    { key: 'HackerEarth',    label: 'HackerEarth',     count: stats.source_counts?.['HackerEarth'] || 0 },
    { key: 'Instagram',      label: 'Instagram',       count: stats.source_counts?.['Instagram'] || 0 },
    { key: 'Web Discovery',  label: 'Open web',        count: stats.source_counts?.['Web Discovery'] || 0 },
    { key: 'Unique Sources', label: 'Curated',         count: stats.source_counts?.['Unique Sources'] || stats.unique_sources_count || 0 },
  ];

  const tabs = [
    { key: 'upcoming', label: 'Active opportunities', count: upcomingTotal },
    { key: 'missed',   label: 'Lost opportunities',   count: missedTotal },
    { key: 'all',      label: 'All hackathons',       count: allTotal || (upcomingTotal + missedTotal) || stats.total },
  ];

  // ── Derived display values ────────────────────────────────────────────
  const fmt = (n) => (n || n === 0 ? Number(n).toLocaleString('en-IN') : '—');
  const activeTabTotal = activeTab === 'upcoming' ? upcomingTotal : activeTab === 'all' ? (allTotal || upcomingTotal + missedTotal) : missedTotal;
  const hasFilters = Boolean(searchQuery) || activeCategory !== 'All' || activeSource !== 'All';

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
    requestLocation();
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
            <button className="btn btn-ink header-refresh min-w-[76px]" onClick={handleSync} disabled={loading}>
              {loading ? (
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
              <button className="btn btn-ink !px-2 !text-xs truncate" disabled={loading} onClick={() => { setMobileMenuOpen(false); handleSync(); }}>
                {loading ? 'Loading…' : 'Refresh'}
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
              onShortcut={(kind) => {
                setActiveTab('upcoming'); setCurrentPage(1);
                if (kind === 'college') {
                  setActiveCategory('Top College'); setActiveSource('All'); setSearchQuery('');
                  scrollToSection('events');
                } else handleQuickFilter(kind);
              }}
              loading={loading} error={error} lastCollected={stats.last_scraped}
            />

            {/* ── RADAR ── */}
            <section ref={eventsRef} id="events" className="shell discovery-section scroll-mt-20">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end reveal">
                <div className="lg:col-span-7">
                  <h2 className="text-[28px] font-semibold tracking-tight">Discover hackathons</h2>
                  <p className="mt-2 text-sm text-muted">Search by topic, venue, or campus. Register directly with the organizer.</p>
                </div>
                <div className="lg:col-span-5 flex flex-col sm:flex-row items-stretch sm:items-end gap-3 sm:gap-4">
                  <div className="search flex-1">
                    <span className="search-icon"><SearchIcon /></span>
                    <input
                      type="text"
                      aria-label="Search hackathons"
                      placeholder="Search hackathon, venue or campus"
                      value={searchQuery}
                      onChange={handleSearchChange}
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-0 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-muted hover:text-ink"
                        title="Clear search"
                        aria-label="Clear search"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="results-update">
                <p className="text-sm text-muted">{loading ? 'Loading listings…' : error ? 'Listings could not be loaded.' : 'Check the organizer’s page before registering.'}</p>
                <button className="btn btn-ghost" disabled={loading} onClick={handleSync}>Refresh listings</button>
              </div>

              {/* Filters */}
              <div className="mt-8 grid grid-cols-1 lg:grid-cols-[120px_1fr] gap-x-6 gap-y-5 items-center">
                <span className="eyebrow">Quick focus</span>
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { k: 'faang', l: 'FAANG / MANGO', q: 'faang' },
                    { k: 'pune',  l: 'Pune tech (COEP / PICT)', q: 'pune' },
                    { k: 'iiit',  l: 'IIIT Hyderabad', q: 'iiit hyderabad' },
                    { k: 'college', l: 'Premier IITs', q: 'iit' },
                  ].map((f) => (
                    <button
                      key={f.k}
                      type="button"
                      className="chip chip-sm"
                      data-active={searchQuery.toLowerCase() === f.q}
                      onClick={() => handleQuickFilter(f.k)}
                    >
                      {f.l}
                    </button>
                  ))}
                </div>

                <span className="eyebrow">Platform</span>
                <div className="flex flex-wrap items-center gap-2">
                  {platformSources.map((src) => (
                    <button
                      key={src.key}
                      type="button"
                      className="chip chip-sm"
                      data-active={activeSource === src.key}
                      onClick={() => handleSourceChange(src.key)}
                    >
                      {src.label}
                      <span className="count">{src.count}</span>
                    </button>
                  ))}
                </div>

                <span className="eyebrow">Category</span>
                <div className="flex flex-wrap items-center gap-2">
                  {categories.map((cat) => (
                    <button
                      key={cat.key}
                      type="button"
                      className="chip"
                      data-active={activeCategory === cat.key}
                      onClick={() => handleCategoryChange(cat.key)}
                    >
                      {cat.label}
                      <span className="count">{cat.count}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tabs + view controls */}
              <div className="mt-10 border-t border-line-strong flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
                <div role="tablist" aria-label="Opportunity status" className="flex items-center overflow-x-auto no-scrollbar max-w-full pb-1 sm:pb-0 touch-pan-x">
                  {tabs.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === tab.key}
                      className="tab shrink-0"
                      onClick={() => handleTabChange(tab.key)}
                    >
                      {tab.label}
                      <span className="count">{fmt(tab.count)}</span>
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 py-2.5 w-full sm:w-auto justify-between sm:justify-start">
                  <div className="seg shrink-0" role="group" aria-label="Layout">
                    <button
                      type="button"
                      aria-pressed={viewMode === 'grid'}
                      onClick={() => { setViewMode('grid'); try { localStorage.setItem('hackathon_view_mode', 'grid'); } catch { /* storage unavailable */ } }}
                      title="Card grid view"
                      aria-label="Card grid view"
                    >
                      <GridViewIcon /> <span className="hidden sm:inline">Grid</span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={viewMode === 'compact'}
                      onClick={() => { setViewMode('compact'); try { localStorage.setItem('hackathon_view_mode', 'compact'); } catch { /* storage unavailable */ } }}
                      title="Compact list view"
                      aria-label="Compact list view"
                    >
                      <ListViewIcon /> <span className="hidden sm:inline">List</span>
                    </button>
                  </div>
                  <select value={pageSize} onChange={handlePageSizeChange} className="field flex-1 sm:flex-initial min-w-[110px]" aria-label="Results per page">
                    <option value={12}>12 / page</option>
                    <option value={24}>24 / page</option>
                    <option value={48}>48 / page</option>
                    <option value={96}>96 / page</option>
                  </select>
                  <select value={sortBy} onChange={handleSortChange} className="field flex-1 sm:flex-initial min-w-[130px]" aria-label="Sort order">
                    <option value="deadline">Deadline — soonest</option>
                    <option value="newest">Recently added</option>
                    <option value="name">Name A–Z</option>
                    <option value="distance">Nearest {!userLocation && '(uses GPS)'}</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between py-3 mono text-xs text-muted">
                <span>
                  {!loading && !error && (
                    <>Showing <span className="text-ink">{hackathons.length}</span> of <span className="text-ink">{fmt(activeTabTotal)}</span> opportunities</>
                  )}
                </span>
              </div>

              {/* Notices */}
              {locationError && (
                <div className="mb-4 border border-line border-l-2 border-l-accent px-4 py-3 text-sm flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2"><PinIcon /> {locationError}</span>
                  <button onClick={() => setLocationError(null)} className="text-accent-text hover:underline text-xs font-medium">Dismiss</button>
                </div>
              )}
              {error && (
                <div role="alert" className="mb-4 border border-line border-l-2 border-l-bad px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>Connection notice: {error}</div>
                  <button className="btn btn-ink !h-8 !text-xs" onClick={() => fetchHackathons()}>Retry</button>
                </div>
              )}

              {/* Lost opportunities banner */}
              {activeTab === 'missed' && (
                <div className="mb-6 border border-line border-l-2 border-l-bad p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                  <div className="space-y-2 max-w-3xl">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="display text-[28px]">Lost opportunities archive</span>
                      <span className="tag tag-bad">{fmt(missedTotal)} deadlines passed</span>
                      <span className="tag tag-quiet">Excluded from active total</span>
                    </div>
                    <p className="text-sm text-muted leading-relaxed">
                      These hackathons have concluded or closed registrations. They stay here so you can study past
                      themes, winning tracks and college OD archives without cluttering your active pipeline.
                    </p>
                  </div>
                  <button onClick={() => handleTabChange('upcoming')} className="btn btn-ink shrink-0">
                    Back to active hacks <span className="mono text-[11px] opacity-70">{fmt(upcomingTotal)}</span>
                  </button>
                </div>
              )}

              {/* Results ledger */}
              <div className={`ledger ${viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3' : 'flex flex-col'}`}>
                {loading ? (
                  Array.from({ length: Math.min(pageSize, viewMode === 'grid' ? 12 : 6) }).map((_, i) => (
                    <div key={i} className="ledger-cell"><SkeletonCard /></div>
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

              <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />

              {/* Empty state */}
              {!loading && !error && hackathons.length === 0 && (
                <div className="border border-line-strong px-6 py-20 flex flex-col items-center text-center">
                  <EmptySearchIcon />
                  <h3 className="display mt-6 text-[clamp(1.75rem,3.4vw,2.75rem)] max-w-[22ch]">
                    {hasFilters
                      ? 'Nothing matches those filters.'
                      : activeTab === 'missed'
                        ? 'No past deadline records yet.'
                        : 'Nothing new right now — check back soon.'}
                  </h3>
                  <p className="text-muted mt-4 max-w-md leading-relaxed">
                    {hasFilters
                      ? `Zero matches for “${searchQuery || activeCategory || activeSource}”. Try broader terms like AI, Web3 or Beginner, or reset the filters.`
                      : 'No listings are available in this view. Try another category or refresh the listings.'}
                  </p>
                  <button
                    className="btn btn-ink mt-8"
                    onClick={() => { setSearchQuery(''); setActiveCategory('All'); setActiveSource('All'); }}
                  >
                    Reset all filters
                  </button>
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
