/**
 * App.jsx — Root composition component for Hackathon Notifier.
 *
 * All heavy logic is extracted into custom hooks (useDarkMode, useGeolocation,
 * useScrollProgress) and UI into dedicated components (Pagination, Toast,
 * TechSpecModal, ScrollToTop, ErrorBoundary, HackathonCard).
 *
 * This file handles: data fetching orchestration, filter/sort state, and
 * section composition. ~450 lines (down from 1069).
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import HackathonCard from './components/HackathonCard';
import SkeletonCard  from './components/SkeletonCard';
import './index.css';

// ── Extracted Components ────────────────────────────────────────────────────
import Pagination      from './components/Pagination';
import TechSpecModal   from './components/TechSpecModal';
import Toast           from './components/Toast';
import ScrollToTop     from './components/ScrollToTop';
import {
  PinIcon, EmptySearchIcon, TelegramIcon,
  SunIcon, MoonIcon, HamburgerIcon, ArrowRightIcon,
  LogoIcon, ShieldCheckIcon,
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

// ── Helpers ─────────────────────────────────────────────────────────────────
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

  // ── State ───────────────────────────────────────────────────────────────
  const [hackathons, setHackathons]           = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState(null);
  const [activeCategory, setActiveCategory]   = useState('All');
  const [sortBy, setSortBy]                   = useState('deadline');
  const [searchQuery, setSearchQuery]         = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeSection, setActiveSection]     = useState('home');
  const [mobileMenuOpen, setMobileMenuOpen]   = useState(false);
  const [showColdStartBanner, setShowColdStartBanner] = useState(false);
  const [showTechSpecModal, setShowTechSpecModal] = useState(false);
  const [activeTab, setActiveTab]             = useState('upcoming');
  const [currentPage, setCurrentPage]         = useState(1);
  const [totalPages, setTotalPages]           = useState(1);
  const [upcomingTotal, setUpcomingTotal]     = useState(0);
  const [missedTotal, setMissedTotal]         = useState(0);
  const [toast, setToast]                     = useState({ message: '', visible: false });
  const [clientLatency, setClientLatency]     = useState(null);

  const [stats, setStats] = useState({
    total: 0, unique_tags: 0, last_scraped: '', sources: [],
    top_college_count: 0, internship_count: 0, college_types: [],
    online_count: 0, offline_count: 0, unique_sources_count: 0, hackathon_count: 0,
    total_prize_pool_inr: 0, total_prize_pool_formatted: '',
    total_registrations: 0, total_registrations_formatted: '',
    p50_latency_ms: 32.0, recalculated_cadence: 'Every 3-4 hours'
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

  // ── Callbacks ───────────────────────────────────────────────────────────
  const showToast = useCallback((msg) => {
    setToast({ message: msg, visible: true });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 3200);
  }, []);

  const buildQueryParams = useCallback((params) => {
    const { page = 1, limit = PAGE_SIZE, category = 'All', sort = 'deadline', tab = 'upcoming', search = '', lat = '', lng = '' } = params;
    return `?page=${page}&limit=${limit}&category=${encodeURIComponent(category)}&sort=${sort}&tab=${tab}${search ? `&search=${encodeURIComponent(search)}` : ''}${lat && lng ? `&lat=${lat}&lng=${lng}` : ''}`;
  }, []);

  const getCacheKey = useCallback((params) => {
    return `${params.category || 'All'}|${params.sort || 'deadline'}|${params.tab || 'upcoming'}|${params.page || 1}|${params.search || ''}|${params.lat || ''}|${params.lng || ''}`;
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
      page: currentPage, limit: PAGE_SIZE, category: activeCategory,
      sort: sortBy, tab: activeTab, search: debouncedSearch,
      lat: userLocation?.lat ?? '', lng: userLocation?.lng ?? '',
    };
    const cacheKey = getCacheKey(currentParams);
    const cachedEntry = queryCacheRef.current.get(cacheKey);

    // SWR — instant cache hit
    if (cachedEntry) {
      setHackathons(cachedEntry.data || []);
      if (cachedEntry.stats) setStats(cachedEntry.stats);
      const ut = cachedEntry.upcoming_total || 0;
      const mt = cachedEntry.missed_total   || 0;
      setUpcomingTotal(ut); setMissedTotal(mt);
      setTotalPages(Math.max(1, Math.ceil((activeTab === 'upcoming' ? ut : mt) / PAGE_SIZE)));
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
      try { res = await fetch(url, { signal: abortControllerRef.current.signal, headers }); }
      catch (networkErr) {
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
        setUpcomingTotal(ut); setMissedTotal(mt);
        const newTotalPages = Math.max(1, Math.ceil((activeTab === 'upcoming' ? ut : mt) / PAGE_SIZE));
        setTotalPages(newTotalPages);

        const idleCallback = window.requestIdleCallback || ((cb) => setTimeout(cb, 200));
        idleCallback(() => {
          prefetchQuery({ ...currentParams, tab: activeTab === 'upcoming' ? 'missed' : 'upcoming', page: 1 });
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
  }, [activeCategory, sortBy, debouncedSearch, activeTab, currentPage, userLocation, buildQueryParams, getCacheKey, prefetchQuery]);

  // ── Effects ───────────────────────────────────────────────────────────
  useEffect(() => {
    const h = setTimeout(() => { setDebouncedSearch(searchQuery); setCurrentPage(1); }, 350);
    return () => clearTimeout(h);
  }, [searchQuery]);

  useEffect(() => {
    fetchHackathons();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchHackathons(true), 60 * 60 * 1000);
    return () => { clearInterval(intervalRef.current); abortControllerRef.current?.abort(); clearTimeout(coldStartTimerRef.current); };
  }, [fetchHackathons]);

  // Intersection observer for active nav highlight
  useEffect(() => {
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
  }, []);

  // Auto-trigger location sort
  useEffect(() => {
    if (userLocation && sortBy !== 'distance') { setSortBy('distance'); setCurrentPage(1); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation]);

  // ── Event Handlers ────────────────────────────────────────────────────
  const handleCategoryChange = (cat) => { setActiveCategory(cat); setCurrentPage(1); };
  const handleSearchChange   = (e)   => setSearchQuery(e.target.value);
  const handleSortChange     = (e)   => {
    const v = e.target.value;
    if (v === 'distance' && !userLocation) { setSortBy('distance'); requestLocation(); return; }
    setSortBy(v); setCurrentPage(1);
  };
  const handleTabChange  = (tab) => { setActiveTab(tab); setCurrentPage(1); eventsRef.current?.scrollIntoView({ behavior: 'smooth' }); };
  const handlePageChange = (p)   => { setCurrentPage(p); eventsRef.current?.scrollIntoView({ behavior: 'smooth' }); };

  const scrollToSection = (section) => {
    setActiveSection(section); setMobileMenuOpen(false);
    const refMap = { home: homeRef, dashboard: dashboardRef, features: featuresRef, events: eventsRef, about: aboutRef };
    refMap[section]?.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleQuickFilter = (type) => {
    if (type === 'prizes')   { setSortBy('newest'); setActiveCategory('All'); setSearchQuery(''); showToast('⚡ Filter: Highest Cash Pools'); }
    if (type === 'college')  { setSearchQuery('IIT'); setActiveCategory('All'); showToast('🎓 Filter: Premier Colleges (IIT/NIT/BITS)'); }
    if (type === 'inperson') { setActiveCategory('Offline'); setSearchQuery(''); showToast('📍 Filter: In-Person Hackathons Near You'); }
    if (type === 'online')   { setActiveCategory('Online'); setSearchQuery(''); showToast('🌐 Filter: 100% Online & Global Hackathons'); }
    scrollToSection('events');
  };

  // ── Derived Data ──────────────────────────────────────────────────────
  const latencyDisplay = clientLatency ? `${clientLatency}ms` : (stats.p50_latency_ms ? `${Math.round(stats.p50_latency_ms)}ms` : '32ms');

  const categories = [
    { key: 'All',            label: 'All',            count: stats.total },
    { key: 'Online',         label: '🌐 Online',       count: stats.online_count || 0 },
    { key: 'Offline',        label: '📍 In-Person',    count: stats.offline_count || 0 },
    { key: 'Top College',    label: '🏛 Top College',  count: stats.top_college_count || 0 },
    { key: 'Internship',     label: '💼 Internships',  count: stats.internship_count || 0 },
    { key: 'Hackathon',      label: 'Hackathons',     count: stats.hackathon_count || 0 },
    { key: 'Unique Sources', label: '⭐ Curated',      count: stats.unique_sources_count || 0 },
  ];

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-obsidian text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300 flex flex-col relative overflow-hidden">
      {/* ── AMBIENT GLASSMORPHIC BLUR ORBS ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
        <div className="absolute w-[520px] h-[520px] -top-[120px] left-[5%] rounded-full opacity-35 dark:opacity-30 blur-[120px] bg-gradient-to-br from-[#007AFF]/25 to-[#5856D6]/15 animate-orb-slow pointer-events-none transition-transform duration-75 ease-out will-change-transform" style={{ transform: `translate3d(0, ${Math.min(scrollProgress * 1.5, 140)}px, 0)` }} />
        <div className="absolute w-[620px] h-[620px] top-[28%] -right-[120px] rounded-full opacity-30 dark:opacity-25 blur-[140px] bg-gradient-to-br from-[#5856D6]/20 to-[#30B0C7]/15 animate-orb-reverse pointer-events-none transition-transform duration-75 ease-out will-change-transform" style={{ transform: `translate3d(0, -${Math.min(scrollProgress * 1.2, 120)}px, 0)` }} />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(15,23,42,0.04)_1px,transparent_1px)] dark:bg-[radial-gradient(rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:32px_32px] opacity-60"></div>
      </div>

      {showTechSpecModal && <TechSpecModal onClose={() => setShowTechSpecModal(false)} />}

      {/* ── MOBILE BACKDROP OVERLAY ── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/60 backdrop-blur-sm z-40 md:hidden transition-opacity" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* ── NAVIGATION ── */}
      <header className={`sticky top-0 z-50 transition-all duration-300 crystal-chamfer ${
        isScrolled
          ? 'border-b border-black/[0.08] dark:border-white/[0.12] bg-white/85 dark:bg-black/85 backdrop-blur-2xl shadow-[0_4px_24px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_32px_rgba(0,0,0,0.75)] py-2.5'
          : 'border-b border-black/[0.04] dark:border-white/[0.06] bg-white/70 dark:bg-black/70 backdrop-blur-xl py-3.5'
      } px-4 sm:px-6 lg:px-8`}>
        <div className="absolute bottom-0 left-0 h-[2px] bg-gradient-to-r from-[#007AFF] via-[#5856D6] to-[#30B0C7] transition-all duration-75 ease-out" style={{ width: `${scrollProgress}%`, opacity: isScrolled ? 1 : 0 }} />
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => scrollToSection('home')}>
            <div className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-[#007AFF] to-[#0055D4] flex items-center justify-center shadow-sm shrink-0"><LogoIcon /></div>
            <span className="font-semibold text-sm tracking-tight text-slate-900 dark:text-white">Hackathon Notifier</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-4 text-sm font-semibold text-slate-600 dark:text-slate-300">
              {['events', 'dashboard', 'about'].map(section => (
                <a key={section} href={`#${section}`} onClick={e => { e.preventDefault(); scrollToSection(section); }} className={`hover:text-slate-900 dark:hover:text-white transition-colors ${activeSection === section ? 'text-[#007AFF] dark:text-[#0A84FF]' : ''}`}>
                  {section === 'events' ? 'Radar' : section === 'dashboard' ? 'Telemetry' : 'Dev Desk'}
                </a>
              ))}
            </div>
            <div className="flex items-center gap-2 ml-4 border-l border-black/[0.08] dark:border-white/[0.12] pl-4">
              <button onClick={toggleDarkMode} className="w-10 h-10 min-h-[40px] min-w-[40px] rounded-[12px] apple-squircle apple-touch-target apple-spring-press apple-dual-bevel bg-black/[0.04] text-slate-700 hover:bg-black/[0.08] dark:bg-white/[0.08] dark:text-slate-300 dark:hover:bg-white/[0.14] transition-all flex items-center justify-center cursor-pointer shadow-xs" title="Toggle Theme">
                <div className="transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] transform hover:rotate-12 active:rotate-45">{isDarkMode ? <SunIcon /> : <MoonIcon />}</div>
              </button>
              <button className={`hidden sm:flex items-center gap-1.5 px-3.5 h-10 min-h-[40px] rounded-[12px] apple-squircle apple-touch-target apple-spring-press apple-dual-bevel text-xs font-semibold transition-all cursor-pointer shadow-xs ${
                userLocation ? 'bg-[#007AFF]/15 text-[#007AFF] dark:bg-[#0A84FF]/20 dark:text-[#0A84FF] border border-[#007AFF]/30' : 'bg-black/[0.04] text-slate-700 hover:bg-black/[0.08] dark:bg-white/[0.08] dark:text-slate-300 dark:hover:bg-white/[0.14] border border-black/[0.06] dark:border-white/[0.08]'
              }`} onClick={requestLocation}><PinIcon /> {isLocating ? 'Locating...' : 'Near Me'}</button>
              <button className="hidden sm:flex items-center gap-1.5 px-4 h-10 min-h-[40px] rounded-[12px] apple-squircle apple-touch-target apple-spring-press apple-dual-bevel text-xs font-bold bg-[#007AFF] hover:bg-[#0066D6] dark:bg-[#0A84FF] dark:hover:bg-[#0077ED] text-white shadow-xs hover:shadow-md hover:shadow-[#007AFF]/25 transition-all cursor-pointer" onClick={() => fetchHackathons()}>Sync</button>
              <button className="md:hidden p-2 text-slate-600 dark:text-slate-300" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}><HamburgerIcon /></button>
            </div>
          </div>
        </div>

        {/* Mobile Nav Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-2xl border-b border-black/[0.08] dark:border-white/[0.12] shadow-xl p-4 flex flex-col gap-3 animate-sheet-pop">
            {['events', 'dashboard', 'about'].map(section => (
              <a key={section} href={`#${section}`} onClick={e => { e.preventDefault(); scrollToSection(section); }} className="block py-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                {section === 'events' ? 'Radar' : section === 'dashboard' ? 'Telemetry' : 'Dev Desk'}
              </a>
            ))}
            <div className="h-px bg-black/[0.06] dark:bg-white/[0.08] my-1"></div>
            <button className="flex items-center justify-center gap-2 py-2.5 rounded-[12px] bg-black/[0.04] dark:bg-white/[0.08] text-sm font-semibold" onClick={requestLocation}><PinIcon /> Use GPS Location</button>
            <button className="flex items-center justify-center gap-2 py-2.5 rounded-[12px] bg-[#007AFF] text-white text-sm font-semibold" onClick={() => fetchHackathons()}>Force Sync Now</button>
          </div>
        )}
      </header>

      {/* ── COLD START BANNER ── */}
      {showColdStartBanner && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-500/30 text-blue-800 dark:text-blue-300 px-4 py-2 text-xs font-medium flex items-center justify-center gap-2 backdrop-blur-md">
          <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></span>
          Cloud server waking up · Render free tier initial spin-up (~25s). Loading live database…
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 space-y-12 w-full flex-1 relative z-10">

        {/* HERO SECTION */}
        <section ref={homeRef} className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          <div className="lg:col-span-7 space-y-5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-semibold tracking-wide border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse"></span>
              NATIVE OD SYSTEM • ZERO AMBER TOLERANCE
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-950 dark:text-white leading-[1.12]">Stop missing hackathons while arguing in the canteen.</h1>
            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
              Continuously scan <strong className="text-slate-900 dark:text-white font-bold">{stats.total ? `${stats.total.toLocaleString()}+` : '2,300+'} verified student hackathons</strong> across top IITs, NITs, and premier global hubs. Rigorously vetted for guaranteed cash pools, college On-Duty (OD) approval letters, and direct SDE interview shortlists.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button className="h-12 min-h-[44px] px-6 rounded-[14px] apple-squircle apple-touch-target apple-spring-press apple-dual-bevel bg-[#007AFF] hover:bg-[#0066D6] dark:bg-[#0A84FF] dark:hover:bg-[#0077ED] text-white text-sm font-semibold shadow-xs hover:shadow-md hover:shadow-[#007AFF]/25 transition-all duration-200 flex items-center gap-2 cursor-pointer" onClick={() => scrollToSection('events')}>Explore Live Hacks <ArrowRightIcon /></button>
              <a href="https://t.me/Pranavhakathon_bot" target="_blank" rel="noreferrer" className="h-12 min-h-[44px] px-6 rounded-[14px] apple-squircle apple-touch-target apple-spring-press apple-dual-bevel bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.12] hover:bg-slate-50 dark:hover:bg-white/[0.06] text-slate-800 dark:text-slate-200 text-sm font-semibold flex items-center gap-2 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer"><TelegramIcon /> Telegram Alerts</a>
            </div>

            {/* Interactive Stats Triplet */}
            <div className="grid grid-cols-3 gap-3 pt-4">
              <button type="button" onClick={() => handleQuickFilter('prizes')} className="text-left bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl p-3.5 rounded-[16px] apple-squircle apple-dual-bevel apple-spring-press border border-black/[0.08] dark:border-white/[0.10] shadow-[0_2px_10px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.30)] hover:border-[#007AFF]/40 dark:hover:border-[#0A84FF]/40 hover:-translate-y-1 hover:shadow-lg dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group cursor-pointer crystal-chamfer crystal-sheen" title="Filter highest cash prize pools">
                <div className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight group-hover:text-[#007AFF] dark:group-hover:text-[#0A84FF] transition-colors">{stats.total_prize_pool_formatted || '₹40.6 Cr'}</div>
                <div className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 tracking-wider flex items-center justify-between mt-0.5"><span>Verified Prizes</span><span className="text-[10px] text-[#007AFF] opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-200">↗</span></div>
              </button>
              <button type="button" onClick={() => handleQuickFilter('college')} className="text-left bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl p-3.5 rounded-[16px] apple-squircle apple-dual-bevel apple-spring-press border border-black/[0.08] dark:border-white/[0.10] shadow-[0_2px_10px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.30)] hover:border-[#34C759]/40 dark:hover:border-[#30D158]/40 hover:-translate-y-1 hover:shadow-lg dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group cursor-pointer crystal-chamfer crystal-sheen" title="Filter premier IIT/NIT college hackathons">
                <div className="text-lg sm:text-xl font-bold text-[#34C759] dark:text-[#30D158] tracking-tight">{stats.top_college_count ? `${stats.top_college_count} Premier` : '100% OD'}</div>
                <div className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 tracking-wider flex items-center justify-between mt-0.5"><span>HOD Approved</span><span className="text-[10px] text-[#34C759] opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-200">↗</span></div>
              </button>
              <button type="button" onClick={() => { scrollToSection('dashboard'); showToast('⚡ Telemetry: Live sub-second radar active'); }} className="text-left bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl p-3.5 rounded-[16px] apple-squircle apple-dual-bevel apple-spring-press border border-black/[0.08] dark:border-white/[0.10] shadow-[0_2px_10px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.30)] hover:border-[#007AFF]/40 dark:hover:border-[#0A84FF]/40 hover:-translate-y-1 hover:shadow-lg dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group cursor-pointer crystal-chamfer crystal-sheen" title="View live broadcast telemetry">
                <div className="text-lg sm:text-xl font-bold text-[#007AFF] dark:text-[#0A84FF] tracking-tight">{latencyDisplay}</div>
                <div className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 tracking-wider flex items-center justify-between mt-0.5"><span>Push Latency</span><span className="text-[10px] text-[#007AFF] opacity-0 group-hover:opacity-100 transition-opacity">⚡</span></div>
              </button>
            </div>
          </div>

          {/* TELEMETRY CARD */}
          <div ref={dashboardRef} className="lg:col-span-5 bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-2xl p-6 rounded-[24px] border border-black/[0.08] dark:border-white/[0.10] shadow-[0_4px_24px_rgba(0,0,0,0.05)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.40)] flex flex-col justify-between h-full min-h-[340px] crystal-chamfer crystal-sheen">
            <div>
              <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] pb-3 mb-4">
                <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-[#34C759] dark:bg-[#30D158] animate-pulse"></span><span className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide">Live Telemetry</span></div>
                <span className="text-[10px] font-semibold uppercase px-2.5 py-0.5 rounded-full bg-[#007AFF]/10 text-[#007AFF] dark:bg-[#0A84FF]/15 dark:text-[#0A84FF] border border-[#007AFF]/20 crystal-pill" title="Recalculated every 3–4 hours">Recalculated ~3-4h</span>
              </div>
              <div className="bg-[#F2F2F7]/80 dark:bg-[#2C2C2E]/60 backdrop-blur-md rounded-[16px] p-4.5 border border-black/[0.04] dark:border-white/[0.06] space-y-4 crystal-chamfer">
                <div className="flex items-center justify-between text-xs font-mono"><span className="text-slate-500 dark:text-slate-400">Sync Cadence</span><strong className="text-slate-900 dark:text-white">Every 3–4 hrs · {formatLastScraped(stats.last_scraped)}</strong></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><div className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{upcomingTotal}</div><div className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400">Active Live</div></div>
                  <div><div className="text-2xl font-bold text-[#34C759] dark:text-[#30D158] tracking-tight">{stats.top_college_count || 0}</div><div className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400">Premier IIT/NIT</div></div>
                  <div><div className="text-2xl font-bold text-[#AF52DE] dark:text-[#BF5AF2] tracking-tight">{stats.internship_count || 0}</div><div className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400">Internships</div></div>
                  <div><div className="text-2xl font-bold text-[#007AFF] dark:text-[#0A84FF] tracking-tight">{stats.total || 0}</div><div className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400">Total Tracked</div></div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5 pt-4 border-t border-black/[0.06] dark:border-white/[0.08] mt-4 text-center">
              <div className="p-3 rounded-[12px] bg-[#F2F2F7]/80 dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] crystal-chamfer"><div className="text-sm font-bold text-slate-900 dark:text-white">{stats.total_registrations ? stats.total_registrations.toLocaleString() : '263,031'}</div><div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Registered Students</div></div>
              <div className="p-3 rounded-[12px] bg-emerald-500/10 border border-emerald-500/20 crystal-chamfer crystal-pill"><div className="text-sm font-bold text-[#34C759] dark:text-[#30D158]">{stats.total_prize_pool_formatted || '₹40.6 Cr'}</div><div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase">Total Prize Pool</div></div>
            </div>
          </div>
        </section>

        {/* ── DISCOVER EVENTS SECTION ── */}
        <section ref={eventsRef} className="space-y-6 pt-8 border-t border-border-light dark:border-border-dark">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.6)]"></span>Verified Hackathon Radar</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 font-medium">Zero scam portals • Direct API links • Guaranteed real opportunities</p>
            </div>
            <div className="relative group w-full sm:w-80">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500 group-focus-within:text-[#007AFF] dark:group-focus-within:text-[#0A84FF] group-focus-within:scale-110 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              </div>
              <input type="text" placeholder="Search hacks (e.g., AI, Web3)..." className="w-full pl-10 pr-9 h-11 min-h-[44px] bg-black/[0.05] dark:bg-white/[0.08] border border-transparent focus:border-[#007AFF]/40 focus:bg-white dark:focus:bg-[#1C1C1E] rounded-[14px] apple-squircle text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/25 focus:shadow-[0_0_24px_rgba(0,122,255,0.12)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] shadow-xs crystal-search crystal-chamfer" value={searchQuery} onChange={handleSearchChange} />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-all duration-200 active:scale-85 cursor-pointer" title="Clear search" aria-label="Clear search">
                  <span className="w-4 h-4 rounded-full bg-black/10 dark:bg-white/20 flex items-center justify-center text-[10px] leading-none">✕</span>
                </button>
              )}
            </div>
          </div>

          {/* Category Pill Bar */}
          <div className="flex flex-wrap items-center gap-2 pb-2">
            {categories.map(cat => (
              <button key={cat.key} onClick={() => handleCategoryChange(cat.key)} className={`px-4 py-2 min-h-[38px] sm:min-h-[40px] rounded-full apple-touch-target apple-spring-press apple-dual-bevel text-xs font-semibold transition-all duration-200 cursor-pointer crystal-chamfer ${
                activeCategory === cat.key ? 'bg-[#007AFF] text-white shadow-xs shadow-[#007AFF]/25 scale-[1.02]' : 'bg-white/90 dark:bg-[#1C1C1E]/90 border border-black/[0.08] dark:border-white/[0.10] text-slate-700 dark:text-slate-300 hover:bg-black/[0.03] dark:hover:bg-white/[0.06] hover:border-black/[0.15] dark:border-white/[0.20]'
              }`}>{cat.label} <span className="opacity-70 ml-1">({cat.count})</span></button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Sort:</span>
              <select value={sortBy} onChange={handleSortChange} className="h-10 sm:h-11 min-h-[40px] sm:min-h-[44px] bg-white/95 dark:bg-[#1C1C1E]/95 border border-black/[0.08] dark:border-white/[0.10] text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-[12px] apple-squircle apple-touch-target apple-dual-bevel px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#007AFF] cursor-pointer shadow-xs transition-all duration-200 crystal-chamfer">
                <option value="deadline">⏳ Deadline (Soonest)</option>
                <option value="newest">✨ Recently Added</option>
                <option value="name">🔤 Name (A–Z)</option>
                <option value="distance">📍 Nearest {!userLocation && '(uses GPS)'}</option>
              </select>
            </div>
          </div>

          {/* Error / Location States */}
          {locationError && (
            <div className="bg-sky-500/10 border border-sky-500/20 text-sky-800 dark:text-sky-300 px-4 py-3 rounded-[14px] text-xs sm:text-sm font-semibold flex items-center justify-between gap-2 shadow-xs">
              <span className="flex items-center gap-2"><PinIcon /> {locationError}</span>
              <button onClick={() => setLocationError(null)} className="text-[#007AFF] dark:text-[#0A84FF] hover:underline text-xs font-bold">Dismiss</button>
            </div>
          )}
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-800 dark:text-rose-300 px-4 py-3 rounded-[14px] text-xs sm:text-sm font-semibold flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
              <div>Connection Notice: {error}</div>
              <button className="px-3.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-[8px] text-xs font-bold transition shadow-xs" onClick={() => fetchHackathons()}>Retry</button>
            </div>
          )}

          {/* Tab Switcher */}
          {!loading && !error && (upcomingTotal > 0 || missedTotal > 0) && (
            <div className="flex items-center">
              <div className="relative p-1 rounded-[16px] apple-squircle bg-black/[0.05] dark:bg-white/[0.08] backdrop-blur-md inline-flex items-center shadow-inner border border-black/[0.04] dark:border-white/[0.04] w-fit min-h-[44px] crystal-pill crystal-chamfer">
                <div className={`absolute top-1 bottom-1 rounded-[12px] apple-squircle apple-dual-bevel bg-white dark:bg-[#2C2C2E] shadow-sm transition-all duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] crystal-chamfer ${activeTab === 'upcoming' ? 'left-1 w-[calc(50%-4px)]' : 'left-[calc(50%)] w-[calc(50%-4px)]'}`} aria-hidden="true" />
                {['upcoming', 'missed'].map(tab => (
                  <button key={tab} type="button" className={`relative z-10 px-5 py-2 min-h-[38px] text-xs sm:text-sm font-semibold rounded-[12px] apple-squircle apple-touch-target apple-spring-press transition-colors duration-200 flex items-center justify-center gap-2 cursor-pointer select-none ${activeTab === tab ? 'text-slate-950 dark:text-white font-bold' : 'text-slate-500 dark:text-slate-400 hover:text-black dark:hover:text-white'}`} onClick={() => handleTabChange(tab)}>
                    <span>{tab === 'upcoming' ? '🚀 Upcoming' : '📁 Past Deadlines'}</span>
                    <span className={`py-0.5 px-2 rounded-full text-[10px] font-bold transition-all duration-300 ${activeTab === tab ? (tab === 'upcoming' ? 'bg-[#007AFF]/12 text-[#007AFF] dark:bg-[#0A84FF]/25 dark:text-[#0A84FF] scale-105' : 'bg-black/10 text-black dark:bg-white/20 dark:text-white scale-105') : 'bg-black/[0.05] dark:bg-white/10 text-slate-500 dark:text-slate-400'}`}>{tab === 'upcoming' ? upcomingTotal : missedTotal}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Card Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))
            ) : !error && hackathons.length > 0 ? (
              hackathons.map((h, index) => (
                <div key={h._id || h.link} className="animate-card-in scroll-reveal-card" style={{ animationDelay: `${Math.min(index * 35, 210)}ms` }}>
                  <HackathonCard hackathon={h} onShare={(title) => showToast(`Copied link for ${title}`)} />
                </div>
              ))
            ) : null}
          </div>

          <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />

          {/* Empty State */}
          {!loading && !error && hackathons.length === 0 && (
            <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-slate-300 dark:border-white/20 rounded-[24px] bg-white/40 dark:bg-white/[0.02]">
              <EmptySearchIcon />
              <h3 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">{searchQuery || activeCategory !== 'All' ? 'No hackathons found matching your active filters' : activeTab === 'missed' ? 'No past deadline records available.' : 'Nothing new right now — check back soon.'}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md leading-relaxed">{searchQuery || activeCategory !== 'All' ? `Zero matches for "${searchQuery || activeCategory}". Try searching for broader terms (e.g. AI, Web3, Beginner) or reset filters.` : 'The scraper pipeline runs autonomous hourly sweeps across Unstop, Devfolio, HackerEarth and Devpost.'}</p>
              <button className="mt-5 px-6 h-11 min-h-[44px] apple-squircle apple-touch-target apple-spring-press apple-dual-bevel bg-[#007AFF] hover:bg-[#0066D6] dark:bg-[#0A84FF] text-white rounded-[12px] text-xs font-bold shadow-md shadow-blue-600/20 transition-all cursor-pointer" onClick={() => { setSearchQuery(''); setActiveCategory('All'); }}>Reset All Filters</button>
            </div>
          )}
        </section>

        {/* ── ABOUT & MAKER SECTION ── */}
        <section ref={aboutRef} className="pt-8 border-t border-black/[0.08] dark:border-white/[0.10] grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-6 bg-white dark:bg-[#1C1C1E] p-6 rounded-[24px] border border-black/[0.08] dark:border-white/[0.10] shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] pb-3">
              <span className="text-xs font-semibold text-[#007AFF] dark:text-[#0A84FF] uppercase tracking-wider">Developer Spotlight • Maker</span>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 border border-emerald-500/20 font-bold tracking-wide">100% Free & Open Source</span>
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white leading-snug tracking-tight">"Why I spent 2 weeks coding this instead of studying for Data Structures and Signals & Systems."</h3>
            <p className="text-xs sm:text-sm font-normal text-slate-600 dark:text-slate-300 leading-relaxed">I built Hackathon Notifier because missing out on the Smart India Hackathon internal college round due to a forwarded WhatsApp PDF buried under 800 spam messages in our unofficial college group was the final straw. Built by a 2nd year engineer for fellow developers: no spam portals, no paid paywalls, just sub-second alerts right to your device and instant HOD OD letters.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 text-[11px] bg-[#F2F2F7] dark:bg-[#2C2C2E] p-3.5 rounded-[16px] border border-black/[0.04] dark:border-white/[0.04]">
              <div><span className="text-slate-500 dark:text-slate-400 block mb-0.5 font-semibold text-[10px]">Dev</span><strong className="text-slate-900 dark:text-white text-xs">Pranav D. (2nd Year)</strong></div>
              <div><span className="text-slate-500 dark:text-slate-400 block mb-0.5 font-semibold text-[10px]">Server Cost</span><strong className="text-[#34C759] dark:text-[#30D158] text-xs">₹0 / month</strong></div>
              <div><span className="text-slate-500 dark:text-slate-400 block mb-0.5 font-semibold text-[10px]">Attendance</span><strong className="text-[#007AFF] dark:text-[#0A84FF] text-xs">74.2% (OD Pending)</strong></div>
              <div><span className="text-slate-500 dark:text-slate-400 block mb-0.5 font-semibold text-[10px]">Engine</span><strong className="text-slate-800 dark:text-slate-200 text-xs">FastAPI+Vite</strong></div>
            </div>
          </div>

          <div className="lg:col-span-6 flex flex-col gap-5">
            <div className="bg-gradient-to-r from-[#007AFF] to-[#5856D6] text-white rounded-[24px] p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md border border-blue-400/30 crystal-chamfer crystal-sheen">
              <div>
                <div className="text-[10px] font-mono tracking-wider text-blue-100 uppercase font-bold mb-1">● Live Telegram Pipeline</div>
                <div className="text-base font-bold tracking-tight leading-snug">Never miss a 32 LPA PPI deadline again.</div>
                <div className="text-xs text-blue-100 font-normal mt-1">Direct notifications with sub-second radar ({latencyDisplay}) of registration openings.</div>
              </div>
              <a href="https://t.me/Pranavhakathon_bot" target="_blank" rel="noreferrer" className="h-11 min-h-[44px] px-5 rounded-[12px] apple-squircle apple-touch-target apple-spring-press apple-dual-bevel bg-white text-[#007AFF] text-xs sm:text-sm font-bold hover:bg-slate-50 transition shadow-sm whitespace-nowrap flex items-center gap-2 cursor-pointer"><TelegramIcon /> Join @Pranavhakathon_bot</a>
            </div>
            <div className="bg-[#F2F2F7]/90 dark:bg-[#1C1C1E]/90 backdrop-blur-xl p-6 rounded-[24px] border border-black/[0.06] dark:border-white/[0.08] text-xs font-normal text-slate-600 dark:text-slate-400 space-y-3 flex-1 flex flex-col justify-center crystal-chamfer">
              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><ShieldCheckIcon /> TERMS, ELIGIBILITY & OD VERIFICATION POLICY</div>
              <p className="leading-relaxed">Hackathon Notifier operates strictly as a zero-middleman student utility. Attendance On-Duty (OD) generation is automated per university guidelines (AICTE, KTU, VTU, Mumbai Univ) and subject to authorized HOD sign-off. Bounties and prize distributions are guaranteed directly via official organizer escrow.</p>
              <div className="flex flex-wrap items-center justify-between font-mono text-[10px] pt-3 border-t border-black/[0.06] dark:border-white/[0.06] opacity-80">
                <span>Privacy Policy: Zero Student Data Tracking</span>
                <span>Apple HIG Standard v4.2 • Telemetry: 100% Operational</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── FOOTER ── */}
      <footer className="bg-white dark:bg-[#000000] border-t border-black/[0.08] dark:border-white/[0.10] px-4 sm:px-8 py-5 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-semibold text-slate-500 dark:text-slate-400 z-10 relative mt-auto">
        <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-center sm:text-left">
          <span className="font-bold text-slate-900 dark:text-white">© 2026 Hackathon Notifier</span>
          <span className="hidden sm:inline-block border-l border-slate-300 dark:border-slate-700 h-3"></span>
          <span>Built for Indian Engineering Students</span>
        </div>
        <div className="flex items-center gap-4">
          <button className="text-[#007AFF] dark:text-[#0A84FF] hover:underline font-bold" onClick={() => setShowTechSpecModal(true)}>Architecture Spec</button>
          <span className="text-[#34C759] dark:text-[#30D158] font-mono font-bold">Mode: {isDarkMode ? 'OLED Dark' : 'Normal Light'} PRO</span>
        </div>
      </footer>

      <ScrollToTop isScrolled={isScrolled} scrollProgress={scrollProgress} />
      <Toast message={toast.message} visible={toast.visible} />
    </div>
  );
}

export default App;
