import React, { useState, useEffect, useRef, useCallback } from 'react';
import HackathonCard from '../Components/hakathoncard';
import './index.css';

let API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://hackathon-notifier.onrender.com' : 'http://localhost:8000');
if (API_URL.endsWith('/')) API_URL = API_URL.slice(0, -1);
if (!API_URL.endsWith('/api/hackathons')) API_URL += '/api/hackathons';

const COLD_START_WARN_MS = 5_000;
const PAGE_SIZE = 12; // cards per page

// ── About Modal ──────────────────────────────────────────────────────────────
function AboutModal({ onClose }) {
  // close on backdrop click or Escape key
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-window" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="About the maker">
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>

        <div className="modal-header">
          <div className="modal-avatar">PD</div>
          <div>
            <h2 className="modal-name">Pranav Deshmukh</h2>
            <p className="modal-role">B.Tech 2nd Year · Full-Stack Developer</p>
          </div>
        </div>

        <div className="modal-body">
          <p className="modal-bio">
            Hey! I'm <strong>Pranav Deshmukh</strong>, a 2nd-year B.Tech student passionate about building tools
            that actually solve real problems for students. I got tired of manually checking multiple platforms
            for hackathons, so I built this — a fully automated, real-time hackathon aggregator.
          </p>

          <div className="modal-badge-row">
            <span className="modal-badge modal-badge--green">🏗️ Architecture by Pranav</span>
            <span className="modal-badge modal-badge--blue">🤖 AI-Assisted Development</span>
          </div>

          <div className="modal-section">
            <h3>About this project</h3>
            <p>
              The entire system architecture — from the multi-source scraping pipeline, concurrent execution,
              MongoDB deduplication, classification engine, to the Telegram notification bot — was <strong>designed
              and engineered by me</strong>. AI tools were used to accelerate development, but every architectural
              decision, data model, and product feature was conceived and built by me.
            </p>
          </div>

          <div className="modal-section">
            <h3>Tech Stack</h3>
            <div className="modal-tech-grid">
              <div className="modal-tech-item"><span>⚡</span> FastAPI + Python</div>
              <div className="modal-tech-item"><span>🌿</span> MongoDB Atlas</div>
              <div className="modal-tech-item"><span>⚛️</span> React + Vite</div>
              <div className="modal-tech-item"><span>🤖</span> Telegram Bot API</div>
              <div className="modal-tech-item"><span>☁️</span> Render + Vercel</div>
              <div className="modal-tech-item"><span>🕷️</span> curl-cffi / BeautifulSoup</div>
            </div>
          </div>

          <div className="modal-section">
            <h3>What it does</h3>
            <ul className="modal-list">
              <li>🔍 Scrapes <strong>Devfolio, Unstop, Devpost & HackerEarth</strong> concurrently every 5 minutes</li>
              <li>🏛️ Auto-classifies IIT / NIT / IIIT / BITS events and internships</li>
              <li>📍 Geocodes offline venues and sorts by distance from your location</li>
              <li>📲 Sends Telegram notifications for top-college & internship opportunities</li>
            </ul>
          </div>

          <div className="modal-footer-note">
            <em>AI-assisted but human-architected. Every line of logic was reviewed and owned by Pranav.</em>
          </div>
        </div>

        <div className="modal-links">
          <a href="https://github.com/Pranavdeshmukhhh/hackathon-notifier" target="_blank" rel="noopener noreferrer" className="modal-link-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/></svg>
            View Source
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Pagination controls component ────────────────────────────────────────────
function Pagination({ currentPage, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  const pages = [];
  // Always show first, last, and pages around current
  const delta = 1;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
      pages.push(i);
    }
  }

  // Insert ellipsis markers
  const withEllipsis = [];
  let prev = null;
  for (const page of pages) {
    if (prev !== null && page - prev > 1) {
      withEllipsis.push('...');
    }
    withEllipsis.push(page);
    prev = page;
  }

  return (
    <div className="pagination">
      <button
        className="pagination-btn"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        aria-label="Previous page"
      >
        ← Prev
      </button>
      {withEllipsis.map((item, i) =>
        item === '...'
          ? <span key={`ellipsis-${i}`} className="pagination-ellipsis">…</span>
          : <button
              key={item}
              className={`pagination-btn ${currentPage === item ? 'active' : ''}`}
              onClick={() => onPageChange(item)}
            >
              {item}
            </button>
      )}
      <button
        className="pagination-btn"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        aria-label="Next page"
      >
        Next →
      </button>
    </div>
  );
}

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

  // ── Tab between Upcoming / Missed ──
  const [activeTab, setActiveTab] = useState('upcoming'); // 'upcoming' | 'missed'
  // ── Pagination state ──
  const [upcomingPage, setUpcomingPage] = useState(1);
  const [missedPage, setMissedPage] = useState(1);

  const [stats, setStats] = useState({
    total: 0,
    unique_tags: 0,
    last_scraped: '',
    sources: [],
    top_college_count: 0,
    internship_count: 0,
    college_types: [],
  });

  const homeRef = useRef(null);
  const dashboardRef = useRef(null);
  const aboutRef = useRef(null);
  const eventsRef = useRef(null);
  const abortControllerRef = useRef(null);
  const coldStartTimerRef = useRef(null);
  const intervalRef = useRef(null);

  const fetchHackathons = useCallback(async (lat = null, lng = null) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);
    setShowColdStartBanner(false);

    coldStartTimerRef.current = setTimeout(() => setShowColdStartBanner(true), COLD_START_WARN_MS);

    try {
      let url = API_URL;
      if (lat && lng) url += `?lat=${lat}&lng=${lng}`;

      const response = await fetch(url, { signal: abortControllerRef.current.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();

      if (Array.isArray(result)) {
        setHackathons(result);
        setFiltered(result);
      } else if (result.success) {
        setHackathons(result.data);
        setFiltered(result.data);
        if (result.stats) setStats(result.stats);
      } else {
        throw new Error(result.error || 'Unknown error from API');
      }
      // Reset pagination on fresh data
      setUpcomingPage(1);
      setMissedPage(1);
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

  const handleNearMeClick = () => {
    if (!navigator.geolocation) { setLocationError("Geolocation is not supported by your browser"); return; }
    setIsLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setUserLocation({ lat, lng });
        setIsLocating(false);
        fetchHackathons(lat, lng);
      },
      () => { setLocationError("Unable to retrieve your location"); setIsLocating(false); }
    );
  };

  useEffect(() => {
    const lat = userLocation?.lat ?? null;
    const lng = userLocation?.lng ?? null;
    fetchHackathons(lat, lng);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchHackathons(lat, lng), 5 * 60 * 1000);
    return () => {
      clearInterval(intervalRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
      clearTimeout(coldStartTimerRef.current);
    };
  }, [userLocation?.lat, userLocation?.lng, fetchHackathons]);

  // ── Sorting ──
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

  // ── Filtering ──
  const applyFilters = (category, tag, search, sort) => {
    let result = hackathons;
    if (category === 'Top College')  result = result.filter(h => h.is_top_college === true);
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
    setFiltered(result);
    // Reset to page 1 whenever filters change
    setUpcomingPage(1);
    setMissedPage(1);
  };

  const handleCategoryChange = (category) => { setActiveCategory(category); setActiveTag('All'); applyFilters(category, 'All', searchQuery, sortBy); };
  const handleSortChange = (e) => { const v = e.target.value; setSortBy(v); applyFilters(activeCategory, activeTag, searchQuery, v); };
  const handleSearchChange = (e) => { const q = e.target.value; setSearchQuery(q); applyFilters(activeCategory, activeTag, q, sortBy); };

  const scrollToSection = (section) => {
    setActiveSection(section);
    setMobileMenuOpen(false);
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

  // ── Split + paginate ──
  const upcomingHackathons = filtered.filter(h => !h.is_past);
  const missedHackathons   = filtered.filter(h => h.is_past);

  const upcomingTotalPages = Math.max(1, Math.ceil(upcomingHackathons.length / PAGE_SIZE));
  const missedTotalPages   = Math.max(1, Math.ceil(missedHackathons.length / PAGE_SIZE));

  const upcomingPageItems = upcomingHackathons.slice((upcomingPage - 1) * PAGE_SIZE, upcomingPage * PAGE_SIZE);
  const missedPageItems   = missedHackathons.slice((missedPage - 1) * PAGE_SIZE, missedPage * PAGE_SIZE);

  // Scroll to top of list when page changes
  const handleUpcomingPageChange = (p) => { setUpcomingPage(p); eventsRef.current?.scrollIntoView({ behavior: 'smooth' }); };
  const handleMissedPageChange   = (p) => { setMissedPage(p);   eventsRef.current?.scrollIntoView({ behavior: 'smooth' }); };

  return (
    <div className="app-container">
      {/* ── About Modal ── */}
      {showAboutModal && <AboutModal onClose={() => setShowAboutModal(false)} />}

      {/* ── Navbar ── */}
      <nav className="navbar" id="main-nav">
        <div className="navbar-brand" onClick={() => scrollToSection('home')} style={{ cursor: 'pointer' }}>
          <div className="brand-icon">H</div>
          <span>Hackathon Notifier</span>
        </div>

        <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle menu">
          <span className={`hamburger ${mobileMenuOpen ? 'open' : ''}`}></span>
        </button>

        <div className={`navbar-links ${mobileMenuOpen ? 'mobile-open' : ''}`}>
          <a href="#about" className={activeSection === 'about' ? 'nav-active' : ''} onClick={(e) => { e.preventDefault(); scrollToSection('about'); }}>Features</a>
          <a href="#dashboard" className={activeSection === 'dashboard' ? 'nav-active' : ''} onClick={(e) => { e.preventDefault(); scrollToSection('dashboard'); }}>Dashboard</a>
          <a href="#events" className={activeSection === 'events' ? 'nav-active' : ''} onClick={(e) => { e.preventDefault(); scrollToSection('events'); }}>Hackathons</a>
          <button className="btn-link" onClick={() => setShowAboutModal(true)}>About</button>
          <button className={`btn-secondary ${userLocation ? 'active' : ''}`} onClick={handleNearMeClick} disabled={isLocating} title="Sort hackathons by distance from you">
            {isLocating ? 'Locating...' : '📍 Near Me'}
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
            <button className="btn-secondary" onClick={() => scrollToSection('dashboard')}>View Dashboard</button>
          </div>
        </div>

        <div className="hero-stats-panel">
          <div className="hero-stats-header">
            <span style={{ color: '#10b981' }}>●</span> Live Data Pipeline
          </div>
          <div className="hero-stats-grid">
            <div className="hero-stat-box">
              <div className="hero-stat-value">{stats.total || hackathons.length}</div>
              <div className="hero-stat-label">Total Events</div>
            </div>
            <div className="hero-stat-box">
              <div className="hero-stat-value">{upcomingHackathons.length}</div>
              <div className="hero-stat-label">Active</div>
            </div>
            <div className="hero-stat-box">
              <div className="hero-stat-value">{stats.top_college_count || 0}</div>
              <div className="hero-stat-label">Top College</div>
            </div>
            <div className="hero-stat-box">
              <div className="hero-stat-value" style={{ color: '#0f172a' }}>{formatLastScraped(stats.last_scraped)}</div>
              <div className="hero-stat-label">Last Update</div>
            </div>
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
            <p>Uses your location to calculate distance to offline events. Sort by nearest.</p>
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
          <div className="highlight-card bg-orange">
            <h3>See how many Top College events are live right now</h3>
            <div className="highlight-stats">
              <div className="h-stat"><span className="h-stat-val">{stats.top_college_count || 0}</span><span className="h-stat-label">IIT/NIT/BITS</span></div>
              <div className="h-stat"><span className="h-stat-val">{stats.internship_count || 0}</span><span className="h-stat-label">Internships</span></div>
            </div>
          </div>
          <div className="highlight-card bg-blue">
            <h3>Missed Opportunities tracker to keep you accountable</h3>
            <div className="highlight-stats">
              <div className="h-stat"><span className="h-stat-val">{upcomingHackathons.length}</span><span className="h-stat-label">Upcoming</span></div>
              <div className="h-stat"><span className="h-stat-val">{missedHackathons.length}</span><span className="h-stat-label">Missed</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Search + Sort Bar ── */}
      <div className="search-sort-container" ref={eventsRef}>
        <div className="search-sort-bar">
          <div className="search-box">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Search hackathons, locations, tags..." value={searchQuery} onChange={handleSearchChange} id="search-input" />
          </div>
          <div className="sort-box">
            <label htmlFor="sort-select">Sort by:</label>
            <select id="sort-select" value={sortBy} onChange={handleSortChange}>
              <option value="deadline">Deadline (soonest)</option>
              <option value="newest">Recently Added</option>
              <option value="name">Name (A-Z)</option>
              {userLocation && <option value="distance">Distance (nearest)</option>}
            </select>
          </div>
        </div>

        {/* Category Tabs */}
        {!loading && !error && hackathons.length > 0 && (
          <div className="category-tabs" id="category-tabs">
            {categories.map(cat => (
              <button key={cat.key} className={`category-tab ${activeCategory === cat.key ? 'active' : ''}`} onClick={() => handleCategoryChange(cat.key)}>
                {cat.label}
                <span className="tab-count">{cat.count}</span>
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
            <h3>Connection Error</h3>
            <p>{error}</p>
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

        {/* ── Tab switcher (Upcoming / Missed) ── */}
        {!loading && !error && (upcomingHackathons.length > 0 || missedHackathons.length > 0) && (
          <div className="list-tabs">
            <button
              className={`list-tab ${activeTab === 'upcoming' ? 'active' : ''}`}
              onClick={() => setActiveTab('upcoming')}
            >
              🚀 Upcoming
              <span className="tab-count">{upcomingHackathons.length}</span>
            </button>
            <button
              className={`list-tab ${activeTab === 'missed' ? 'active' : ''}`}
              onClick={() => setActiveTab('missed')}
            >
              📁 Missed
              <span className="tab-count">{missedHackathons.length}</span>
            </button>
          </div>
        )}

        {/* ── Upcoming page ── */}
        {!loading && activeTab === 'upcoming' && upcomingHackathons.length > 0 && (
          <>
            <div className="section-header">
              <h2>Upcoming Events</h2>
              <p>Page {upcomingPage} of {upcomingTotalPages} · {upcomingHackathons.length} total</p>
            </div>
            <div className="card-grid">
              {upcomingPageItems.map((h) => (
                <HackathonCard key={h._id || h.link} hackathon={h} />
              ))}
            </div>
            <Pagination currentPage={upcomingPage} totalPages={upcomingTotalPages} onPageChange={handleUpcomingPageChange} />
          </>
        )}

        {/* ── Missed page ── */}
        {!loading && activeTab === 'missed' && missedHackathons.length > 0 && (
          <>
            <div className="section-header">
              <h2 style={{ color: '#64748b' }}>Missed Opportunities</h2>
              <p>Page {missedPage} of {missedTotalPages} · {missedHackathons.length} total — hackathons that have already passed their deadline.</p>
            </div>
            <div className="card-grid">
              {missedPageItems.map((h) => (
                <HackathonCard key={h._id || h.link} hackathon={h} />
              ))}
            </div>
            <Pagination currentPage={missedPage} totalPages={missedTotalPages} onPageChange={handleMissedPageChange} />
          </>
        )}

        {!loading && activeTab === 'missed' && missedHackathons.length === 0 && !error && (
          <div className="empty-state">
            <div className="empty-icon">🎉</div>
            <h3>No missed hackathons!</h3>
            <p>You haven't missed anything in the current filter. Keep it up!</p>
          </div>
        )}
      </section>

      {/* ── Footer ── */}
      <footer className="app-footer">
        <div className="footer-brand">
          <div className="brand-icon">H</div>
          <span>Hackathon Notifier</span>
        </div>
        <p className="footer-tagline">Never miss a submission deadline.</p>
        <div className="footer-links">
          <a href="https://github.com/Pranavdeshmukhhh/hackathon-notifier" target="_blank" rel="noopener noreferrer">GitHub Open Source</a>
          <span className="footer-sep">·</span>
          <button className="btn-link footer-about-btn" onClick={() => setShowAboutModal(true)}>
            Made by Pranav Deshmukh 👋
          </button>
        </div>
      </footer>
    </div>
  );
}

export default App;
