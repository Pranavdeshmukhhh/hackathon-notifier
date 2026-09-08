import React, { useState, useEffect } from 'react';
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
  const [userLocation, setUserLocation] = useState(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [stats, setStats] = useState({
    total: 0,
    unique_tags: 0,
    last_scraped: '',
    sources: [],
    top_college_count: 0,
    internship_count: 0,
    college_types: [],
  });

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
        // Fallback for older backend versions that return an array directly
        setHackathons(result);
        setFiltered(result);
      } else if (result.success) {
        // New backend version that returns {success, count, data, stats}
        setHackathons(result.data);
        setFiltered(result.data);
        if (result.stats) {
          setStats(result.stats);
        }
      } else {
        throw new Error(result.error || 'Unknown error from API');
      }
    } catch (e) {
      setError('Could not connect to the API. Make sure the backend is running on port 8000.');
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
      (err) => {
        setLocationError("Unable to retrieve your location");
        setIsLocating(false);
      }
    );
  };

  useEffect(() => {
    fetchHackathons(userLocation?.lat, userLocation?.lng);

    // Auto-refresh every 5 minutes (300000 ms)
    const intervalId = setInterval(() => {
      fetchHackathons(userLocation?.lat, userLocation?.lng);
    }, 5 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, []);

  // ── Category + tag filtering ──────────────────────────────────────────────
  const applyFilters = (category, tag) => {
    let result = hackathons;

    // Category filter
    if (category === 'Top College') {
      result = result.filter(h => h.is_top_college === true);
    } else if (category === 'Internship') {
      result = result.filter(h => h.is_internship === true);
    } else if (category === 'Hackathon') {
      result = result.filter(h => h.opportunity_type === 'Hackathon');
    }
    // 'All' = no category filter

    // Tag filter
    if (tag !== 'All') {
      result = result.filter(h => h.tags && h.tags.includes(tag));
    }

    setFiltered(result);
  };

  const handleCategoryChange = (category) => {
    setActiveCategory(category);
    setActiveTag('All'); // reset tag filter when category changes
    applyFilters(category, 'All');
  };

  const handleTagChange = (tag) => {
    setActiveTag(tag);
    applyFilters(activeCategory, tag);
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
  // Only show first 10 tags in filter bar for usability
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

  // Split filtered results into upcoming and past
  const upcomingHackathons = filtered.filter(h => !h.is_past);
  const pastHackathons = filtered.filter(h => h.is_past);

  return (
    <div className="app-container">
      {/* ── Navbar ── */}
      <nav className="navbar" id="main-nav">
        <div className="navbar-brand">
          <div className="brand-icon">H</div>
          <span>Hackathon Notifier</span>
        </div>
        <div className="navbar-links">
          <button 
            className={`btn-secondary ${userLocation ? 'active' : ''}`} 
            onClick={handleNearMeClick}
            disabled={isLocating}
            title="Sort hackathons by distance"
          >
            {isLocating ? 'Locating...' : '📍 Near Me'}
          </button>
          <a href="#">Dashboard</a>
          <a href="#">About</a>
          <button className="btn-primary" id="refresh-btn" onClick={() => fetchHackathons(userLocation?.lat, userLocation?.lng)}>
            Refresh
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="hero" id="hero-section">
        <h1>Discover Live<br />Hackathons</h1>
        <p>
          Automatically scraped and delivered to your Telegram.
          Never miss a hackathon again.
        </p>

        <div className="stats-bar">
          <div className="stat-item">
            <span className="stat-value">{stats.total || hackathons.length}</span>
            <span className="stat-label">Total Found</span>
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
          {stats.sources && stats.sources.length > 0 && (
            <div className="stat-item">
              <span className="stat-value">{stats.sources.join(', ')}</span>
              <span className="stat-label">Sources</span>
            </div>
          )}
        </div>
      </section>

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

      {/* ── Error State ── */}
      {locationError && (
        <div className="error-box" style={{marginBottom: '1rem', backgroundColor: '#fff3cd', color: '#856404'}}>
          <p>{locationError}</p>
        </div>
      )}

      {error && (
        <div className="error-box" id="error-box">
          <h3>Connection Error</h3>
          <p>{error}</p>
        </div>
      )}

      {/* ── Empty State ── */}
      {!loading && !error && filtered.length === 0 && (
        <div className="empty-state" id="empty-state">
          <h3>No hackathons found</h3>
          <p>Run the backend scraper to populate the database, or try a different filter.</p>
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
            <h2>Upcoming Hackathons</h2>
            <span className="section-count">{upcomingHackathons.length}</span>
          </div>
          <div className="card-grid">
            {upcomingHackathons.map((h) => (
              <HackathonCard key={h._id || h.link} hackathon={h} />
            ))}
          </div>
        </>
      )}

      {/* ── Past Hackathons ── */}
      {!loading && pastHackathons.length > 0 && (
        <>
          <div className="section-header section-header--past" id="past-section">
            <h2>Past / Expired</h2>
            <span className="section-count">{pastHackathons.length}</span>
          </div>
          <div className="card-grid">
            {pastHackathons.map((h) => (
              <HackathonCard key={h._id || h.link} hackathon={h} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default App;
