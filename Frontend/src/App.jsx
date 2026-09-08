import React, { useState, useEffect, useRef, useCallback } from 'react';
import HackathonCard from '../Components/hakathoncard';
import './index.css';

let API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://hackathon-notifier.onrender.com' : 'http://localhost:8000');
if (API_URL.endsWith('/')) API_URL = API_URL.slice(0, -1);
if (!API_URL.endsWith('/api/hackathons')) API_URL += '/api/hackathons';

const COLD_START_WARN_MS = 5_000;
const PAGE_SIZE = 12;

// ── Classy animated H logo ────────────────────────────────────────────────────
function HLogo({ size = 36 }) {
  return (
    <svg
      className="brand-h-svg"
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="36" height="36" rx="10" fill="#0f172a" />
      {/* Vertical bars */}
      <rect x="8" y="8" width="5" height="20" rx="2.5" fill="white" />
      <rect x="23" y="8" width="5" height="20" rx="2.5" fill="white" />
      {/* Cross bar */}
      <rect x="8" y="15.5" width="20" height="5" rx="2.5" fill="#10b981" />
      {/* Accent dot */}
      <circle className="brand-h-dot" cx="18" cy="18" r="1.5" fill="white" />
    </svg>
  );
}

// ── Dashboard Stats Popup ─────────────────────────────────────────────────────
function DashboardPopup({ stats, hackathons, onClose }) {
  const upcomingCount = hackathons.filter(h => !h.is_past).length;
  const missedCount   = hackathons.filter(h => h.is_past).length;
  const onlineCount   = hackathons.filter(h => (h.mode || '').toLowerCase() === 'online').length;
  const offlineCount  = hackathons.filter(h => (h.mode || '').toLowerCase() === 'offline').length;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  const sources = stats.sources || [];
  const sourceBreakdown = sources.map(src => ({
    name: src,
    count: hackathons.filter(h => (h.source || '').toLowerCase() === src.toLowerCase()).length,
  }));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-window dash-popup" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Dashboard statistics">
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="modal-header dash-header">
          <HLogo size={40} />
          <div>
            <h2 className="modal-name">Live Dashboard</h2>
            <p className="modal-role">Real-time stats · Auto-refreshes every 5 min</p>
          </div>
        </div>

        <div className="modal-body">
          {/* Key metrics */}
          <div className="dash-metric-grid">
            <div className="dash-metric">
              <span className="dash-metric-val">{stats.total || hackathons.length}</span>
              <span className="dash-metric-label">Total Events</span>
            </div>
            <div className="dash-metric">
              <span className="dash-metric-val" style={{color:'#10b981'}}>{upcomingCount}</span>
              <span className="dash-metric-label">Upcoming</span>
            </div>
            <div className="dash-metric">
              <span className="dash-metric-val" style={{color:'#64748b'}}>{missedCount}</span>
              <span className="dash-metric-label">Missed</span>
            </div>
            <div className="dash-metric">
              <span className="dash-metric-val" style={{color:'#f59e0b'}}>{stats.top_college_count || 0}</span>
              <span className="dash-metric-label">IIT/NIT/BITS</span>
            </div>
            <div className="dash-metric">
              <span className="dash-metric-val" style={{color:'#8b5cf6'}}>{stats.internship_count || 0}</span>
              <span className="dash-metric-label">Internships</span>
            </div>
            <div className="dash-metric">
              <span className="dash-metric-val">{stats.unique_tags || 0}</span>
              <span className="dash-metric-label">Unique Tags</span>
            </div>
          </div>

          {/* Mode split */}
          <div className="modal-section">
            <h3>Mode Distribution</h3>
            <div className="dash-bar-row">
              <span className="dash-bar-label">Online</span>
              <div className="dash-bar-track">
                <div className="dash-bar-fill dash-bar--online" style={{width: hackathons.length ? `${(onlineCount/hackathons.length)*100}%` : '0%'}} />
              </div>
              <span className="dash-bar-count">{onlineCount}</span>
            </div>
            <div className="dash-bar-row">
              <span className="dash-bar-label">Offline</span>
              <div className="dash-bar-track">
                <div className="dash-bar-fill dash-bar--offline" style={{width: hackathons.length ? `${(offlineCount/hackathons.length)*100}%` : '0%'}} />
              </div>
              <span className="dash-bar-count">{offlineCount}</span>
            </div>
          </div>

          {/* Sources */}
          {sourceBreakdown.length > 0 && (
            <div className="modal-section">
              <h3>Sources</h3>
              <div className="dash-source-grid">
                {sourceBreakdown.map(s => (
                  <div key={s.name} className="dash-source-item">
                    <span className={`source-badge source-badge--${s.name.toLowerCase()}`}>{s.name}</span>
                    <span className="dash-source-count">{s.count} events</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── About Modal ───────────────────────────────────────────────────────────────
function AboutModal({ onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-window" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="About the maker">
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="modal-header">
          <div className="modal-avatar">PD</div>
          <div>
            <h2 className="modal-name">Pranav Deshmukh</h2>
            <p className="modal-role">B.Tech 2nd Year · Systems Thinker · Builder</p>
          </div>
        </div>

        <div className="modal-body">
          <p className="modal-bio">
            <strong>"The people who are crazy enough to think they can change the world are the ones who do."</strong>
            <br /><br />
            I'm <strong>Pranav Deshmukh</strong> — a 2nd-year B.Tech student who decided that manually
            refreshing four hackathon platforms every morning was an unsolved systems problem. So I solved it.
            This isn't just a side project. It's a <em>distributed, concurrent, classification-aware
            intelligence layer</em> over the hackathon landscape — packaged into something
            a developer actually wants to use.
          </p>

          <div className="modal-badge-row">
            <span className="modal-badge modal-badge--green">🏗️ Architect: Pranav Deshmukh</span>
            <span className="modal-badge modal-badge--purple">⚡ LLM-Accelerated Engineering</span>
          </div>

          <div className="modal-section">
            <h3>The Philosophy</h3>
            <p>
              The system design — concurrent multi-source scraping via <code>ThreadPoolExecutor</code>,
              TTL-cached MongoDB reads, Haversine-based geo-ranking, and a Telegram push pipeline —
              was <strong>architected, debugged, and owned by me</strong>. Large language models acted as
              a <em>pair programmer</em>, not the engineer. Every decision, every trade-off, every bug hunt:
              that was me at 2am with a cup of chai.
            </p>
          </div>

          <div className="modal-section">
            <h3>Under the Hood</h3>
            <div className="modal-tech-grid">
              <div className="modal-tech-item"><span>⚡</span> FastAPI + Python</div>
              <div className="modal-tech-item"><span>🌿</span> MongoDB Atlas</div>
              <div className="modal-tech-item"><span>⚛️</span> React + Vite</div>
              <div className="modal-tech-item"><span>📲</span> Telegram Bot API</div>
              <div className="modal-tech-item"><span>☁️</span> Render + Vercel</div>
              <div className="modal-tech-item"><span>🕷️</span> curl-cffi (CF bypass)</div>
            </div>
          </div>

          <div className="modal-section">
            <h3>What it ships</h3>
            <ul className="modal-list">
              <li>🔄 4 scrapers running concurrently — Devfolio, Unstop, Devpost, HackerEarth</li>
              <li>🏛️ Rule-based classifier for IIT / NIT / IIIT / BITS / internship signals</li>
              <li>📍 Haversine geo-engine ranks offline events by your GPS coordinates</li>
              <li>📲 Telegram push bot pings only the opportunities that actually matter</li>
            </ul>
          </div>

          <div className="modal-footer-note">
            <em>🤖 AI-accelerated, not AI-generated. The architecture runs on human ingenuity.</em>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Pagination ─────────────────────────────────────────────────────────────────
function Pagination({ currentPage, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;
  const pages = [];
  const delta = 1;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) pages.push(i);
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
      <button className="pagination-btn" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} aria-label="Previous page">← Prev</button>
      {withEllipsis.map((item, i) =>
        item === '...'
          ? <span key={`e-${i}`} className="pagination-ellipsis">…</span>
          : <button key={item} className={`pagination-btn ${currentPage === item ? 'active' : ''}`} onClick={() => onPageChange(item)}>{item}</button>
      )}
      <button className="pagination-btn" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} aria-label="Next page">Next →</button>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
function App() {
  const [hackathons, setHackathons] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeTag, setActiveTag] = useState('All');
  const [sortBy, setSortBy] = useState('deadline');
  const [searchQuery, setSearchQuery] = useState('');
  const [userLocation, setUserLocation] = useState(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [activeSection, setActiveSection] = useState('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showColdStartBanner, setShowColdStartBanner] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [activeTab, setActiveTab] = useState('upcoming');
  const [upcomingPage, setUpcomingPage] = useState(1);
  const [missedPage, setMissedPage] = useState(1);

  const [stats, setStats] = useState({
    total: 0, unique_tags: 0, last_scraped: '', sources: [],
    top_college_count: 0, internship_count: 0, college_types: [],
  });

  const homeRef      = useRef(null);
  const dashboardRef = useRef(null);
  const aboutRef     = useRef(null);
  const eventsRef    = useRef(null);
  const abortControllerRef = useRef(null);
  const coldStartTimerRef  = useRef(null);
  const intervalRef        = useRef(null);

  const fetchHackathons = useCallback(async (lat = null, lng = null) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    setLoading(true); setError(null); setShowColdStartBanner(false);
    coldStartTimerRef.current = setTimeout(() => setShowColdStartBanner(true), COLD_START_WARN_MS);
    try {
      let url = API_URL;
      if (lat && lng) url += `?lat=${lat}&lng=${lng}`;
      const response = await fetch(url, { signal: abortControllerRef.current.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      if (Array.isArray(result)) { setHackathons(result); setFiltered(result); }
      else if (result.success) { setHackathons(result.data); setFiltered(result.data); if (result.stats) setStats(result.stats); }
      else throw new Error(result.error || 'Unknown error from API');
      setUpcomingPage(1); setMissedPage(1);
    } catch (e) {
      if (e.name === 'AbortError') return;
      setError('Could not connect to the API. Make sure the backend is running.');
      console.error(e);
    } finally {
      clearTimeout(coldStartTimerRef.current);
      setShowColdStartBanner(false);
      setLoading(false);
    }
  }, []);

  // Location prompt — used when "Distance (nearest)" selected without location
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) { setLocationError("Geolocation not supported"); return; }
    setIsLocating(true); setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        setUserLocation({ lat, lng }); setIsLocating(false);
        fetchHackathons(lat, lng);
      },
      () => { setLocationError("Unable to retrieve your location"); setIsLocating(false); }
    );
  }, [fetchHackathons]);

  const handleNearMeClick = requestLocation;

  useEffect(() => {
    const lat = userLocation?.lat ?? null, lng = userLocation?.lng ?? null;
    fetchHackathons(lat, lng);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchHackathons(lat, lng), 5 * 60 * 1000);
    return () => {
      clearInterval(intervalRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
      clearTimeout(coldStartTimerRef.current);
    };
  }, [userLocation?.lat, userLocation?.lng, fetchHackathons]);

  const sortHackathons = (list, method) => {
    const sorted = [...list];
    switch (method) {
      case 'deadline': sorted.sort((a, b) => (a.deadline_iso || '9999').localeCompare(b.deadline_iso || '9999')); break;
      case 'distance': sorted.sort((a, b) => (a.distance_km ?? 999999) - (b.distance_km ?? 999999)); break;
      case 'name':     sorted.sort((a, b) => (a.title || '').localeCompare(b.title || '')); break;
      case 'newest':   sorted.sort((a, b) => (b.scraped_at || '').localeCompare(a.scraped_at || '')); break;
      default: break;
    }
    return sorted;
  };

  const applyFilters = (category, tag, search, sort) => {
    let result = hackathons;
    if (category === 'Top College') result = result.filter(h => h.is_top_college === true);
    else if (category === 'Internship') result = result.filter(h => h.is_internship === true);
    else if (category === 'Hackathon') result = result.filter(h => h.opportunity_type === 'Hackathon');
    if (tag !== 'All') result = result.filter(h => h.tags && h.tags.includes(tag));
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(h =>
        (h.title || '').toLowerCase().includes(q) ||
        (h.location || '').toLowerCase().includes(q) ||
        (h.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }
    result = sortHackathons(result, sort);
    setFiltered(result); setUpcomingPage(1); setMissedPage(1);
  };

  const handleCategoryChange = (cat) => { setActiveCategory(cat); setActiveTag('All'); applyFilters(cat, 'All', searchQuery, sortBy); };
  const handleSearchChange   = (e)   => { const q = e.target.value; setSearchQuery(q); applyFilters(activeCategory, activeTag, q, sortBy); };
  const handleSortChange     = (e)   => {
    const v = e.target.value;
    if (v === 'distance' && !userLocation) {
      // Auto-request location when user picks "nearest" without having granted it
      setSortBy('distance');
      requestLocation();
      return;
    }
    setSortBy(v);
    applyFilters(activeCategory, activeTag, searchQuery, v);
  };

  const scrollToSection = (section) => {
    setActiveSection(section); setMobileMenuOpen(false);
    const refMap = { home: homeRef, dashboard: dashboardRef, about: aboutRef, events: eventsRef };
    refMap[section]?.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const categories = [
    { key: 'All',        label: 'All',        count: hackathons.length },
    { key: 'Top College', label: 'Top College', count: stats.top_college_count || 0 },
    { key: 'Internship', label: 'Internship',  count: stats.internship_count || 0 },
    { key: 'Hackathon',  label: 'Hackathons',  count: hackathons.filter(h => h.opportunity_type === 'Hackathon').length },
  ];

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

  const upcomingHackathons = filtered.filter(h => !h.is_past);
  const missedHackathons   = filtered.filter(h => h.is_past);
  const upcomingTotalPages = Math.max(1, Math.ceil(upcomingHackathons.length / PAGE_SIZE));
  const missedTotalPages   = Math.max(1, Math.ceil(missedHackathons.length / PAGE_SIZE));
  const upcomingPageItems  = upcomingHackathons.slice((upcomingPage - 1) * PAGE_SIZE, upcomingPage * PAGE_SIZE);
  const missedPageItems    = missedHackathons.slice((missedPage - 1) * PAGE_SIZE, missedPage * PAGE_SIZE);
  const handleUpcomingPageChange = (p) => { setUpcomingPage(p); eventsRef.current?.scrollIntoView({ behavior: 'smooth' }); };
  const handleMissedPageChange   = (p) => { setMissedPage(p);   eventsRef.current?.scrollIntoView({ behavior: 'smooth' }); };

  return (
    <div className="app-container">
      {showAboutModal    && <AboutModal     onClose={() => setShowAboutModal(false)} />}
      {showDashboard     && <DashboardPopup stats={stats} hackathons={hackathons} onClose={() => setShowDashboard(false)} />}

      {/* ── Navbar ── */}
      <nav className="navbar" id="main-nav">
        <div className="navbar-brand" onClick={() => scrollToSection('home')} style={{ cursor: 'pointer' }}>
          <HLogo size={36} />
          <span>Hackathon Notifier</span>
        </div>

        <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle menu">
          <span className={`hamburger ${mobileMenuOpen ? 'open' : ''}`}></span>
        </button>

        <div className={`navbar-links ${mobileMenuOpen ? 'mobile-open' : ''}`}>
          <a href="#about"     className={activeSection === 'about'     ? 'nav-active' : ''} onClick={e => { e.preventDefault(); scrollToSection('about'); }}>Features</a>
          <a href="#events"    className={activeSection === 'events'    ? 'nav-active' : ''} onClick={e => { e.preventDefault(); scrollToSection('events'); }}>Hackathons</a>
          <button className="btn-link" onClick={() => setShowDashboard(true)}>📊 Dashboard</button>
          <button className="btn-link" onClick={() => setShowAboutModal(true)}>About</button>
          <button className={`btn-secondary ${userLocation ? 'active' : ''}`} onClick={handleNearMeClick} disabled={isLocating} title="Sort by distance from you">
            {isLocating ? 'Locating…' : '📍 Near Me'}
          </button>
          <button className="btn-primary" id="refresh-btn" onClick={() => fetchHackathons(userLocation?.lat, userLocation?.lng)}>
            Refresh
          </button>
        </div>
      </nav>

      {/* ── Cold-start Banner ── */}
      {showColdStartBanner && (
        <div className="cold-start-banner">
          <div className="cold-start-spinner"></div>
          <span><strong>Backend is waking up</strong> (Render free tier cold-start — ~30s on first visit). Hang tight…</span>
        </div>
      )}

      {/* ── Hero Section ── */}
      <section className="hero" id="hero-section" ref={homeRef}>
        <div className="hero-content">
          <h1>Never miss a<br />hackathon again.</h1>
          <p>
            The knowledge infrastructure for ambitious developers.{' '}
            Automatically scraping Devfolio, Unstop, Devpost &amp; HackerEarth{' '}
            to classify and deliver opportunities straight to you.
          </p>
          <div className="hero-cta-buttons">
            <button className="btn-primary" onClick={() => scrollToSection('events')}>Browse Hackathons</button>
            <button className="btn-secondary" onClick={() => setShowDashboard(true)}>Open Dashboard</button>
          </div>
        </div>

        <div className="hero-stats-panel">
          <div className="hero-stats-header">
            <span style={{ color: '#10b981' }}>●</span> Live Data Pipeline
          </div>
          <div className="hero-stats-grid">
            <div className="hero-stat-box"><div className="hero-stat-value">{stats.total || hackathons.length}</div><div className="hero-stat-label">Total Events</div></div>
            <div className="hero-stat-box"><div className="hero-stat-value">{upcomingHackathons.length}</div><div className="hero-stat-label">Active</div></div>
            <div className="hero-stat-box"><div className="hero-stat-value">{stats.top_college_count || 0}</div><div className="hero-stat-label">Top College</div></div>
            <div className="hero-stat-box"><div className="hero-stat-value" style={{ fontSize: '0.9rem', color: '#0f172a' }}>{formatLastScraped(stats.last_scraped)}</div><div className="hero-stat-label">Last Update</div></div>
          </div>
        </div>
      </section>

      {/* ── Logo Strip ── */}
      <div className="logo-strip">
        <p>Tracking the world's most ambitious building platforms</p>
        <div className="logo-grid">
          <div className="logo-item">Devfolio</div>
          <div className="logo-item">Unstop</div>
          <div className="logo-item">Devpost</div>
          <div className="logo-item">HackerEarth</div>
        </div>
      </div>

      {/* ── About / Features ── */}
      <section className="about-section" id="about-section" ref={aboutRef}>
        <div className="section-header" style={{ textAlign: 'center', borderBottom: 'none' }}>
          <h2>One platform for your entire opportunity stack.</h2>
          <p>Agents that keep scraping 24/7 so you don't have to.</p>
        </div>
        <div className="about-grid">
          <div className="about-card">
            <div className="about-card-icon">🔍</div>
            <h3>Auto-Discovery</h3>
            <p>Scrapes multiple platforms every 5 minutes. No manual entry needed.</p>
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

      {/* ── Dashboard Highlights ── */}
      <section className="dashboard-section" id="dashboard-section" ref={dashboardRef}>
        <div className="section-header">
          <h2>Powering developers of all sizes.</h2>
          <p>Real-time analytics on the hackathon landscape.</p>
        </div>
        <div className="highlight-grid">
          <div className="highlight-card bg-orange" style={{ cursor: 'pointer' }} onClick={() => setShowDashboard(true)}>
            <h3>See how many Top College events are live right now</h3>
            <div className="highlight-stats">
              <div className="h-stat"><span className="h-stat-val">{stats.top_college_count || 0}</span><span className="h-stat-label">IIT/NIT/BITS</span></div>
              <div className="h-stat"><span className="h-stat-val">{stats.internship_count || 0}</span><span className="h-stat-label">Internships</span></div>
            </div>
            <div className="highlight-cta">Tap to open full dashboard →</div>
          </div>
          <div className="highlight-card bg-blue" style={{ cursor: 'pointer' }} onClick={() => setShowDashboard(true)}>
            <h3>Missed Opportunities tracker to keep you accountable</h3>
            <div className="highlight-stats">
              <div className="h-stat"><span className="h-stat-val">{upcomingHackathons.length}</span><span className="h-stat-label">Upcoming</span></div>
              <div className="h-stat"><span className="h-stat-val">{missedHackathons.length}</span><span className="h-stat-label">Missed</span></div>
            </div>
            <div className="highlight-cta">Tap to open full dashboard →</div>
          </div>
        </div>
      </section>

      {/* ── Search + Sort Bar ── */}
      <div className="search-sort-container" ref={eventsRef}>
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

        {!loading && !error && hackathons.length > 0 && (
          <div className="category-tabs" id="category-tabs">
            {categories.map(cat => (
              <button key={cat.key} className={`category-tab ${activeCategory === cat.key ? 'active' : ''}`} onClick={() => handleCategoryChange(cat.key)}>
                {cat.label}<span className="tab-count">{cat.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Hackathon List Section ── */}
      <section className="hack-list-section">
        {locationError && <div className="error-box" style={{ marginTop: '2rem' }}><p>⚠️ {locationError}</p></div>}
        {error && (
          <div className="error-box">
            <h3>Connection Error</h3><p>{error}</p>
            <button className="btn-primary" onClick={() => fetchHackathons()} style={{ marginTop: '1rem' }}>Retry</button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <h3>No hackathons found</h3>
            <p>Try adjusting your filters or wait for the next scrape cycle.</p>
          </div>
        )}

        {loading && (
          <div className="card-grid">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" />)}
          </div>
        )}

        {!loading && !error && (upcomingHackathons.length > 0 || missedHackathons.length > 0) && (
          <div className="list-tabs">
            <button className={`list-tab ${activeTab === 'upcoming' ? 'active' : ''}`} onClick={() => setActiveTab('upcoming')}>
              🚀 Upcoming<span className="tab-count">{upcomingHackathons.length}</span>
            </button>
            <button className={`list-tab ${activeTab === 'missed' ? 'active' : ''}`} onClick={() => setActiveTab('missed')}>
              📁 Missed<span className="tab-count">{missedHackathons.length}</span>
            </button>
          </div>
        )}

        {!loading && activeTab === 'upcoming' && upcomingHackathons.length > 0 && (
          <>
            <div className="section-header">
              <h2>Upcoming Events</h2>
              <p>Page {upcomingPage} of {upcomingTotalPages} · {upcomingHackathons.length} total</p>
            </div>
            <div className="card-grid">
              {upcomingPageItems.map(h => <HackathonCard key={h._id || h.link} hackathon={h} />)}
            </div>
            <Pagination currentPage={upcomingPage} totalPages={upcomingTotalPages} onPageChange={handleUpcomingPageChange} />
          </>
        )}

        {!loading && activeTab === 'missed' && missedHackathons.length > 0 && (
          <>
            <div className="section-header">
              <h2 style={{ color: '#64748b' }}>Missed Opportunities</h2>
              <p>Page {missedPage} of {missedTotalPages} · {missedHackathons.length} total</p>
            </div>
            <div className="card-grid">
              {missedPageItems.map(h => <HackathonCard key={h._id || h.link} hackathon={h} />)}
            </div>
            <Pagination currentPage={missedPage} totalPages={missedTotalPages} onPageChange={handleMissedPageChange} />
          </>
        )}

        {!loading && activeTab === 'missed' && missedHackathons.length === 0 && !error && (
          <div className="empty-state">
            <div className="empty-icon">🎉</div>
            <h3>No missed hackathons!</h3>
            <p>You're on top of it. Keep building.</p>
          </div>
        )}
      </section>

      {/* ── Footer ── */}
      <footer className="app-footer">
        <div className="footer-brand">
          <HLogo size={28} />
          <span>Hackathon Notifier</span>
        </div>
        <p className="footer-tagline">Never miss a submission deadline.</p>
        <div className="footer-links">
          <a href="https://github.com/Pranavdeshmukhhh/hackathon-notifier" target="_blank" rel="noopener noreferrer">GitHub</a>
          <span className="footer-sep">·</span>
          <button className="btn-link footer-about-btn" onClick={() => setShowAboutModal(true)}>Made by Pranav Deshmukh 👋</button>
        </div>
      </footer>
    </div>
  );
}

export default App;
