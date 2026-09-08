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

  const handleTagChange = (tag) => {
    setActiveTag(tag);
    applyFilters(activeCategory, tag, searchQuery, sortBy);
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
    const refMap = { home: homeRef, dashboard: dashboardRef, about: aboutRef };
    refMap[section]?.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Category definitions with counts
  const categories = [
    { key: 'All', label: 'All', emoji: '📋', count: hackathons.length },
    { key: 'Top College', label: 'Top College', emoji: '🏛', count: stats.top_college_count || 0 },
    { key: 'Internship', label: 'Internship', emoji: '💼', count: stats.internship_count || 0 },
    { key: 'Hackathon', label: 'Hackathon', emoji: '🏆', count: hackathons.filter(h => h.opportunity_type === 'Hackathon').length },
  ];

  // Build unique tag set for filter chips
  const allTags = ['All', ...new Set(filtered.flatMap(h => h.tags || []))];
  const visibleTags = allTags.slice(0, 11);

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

  // Dashboard stats
  const onlineCount = hackathons.filter(h => (h.mode || '').toLowerCase() === 'online').length;
  const offlineCount = hackathons.filter(h => (h.mode || '').toLowerCase() === 'offline').length;
  const hybridCount = hackathons.filter(h => {
    const m = (h.mode || '').toLowerCase();
    return m !== 'online' && m !== 'offline' && m !== 'unknown' && m !== '';
  }).length;

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
          <a href="#home" className={activeSection === 'home' ? 'nav-active' : ''} onClick={(e) => { e.preventDefault(); scrollToSection('home'); }}>Home</a>
          <a href="#dashboard" className={activeSection === 'dashboard' ? 'nav-active' : ''} onClick={(e) => { e.preventDefault(); scrollToSection('dashboard'); }}>Dashboard</a>
          <a href="#about" className={activeSection === 'about' ? 'nav-active' : ''} onClick={(e) => { e.preventDefault(); scrollToSection('about'); }}>About</a>
          <button
            className={`btn-secondary ${userLocation ? 'active' : ''}`}
            onClick={handleNearMeClick}
            disabled={isLocating}
            title="Sort hackathons by distance from you"
          >
            {isLocating ? '⏳ Locating...' : '📍 Near Me'}
          </button>
          <button className="btn-primary" id="refresh-btn" onClick={() => fetchHackathons(userLocation?.lat, userLocation?.lng)}>
            ↻ Refresh
          </button>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <section className="hero" id="hero-section" ref={homeRef}>
        <div className="hero-content">
          <h1>Discover Live<br />Hackathons</h1>
          <p>
            Automatically scraped from Devfolio, Unstop, Devpost & HackerEarth.
            Sorted, classified and delivered to your Telegram — never miss a hackathon again.
          </p>
        </div>

        <div className="stats-bar">
          <div className="stat-item">
            <span className="stat-value">{stats.total || hackathons.length}</span>
            <span className="stat-label">Total Found</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{upcomingHackathons.length}</span>
            <span className="stat-label">Upcoming</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{missedHackathons.length}</span>
            <span className="stat-label">Missed</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{stats.top_college_count || 0}</span>
            <span className="stat-label">Top College</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{stats.internship_count || 0}</span>
            <span className="stat-label">Internships</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{formatLastScraped(stats.last_scraped)}</span>
            <span className="stat-label">Last Scraped</span>
          </div>
        </div>
      </section>

      {/* ── Search + Sort Bar ── */}
      {!loading && !error && hackathons.length > 0 && (
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
      )}

      {/* ── Category Tabs ── */}
      {!loading && !error && hackathons.length > 0 && (
        <div className="category-tabs" id="category-tabs">
          {categories.map(cat => (
            <button
              key={cat.key}
              className={`category-tab ${activeCategory === cat.key ? 'active' : ''}`}
              onClick={() => handleCategoryChange(cat.key)}
            >
              {cat.emoji} {cat.label}
              <span className="tab-count">{cat.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Tag Filter Chips ── */}
      {!loading && !error && filtered.length > 0 && visibleTags.length > 1 && (
        <div className="filter-bar" id="filter-bar">
          {visibleTags.map(tag => (
            <button
              key={tag}
              className={`filter-chip ${activeTag === tag ? 'active' : ''}`}
              onClick={() => handleTagChange(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* ── Error States ── */}
      {locationError && (
        <div className="error-box error-box--warning">
          <p>⚠️ {locationError}</p>
        </div>
      )}
      {error && (
        <div className="error-box" id="error-box">
          <h3>Connection Error</h3>
          <p>{error}</p>
          <button className="btn-primary" onClick={() => fetchHackathons()} style={{ marginTop: '1rem' }}>
            Retry
          </button>
        </div>
      )}

      {/* ── Empty State ── */}
      {!loading && !error && filtered.length === 0 && (
        <div className="empty-state" id="empty-state">
          <div className="empty-icon">🔍</div>
          <h3>No hackathons found</h3>
          <p>Try adjusting your filters or search query, or wait for the next scrape cycle.</p>
        </div>
      )}

      {/* ── Loading State ── */}
      {loading && (
        <div className="card-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" />
          ))}
        </div>
      )}

      {/* ── Upcoming Hackathons ── */}
      {!loading && upcomingHackathons.length > 0 && (
        <>
          <div className="section-header" id="upcoming-section">
            <div className="section-header-left">
              <span className="section-icon">🚀</span>
              <h2>Upcoming Hackathons</h2>
              <span className="section-count">{upcomingHackathons.length}</span>
            </div>
          </div>
          <div className="card-grid">
            {upcomingHackathons.map((h) => (
              <HackathonCard key={h._id || h.link} hackathon={h} />
            ))}
          </div>
        </>
      )}

      {/* ── Missed Opportunities ── */}
      {!loading && missedHackathons.length > 0 && (
        <>
          <div className="section-header section-header--missed" id="missed-section">
            <div className="section-header-left">
              <span className="section-icon">⏰</span>
              <h2>Missed Opportunities</h2>
              <span className="section-count">{missedHackathons.length}</span>
            </div>
          </div>
          <div className="card-grid">
            {missedHackathons.map((h) => (
              <HackathonCard key={h._id || h.link} hackathon={h} />
            ))}
          </div>
        </>
      )}

      {/* ── Dashboard Section ── */}
      <section className="dashboard-section" id="dashboard-section" ref={dashboardRef}>
        <div className="section-header">
          <div className="section-header-left">
            <span className="section-icon">📊</span>
            <h2>Dashboard</h2>
          </div>
        </div>

        <div className="dashboard-grid">
          {/* Overview Card */}
          <div className="dashboard-card dashboard-card--overview">
            <h3>Overview</h3>
            <div className="dashboard-stat-grid">
              <div className="dash-stat">
                <span className="dash-stat-value">{stats.total || hackathons.length}</span>
                <span className="dash-stat-label">Total Hackathons</span>
              </div>
              <div className="dash-stat">
                <span className="dash-stat-value dash-stat-value--green">{upcomingHackathons.length}</span>
                <span className="dash-stat-label">Upcoming</span>
              </div>
              <div className="dash-stat">
                <span className="dash-stat-value dash-stat-value--red">{missedHackathons.length}</span>
                <span className="dash-stat-label">Missed</span>
              </div>
              <div className="dash-stat">
                <span className="dash-stat-value dash-stat-value--amber">{formatLastScraped(stats.last_scraped)}</span>
                <span className="dash-stat-label">Last Updated</span>
              </div>
            </div>
          </div>

          {/* Source Breakdown */}
          <div className="dashboard-card">
            <h3>Sources</h3>
            <div className="source-list">
              {Object.entries(sourceBreakdown).sort((a, b) => b[1] - a[1]).map(([src, count]) => (
                <div key={src} className="source-row">
                  <span className={`source-dot source-dot--${src.toLowerCase()}`}></span>
                  <span className="source-name">{src}</span>
                  <span className="source-count">{count}</span>
                  <div className="source-bar">
                    <div className="source-bar-fill" style={{ width: `${(count / (stats.total || hackathons.length || 1)) * 100}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mode Breakdown */}
          <div className="dashboard-card">
            <h3>Event Modes</h3>
            <div className="mode-pills">
              <div className="mode-pill mode-pill--online">
                <span className="mode-pill-icon">🌐</span>
                <span className="mode-pill-label">Online</span>
                <span className="mode-pill-value">{onlineCount}</span>
              </div>
              <div className="mode-pill mode-pill--offline">
                <span className="mode-pill-icon">📍</span>
                <span className="mode-pill-label">Offline</span>
                <span className="mode-pill-value">{offlineCount}</span>
              </div>
              <div className="mode-pill mode-pill--hybrid">
                <span className="mode-pill-icon">🔄</span>
                <span className="mode-pill-label">Hybrid / Other</span>
                <span className="mode-pill-value">{hybridCount}</span>
              </div>
            </div>
          </div>

          {/* Classification */}
          <div className="dashboard-card">
            <h3>Classification</h3>
            <div className="mode-pills">
              <div className="mode-pill mode-pill--college">
                <span className="mode-pill-icon">🏛</span>
                <span className="mode-pill-label">Top College</span>
                <span className="mode-pill-value">{stats.top_college_count || 0}</span>
              </div>
              <div className="mode-pill mode-pill--internship">
                <span className="mode-pill-icon">💼</span>
                <span className="mode-pill-label">Internship</span>
                <span className="mode-pill-value">{stats.internship_count || 0}</span>
              </div>
              {stats.college_types && stats.college_types.length > 0 && (
                <div className="college-type-chips">
                  {stats.college_types.map(ct => (
                    <span key={ct} className={`college-chip college-chip--${ct.toLowerCase()}`}>{ct}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── About Section ── */}
      <section className="about-section" id="about-section" ref={aboutRef}>
        <div className="about-content">
          <div className="about-header">
            <span className="section-icon">ℹ️</span>
            <h2>About Hackathon Notifier</h2>
          </div>
          <div className="about-grid">
            <div className="about-card">
              <div className="about-card-icon">🔍</div>
              <h3>Auto-Discovery</h3>
              <p>Scrapes hackathons from <strong>Devfolio, Unstop, Devpost & HackerEarth</strong> every 5 minutes. No manual entry needed.</p>
            </div>
            <div className="about-card">
              <div className="about-card-icon">🏛</div>
              <h3>Smart Classification</h3>
              <p>Automatically identifies <strong>IIT, NIT, IIIT, BITS</strong> college events and internship opportunities using keyword analysis.</p>
            </div>
            <div className="about-card">
              <div className="about-card-icon">📍</div>
              <h3>Location-Aware</h3>
              <p>Uses your location to calculate <strong>distance in km</strong> to offline events. Sort by nearest to find events close to you.</p>
            </div>
            <div className="about-card">
              <div className="about-card-icon">📬</div>
              <h3>Telegram Alerts</h3>
              <p>Get instant <strong>Telegram notifications</strong> for new top-college and internship hackathons the moment they're discovered.</p>
            </div>
            <div className="about-card">
              <div className="about-card-icon">⚡</div>
              <h3>Real-Time</h3>
              <p>Dashboard auto-refreshes every <strong>5 minutes</strong>. Backend scrapes run continuously to keep you ahead of the game.</p>
            </div>
            <div className="about-card">
              <div className="about-card-icon">🧠</div>
              <h3>Open Source</h3>
              <p>Built with <strong>React, FastAPI, MongoDB & Python</strong>. Fork it, hack it, make it yours.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="brand-icon">H</div>
            <span>Hackathon Notifier</span>
          </div>
          <p className="footer-tagline">Never miss a hackathon again.</p>
          <div className="footer-links">
            <a href="https://github.com/Pranavdeshmukhhh/hackathon-notifier" target="_blank" rel="noopener noreferrer">GitHub</a>
            <span className="footer-divider">•</span>
            <span className="footer-stats">Tracking {stats.total || hackathons.length} hackathons from {Object.keys(sourceBreakdown).length} sources</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
