import React, { useState, useEffect, useRef, useCallback } from 'react';
import HackathonCard from '../Components/hakathoncard';
import './index.css';

let API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://hackathon-notifier.onrender.com' : 'http://localhost:8000');
if (API_URL.endsWith('/')) API_URL = API_URL.slice(0, -1);
if (!API_URL.endsWith('/api/hackathons')) API_URL += '/api/hackathons';

const COLD_START_WARN_MS = 5_000;
const PAGE_SIZE = 12;

// ── Logo — lightning bolt inside a rounded square ──────────────────────────
function HLogo({ size = 36 }) {
  return (
    <svg
      className="brand-h-svg"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="11" fill="url(#logo-grad)" />
      <path
        d="M23 7L13 22h8l-4 11 14-17h-9l6-9z"
        fill="white"
        stroke="rgba(255,255,255,0.3)"
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id="logo-grad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ── Dashboard Stats Popup ────────────────────────────────────────────────────
function DashboardPopup({ stats, upcomingTotal, missedTotal, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-window dash-popup" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Dashboard statistics">
        <div className="modal-header dash-header">
          <HLogo size={40} />
          <div>
            <h2 className="modal-name">Live Dashboard</h2>
            <p className="modal-role">Real-time stats · Auto-refreshes every 1 hr</p>
          </div>
        </div>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="modal-body">
          <div className="dash-metric-grid">
            <div className="dash-metric"><span className="dash-metric-val">{stats.total || 0}</span><span className="dash-metric-label">Total Events</span></div>
            <div className="dash-metric"><span className="dash-metric-val" style={{color:'#10b981'}}>{upcomingTotal || 0}</span><span className="dash-metric-label">Upcoming</span></div>
            <div className="dash-metric"><span className="dash-metric-val" style={{color:'#64748b'}}>{missedTotal || 0}</span><span className="dash-metric-label">Missed</span></div>
            <div className="dash-metric"><span className="dash-metric-val" style={{color:'#f59e0b'}}>{stats.top_college_count || 0}</span><span className="dash-metric-label">IIT/NIT/BITS</span></div>
            <div className="dash-metric"><span className="dash-metric-val" style={{color:'#a78bfa'}}>{stats.internship_count || 0}</span><span className="dash-metric-label">Internships</span></div>
            <div className="dash-metric"><span className="dash-metric-val">{stats.unique_tags || 0}</span><span className="dash-metric-label">Unique Tags</span></div>
          </div>
          <div className="modal-section">
            <h3>Mode Distribution</h3>
            <div className="dash-bar-row">
              <span className="dash-bar-label">Online</span>
              <div className="dash-bar-track"><div className="dash-bar-fill dash-bar--online" style={{width: stats.total ? `${((stats.online_count||0)/stats.total)*100}%` : '0%'}} /></div>
              <span className="dash-bar-count">{stats.online_count || 0}</span>
            </div>
            <div className="dash-bar-row">
              <span className="dash-bar-label">Offline</span>
              <div className="dash-bar-track"><div className="dash-bar-fill dash-bar--offline" style={{width: stats.total ? `${((stats.offline_count||0)/stats.total)*100}%` : '0%'}} /></div>
              <span className="dash-bar-count">{stats.offline_count || 0}</span>
            </div>
          </div>
          <div className="modal-section">
            <h3>Sources</h3>
            <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
              {(stats.sources || []).map(s => <span key={s} className={`source-badge source-badge--${s.toLowerCase()}`}>{s}</span>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── About Modal ──────────────────────────────────────────────────────────────
function AboutModal({ onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-window about-modal-compact" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="About the maker">
        <div className="modal-header">
          <div className="modal-avatar">PD</div>
          <div>
            <h2 className="modal-name">Pranav Deshmukh</h2>
            <p className="modal-role">B.Tech 2nd Year &nbsp;·&nbsp; Systems Architect &nbsp;·&nbsp; Builder</p>
          </div>
        </div>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="modal-body about-body-compact">
          <div className="modal-badge-row">
            <span className="modal-badge modal-badge--green">🏗️ Architect: Pranav Deshmukh</span>
            <span className="modal-badge modal-badge--purple">⚡ LLM-Accelerated</span>
          </div>
          <p className="modal-bio" style={{fontSize:'0.88rem',marginBottom:'1rem'}}>
            A 2nd-year B.Tech student who decided manually refreshing four hackathon
            platforms every morning was an unsolved systems problem — <strong>so I solved it.</strong>{' '}
            LLMs acted as a <em>pair programmer</em>, not the engineer.
          </p>
          <div className="modal-section" style={{marginBottom:'0.9rem'}}>
            <h3>Under the Hood</h3>
            <div className="modal-tech-grid">
              <div className="modal-tech-item"><span>⚡</span> FastAPI + Python</div>
              <div className="modal-tech-item"><span>🌿</span> MongoDB Atlas</div>
              <div className="modal-tech-item"><span>⚛️</span> React + Vite</div>
              <div className="modal-tech-item"><span>📲</span> Telegram Bot</div>
              <div className="modal-tech-item"><span>☁️</span> Render + Vercel</div>
              <div className="modal-tech-item"><span>🕷️</span> curl-cffi (CF bypass)</div>
            </div>
          </div>
          <div className="modal-section" style={{marginBottom:'0.9rem'}}>
            <h3>What it ships</h3>
            <div className="about-chips">
              <span>5 concurrent scrapers</span><span>IIT/NIT/BITS classifier</span>
              <span>Haversine geo-ranking</span><span>Telegram push alerts</span>
            </div>
          </div>
          <div className="modal-footer-note"><em>🤖 AI-accelerated, not AI-generated. The architecture runs on human ingenuity.</em></div>
        </div>
      </div>
    </div>
  );
}

// ── Pagination ──────────────────────────────────────────────────────────────
function Pagination({ currentPage, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;
  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) pages.push(i);
  }
  const withEllipsis = [];
  let prev = null;
  for (const page of pages) {
    if (prev !== null && page - prev > 1) withEllipsis.push('...');
    withEllipsis.push(page);
    prev = page;
  }
  return (
    <div className="pagination">
      <button className="pagination-btn" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}>← Prev</button>
      {withEllipsis.map((item, i) =>
        item === '...'
          ? <span key={`e-${i}`} className="pagination-ellipsis">…</span>
          : <button key={item} className={`pagination-btn ${currentPage === item ? 'active' : ''}`} onClick={() => onPageChange(item)}>{item}</button>
      )}
      <button className="pagination-btn" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}>Next →</button>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────
function App() {
  const [hackathons, setHackathons]           = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState(null);
  const [activeCategory, setActiveCategory]   = useState('All');
  const [sortBy, setSortBy]                   = useState('deadline');
  const [searchQuery, setSearchQuery]         = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [userLocation, setUserLocation]       = useState(null);
  const [isLocating, setIsLocating]           = useState(false);
  const [locationError, setLocationError]     = useState(null);
  const [activeSection, setActiveSection]     = useState('home');
  const [mobileMenuOpen, setMobileMenuOpen]   = useState(false);
  const [showColdStartBanner, setShowColdStartBanner] = useState(false);
  const [showAboutModal, setShowAboutModal]   = useState(false);
  const [showDashboard, setShowDashboard]     = useState(false);
  const [activeTab, setActiveTab]             = useState('upcoming');
  const [currentPage, setCurrentPage]         = useState(1);
  const [totalPages, setTotalPages]           = useState(1);
  const [upcomingTotal, setUpcomingTotal]     = useState(0);
  const [missedTotal, setMissedTotal]         = useState(0);
  const [stats, setStats] = useState({
    total: 0, unique_tags: 0, last_scraped: '', sources: [],
    top_college_count: 0, internship_count: 0, college_types: [],
    online_count: 0, offline_count: 0, unique_sources_count: 0, hackathon_count: 0
  });

  const homeRef            = useRef(null);
  const dashboardRef       = useRef(null);
  const aboutRef           = useRef(null);
  const eventsRef          = useRef(null);
  const abortControllerRef = useRef(null);
  const coldStartTimerRef  = useRef(null);
  const intervalRef        = useRef(null);

  useEffect(() => {
    const h = setTimeout(() => { setDebouncedSearch(searchQuery); setCurrentPage(1); }, 400);
    return () => clearTimeout(h);
  }, [searchQuery]);

  const fetchHackathons = useCallback(async (isAutoRefresh = false) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    if (!isAutoRefresh) {
      setLoading(true); setError(null); setShowColdStartBanner(false);
      coldStartTimerRef.current = setTimeout(() => setShowColdStartBanner(true), COLD_START_WARN_MS);
    }
    try {
      const lat = userLocation?.lat ?? '';
      const lng = userLocation?.lng ?? '';
      let url = `${API_URL}?page=${currentPage}&limit=${PAGE_SIZE}&category=${encodeURIComponent(activeCategory)}&sort=${sortBy}&tab=${activeTab}`;
      if (debouncedSearch) url += `&search=${encodeURIComponent(debouncedSearch)}`;
      if (lat && lng) url += `&lat=${lat}&lng=${lng}`;
      const res = await fetch(url, { signal: abortControllerRef.current.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      if (result.success) {
        setHackathons(result.data || []);
        if (result.stats) setStats(result.stats);
        const ut = result.upcoming_total || 0;
        const mt = result.missed_total   || 0;
        setUpcomingTotal(ut);
        setMissedTotal(mt);
        const countForTab = activeTab === 'upcoming' ? ut : mt;
        setTotalPages(Math.max(1, Math.ceil(countForTab / PAGE_SIZE)));
      } else {
        throw new Error(result.error || 'Unknown API error');
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      setError('Could not connect to the API. Make sure the backend is running.');
      console.error(e);
    } finally {
      clearTimeout(coldStartTimerRef.current);
      setShowColdStartBanner(false);
      setLoading(false);
    }
  }, [activeCategory, sortBy, debouncedSearch, activeTab, currentPage, userLocation]);

  useEffect(() => {
    fetchHackathons();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchHackathons(true), 60 * 60 * 1000);
    return () => {
      clearInterval(intervalRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
      clearTimeout(coldStartTimerRef.current);
    };
  }, [fetchHackathons]);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) { setLocationError('Geolocation not supported'); return; }
    setIsLocating(true); setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setIsLocating(false); setSortBy('distance'); setCurrentPage(1); },
      ()    => { setLocationError('Unable to retrieve your location'); setIsLocating(false); }
    );
  }, []);

  const handleCategoryChange = (cat) => { setActiveCategory(cat); setCurrentPage(1); };
  const handleSearchChange   = (e)   => { setSearchQuery(e.target.value); };
  const handleSortChange     = (e)   => {
    const v = e.target.value;
    if (v === 'distance' && !userLocation) { setSortBy('distance'); requestLocation(); return; }
    setSortBy(v); setCurrentPage(1);
  };
  const handleTabChange  = (tab) => { setActiveTab(tab); setCurrentPage(1); eventsRef.current?.scrollIntoView({ behavior: 'smooth' }); };
  const handlePageChange = (p)   => { setCurrentPage(p); eventsRef.current?.scrollIntoView({ behavior: 'smooth' }); };
  const scrollToSection  = (section) => {
    setActiveSection(section); setMobileMenuOpen(false);
    const refMap = { home: homeRef, dashboard: dashboardRef, about: aboutRef, events: eventsRef };
    refMap[section]?.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatLastScraped = (isoStr) => {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      const diffMins = Math.floor((Date.now() - d) / 60000);
      if (diffMins < 1)  return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHrs = Math.floor(diffMins / 60);
      if (diffHrs < 24)  return `${diffHrs}h ago`;
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return '—'; }
  };

  const categories = [
    { key: 'All',            label: 'All',            count: stats.total },
    { key: 'Online',         label: '🌐 Online',       count: stats.online_count || 0 },
    { key: 'Offline',        label: '📍 Offline',      count: stats.offline_count || 0 },
    { key: 'Top College',    label: '🏛 Top College',  count: stats.top_college_count || 0 },
    { key: 'Internship',     label: '💼 Internship',   count: stats.internship_count || 0 },
    { key: 'Hackathon',      label: '💻 Hackathons',   count: stats.hackathon_count || 0 },
    { key: 'Unique Sources', label: '⭐ Curated',      count: stats.unique_sources_count || 0 },
  ];

  return (
    <div className="app-container">
      {showAboutModal && <AboutModal onClose={() => setShowAboutModal(false)} />}
      {showDashboard  && <DashboardPopup stats={stats} upcomingTotal={upcomingTotal} missedTotal={missedTotal} onClose={() => setShowDashboard(false)} />}

      {/* ── NAVBAR ── */}
      <nav className="navbar" id="main-nav">
        <div className="navbar-brand" onClick={() => scrollToSection('home')}>
          <HLogo size={36} /><span>Hackathon Notifier</span>
        </div>
        <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle menu">
          <span className={`hamburger ${mobileMenuOpen ? 'open' : ''}`}></span>
        </button>
        <div className={`navbar-links ${mobileMenuOpen ? 'mobile-open' : ''}`}>
          <a href="#about"  className={activeSection === 'about'  ? 'nav-active' : ''} onClick={e => { e.preventDefault(); scrollToSection('about'); }}>Features</a>
          <a href="#events" className={activeSection === 'events' ? 'nav-active' : ''} onClick={e => { e.preventDefault(); scrollToSection('events'); }}>Events</a>
          <button className="btn-link" onClick={() => { setShowDashboard(true); setMobileMenuOpen(false); }}>📊 Dashboard</button>
          <button className="btn-link" onClick={() => { setShowAboutModal(true); setMobileMenuOpen(false); }}>About</button>
          <button className={`btn-secondary ${userLocation ? 'active' : ''}`} onClick={() => { requestLocation(); setMobileMenuOpen(false); }} disabled={isLocating}>
            {isLocating ? 'Locating…' : '📍 Near Me'}
          </button>
          <button className="btn-primary" id="refresh-btn" onClick={() => { fetchHackathons(); setMobileMenuOpen(false); }}>Refresh</button>
        </div>
      </nav>

      {showColdStartBanner && (
        <div className="cold-start-banner">
          <div className="cold-start-spinner"></div>
          <span><strong>Backend is waking up</strong> (Render free tier cold-start — ~30s on first visit). Hang tight…</span>
        </div>
      )}

      {/* ── HERO ── */}
      <section className="hero" id="hero-section" ref={homeRef}>
        <div className="hero-content">
          <div className="hero-badge">
            <span className="hero-badge-dot"></span>
            Live · Auto-scraping 5 platforms
          </div>
          <h1>
            Never miss a<br />
            <span className="gradient-text">hackathon</span> again.
          </h1>
          <p>
            Automatically scraping Devfolio, Unstop, Devpost, HackerEarth &amp; Devnovate
            to classify and deliver opportunities straight to you.
          </p>
          <div className="hero-cta-buttons">
            <button className="btn-primary" onClick={() => scrollToSection('events')}>Browse Events →</button>
            <button className="btn-secondary" onClick={() => setShowDashboard(true)}>📊 Live Dashboard</button>
          </div>
        </div>

        <div className="hero-stats-panel">
          <div className="hero-stats-header">
            <span className="live-dot"></span>
            Live Data Pipeline
          </div>
          <div className="hero-stats-grid">
            <div className="hero-stat-box">
              <div className="hero-stat-value">{stats.total}</div>
              <div className="hero-stat-label">Total Events</div>
            </div>
            <div className="hero-stat-box">
              <div className="hero-stat-value">{upcomingTotal}</div>
              <div className="hero-stat-label">Active</div>
            </div>
            <div className="hero-stat-box">
              <div className="hero-stat-value">{stats.top_college_count || 0}</div>
              <div className="hero-stat-label">Top College</div>
            </div>
            <div className="hero-stat-box">
              <div className="hero-stat-value" style={{ fontSize: '1.1rem', letterSpacing: 0 }}>{formatLastScraped(stats.last_scraped)}</div>
              <div className="hero-stat-label">Last Update</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PLATFORM STRIP ── */}
      <div className="logo-strip">
        <p>Tracking the world's most ambitious building platforms</p>
        <div className="logo-grid">
          <div className="logo-item">Devfolio</div>
          <div className="logo-item">Unstop</div>
          <div className="logo-item">Devpost</div>
          <div className="logo-item">HackerEarth</div>
          <div className="logo-item">Devnovate</div>
        </div>
      </div>

      {/* ── FEATURES ── */}
      <section className="about-section" id="about-section" ref={aboutRef}>
        <div className="section-header" style={{ textAlign: 'center', borderBottom: 'none' }}>
          <h2>One platform for your entire opportunity stack.</h2>
          <p>Agents that keep scraping 24/7 so you don't have to.</p>
        </div>
        <div className="about-grid">
          <div className="about-card">
            <div className="about-card-icon">🔍</div>
            <h3>Auto-Discovery</h3>
            <p>Scrapes 5 major platforms every few hours. No manual entry needed.</p>
          </div>
          <div className="about-card">
            <div className="about-card-icon">🏛</div>
            <h3>Smart Classification</h3>
            <p>Automatically identifies IIT, NIT, IIIT, BITS events and internships.</p>
          </div>
          <div className="about-card">
            <div className="about-card-icon">📍</div>
            <h3>Location-Aware</h3>
            <p>Uses your GPS to calculate distance to offline events. Sort by nearest.</p>
          </div>
        </div>
      </section>

      {/* ── DASHBOARD HIGHLIGHT ── */}
      <section className="dashboard-section" id="dashboard-section" ref={dashboardRef}>
        <div className="section-header">
          <h2>Powering developers of all sizes.</h2>
          <p>Real-time analytics on the hackathon landscape.</p>
        </div>
        <div className="highlight-grid">
          <div className="highlight-card bg-orange" onClick={() => setShowDashboard(true)}>
            <h3>See how many Top College events are live right now</h3>
            <div className="highlight-stats">
              <div className="h-stat"><span className="h-stat-val">{stats.top_college_count || 0}</span><span className="h-stat-label">IIT/NIT/BITS</span></div>
              <div className="h-stat"><span className="h-stat-val">{stats.internship_count || 0}</span><span className="h-stat-label">Internships</span></div>
            </div>
            <div className="highlight-cta">Tap to open full dashboard →</div>
          </div>
          <div className="highlight-card bg-blue" onClick={() => setShowDashboard(true)}>
            <h3>Missed Opportunities tracker to keep you accountable</h3>
            <div className="highlight-stats">
              <div className="h-stat"><span className="h-stat-val">{upcomingTotal}</span><span className="h-stat-label">Upcoming</span></div>
              <div className="h-stat"><span className="h-stat-val">{missedTotal}</span><span className="h-stat-label">Missed</span></div>
            </div>
            <div className="highlight-cta">Tap to open full dashboard →</div>
          </div>
        </div>
      </section>

      {/* ── EVENTS SECTION ── */}
      <div className="events-section-title" ref={eventsRef}>
        <h2>Discover Events</h2>
        <p>Browse, filter, and register for your next hackathon.</p>
      </div>

      <div className="search-sort-container">
        <div className="search-sort-bar">
          <div className="search-box">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Search hackathons, locations, tags…" value={searchQuery} onChange={handleSearchChange} id="search-input" />
          </div>
          <div className="sort-box">
            <label htmlFor="sort-select">Sort by:</label>
            <select id="sort-select" value={sortBy} onChange={handleSortChange}>
              <option value="deadline">Deadline (soonest)</option>
              <option value="newest">Recently Added</option>
              <option value="name">Name (A–Z)</option>
              <option value="distance">📍 Nearest {!userLocation && '(grant location)'}</option>
            </select>
          </div>
        </div>
        {!loading && !error && stats.total > 0 && (
          <div className="category-tabs" id="category-tabs">
            {categories.map(cat => (
              <button key={cat.key} className={`category-tab ${activeCategory === cat.key ? 'active' : ''}`} onClick={() => handleCategoryChange(cat.key)}>
                {cat.label}<span className="tab-count">{cat.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── HACKATHON LIST ── */}
      <section className="hack-list-section">
        {locationError && <div className="error-box" style={{ marginTop: '2rem' }}><p>⚠️ {locationError}</p></div>}
        {error && (
          <div className="error-box">
            <h3>Connection Error</h3><p>{error}</p>
            <button className="btn-primary" onClick={() => fetchHackathons()} style={{ marginTop: '1rem' }}>Retry</button>
          </div>
        )}
        {loading && (
          <div className="card-grid">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" />)}</div>
        )}
        {!loading && !error && (upcomingTotal > 0 || missedTotal > 0) && (
          <div className="list-tabs">
            <button className={`list-tab ${activeTab === 'upcoming' ? 'active' : ''}`} onClick={() => handleTabChange('upcoming')}>
              🚀 Upcoming<span className="tab-count">{upcomingTotal}</span>
            </button>
            <button className={`list-tab ${activeTab === 'missed' ? 'active' : ''}`} onClick={() => handleTabChange('missed')}>
              📁 Missed<span className="tab-count">{missedTotal}</span>
            </button>
          </div>
        )}
        {!loading && !error && activeTab === 'upcoming' && upcomingTotal > 0 && (
          <>
            <div className="section-header" style={{ borderBottom: 'none', marginBottom: '1.5rem' }}>
              <h2>Upcoming Events</h2>
              <p>Page {currentPage} of {totalPages} · {upcomingTotal} total</p>
            </div>
            <div className="card-grid">{hackathons.map(h => <HackathonCard key={h._id || h.link} hackathon={h} />)}</div>
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
          </>
        )}
        {!loading && !error && activeTab === 'missed' && missedTotal > 0 && (
          <>
            <div className="section-header" style={{ borderBottom: 'none', marginBottom: '1.5rem' }}>
              <h2 style={{ color: 'var(--text-muted)' }}>Missed Opportunities</h2>
              <p>Page {currentPage} of {totalPages} · {missedTotal} total</p>
            </div>
            <div className="card-grid">{hackathons.map(h => <HackathonCard key={h._id || h.link} hackathon={h} />)}</div>
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
          </>
        )}
        {!loading && !error && activeTab === 'upcoming' && upcomingTotal === 0 && (
          <div className="empty-state"><span className="empty-icon">🔍</span><h3>No upcoming hackathons found</h3><p>Try adjusting your filters or wait for the next scrape cycle.</p></div>
        )}
        {!loading && !error && activeTab === 'missed' && missedTotal === 0 && (
          <div className="empty-state"><span className="empty-icon">🎉</span><h3>No missed hackathons!</h3><p>You're on top of it. Keep building.</p></div>
        )}
      </section>

      {/* ── FOOTER ── */}
      <footer className="app-footer">
        <div className="footer-brand"><HLogo size={28} /><span>Hackathon Notifier</span></div>
        <p className="footer-tagline">Never miss a submission deadline.</p>
        <div className="footer-links">
          <button className="btn-link footer-about-btn" onClick={() => setShowAboutModal(true)}>Made by Pranav Deshmukh 👋</button>
        </div>
      </footer>
    </div>
  );
}

export default App;
