import React, { useState, useEffect, useRef, useCallback } from 'react';
import HackathonCard from '../Components/hakathoncard';
import './index.css';

const PROD_API_URL = 'https://hackathon-notifier.onrender.com/api/hackathons';
const LOCAL_API_URL = 'http://localhost:8000/api/hackathons';
let DEFAULT_API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? PROD_API_URL : LOCAL_API_URL);
if (DEFAULT_API_URL.endsWith('/')) DEFAULT_API_URL = DEFAULT_API_URL.slice(0, -1);
if (!DEFAULT_API_URL.endsWith('/api/hackathons')) DEFAULT_API_URL += '/api/hackathons';

const COLD_START_WARN_MS = 6_000;
const PAGE_SIZE = 12;

// ── Brand Logo ─────────────────────────────────────────────────────────────
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
      <rect width="40" height="40" rx="10" fill="#18181b" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
      <path
        d="M22 8L13 21h7l-3 11 12-15h-8l5-7z"
        fill="#6366f1"
        stroke="#818cf8"
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── SVG Icons ──────────────────────────────────────────────────────────────
const DiscoveryIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
  </svg>
);

const LayersIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);

const PinIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const EmptySearchIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);

const CheckCircleIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#10b981', opacity: 0.8 }}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const TelegramIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.19-.08-.05-.19-.02-.27 0-.12.03-1.99 1.27-5.62 3.72-.53.36-1.01.54-1.44.53-.47-.01-1.38-.27-2.06-.49-.83-.27-1.49-.42-1.43-.88.03-.24.37-.49 1.02-.74 3.98-1.73 6.64-2.88 7.97-3.44 3.79-1.58 4.58-1.85 5.09-1.86.11 0 .37.03.53.17.14.12.18.28.2.45-.01.07.01.22 0 .34z" />
  </svg>
);






// ── Technical Architecture Modal ───────────────────────────────────────────
function TechSpecModal({ onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-window about-modal-compact" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Technical Architecture">
        <div className="modal-header">
          <HLogo size={40} />
          <div>
            <h2 className="modal-name">System Architecture</h2>
            <p className="modal-role">Autonomous Scraper &amp; Notification Engine</p>
          </div>
        </div>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="modal-body about-body-compact">
          <div className="modal-badge-row">
            <span className="modal-badge modal-badge--green">Radar: 24/7 Active Ingestion</span>
            <span className="modal-badge modal-badge--purple">100% Automated Pipeline</span>
          </div>
          <p className="modal-bio" style={{ fontSize: '0.88rem', marginBottom: '1rem' }}>
            Built to automate hackathon discovery across India and global platforms in real time.
            Aggregates, categorizes, and geo-locates opportunities so developers never miss a deadline.
          </p>
          <div className="modal-section" style={{ marginBottom: '0.9rem' }}>
            <h3>Stack &amp; Services</h3>
            <div className="modal-tech-grid">
              <div className="modal-tech-item"><span className="tech-dot" /> FastAPI (Python 3.12)</div>
              <div className="modal-tech-item"><span className="tech-dot" /> MongoDB Atlas Cluster</div>
              <div className="modal-tech-item"><span className="tech-dot" /> React 18 + Vite</div>
              <div className="modal-tech-item"><span className="tech-dot" /> Telegram Bot API</div>
              <div className="modal-tech-item"><span className="tech-dot" /> Cloudflare Bypass (curl_cffi)</div>
              <div className="modal-tech-item"><span className="tech-dot" /> Geocoder (Nominatim)</div>
            </div>
          </div>
          <div className="modal-section" style={{ marginBottom: '0.9rem' }}>
            <h3>Pipeline Capabilities</h3>
            <div className="about-chips">
              <span>5 concurrent scrapers</span>
              <span>IIT/NIT/BITS classifier</span>
              <span>GPS Haversine distance</span>
              <span>Telegram push broadcast</span>
              <span>Server-side pagination</span>
            </div>
          </div>
          <div className="modal-footer-note">
            <em>Hackathon Notifier · Autonomous opportunity intelligence for the developer community. Free forever.</em>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Pagination ─────────────────────────────────────────────────────────────
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
      <button className="pagination-btn" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}>
        Previous
      </button>
      {withEllipsis.map((item, i) =>
        item === '...'
          ? <span key={`e-${i}`} className="pagination-ellipsis">…</span>
          : <button key={item} className={`pagination-btn ${currentPage === item ? 'active' : ''}`} onClick={() => onPageChange(item)}>{item}</button>
      )}
      <button className="pagination-btn" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}>
        Next
      </button>
    </div>
  );
}

// ── Interactive Radar Steps ────────────────────────────────────────────────
const RADAR_STEPS = [
  {
    id: 'ingest',
    title: 'Auto Ingestion',
    badge: 'Phase 01 · 24/7 Scraping',
    headline: '5 Parallel Scrapers Polling Continually',
    desc: 'Independent Python worker routines continuously query Devfolio, Unstop (with TLS fingerprint spoofing), Devpost, HackerEarth, and Devnovate without relying on manual submissions.',
    chips: ['TLS Fingerprint Spoofing', 'Cloudflare Bypass', 'Concurrent Workers', '5 Platforms'],
    terminalLog: `[INGEST] Scraping devfolio.co ... 24 events\n[INGEST] Scraping unstop.com ... 38 events\n[INGEST] Syncing devpost.com ... 19 events\n[INGEST] Scraping hackerearth.com ... 14 events\n[SYNC] 95 total opportunities active & verified`
  },
  {
    id: 'classify',
    title: 'Smart Filter',
    badge: 'Phase 02 · Classification',
    headline: 'Heuristic Filtering & Tier Detection',
    desc: 'Our engine cleans scraped listings, extracts cash prize pools, identifies registration caps, and automatically flags prestigious tier-1 college hackathons (IIT, NIT, IIIT, BITS).',
    chips: ['Cash Prize Parser', 'IIT/NIT Tagger', 'Team Range Parser', 'Spam Filter'],
    terminalLog: `[FILTER] Parsing raw listing metadata...\n[CLASSIFIER] Target: IIT Roorkee -> Flagged as Premier\n[REWARDS] Extracted prize: ₹5,00,000 cash pool\n[STATUS] Registration Verified: OPEN (Ends in 6d)`
  },
  {
    id: 'geolocate',
    title: 'Proximity GPS',
    badge: 'Phase 03 · Geocoding',
    headline: 'Haversine GPS Venue Distance',
    desc: 'Physical venues are geocoded using OpenStreetMap Nominatim. When you tap Near Me, we compute spherical distance between your coordinates and the hackathon venue.',
    chips: ['Nominatim Geocoding', 'Haversine Spherical Math', 'Venue Normalization', 'City Ranking'],
    terminalLog: `[GEO] Resolving venue "Koramangala, Bengaluru"...\n[GEO] Lat: 12.9352, Lng: 77.6245\n[DISTANCE] Computed 4.2 km from your GPS location\n[PRIORITY] Ranked closest in-person events first`
  },
  {
    id: 'dispatch',
    title: 'Instant Dispatch',
    badge: 'Phase 04 · Broadcast',
    headline: 'Zero-Lag Telegram & Web Broadcast',
    desc: 'New hackathons are pushed to Telegram subscribers in under 10 seconds. You get direct registration links before team caps fill up, with zero marketing clutter.',
    chips: ['< 10s Latency', 'Direct Links', 'Zero Noise', 'Telegram Bot API'],
    terminalLog: `[BROADCAST] Target: @Pranavhakathon_bot\n[PUSH] Instant dispatch sent to active subscribers\n[TELEMETRY] Web dashboard live synced (32ms)\n[DISPATCH] Status: DELIVERED (Zero Spam)`
  }
];

// ── Main App ───────────────────────────────────────────────────────────────
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
  const [showTechSpecModal, setShowTechSpecModal] = useState(false);
  const [activeTab, setActiveTab]             = useState('upcoming');
  const [currentPage, setCurrentPage]         = useState(1);
  const [totalPages, setTotalPages]           = useState(1);
  const [upcomingTotal, setUpcomingTotal]     = useState(0);
  const [missedTotal, setMissedTotal]         = useState(0);
  const [activeStage, setActiveStage]         = useState(0);
  const [toast, setToast]                     = useState({ message: '', visible: false });
  const [stats, setStats] = useState({
    total: 0, unique_tags: 0, last_scraped: '', sources: [],
    top_college_count: 0, internship_count: 0, college_types: [],
    online_count: 0, offline_count: 0, unique_sources_count: 0, hackathon_count: 0
  });

  const showToast = useCallback((msg) => {
    setToast({ message: msg, visible: true });
    setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, 3200);
  }, []);

  const handleQuickFilter = (type) => {
    if (type === 'prizes') {
      setSortBy('newest');
      setActiveCategory('All');
      setSearchQuery('');
      showToast('⚡ Filter: Highest Cash Pools');
    } else if (type === 'college') {
      setSearchQuery('IIT');
      setActiveCategory('All');
      showToast('🎓 Filter: Premier Colleges (IIT/NIT/BITS)');
    } else if (type === 'inperson') {
      setActiveCategory('Offline');
      setSearchQuery('');
      showToast('📍 Filter: In-Person Hackathons Near You');
    } else if (type === 'online') {
      setActiveCategory('Online');
      setSearchQuery('');
      showToast('🌐 Filter: 100% Online & Global Hackathons');
    }
    scrollToSection('events');
  };

  const homeRef            = useRef(null);
  const dashboardRef       = useRef(null);
  const featuresRef        = useRef(null);
  const eventsRef          = useRef(null);
  const aboutRef           = useRef(null);
  const abortControllerRef = useRef(null);
  const coldStartTimerRef  = useRef(null);
  const intervalRef        = useRef(null);

  useEffect(() => {
    const h = setTimeout(() => { setDebouncedSearch(searchQuery); setCurrentPage(1); }, 350);
    return () => clearTimeout(h);
  }, [searchQuery]);

  // Robust fetcher with automatic live Render fallback if localhost is offline
  const fetchHackathons = useCallback(async (isAutoRefresh = false) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    if (!isAutoRefresh) {
      setLoading(true);
      setError(null);
      setShowColdStartBanner(false);
      coldStartTimerRef.current = setTimeout(() => setShowColdStartBanner(true), COLD_START_WARN_MS);
    }

    try {
      const lat = userLocation?.lat ?? '';
      const lng = userLocation?.lng ?? '';
      const queryParams = `?page=${currentPage}&limit=${PAGE_SIZE}&category=${encodeURIComponent(activeCategory)}&sort=${sortBy}&tab=${activeTab}${debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : ''}${lat && lng ? `&lat=${lat}&lng=${lng}` : ''}`;

      let url = `${DEFAULT_API_URL}${queryParams}`;
      let res;
      try {
        res = await fetch(url, { signal: abortControllerRef.current.signal });
      } catch (networkErr) {
        if (networkErr.name === 'AbortError') return;
        // If local API is unreachable and we weren't already hitting production, fall back to production API
        if (!url.startsWith(PROD_API_URL)) {
          const fallbackUrl = `${PROD_API_URL}${queryParams}`;
          res = await fetch(fallbackUrl, { signal: abortControllerRef.current.signal });
        } else {
          throw networkErr;
        }
      }

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
      setError('Could not connect to the API. Connecting to cloud pipeline…');
      console.error('Fetch error:', e);
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
    if (!navigator.geolocation) { setLocationError('Geolocation not supported by browser'); return; }
    setIsLocating(true); setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setIsLocating(false);
        setSortBy('distance');
        setCurrentPage(1);
      },
      () => {
        setLocationError('Location permission denied or unavailable');
        setIsLocating(false);
      },
      { timeout: 8000 }
    );
  }, []);

  const handleCategoryChange = (cat) => { setActiveCategory(cat); setCurrentPage(1); };
  const handleSearchChange   = (e)   => { setSearchQuery(e.target.value); };
  const handleSortChange     = (e)   => {
    const v = e.target.value;
    if (v === 'distance' && !userLocation) {
      setSortBy('distance');
      requestLocation();
      return;
    }
    setSortBy(v);
    setCurrentPage(1);
  };
  const handleTabChange  = (tab) => { setActiveTab(tab); setCurrentPage(1); eventsRef.current?.scrollIntoView({ behavior: 'smooth' }); };
  const handlePageChange = (p)   => { setCurrentPage(p); eventsRef.current?.scrollIntoView({ behavior: 'smooth' }); };
  const scrollToSection  = (section) => {
    setActiveSection(section);
    setMobileMenuOpen(false);
    const refMap = { home: homeRef, dashboard: dashboardRef, features: featuresRef, events: eventsRef, about: aboutRef };
    refMap[section]?.current?.scrollIntoView({ behavior: 'smooth' });
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

  const categories = [
    { key: 'All',            label: 'All',            count: stats.total },
    { key: 'Online',         label: '🌐 Online',       count: stats.online_count || 0 },
    { key: 'Offline',        label: '📍 In-Person',    count: stats.offline_count || 0 },
    { key: 'Top College',    label: '🏛 Top College',  count: stats.top_college_count || 0 },
    { key: 'Internship',     label: '💼 Internships',  count: stats.internship_count || 0 },
    { key: 'Hackathon',      label: 'Hackathons',     count: stats.hackathon_count || 0 },
    { key: 'Unique Sources', label: '⭐ Curated',      count: stats.unique_sources_count || 0 },
  ];

  return (
    <div className="app-container">
      {/* ── AMBIENT GLASSMORPHIC BLUR ORBS ── */}
      <div className="ambient-blur-container" aria-hidden="true">
        <div className="ambient-orb orb-1"></div>
        <div className="ambient-orb orb-2"></div>
        <div className="ambient-orb orb-3"></div>
        <div className="ambient-grid-overlay"></div>
      </div>

      {showTechSpecModal && <TechSpecModal onClose={() => setShowTechSpecModal(false)} />}

      {/* ── MOBILE BACKDROP OVERLAY ── */}
      {mobileMenuOpen && (
        <div className="nav-backdrop" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* ── NAVBAR ── */}
      <nav className="navbar" id="main-nav">
        <div className="navbar-brand" onClick={() => scrollToSection('home')}>
          <HLogo size={34} />
          <div className="brand-text-container">
            <span className="brand-title">Hackathon Notifier</span>
            <span className="brand-badge">PRO</span>
          </div>
        </div>

        <button
          className={`mobile-menu-btn ${mobileMenuOpen ? 'open' : ''}`}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle mobile menu"
          aria-expanded={mobileMenuOpen}
        >
          <span className="hamburger-box">
            <span className="hamburger-inner"></span>
          </span>
        </button>

        <div className={`navbar-links ${mobileMenuOpen ? 'mobile-open' : ''}`}>
          <a
            href="#events"
            className={activeSection === 'events' ? 'nav-active' : ''}
            onClick={e => { e.preventDefault(); scrollToSection('events'); }}
          >
            Events
          </a>
          <a
            href="#dashboard"
            className={activeSection === 'dashboard' ? 'nav-active' : ''}
            onClick={e => { e.preventDefault(); scrollToSection('dashboard'); }}
          >
            Live Pipeline
          </a>
          <a
            href="#features"
            className={activeSection === 'features' ? 'nav-active' : ''}
            onClick={e => { e.preventDefault(); scrollToSection('features'); }}
          >
            Features
          </a>
          <a
            href="#about"
            className={activeSection === 'about' ? 'nav-active' : ''}
            onClick={e => { e.preventDefault(); scrollToSection('about'); }}
          >
            About &amp; Maker
          </a>

          <div className="nav-actions-group">
            <button
              className={`btn-secondary nav-loc-btn ${userLocation ? 'active' : ''}`}
              onClick={() => { requestLocation(); setMobileMenuOpen(false); }}
              disabled={isLocating}
              title="Filter hackathons nearest to your GPS coordinates"
            >
              <PinIcon />
              <span>{isLocating ? 'Locating…' : userLocation ? 'Near You' : 'Near Me'}</span>
            </button>
            <button
              className="btn-primary nav-refresh-btn"
              id="refresh-btn"
              onClick={() => { fetchHackathons(); setMobileMenuOpen(false); }}
            >
              Sync
            </button>
          </div>
        </div>
      </nav>

      {/* ── COLD START BANNER ── */}
      {showColdStartBanner && (
        <div className="cold-start-banner">
          <div className="cold-start-spinner"></div>
          <span><strong>Cloud server waking up</strong> · Render free tier initial spin-up (~25s). Loading live database…</span>
        </div>
      )}

      {/* ── HERO ── */}
      <section className="hero" id="hero-section" ref={homeRef}>
        <div className="hero-content">
          <div className="hero-creator-pill">
            <span className="creator-pulse-dot"></span>
            <span>Engineered by <strong>Pranav Deshmukh</strong> · 2nd Year ETC · 24/7 Radar</span>
          </div>
          <h1>
            Never miss another<br />
            <span className="hero-highlight">hackathon</span> again.
          </h1>
          <p>
            Continuous automated discovery across <strong>Devfolio, Unstop, Devpost, HackerEarth &amp; Devnovate</strong>.
            Intelligent premier-college classification, deadline tracking, and instant alerts.
          </p>
          <div className="hero-cta-buttons">
            <a
              href="https://t.me/Pranavhakathon_bot"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary hero-bot-btn"
              style={{ backgroundColor: '#3b82f6', borderColor: '#2563eb', color: 'white' }}
            >
              <TelegramIcon /> Get instant Telegram alerts
            </a>
            <button className="btn-secondary" onClick={() => scrollToSection('events')}>
              See what's open now
            </button>
            <button className="btn-ghost" onClick={() => scrollToSection('dashboard')}>
              View live stats
            </button>
          </div>
        </div>

        {/* ── HERO HUD STATS PANEL ── */}
        <div className="hero-stats-panel">
          <div className="hero-stats-header">
            <div className="pulse-indicator">
              <span className="pulse-dot"></span>
              <span className="pulse-ring"></span>
            </div>
            <span className="hero-stats-title">Automated Ingestion Pipeline</span>
            <span className="hero-stats-time">{formatLastScraped(stats.last_scraped)}</span>
          </div>
          <div className="hero-stats-grid">
            <div className="hero-stat-box">
              <div className="hero-stat-value">{stats.total || '—'}</div>
              <div className="hero-stat-label">Total Tracked</div>
            </div>
            <div className="hero-stat-box">
              <div className="hero-stat-value" style={{ color: '#10b981' }}>{upcomingTotal || '—'}</div>
              <div className="hero-stat-label">Active &amp; Open</div>
            </div>
            <div className="hero-stat-box">
              <div className="hero-stat-value" style={{ color: '#818cf8' }}>{stats.top_college_count || 0}</div>
              <div className="hero-stat-label">IIT / NIT / BITS</div>
            </div>
            <div className="hero-stat-box">
              <div className="hero-stat-value" style={{ color: '#a78bfa' }}>{stats.internship_count || 0}</div>
              <div className="hero-stat-label">Internships</div>
            </div>
          </div>
          <div className="hero-sources-strip">
            <span className="sources-label">Sources:</span>
            <div className="sources-tags">
              {(stats.sources && stats.sources.length > 0 ? stats.sources : ['Devfolio', 'Unstop', 'Devpost', 'HackerEarth', 'Devnovate']).map(s => (
                <span key={s} className="source-pill">{s}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── PLATFORM LOGO STRIP ── */}
      <div className="logo-strip">
        <p>Continuous automated indexing across the world&apos;s leading hackathon hosts</p>
        <div className="logo-grid">
          <div className="logo-item"><span className="logo-dot dot--blue" />Devfolio</div>
          <div className="logo-item"><span className="logo-dot dot--green" />Unstop</div>
          <div className="logo-item"><span className="logo-dot dot--orange" />Devpost</div>
          <div className="logo-item"><span className="logo-dot dot--purple" />HackerEarth</div>
          <div className="logo-item"><span className="logo-dot dot--cyan" />Devnovate</div>
        </div>
      </div>

      {/* ── LIVE PIPELINE COMMAND CENTER (IN-PAGE DASHBOARD) ── */}
      <section className="dashboard-section" id="dashboard-section" ref={dashboardRef}>
        <div className="section-header">
          <div className="section-badge">Live Telemetry</div>
          <h2>Ingestion Pipeline &amp; Ecosystem Metrics</h2>
          <p>Real-time analytics across opportunities, platforms, and verified institutions.</p>
        </div>

        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-title">Active vs Past Events</span>
              <span className="kpi-badge badge--green">Live</span>
            </div>
            <div className="kpi-numbers">
              <div className="kpi-num-col">
                <span className="kpi-value text-green">{upcomingTotal}</span>
                <span className="kpi-sub">Upcoming</span>
              </div>
              <div className="kpi-divider">/</div>
              <div className="kpi-num-col">
                <span className="kpi-value text-muted">{missedTotal}</span>
                <span className="kpi-sub">Past</span>
              </div>
            </div>
            <div className="kpi-progress">
              <div
                className="kpi-progress-fill fill--green"
                style={{ width: stats.total ? `${((upcomingTotal) / stats.total) * 100}%` : '50%' }}
              />
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-title">Premier Colleges</span>
              <span className="kpi-badge badge--amber">Elite</span>
            </div>
            <div className="kpi-numbers">
              <div className="kpi-num-col">
                <span className="kpi-value text-amber">{stats.top_college_count || 0}</span>
                <span className="kpi-sub">IIT / NIT / BITS / IIIT</span>
              </div>
            </div>
            <p className="kpi-note">Auto-detected by college classifier heuristics</p>
          </div>

          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-title">Paid Internships</span>
              <span className="kpi-badge badge--purple">Careers</span>
            </div>
            <div className="kpi-numbers">
              <div className="kpi-num-col">
                <span className="kpi-value text-purple">{stats.internship_count || 0}</span>
                <span className="kpi-sub">Student &amp; Hiring Tracks</span>
              </div>
            </div>
            <p className="kpi-note">Competitions with direct interview &amp; offer pipelines</p>
          </div>

          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-title">Event Mode Split</span>
              <span className="kpi-badge badge--cyan">Format</span>
            </div>
            <div className="kpi-numbers">
              <div className="kpi-num-col">
                <span className="kpi-value text-cyan">{stats.online_count || 0}</span>
                <span className="kpi-sub">Online</span>
              </div>
              <div className="kpi-divider">·</div>
              <div className="kpi-num-col">
                <span className="kpi-value text-orange">{stats.offline_count || 0}</span>
                <span className="kpi-sub">In-Person</span>
              </div>
            </div>
            <div className="kpi-progress">
              <div
                className="kpi-progress-fill fill--cyan"
                style={{ width: stats.total ? `${((stats.online_count || 0) / stats.total) * 100}%` : '60%' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── ENGINEERING FEATURES ── */}
      <section className="features-section" id="features-section" ref={featuresRef}>
        <div className="section-header" style={{ textAlign: 'center' }}>
          <div className="section-badge" style={{ margin: '0 auto 0.75rem' }}>Core Engine</div>
          <h2>Built for reliability. Zero fluff.</h2>
          <p>Engineered from scratch to solve fragmented event listings across the web.</p>
        </div>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-card-icon"><DiscoveryIcon /></div>
            <h3>5 Parallel Python Scrapers</h3>
            <p>Runs concurrent workers over Devfolio, Unstop (Cloudflare TLS fingerprint spoofing), Devpost, HackerEarth, and Devnovate.</p>
          </div>
          <div className="feature-card">
            <div className="feature-card-icon"><LayersIcon /></div>
            <h3>Intelligent Classification</h3>
            <p>Automatically flags prestigious institutions (IIT, NIT, IIIT, BITS) and parses prize pools and registration team ranges.</p>
          </div>
          <div className="feature-card">
            <div className="feature-card-icon"><PinIcon /></div>
            <h3>GPS Haversine Distance</h3>
            <p>Geocodes physical venues with Nominatim and calculates live GPS distance to rank in-person hackathons closest to you.</p>
          </div>
        </div>
      </section>

      {/* ── DISCOVER EVENTS SECTION ── */}
      <section className="events-container-section" id="events-section" ref={eventsRef}>
        <div className="events-section-title">
          <div className="section-badge">Live Listings</div>
          <h2>Explore Opportunities</h2>
          <p>Filter by domain, search by technology, or sort by deadline and proximity.</p>
        </div>

        {/* ── SEARCH + SORT TOOLBAR ── */}
        <div className="search-sort-container">
          <div className="search-sort-bar">
            <div className="search-box">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search by title, location, tag (e.g. AI, Web3, Bangalore)…"
                value={searchQuery}
                onChange={handleSearchChange}
                id="search-input"
              />
              {searchQuery && (
                <button className="search-clear-btn" onClick={() => setSearchQuery('')} aria-label="Clear search">✕</button>
              )}
            </div>
            <div className="sort-box">
              <label htmlFor="sort-select">Sort by:</label>
              <select id="sort-select" value={sortBy} onChange={handleSortChange}>
                <option value="deadline">⏳ Deadline (Soonest)</option>
                <option value="newest">✨ Recently Added</option>
                <option value="name">🔤 Name (A–Z)</option>
                <option value="distance">📍 Nearest {!userLocation && '(uses GPS)'}</option>
              </select>
            </div>
          </div>

          {/* ── CATEGORY PILL TABS ── */}
          <div className="category-tabs-wrapper">
            <div className="category-tabs" id="category-tabs">
              {categories.map(cat => (
                <button
                  key={cat.key}
                  className={`category-tab ${activeCategory === cat.key ? 'active' : ''}`}
                  onClick={() => handleCategoryChange(cat.key)}
                >
                  <span className="tab-label">{cat.label}</span>
                  <span className="tab-count">{cat.count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── LISTINGS GRID ── */}
        <div className="hack-list-section">
          {locationError && (
            <div className="notice-box notice--warning">
              <span>📍 {locationError}</span>
            </div>
          )}

          {error && (
            <div className="error-box">
              <h3>Connection Notice</h3>
              <p>{error}</p>
              <button className="btn-primary" onClick={() => fetchHackathons()} style={{ marginTop: '1rem' }}>
                Retry Connection
              </button>
            </div>
          )}

          {/* Upcoming vs Missed Subtabs */}
          {!loading && !error && (upcomingTotal > 0 || missedTotal > 0) && (
            <div className="list-tabs-container">
              <div className="list-tabs">
                <button
                  className={`list-tab ${activeTab === 'upcoming' ? 'active' : ''}`}
                  onClick={() => handleTabChange('upcoming')}
                >
                  🚀 Upcoming Opportunities
                  <span className="tab-count-pill count-green">{upcomingTotal}</span>
                </button>
                <button
                  className={`list-tab ${activeTab === 'missed' ? 'active' : ''}`}
                  onClick={() => handleTabChange('missed')}
                >
                  📁 Past Deadlines
                  <span className="tab-count-pill count-muted">{missedTotal}</span>
                </button>
              </div>
            </div>
          )}

          {/* Skeletons on loading */}
          {loading && (
            <div className="card-grid">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton-card">
                  <div className="skeleton skeleton-banner" />
                  <div className="skeleton-content">
                    <div className="skeleton skeleton-line w-40" />
                    <div className="skeleton skeleton-title" />
                    <div className="skeleton skeleton-line w-60" />
                    <div className="skeleton skeleton-footer" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Hackathons Render */}
          {!loading && !error && hackathons.length > 0 && (
            <>
              <div className="results-meta-bar">
                <span className="results-count">
                  Showing <strong>{hackathons.length}</strong> of <strong>{activeTab === 'upcoming' ? upcomingTotal : missedTotal}</strong> opportunities
                </span>
                <span className="results-page">Page {currentPage} of {totalPages}</span>
              </div>
              <div className="card-grid">
                {hackathons.map(h => (
                  <HackathonCard
                    key={h._id || h.link}
                    hackathon={h}
                    onShare={(title) => showToast(`Copied link for ${title}`)}
                  />
                ))}
              </div>
              <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
            </>
          )}

          {/* Empty States */}
          {!loading && !error && activeTab === 'upcoming' && upcomingTotal === 0 && (
            <div className="empty-state">
              <div className="empty-icon"><EmptySearchIcon /></div>
              <h3>Nothing new right now — check back soon.</h3>
              <p>Or try clearing your filters to see more.</p>
              <button className="btn-secondary" onClick={() => { setSearchQuery(''); setActiveCategory('All'); }} style={{ marginTop: '1rem' }}>
                Reset filters
              </button>
            </div>
          )}

          {!loading && !error && activeTab === 'missed' && missedTotal === 0 && (
            <div className="empty-state">
              <div className="empty-icon"><CheckCircleIcon /></div>
              <h3>Nothing here yet.</h3>
              <p>No past opportunities matched your view.</p>
            </div>
          )}
        </div>
      </section>

      {/* ── ABOUT & MAKER SECTION ── */}
      <section className="about-section" id="about-section" ref={aboutRef}>
        <div className="about-container">
          <div className="about-header">
            <div className="section-badge">
              Platform Creator · 24/7 Autonomous Ingestion Radar
            </div>
            <h2 className="about-title">Built by a Student Builder, for Developers Everywhere.</h2>
            <p className="about-subtitle">
              High-value prize tracks, tier-1 campus competitions, and premier hiring hackathons are scattered across half a dozen platforms, with registration deadlines quietly passing by. 
              Hackathon Notifier runs an autonomous continuous ingestion radar so you never miss another opportunity.
            </p>
          </div>

          {/* ── AUTHENTIC MAKER SHOWCASE CARD ── */}
          <div className="maker-glass-card">
            <div className="maker-glass-glow"></div>
            <div className="maker-main-row">
              <div className="maker-avatar-wrap">
                <div className="maker-avatar-ring"></div>
                <div className="maker-avatar">PD</div>
              </div>
              <div className="maker-meta">
                <div className="maker-badge-row">
                  <span className="maker-badge maker-badge--cyan">Creator &amp; Systems Architect</span>
                  <span className="maker-badge maker-badge--indigo">B.Tech 2nd Year ETC</span>
                  <span className="maker-badge maker-badge--green">Live Ingestion 24/7</span>
                </div>
                <h3 className="maker-name">Pranav Deshmukh</h3>
                <p className="maker-tagline">2nd Year ETC Engineering Student · Full-Stack &amp; Systems Builder</p>
              </div>
            </div>

            <div className="maker-story-glass">
              <p>
                I engineered <strong>Hackathon Notifier</strong> as a 2nd year ETC engineering student to solve a problem every ambitious builder experiences firsthand:
                valuable hackathons, six-figure prize pools, and premier internship opportunities are fragmented across Devfolio, Unstop, Devpost, HackerEarth, and college portals. By the time students hear about them, registration caps have filled or deadlines have quietly expired.
              </p>
              <p>
                This platform is a production-grade autonomous daemon operating 24/7 in the cloud. It indexes opportunities across 5 ecosystems, extracts verified prizes and team caps, identifies premier tier-1 colleges (IIT, NIT, IIIT, BITS), computes spherical GPS proximity, and broadcasts instant alerts to Telegram in under 10 seconds.
              </p>
            </div>

            <div className="maker-stats-strip">
              <div className="maker-stat-box">
                <span className="m-stat-val">5</span>
                <span className="m-stat-lbl">Active Scrapers</span>
              </div>
              <div className="maker-stat-box">
                <span className="m-stat-val">24/7</span>
                <span className="m-stat-lbl">Autonomous Radar</span>
              </div>
              <div className="maker-stat-box">
                <span className="m-stat-val">&lt; 10s</span>
                <span className="m-stat-lbl">Push Broadcast</span>
              </div>
              <div className="maker-stat-box">
                <span className="m-stat-val">100%</span>
                <span className="m-stat-lbl">Community Platform</span>
              </div>
            </div>

            <div className="maker-actions-row">
              <a
                href="https://t.me/Pranavhakathon_bot"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary maker-link-btn"
              >
                <TelegramIcon /> Telegram Alerts Bot
              </a>
              <button
                type="button"
                className="btn-secondary maker-link-btn"
                onClick={() => scrollToSection('events')}
              >
                <DiscoveryIcon /> Explore Live Hackathons
              </button>
              <button
                type="button"
                className="btn-ghost maker-link-btn"
                onClick={() => setShowTechSpecModal(true)}
              >
                System Architecture Spec
              </button>
            </div>
          </div>

          {/* ── INTERACTIVE RADAR STAGES ── */}
          <div className="interactive-radar-card">
            <div className="radar-card-header">
              <div className="radar-status-live">
                <span className="pulse-dot"></span>
                <span className="pulse-ring"></span>
                <span className="radar-status-label">Continuous Radar Pipeline</span>
              </div>
              <span className="radar-step-indicator">Interactive · Tap any phase to inspect telemetry</span>
            </div>

            <div className="radar-tabs">
              {RADAR_STEPS.map((step, idx) => (
                <button
                  key={step.id}
                  className={`radar-tab-btn ${activeStage === idx ? 'active' : ''}`}
                  onClick={() => setActiveStage(idx)}
                >
                  <span className="radar-tab-num">0{idx + 1}</span>
                  <span className="radar-tab-title">{step.title}</span>
                </button>
              ))}
            </div>

            <div className="radar-stage-detail">
              <div className="radar-detail-content">
                <div className="radar-detail-badge">{RADAR_STEPS[activeStage].badge}</div>
                <h3>{RADAR_STEPS[activeStage].headline}</h3>
                <p>{RADAR_STEPS[activeStage].desc}</p>
                <div className="radar-detail-chips">
                  {RADAR_STEPS[activeStage].chips.map((chip, cIdx) => (
                    <span key={cIdx} className="radar-chip">{chip}</span>
                  ))}
                </div>
              </div>
              <div className="radar-detail-visual">
                <div className="radar-visual-terminal">
                  <div className="terminal-header">
                    <div className="terminal-dots">
                      <span></span><span></span><span></span>
                    </div>
                    <span className="terminal-title">radar_dispatch.log</span>
                  </div>
                  <pre className="terminal-body">
                    <code>{RADAR_STEPS[activeStage].terminalLog}</code>
                  </pre>
                </div>
              </div>
            </div>
          </div>

          {/* ── INTERACTIVE DISCOVERY & TELEGRAM SPOTLIGHT ── */}
          <div className="about-interactive-grid">
            {/* Quick Matchmaker */}
            <div className="matchmaker-card">
              <div className="matchmaker-badge">Instant Finder</div>
              <h3>Jump into high-priority opportunities</h3>
              <p>One-click filters that immediately configure your live listings:</p>
              <div className="matchmaker-buttons">
                <button
                  className="quick-filter-btn"
                  onClick={() => handleQuickFilter('prizes')}
                >
                  💰 Highest Cash Pools
                </button>
                <button
                  className="quick-filter-btn"
                  onClick={() => handleQuickFilter('college')}
                >
                  🎓 Premier Colleges (IIT/NIT)
                </button>
                <button
                  className="quick-filter-btn"
                  onClick={() => handleQuickFilter('inperson')}
                >
                  📍 Physical &amp; In-Person Near You
                </button>
                <button
                  className="quick-filter-btn"
                  onClick={() => handleQuickFilter('online')}
                >
                  🌐 100% Online &amp; Remote
                </button>
              </div>
            </div>

            {/* Telegram Spotlight */}
            <div className="telegram-spotlight-card">
              <div className="telegram-card-header">
                <div className="telegram-icon-badge"><TelegramIcon /></div>
                <div>
                  <h4>Zero Noise Telegram Channel</h4>
                  <span>Direct registration links in &lt; 10s</span>
                </div>
              </div>
              <div className="telegram-preview-box">
                <div className="telegram-preview-title">⚡ Live Dispatch Sample</div>
                <div className="telegram-preview-body">
                  <strong>ETHIndia 2026</strong> · Bangalore (In-Person)<br />
                  🏆 Prize Pool: $100,000+ USD<br />
                  ⏳ Registration closes in 4 days
                </div>
              </div>
              <div className="telegram-card-actions">
                <a
                  href="https://t.me/Pranavhakathon_bot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary telegram-join-btn"
                >
                  <TelegramIcon /> Subscribe to Telegram Alerts
                </a>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    if (navigator.clipboard) navigator.clipboard.writeText('@Pranavhakathon_bot');
                    showToast('Copied handle: @Pranavhakathon_bot');
                  }}
                  title="Copy bot handle"
                >
                  Copy Handle
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => setShowTechSpecModal(true)}
                >
                  Architecture Spec
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="app-footer">
        <div className="footer-top">
          <div className="footer-brand">
            <HLogo size={28} />
            <span>Hackathon Notifier</span>
          </div>
          <p className="footer-tagline">Autonomous developer opportunity ingestion &amp; notification platform.</p>
        </div>
        <div className="footer-bottom">
          <span>Crafted &amp; Engineered with pride by <strong>Pranav Deshmukh</strong> · 2nd Year ETC Student</span>
          <div className="footer-nav">
            <a href="#events" onClick={e => { e.preventDefault(); scrollToSection('events'); }}>Events</a>
            <a href="#dashboard" onClick={e => { e.preventDefault(); scrollToSection('dashboard'); }}>Pipeline</a>
            <a href="#about" onClick={e => { e.preventDefault(); scrollToSection('about'); }}>About &amp; Maker</a>
            <button className="footer-spec-link" onClick={() => setShowTechSpecModal(true)}>Architecture Spec</button>
          </div>
        </div>
      </footer>

      {/* ── FLOATING TELEGRAM CTA ── */}
      <a
        href="https://t.me/Pranavhakathon_bot"
        target="_blank"
        rel="noopener noreferrer"
        className="floating-telegram-cta"
        aria-label="Join Telegram Alerts"
      >
        <div className="floating-telegram-icon">
          <TelegramIcon />
        </div>
        <span className="floating-telegram-text">Get Instant Alerts</span>
      </a>

      {/* ── INTERACTIVE TOAST NOTIFICATION ── */}
      {toast.visible && (
        <div className="telex-toast" role="status" aria-live="polite">
          <span className="toast-dot"></span>
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}

export default App;
