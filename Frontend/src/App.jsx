/**
 * App.jsx — Root composition component for Hackathon Notifier.
 *
 * All heavy logic is extracted into custom hooks (useDarkMode, useGeolocation,
 * useScrollProgress) and UI into dedicated components (Pagination, Toast,
 * TechSpecModal, ScrollToTop, ErrorBoundary, HackathonCard, TermsAndConditions).
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import HackathonCard from './components/HackathonCard';
import SkeletonCard  from './components/SkeletonCard';
import { CursorSpotlight, TiltCard, CountUp } from './components/MotionKit';
import './index.css';

// ── Extracted Components ────────────────────────────────────────────────────
import Pagination         from './components/Pagination';
import TechSpecModal      from './components/TechSpecModal';
import AutoListModal      from './components/AutoListModal';
import Toast              from './components/Toast';
import ScrollToTop        from './components/ScrollToTop';
import TermsAndConditions from './components/TermsAndConditions';
import {
  PinIcon, EmptySearchIcon, TelegramIcon,
  SunIcon, MoonIcon, HamburgerIcon, ArrowRightIcon,
  LogoIcon, ShieldCheckIcon, GridViewIcon, ListViewIcon, ArrowUpRightIcon, SearchIcon,
} from './components/Icons';

// ── Extracted Hooks ─────────────────────────────────────────────────────────
import useDarkMode       from './hooks/useDarkMode';
import useGeolocation    from './hooks/useGeolocation';
import useScrollProgress from './hooks/useScrollProgress';

// ── Constants ───────────────────────────────────────────────────────────────
const PROD_API_URL = 'https://hackathon-notifier.onrender.com/api/hackathons';
const LOCAL_API_URL = 'http://localhost:8000/api/hackathons';
let DEFAULT_API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? PROD_API_URL : LOCAL_API_URL);
if (DEFAULT_API_URL.endsWith('/')) DEFAULT_API_URL = DEFAULT_API_URL.slice(0, -1);
if (!DEFAULT_API_URL.endsWith('/api/hackathons')) DEFAULT_API_URL += '/api/hackathons';

const COLD_START_WARN_MS = 6_000;
const PAGE_SIZE = 12;
const SCAN_INTERVAL_SECONDS = 900; // 15-minute autoscan cycle

// ── Helpers ─────────────────────────────────────────────────────────────────
const formatCountdown = (totalSec) => {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

const formatLastScraped = (isoStr) => {
  if (!isoStr) return 'Active now';
  try {
    const d = new Date(isoStr);
    const diffMins = Math.floor((Date.now() - d) / 60000);
    if (diffMins < 1)  return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24)  return `${diffHrs}h ago`;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch { return 'Active now'; }
};

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
  const [secondsUntilNextScan, setSecondsUntilNextScan] = useState(SCAN_INTERVAL_SECONDS);

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
  const [clientLatency, setClientLatency]     = useState(null);

  const [stats, setStats] = useState({
    total: 0, active_count: 0, lost_opportunities_count: 0, all_total: 0,
    unique_tags: 0, last_scraped: '', sources: [], source_counts: {},
    top_college_count: 0, internship_count: 0, college_types: [],
    online_count: 0, offline_count: 0, unique_sources_count: 0, hackathon_count: 0,
    total_prize_pool_inr: 0, total_prize_pool_formatted: '',
    total_registrations: 0, total_registrations_formatted: '',
    p50_latency_ms: 32.0, recalculated_cadence: 'Every 15 minutes'
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const navigateToRadar = useCallback((section = 'home') => {
    if (window.location.hash === '#terms') {
      window.location.hash = section === 'home' ? '' : section;
    }
    setCurrentView('radar');
    setMobileMenuOpen(false);
    if (section && section !== 'home') {
      setTimeout(() => {
        const refMap = { home: homeRef, dashboard: dashboardRef, features: featuresRef, events: eventsRef, about: aboutRef };
        refMap[section]?.current?.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
      catch { if (!url.startsWith(PROD_API_URL)) { res = await fetch(`${PROD_API_URL}${qParams}`); } else { return; } }
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
    abortControllerRef.current = new AbortController();

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
      setLoading(false); setError(null); setClientLatency(0);
    } else if (!isAutoRefresh) {
      setLoading(true); setError(null); setShowColdStartBanner(false);
      coldStartTimerRef.current = setTimeout(() => setShowColdStartBanner(true), COLD_START_WARN_MS);
    }

    try {
      const queryParams = buildQueryParams(currentParams);
      let url = `${DEFAULT_API_URL}${queryParams}`;
      const t0 = performance.now();
      const headers = {};
      if (cachedEntry?.etag) headers['If-None-Match'] = cachedEntry.etag;

      let res;
      try {
        if (!url.startsWith(PROD_API_URL)) {
          // Fast localhost failover: if local backend not running, don't stall for 10s
          const localCtrl = new AbortController();
          const timer = setTimeout(() => localCtrl.abort(), 1200);
          try {
            res = await fetch(url, { signal: localCtrl.signal, headers });
            clearTimeout(timer);
          } catch {
            clearTimeout(timer);
            res = await fetch(`${PROD_API_URL}${queryParams}`, { signal: abortControllerRef.current.signal, headers });
          }
        } else {
          res = await fetch(url, { signal: abortControllerRef.current.signal, headers });
        }
      } catch (networkErr) {
        if (networkErr.name === 'AbortError') return;
        if (!url.startsWith(PROD_API_URL)) {
          res = await fetch(`${PROD_API_URL}${queryParams}`, { signal: abortControllerRef.current.signal, headers });
        } else { throw networkErr; }
      }

      if (res.status === 304) { setClientLatency(Math.round(performance.now() - t0)); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const etag = res.headers.get('ETag');
      const result = await res.json();
      setClientLatency(Math.round(performance.now() - t0));

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
      if (e.name === 'AbortError') return;
      if (!cachedEntry) setError('Could not connect to the API. Connecting to cloud pipeline…');
    } finally {
      clearTimeout(coldStartTimerRef.current);
      setShowColdStartBanner(false);
      setLoading(false);
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
      setSecondsUntilNextScan(SCAN_INTERVAL_SECONDS);
    }, SCAN_INTERVAL_SECONDS * 1000);
    return () => { clearInterval(intervalRef.current); abortControllerRef.current?.abort(); clearTimeout(coldStartTimerRef.current); };
  }, [fetchHackathons]);

  // Live 1-second countdown ticker for next 15-minute auto-scan
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsUntilNextScan((prev) => {
        if (prev <= 1) {
          return SCAN_INTERVAL_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Intersection observer for active nav highlight
  useEffect(() => {
    if (currentView === 'terms') return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          if (entry.target === homeRef.current) setActiveSection('home');
          else if (entry.target === dashboardRef.current) setActiveSection('dashboard');
          else if (entry.target === eventsRef.current) setActiveSection('events');
          else if (entry.target === aboutRef.current) setActiveSection('about');
        }
      });
    }, { rootMargin: '-20% 0px -60% 0px' });
    [homeRef, dashboardRef, eventsRef, aboutRef].forEach(ref => { if (ref.current) observer.observe(ref.current); });
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
          behavior: 'smooth'
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
      window.scrollTo({ top: Math.max(0, offsetPosition), behavior: 'smooth' });
    }
  };

  const handleQuickFilter = (type) => {
    if (type === 'prizes')   { setSortBy('newest'); setActiveCategory('All'); setActiveSource('All'); setSearchQuery(''); showToast('Filter: highest cash pools'); }
    if (type === 'college')  { setSearchQuery('IIT'); setActiveCategory('All'); setActiveSource('All'); showToast('Filter: premier colleges (IIT / NIT / BITS)'); }
    if (type === 'faang')    { setSearchQuery('faang'); setActiveCategory('All'); setActiveSource('All'); showToast('Filter: FAANG & MANGO global hackathons'); }
    if (type === 'pune')     { setSearchQuery('pune'); setActiveCategory('All'); setActiveSource('All'); showToast('Filter: Pune engineering hackathons (COEP / PICT)'); }
    if (type === 'iiit')     { setSearchQuery('iiit hyderabad'); setActiveCategory('All'); setActiveSource('All'); showToast('Filter: IIIT Hyderabad & premier campus hackathons'); }
    if (type === 'inperson') { setActiveCategory('Offline'); setActiveSource('All'); setSearchQuery(''); showToast('Filter: in-person hackathons near you'); }
    if (type === 'online')   { setActiveCategory('Online'); setActiveSource('All'); setSearchQuery(''); showToast('Filter: 100% online & global hackathons'); }
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
  const latencyDisplay = clientLatency ? `${clientLatency}ms` : (stats.p50_latency_ms ? `${Math.round(stats.p50_latency_ms)}ms` : '32ms');

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
  const activeCount = stats.total || upcomingTotal || 0;
  const fmt = (n) => (n || n === 0 ? Number(n).toLocaleString('en-IN') : '—');
  const prizeDisplay = stats.total_prize_pool_formatted || '—';
  const sweepProgress = Math.min(1, Math.max(0, 1 - secondsUntilNextScan / SCAN_INTERVAL_SECONDS));
  const sourceTicker = platformSources.filter((s) => s.key !== 'All' && s.count > 0);
  const tickerItems = [...sourceTicker, ...sourceTicker, ...sourceTicker, ...sourceTicker];
  const activeTabTotal = activeTab === 'upcoming' ? upcomingTotal : activeTab === 'all' ? (allTotal || upcomingTotal + missedTotal) : missedTotal;
  const hasFilters = Boolean(searchQuery) || activeCategory !== 'All' || activeSource !== 'All';

  const navItems = [
    { key: 'events',    label: 'Radar' },
    { key: 'dashboard', label: 'Telemetry' },
    { key: 'about',     label: 'Dev Desk' },
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
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* ── NAVIGATION ── */}
      <CursorSpotlight />
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

          <nav className="hidden md:flex items-center gap-9" aria-label="Primary">
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
            <button className="icon-btn" onClick={toggleDarkMode} title="Toggle theme" aria-label="Toggle theme">
              {isDarkMode ? <SunIcon /> : <MoonIcon />}
            </button>
            <button className="btn btn-ghost hidden lg:inline-flex" data-on={Boolean(userLocation)} onClick={handleNearMe}>
              <PinIcon /> {isLocating ? 'Locating…' : 'Near me'}
            </button>
            <button
              className="btn btn-ghost hidden sm:inline-flex"
              onClick={() => setShowAutoListModal(true)}
              title="Autonomous internet hackathon scanner for colleges and cities"
            >
              Auto-scanner
            </button>
            <button className="btn btn-ink hidden sm:inline-flex min-w-[76px]" onClick={handleSync}>
              {loading ? (
                <>
                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Syncing
                </>
              ) : 'Sync'}
            </button>
            <button
              className="icon-btn md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
            >
              <HamburgerIcon />
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-paper border-b border-line-strong animate-sheet-pop max-h-[calc(100dvh-4rem)] overflow-y-auto shadow-2xl">
            <nav className="shell py-2" aria-label="Mobile">
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
              <button className="btn btn-ghost !px-2 !text-xs truncate" onClick={openScanner}>Scanner</button>
              <button className="btn btn-ghost !px-2 !text-xs truncate" onClick={() => { setMobileMenuOpen(false); handleNearMe(); }}>
                {isLocating ? 'Locating…' : 'Near me'}
              </button>
              <button className="btn btn-ink !px-2 !text-xs truncate" onClick={() => { setMobileMenuOpen(false); handleSync(); }}>
                {loading ? 'Syncing…' : 'Sync'}
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ── COLD START BANNER ── */}
      {showColdStartBanner && (
        <div className="border-b border-line bg-sunken text-muted mono text-xs px-4 py-2.5 flex items-center justify-center gap-3">
          <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          Cloud server waking up — free-tier spin-up takes ~25s. Loading live database…
        </div>
      )}

      {/* ── MAIN CONTENT (RADAR or TERMS) ── */}
      <main className="flex-1 w-full">
        {currentView === 'terms' ? (
          <div className="shell py-10 md:py-14">
            <TermsAndConditions onBack={() => navigateToRadar('home')} onShowToast={showToast} />
          </div>
        ) : (
          <>
            {/* ── HERO ── */}
            <section ref={homeRef} className="hero overflow-hidden">
              <div className="hero-rings" aria-hidden="true" />
              <div className="shell pt-14 pb-16 md:pt-24 md:pb-24 grid grid-cols-1 lg:grid-cols-12 gap-14 lg:gap-8 items-end">
                <div className="lg:col-span-8">
                  <p className="eyebrow inline-flex items-center gap-2.5 rise" style={{ '--d': 0 }}>
                    <span className="dot dot-live" />
                    Native OD system · Zero amber tolerance
                  </p>
                  <h1
                    className="display rise mt-7 [font-size:clamp(2.35rem,7.5vw,7.75rem)]"
                    style={{ '--d': 1 }}
                  >
                    Stop missing hackathons <em>while arguing in the canteen.</em>
                  </h1>
                  <p className="rise mt-9 text-[17px] md:text-[19px] leading-relaxed text-ink-2 max-w-[54ch]" style={{ '--d': 2 }}>
                    Continuously scanning{' '}
                    <strong className="font-medium text-ink">{fmt(activeCount)} active, verified hackathons</strong>{' '}
                    across top IITs, NITs and premier global hubs. Ended events are archived under Lost
                    Opportunities and never counted in the active total.
                  </p>
                  <div className="rise mt-10 flex flex-wrap items-center gap-3" style={{ '--d': 3 }}>
                    <button className="btn btn-accent btn-lg" onClick={() => scrollToSection('events')}>
                      Explore live hacks <ArrowRightIcon />
                    </button>
                    <a
                      href="https://t.me/Pranavhakathon_bot"
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-ghost btn-lg"
                    >
                      <TelegramIcon /> Telegram alerts
                    </a>
                  </div>
                </div>

                {/* Telemetry ledger */}
                <aside
                  ref={dashboardRef}
                  className="lg:col-span-4 panel rise scroll-mt-24"
                  style={{ '--d': 4 }}
                  aria-label="Live telemetry"
                >
                  <div className="flex items-center justify-between px-5 py-4">
                    <span className="eyebrow inline-flex items-center gap-2.5 !text-ink">
                      <span className="dot dot-live" />
                      Live telemetry
                    </span>
                    <span className="tag tag-quiet" title="Autonomous 15-minute background discovery">Auto-sweep 15m</span>
                  </div>

                  <div className="px-5 pb-6 pt-1">
                    <div className="eyebrow">Next sweep in</div>
                    <div className="num mt-3 text-[clamp(2.75rem,8vw,4.25rem)] text-ink" aria-live="off">
                      {formatCountdown(secondsUntilNextScan)}
                    </div>
                    <div className="sweep-track mt-5" role="presentation">
                      <div className="sweep-fill" style={{ transform: `scaleX(${sweepProgress})` }} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 border-t border-line">
                    {[
                      { v: upcomingTotal, l: 'Active live', tone: 'text-ink' },
                      { v: stats.top_college_count || 0, l: 'Premier IIT / NIT', tone: 'text-accent-text' },
                      { v: stats.internship_count || 0, l: 'Internships', tone: 'text-ink' },
                      { v: missedTotal || stats.lost_opportunities_count || 0, l: 'Lost opps (past)', tone: 'text-muted' },
                    ].map((cell, i) => (
                      <div
                        key={cell.l}
                        className={`p-3.5 sm:p-5 ${i % 2 === 0 ? 'border-r border-line' : ''} ${i < 2 ? 'border-b border-line' : ''}`}
                      >
                        <div className={`num text-[clamp(1.75rem,5.5vw,2.5rem)] ${cell.tone}`}><CountUp value={cell.v} format={fmt} /></div>
                        <div className="eyebrow mt-2.5">{cell.l}</div>
                      </div>
                    ))}
                  </div>

                  <dl>
                    <div className="panel-row"><dt>Last scraped</dt><dd className="!text-accent-text">{formatLastScraped(stats.last_scraped)}</dd></div>
                    <div className="panel-row"><dt>Registered students</dt><dd>{stats.total_registrations ? stats.total_registrations.toLocaleString('en-IN') : '—'}</dd></div>
                    <div className="panel-row"><dt>Active prize pool</dt><dd>{prizeDisplay}</dd></div>
                  </dl>
                </aside>
              </div>
            </section>

            {/* ── STAT STRIP ── */}
            <div className="stat-strip" role="group" aria-label="Quick stats">
              <button type="button" className="stat-cell" onClick={() => handleQuickFilter('prizes')} title="Filter highest cash prize pools">
                <ArrowUpRightIcon size={18} />
                <div className="num text-[clamp(2rem,4.6vw,4rem)]">{prizeDisplay}</div>
                <div className="eyebrow mt-3">Verified prizes</div>
              </button>
              <button type="button" className="stat-cell" onClick={() => handleQuickFilter('college')} title="Filter premier IIT / NIT hackathons">
                <ArrowUpRightIcon size={18} />
                <div className="num text-[clamp(2rem,4.6vw,4rem)]">
                  {stats.top_college_count ? stats.top_college_count : '—'}
                  <span className="text-accent-text italic text-[0.5em] ml-2">premier</span>
                </div>
                <div className="eyebrow mt-3">HOD approved</div>
              </button>
              <button
                type="button"
                className="stat-cell"
                onClick={() => { scrollToSection('dashboard'); showToast('Telemetry: live 15-minute autonomous radar active'); }}
                title="View live broadcast telemetry"
              >
                <ArrowUpRightIcon size={18} />
                <div className="num text-[clamp(2rem,4.6vw,4rem)]">{latencyDisplay}</div>
                <div className="eyebrow mt-3">Push latency</div>
              </button>
            </div>

            {/* ── PLATFORM TICKER ── */}
            {sourceTicker.length > 0 && (
              <div className="marquee" aria-label="Platforms monitored">
                <div className="marquee-track">
                  {tickerItems.map((s, i) => (
                    <span key={`${s.key}-${i}`} className="marquee-item" aria-hidden={i >= sourceTicker.length ? 'true' : undefined}>
                      <b>{s.label}</b> {fmt(s.count)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ── RADAR ── */}
            <section ref={eventsRef} className="shell pt-20 md:pt-28 scroll-mt-16">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end reveal">
                <div className="lg:col-span-7">
                  <span className="eyebrow">01 — Radar</span>
                  <h2 className="display mt-4 [font-size:clamp(2.6rem,5.6vw,4.75rem)]">
                    Verified hackathon <em>radar</em>
                  </h2>
                  <p className="mt-5 text-muted max-w-[52ch]">
                    Zero scam portals. Direct links. Every major platform, aggregated across India and globally.
                  </p>
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
                        className="absolute right-0 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-muted hover:text-ink"
                        title="Clear search"
                        aria-label="Clear search"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <button className="btn btn-ghost shrink-0" onClick={() => setShowAutoListModal(true)} title="Autonomous internet hackathon scanner for colleges and cities">
                    Auto-scanner
                  </button>
                </div>
              </div>

              {/* Autonomous engine status */}
              <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-y border-line py-4">
                <div className="flex items-center gap-3 text-sm">
                  <span className="dot dot-live" />
                  <span>
                    <strong className="font-medium">Autonomous radar engine</strong>
                    <span className="text-muted"> — scanning the web, Instagram &amp; platforms every 15 minutes</span>
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="mono text-xs text-muted">
                    Next sweep <span className="text-ink">{formatCountdown(secondsUntilNextScan)}</span>
                  </span>
                  <button
                    className="btn btn-ghost !h-[30px] !px-3 !text-xs"
                    onClick={() => {
                      setSecondsUntilNextScan(SCAN_INTERVAL_SECONDS);
                      fetchHackathons(true);
                      showToast('Running a live autonomous sweep across web and social…');
                    }}
                    title="Force immediate radar sweep"
                  >
                    Scan now
                  </button>
                </div>
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
                <div className="mb-4 border border-line border-l-2 border-l-bad px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
                  hackathons.map((h, index) => (
                    <TiltCard
                      key={h._id || h.link}
                      className="ledger-cell"
                      index={index}
                    >
                      <HackathonCard hackathon={h} onShare={(title) => showToast(`Copied link for ${title}`)} viewMode={viewMode} />
                    </TiltCard>
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
                      : 'The scraper pipeline sweeps Unstop, Devfolio, HackerEarth, Devnovate and Devpost around the clock.'}
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

            {/* ── DEV DESK ── */}
            <section ref={aboutRef} className="mt-24 md:mt-32 border-t border-line scroll-mt-16">
              <div className="shell py-20 md:py-28 grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-12">
                <div className="lg:col-span-7 reveal">
                  <div className="flex items-center gap-4">
                    <span className="eyebrow">02 — Dev desk</span>
                    <span className="tag tag-ok">100% free &amp; open source</span>
                  </div>
                  <div className="quote-mark mt-10" aria-hidden="true">“</div>
                  <blockquote className="display -mt-3 [font-size:clamp(2rem,4.3vw,3.6rem)]">
                    Why I spent 2 weeks coding this instead of studying for <em>Data Structures</em> and Signals &amp; Systems.
                  </blockquote>
                  <p className="mt-10 text-[17px] leading-relaxed text-ink-2 max-w-[58ch]">
                    I built Hackathon Notifier because missing the Smart India Hackathon internal college round — a forwarded WhatsApp PDF buried under 800 spam messages in our unofficial college group — was the final straw. Built by a 2nd year engineer for fellow developers: no spam portals, no paywalls, just sub-second alerts to your device and instant HOD OD letters.
                  </p>
                  <dl className="mt-12 max-w-xl border-b border-line">
                    <div className="dl-row"><dt>Dev</dt><dd>Pranav D. (2nd year)</dd></div>
                    <div className="dl-row"><dt>Server cost</dt><dd className="!text-ok">₹0 / month</dd></div>
                    <div className="dl-row"><dt>Attendance</dt><dd className="!text-accent-text">74.2% (OD pending)</dd></div>
                    <div className="dl-row"><dt>Engine</dt><dd>FastAPI + Vite</dd></div>
                  </dl>
                </div>

                <div className="lg:col-span-5 flex flex-col gap-6">
                  <div className="reveal relative overflow-hidden bg-accent text-accent-ink p-8 md:p-10 rounded-lg">
                    <div className="mono text-[11px] tracking-[0.14em] uppercase font-medium flex items-center gap-2.5">
                      <span className="dot" /> Live Telegram pipeline
                    </div>
                    <div className="display mt-6 [font-size:clamp(2rem,3.4vw,2.9rem)] !text-accent-ink">
                      Never miss a 32 LPA PPI deadline again.
                    </div>
                    <p className="mt-5 text-[15px] leading-relaxed opacity-80 max-w-[40ch]">
                      Direct notifications with sub-second radar ({latencyDisplay}) of registration openings.
                    </p>
                    <a
                      href="https://t.me/Pranavhakathon_bot"
                      target="_blank"
                      rel="noreferrer"
                      className="mt-9 inline-flex items-center gap-2.5 h-12 px-5 rounded-md bg-accent-ink text-paper text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                      <TelegramIcon /> Join @Pranavhakathon_bot <ArrowUpRightIcon size={15} />
                    </a>
                  </div>

                  <div className="reveal border border-line-strong rounded-lg p-8">
                    <div className="flex items-center gap-2.5 eyebrow !text-ink">
                      <ShieldCheckIcon /> Terms, eligibility &amp; OD policy
                    </div>
                    <p className="mt-5 text-sm leading-relaxed text-muted">
                      Hackathon Notifier operates strictly as a zero-middleman student utility. Attendance On-Duty (OD) generation is automated per university guidelines (AICTE, KTU, VTU, Mumbai Univ) and subject to authorized HOD sign-off. Prize distributions are handled directly by the official organizer.
                    </p>
                    <button onClick={navigateToTerms} className="btn btn-ghost mt-6">
                      Read the full terms <ArrowRightIcon />
                    </button>
                    <div className="mono text-[11px] text-faint mt-6 pt-5 border-t border-line">
                      Privacy & data use
                    </div>
                  </div>
                </div>
              </div>
            </section>
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
              Built for Indian engineering students who would rather ship than scroll group chats.
            </p>
          </div>
          <nav className="md:col-span-3 flex flex-col gap-3" aria-label="Explore">
            <span className="eyebrow mb-1">Explore</span>
            <button className="foot-link" onClick={() => navigateToRadar('events')}>Radar</button>
            <button className="foot-link" onClick={() => navigateToRadar('dashboard')}>Telemetry</button>
            <button className="foot-link" onClick={() => navigateToRadar('about')}>Dev desk</button>
          </nav>
          <nav className="md:col-span-3 flex flex-col gap-3" aria-label="Project">
            <span className="eyebrow mb-1">Project</span>
            <button className="foot-link" onClick={navigateToTerms}>Terms &amp; Conditions</button>
            <button className="foot-link" onClick={() => setShowTechSpecModal(true)}>Architecture spec</button>
            <button className="foot-link" onClick={toggleDarkMode}>Theme: {isDarkMode ? 'Dark' : 'Light'}</button>
          </nav>
        </div>
        <div className="shell">
          <div className="foot-word" aria-hidden="true">Hackathon Notifier</div>
        </div>
        <div className="shell py-5 mt-6 border-t border-line flex flex-col sm:flex-row justify-between gap-2 mono text-[11px] text-faint">
          <span>© 2026 Hackathon Notifier</span>
          <span>Crafted by Pranav Deshmukh · B.Tech 2nd year</span>
        </div>
      </footer>

      <ScrollToTop isScrolled={isScrolled} scrollProgress={scrollProgress} />
      <Toast message={toast.message} visible={toast.visible} />
    </div>
  );
}

export default App;
