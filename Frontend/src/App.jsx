import React, { useState, useEffect, useRef, useCallback } from 'react';
import HackathonCard from '../Components/hakathoncard';
import './index.css';

let API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://hackathon-notifier.onrender.com' : 'http://localhost:8000');
if (API_URL.endsWith('/')) API_URL = API_URL.slice(0, -1);
if (!API_URL.endsWith('/api/hackathons')) API_URL += '/api/hackathons';

const COLD_START_WARN_MS = 5_000;
const PAGE_SIZE = 12;

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
      <button className="pagination-btn" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}>Prev</button>
      {withEllipsis.map((item, i) =>
        item === '...'
          ? <span key={`e-${i}`} style={{ color: 'var(--text-muted)' }}>…</span>
          : <button key={item} className={`pagination-btn ${currentPage === item ? 'active' : ''}`} onClick={() => onPageChange(item)}>{item}</button>
      )}
      <button className="pagination-btn" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}>Next</button>
    </div>
  );
}

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
  const [currentPage, setCurrentPage]         = useState(1);
  const [totalPages, setTotalPages]           = useState(1);
  const [stats, setStats] = useState({ total: 0 });

  const eventsRef = useRef(null);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    const h = setTimeout(() => { setDebouncedSearch(searchQuery); setCurrentPage(1); }, 400);
    return () => clearTimeout(h);
  }, [searchQuery]);

  const fetchHackathons = useCallback(async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    setLoading(true); setError(null);
    try {
      const lat = userLocation?.lat ?? '';
      const lng = userLocation?.lng ?? '';
      let url = `${API_URL}?page=${currentPage}&limit=${PAGE_SIZE}&category=${encodeURIComponent(activeCategory)}&sort=${sortBy}&tab=upcoming`;
      if (debouncedSearch) url += `&search=${encodeURIComponent(debouncedSearch)}`;
      if (lat && lng) url += `&lat=${lat}&lng=${lng}`;
      const res = await fetch(url, { signal: abortControllerRef.current.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      if (result.success) {
        setHackathons(result.data || []);
        if (result.stats) setStats(result.stats);
        setTotalPages(Math.max(1, Math.ceil((result.upcoming_total || 0) / PAGE_SIZE)));
      } else {
        throw new Error(result.error || 'Unknown API error');
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      setError('Could not connect to API.');
    } finally {
      setLoading(false);
    }
  }, [activeCategory, sortBy, debouncedSearch, currentPage, userLocation]);

  useEffect(() => {
    fetchHackathons();
  }, [fetchHackathons]);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setIsLocating(false); setSortBy('distance'); setCurrentPage(1); },
      ()    => { setIsLocating(false); }
    );
  }, []);

  return (
    <div className="app-container">
      <nav className="navbar">
        <div className="navbar-brand">Hackathon Notifier</div>
        <div className="navbar-links">
          <button className="btn-link" onClick={() => eventsRef.current?.scrollIntoView({ behavior: 'smooth' })}>Events</button>
          <button className="btn-secondary" onClick={requestLocation} disabled={isLocating}>
            {isLocating ? 'Locating...' : 'Near Me'}
          </button>
        </div>
      </nav>

      <section className="hero">
        <h1>Discover Events</h1>
        <p>Find and register for your next hackathon.</p>
      </section>

      <div className="search-sort-container" ref={eventsRef}>
        <div className="search-sort-bar">
          <div className="search-box">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Search hackathons, locations, tags..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <div className="sort-box">
            <select value={sortBy} onChange={(e) => { setSortBy(e.target.value); setCurrentPage(1); }}>
              <option value="deadline">Deadline</option>
              <option value="newest">Recently Added</option>
              <option value="name">Name (A–Z)</option>
              <option value="distance">Nearest</option>
            </select>
          </div>
        </div>
        <div className="category-tabs">
          {['All', 'Online', 'Offline', 'Top College', 'Internship'].map(cat => (
             <button key={cat} className={`category-tab ${activeCategory === cat ? 'active' : ''}`} onClick={() => { setActiveCategory(cat); setCurrentPage(1); }}>
               {cat}
             </button>
          ))}
        </div>
      </div>

      <div className="card-grid">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" />)
        ) : (
          hackathons.map(h => <HackathonCard key={h._id || h.link} hackathon={h} />)
        )}
      </div>

      {!loading && !error && <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={(p) => { setCurrentPage(p); eventsRef.current?.scrollIntoView({ behavior: 'smooth' }); }} />}

      <footer className="app-footer">
        Hackathon Notifier &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}

export default App;
