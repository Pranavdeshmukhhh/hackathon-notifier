import React, { useState, useEffect, useRef } from 'react';
import HackathonCard from '../Components/hakathoncard';
import './index.css';

const API_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/hackathons`
  : 'http://localhost:8000/api/hackathons';

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
  const [stats, setStats] = useState({
    total: 0,
    unique_tags: 0,
    last_scraped: '',
    sources: [],
    top_college_count: 0,
    internship_count: 0,
    college_types: [],
  });

  // Refs for scroll-to-section
  const homeRef = useRef(null);
  const dashboardRef = useRef(null);
  const aboutRef = useRef(null);
  const eventsRef = useRef(null);

  const fetchHackathons = async (lat = null, lng = null) => {
    setLoading(true);
    setError(null);
    try {
      let url = API_URL;
      if (lat && lng) {
        url += `?lat=${lat}&lng=${lng}`;
      }
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();

      if (Array.isArray(result)) {
        setHackathons(result);
        setFiltered(result);
      } else if (result.success) {
        setHackathons(result.data);
        setFiltered(result.data);
        if (result.stats) {
          setStats(result.stats);
        }
      } else {
        throw new Error(result.error || 'Unknown error from API');
      }
    } catch (e) {
      setError('Could not connect to the API. Make sure the backend is running.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleNearMeClick = () => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser");
      return;
    }
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
      () => {
        setLocationError("Unable to retrieve your location");
        setIsLocating(false);
      }
    );
  };

  useEffect(() => {
    fetchHackathons(userLocation?.lat, userLocation?.lng);
    const intervalId = setInterval(() => {
      fetchHackathons(userLocation?.lat, userLocation?.lng);
    }, 5 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, []);

  // ── Sorting ──
  const sortHackathons = (list, method) => {
    const sorted = [...list];
    switch (method) {
      case 'deadline':
        sorted.sort((a, b) => {
          const da = a.deadline_iso || '9999';
          const db = b.deadline_iso || '9999';
          return da.localeCompare(db);
        });
        break;
      case 'distance':
        sorted.sort((a, b) => (a.distance_km ?? 999999) - (b.distance_km ?? 999999));
        break;
      case 'name':
        sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        break;
      case 'newest':
        sorted.sort((a, b) => (b.scraped_at || '').localeCompare(a.scraped_at || ''));
        break;
      default:
        break;
    }
    return sorted;
  };

  // ── Category + tag + search filtering ──
  const applyFilters = (category, tag, search, sort) => {
    let result = hackathons;

    // Category filter
    if (category === 'Top College') {
      result = result.filter(h => h.is_top_college === true);
    } else if (category === 'Internship') {
      result = result.filter(h => h.is_internship === true);
    } else if (category === 'Hackathon') {
      result = result.filter(h => h.opportunity_type === 'Hackathon');
    }

    // Tag filter
    if (tag !== 'All') {
      result = result.filter(h => h.tags && h.tags.includes(tag));
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(h =>
        (h.title || '').toLowerCase().includes(q) ||
        (h.location || '').toLowerCase().includes(q) ||
        (h.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }

    // Sort
    result = sortHackathons(result, sort);

    setFiltered(result);
  };

  const handleCategoryChange = (category) => {
    setActiveCategory(category);
    setActiveTag('All');
    applyFilters(category, 'All', searchQuery, sortBy);
  };

  const handleSortChange = (e) => {
    const newSort = e.target.value;
    setSortBy(newSort);
    applyFilters(activeCategory, activeTag, searchQuery, newSort);
  };

  const handleSearchChange = (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    applyFilters(activeCategory, activeTag, q, sortBy);
  };

  const scrollToSection = (section) => {
    setActiveSection(section);
    setMobileMenuOpen(false);
    const refMap = { home: homeRef, dashboard: dashboardRef, about: aboutRef, events: eventsRef };
    refMap[section]?.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Category definitions with counts
  const categories = [
    { key: 'All', label: 'All', count: hackathons.length },
    { key: 'Top College', label: 'Top College', count: stats.top_college_count || 0 },
    { key: 'Internship', label: 'Internship', count: stats.internship_count || 0 },
    { key: 'Hackathon', label: 'Hackathons', count: hackathons.filter(h => h.opportunity_type === 'Hackathon').length },
  ];

  // Format last scraped timestamp
  const formatLastScraped = (isoStr) => {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      const now = new Date();
      const diffMs = now - d;
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHrs = Math.floor(diffMins / 60);
      if (diffHrs < 24) return `${diffHrs}h ago`;
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return '—';
    }
  };

  // Split filtered results
  const upcomingHackathons = filtered.filter(h => !h.is_past);
  const missedHackathons = filtered.filter(h => h.is_past);

  // Source breakdown
  const sourceBreakdown = {};
  hackathons.forEach(h => {
    const src = h.source || 'Unknown';
    sourceBreakdown[src] = (sourceBreakdown[src] || 0) + 1;
  });

  return (
    <div className="app-container">
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
          
          <button
            className={`btn-secondary ${userLocation ? 'active' : ''}`}
            onClick={handleNearMeClick}
            disabled={isLocating}
            title="Sort hackathons by distance from you"
          >
            {isLocating ? 'Locating...' : '📍 Near Me'}
          </button>
          <button className="btn-primary" id="refresh-btn" onClick={() => fetchHackathons(userLocation?.lat, userLocation?.lng)}>
            Refresh Data
          </button>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <section className="hero" id="hero-section" ref={homeRef}>
        <div className="hero-content">
          <h1>Never miss a<br />hackathon again.</h1>
          <p>
            The knowledge infrastructure for ambitious developers. 
            Automatically scraping Devfolio, Unstop, Devpost & HackerEarth 
            to classify and deliver opportunities straight to you.
          </p>
          <div style={{ display: 'flex', gap: '1rem' }}>
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

      {/* ── About / Features Bento Box ── */}
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
              <div className="h-stat">
                <span className="h-stat-val">{stats.top_college_count || 0}</span>
                <span className="h-stat-label">IIT/NIT/BITS</span>
              </div>
              <div className="h-stat">
                <span className="h-stat-val">{stats.internship_count || 0}</span>
                <span className="h-stat-label">Internships</span>
              </div>
            </div>
          </div>
          <div className="highlight-card bg-blue">
            <h3>Missed Opportunities tracker to keep you accountable</h3>
            <div className="highlight-stats">
              <div className="h-stat">
                <span className="h-stat-val">{upcomingHackathons.length}</span>
                <span className="h-stat-label">Upcoming</span>
              </div>
              <div className="h-stat">
                <span className="h-stat-val">{missedHackathons.length}</span>
                <span className="h-stat-label">Missed</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Search + Sort Bar ── */}
      <div className="search-sort-container" ref={eventsRef}>
        <div className="search-sort-bar">
          <div className="search-box">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              placeholder="Search hackathons, locations, tags..."
              value={searchQuery}
              onChange={handleSearchChange}
              id="search-input"
            />
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

        {/* ── Category Tabs ── */}
        {!loading && !error && hackathons.length > 0 && (
          <div className="category-tabs" id="category-tabs">
            {categories.map(cat => (
              <button
                key={cat.key}
                className={`category-tab ${activeCategory === cat.key ? 'active' : ''}`}
                onClick={() => handleCategoryChange(cat.key)}
              >
                {cat.label}
                <span className="tab-count">{cat.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Hackathon List Section ── */}
      <section className="hack-list-section">
        
        {/* Error States */}
        {locationError && (
          <div className="error-box" style={{ marginTop: '2rem' }}>
            <p>⚠️ {locationError}</p>
          </div>
        )}
        {error && (
          <div className="error-box">
            <h3>Connection Error</h3>
            <p>{error}</p>
            <button className="btn-primary" onClick={() => fetchHackathons()} style={{ marginTop: '1rem' }}>
              Retry
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filtered.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <h3>No hackathons found</h3>
            <p>Try adjusting your filters or wait for the next scrape cycle.</p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="card-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton" />
            ))}
          </div>
        )}

        {/* Upcoming */}
        {!loading && upcomingHackathons.length > 0 && (
          <>
            <div className="section-header">
              <h2>Upcoming Events</h2>
            </div>
            <div className="card-grid">
              {upcomingHackathons.map((h) => (
                <HackathonCard key={h._id || h.link} hackathon={h} />
              ))}
            </div>
          </>
        )}

        {/* Missed */}
        {!loading && missedHackathons.length > 0 && (
          <>
            <div className="section-header">
              <h2 style={{ color: '#64748b' }}>Missed Opportunities</h2>
              <p>Hackathons that have already passed their deadline.</p>
            </div>
            <div className="card-grid">
              {missedHackathons.map((h) => (
                <HackathonCard key={h._id || h.link} hackathon={h} />
              ))}
            </div>
          </>
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
        </div>
      </footer>
    </div>
  );
}

export default App;
