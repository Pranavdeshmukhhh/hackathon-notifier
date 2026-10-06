import React, { useState, useEffect, useRef } from 'react';

/**
 * Autonomous Internet Scanner Hub (formerly AutoListModal).
 * Continuously and autonomously sweeps the internet for hackathons matching
 * Premier Colleges (IIT, NIT, IIIT, BITS, COEP, PICT), City Tech Hubs (Pune, Hyderabad, Bengaluru),
 * and FAANG/MANGO feeds, deduplicating and indexing directly into MongoDB.
 */
export default function AutoListModal({ onClose, onSuccess, apiBase }) {
  const [status, setStatus] = useState({
    is_scanning: false,
    last_scanned_at: null,
    total_scans_run: 0,
    total_new_indexed: 0,
    active_keywords: { colleges: [], cities: [], faang: [] },
    last_scan_logs: [],
  });

  const [targetKeyword, setTargetKeyword] = useState('');
  const [isTriggering, setIsTriggering] = useState(false);
  const [scanMessage, setScanMessage] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [directUrl, setDirectUrl] = useState('');
  const [isUrlExtracting, setIsUrlExtracting] = useState(false);
  const [urlMessage, setUrlMessage] = useState(null);
  const [showDirectUrlTab, setShowDirectUrlTab] = useState(false);
  const [isInstagramScanning, setIsInstagramScanning] = useState(false);
  const [instagramMessage, setInstagramMessage] = useState(null);
  const [isWebDiscovering, setIsWebDiscovering] = useState(false);
  const [webDiscoveryMessage, setWebDiscoveryMessage] = useState(null);

  const logsEndRef = useRef(null);

  // Derive root API url
  const resolvedBase = apiBase
    ? apiBase.replace(/\/api\/hackathons\/?$/, '')
    : (import.meta.env.PROD ? 'https://hackathon-notifier.onrender.com' : 'http://localhost:8000');

  // Close on Escape key
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  // Fetch scanner telemetry
  const fetchStatus = React.useCallback(async () => {
    try {
      const res = await fetch(`${resolvedBase}/api/scanner/status`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // Silent error fallback
    }
  }, [resolvedBase]);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      if (!ignore) {
        await fetchStatus();
      }
    };
    load();
    const interval = setInterval(load, 3000);
    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, [fetchStatus]);

  // Auto scroll logs
  useEffect(() => {
    if (logsEndRef.current && typeof logsEndRef.current.scrollIntoView === 'function') {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [status.last_scan_logs]);

  // Trigger Full Internet Sweep
  const handleTriggerFullSweep = async () => {
    setIsTriggering(true);
    setScanError(null);
    setScanMessage('Initiating full autonomous internet sweep across all channels...');

    try {
      const res = await fetch(`${resolvedBase}/api/scanner/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setScanMessage(data.message || `Sweep completed: indexed ${data.new_indexed} new events!`);
        if (onSuccess) onSuccess();
        fetchStatus();
      } else {
        setScanError(data.message || 'Scanner busy or sweep encountered an issue.');
      }
    } catch {
      setScanError('Network error connecting to internet scanner daemon.');
    } finally {
      setIsTriggering(false);
      fetchStatus();
    }
  };

  // Trigger Targeted Keyword Sweep (e.g. "COEP Pune", "IIIT Hyderabad")
  const handleTriggerTargeted = async (kw) => {
    const query = (kw || targetKeyword).trim();
    if (!query) return;

    setIsTriggering(true);
    setScanError(null);
    setScanMessage(`Scanning internet for '${query}'...`);

    try {
      const res = await fetch(`${resolvedBase}/api/scanner/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: [query], max_per_keyword: 10 }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setScanMessage(data.message || `Found ${data.total_found} events for '${query}' (${data.new_indexed} new indexed).`);
        if (onSuccess) onSuccess();
        fetchStatus();
      } else {
        setScanError(data.message || `Could not complete scan for '${query}'.`);
      }
    } catch {
      setScanError(`Network error scanning for '${query}'.`);
    } finally {
      setIsTriggering(false);
      fetchStatus();
    }
  };

  // 1-Click URL Auto-Extractor for direct links
  const handleDirectUrlExtract = async (e) => {
    e.preventDefault();
    if (!directUrl.trim()) return;

    setIsUrlExtracting(true);
    setUrlMessage(null);
    try {
      const res = await fetch(`${resolvedBase}/api/hackathons/auto-list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          link: directUrl.trim(),
          title: 'Auto-Discovered Hackathon',
          fetch_metadata: true,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUrlMessage({
          type: 'success',
          text: `Successfully indexed: ${data.data.title} (${data.data.mode || 'Virtual'})!`,
        });
        setDirectUrl('');
        if (onSuccess) onSuccess();
      } else {
        setUrlMessage({
          type: 'error',
          text: data.message || 'Failed to auto-extract from URL.',
        });
      }
    } catch {
      setUrlMessage({
        type: 'error',
        text: 'Network error connecting to radar extractor.',
      });
    } finally {
      setIsUrlExtracting(false);
    }
  };

  const collegeChannels = [
    { label: '🏛️ IITs', query: 'iit' },
    { label: '🎓 NITs', query: 'nit' },
    { label: '🏛️ IIIT Hyderabad', query: 'iiit hyderabad' },
    { label: '⚡ BITS Pilani', query: 'bits' },
    { label: '🏢 COEP Pune', query: 'coep' },
    { label: '💻 PICT Pune', query: 'pict' },
    { label: '🏫 VJTI Mumbai', query: 'vjti' },
    { label: '🏛️ DTU / NSUT', query: 'dtu' },
  ];

  const cityChannels = [
    { label: '🏙️ Pune Tech', query: 'pune' },
    { label: '🌆 Hyderabad Hub', query: 'hyderabad' },
    { label: '🚀 Bengaluru', query: 'bengaluru' },
    { label: '🌊 Mumbai', query: 'mumbai' },
    { label: '🏛️ Delhi-NCR', query: 'delhi' },
  ];

  const faangChannels = [
    { label: '🔥 FAANG / MANGO', query: 'faang' },
    { label: '🌐 Google Cloud', query: 'google' },
    { label: '☁️ Amazon AWS', query: 'amazon' },
    { label: '♾️ Meta / Facebook', query: 'meta' },
    { label: '💻 Microsoft', query: 'microsoft' },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-md overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white/95 dark:bg-[#18181B]/95 backdrop-blur-2xl border border-black/[0.1] dark:border-white/[0.12] rounded-[20px] sm:rounded-[24px] p-4 sm:p-7 w-full max-w-3xl shadow-2xl relative my-auto animate-sheet-pop max-h-[94dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Autonomous Internet Scanner"
      >
        {/* Close Button */}
        <button
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-black/[0.05] dark:bg-white/[0.10] text-slate-500 dark:text-slate-400 hover:bg-black/[0.10] dark:hover:bg-white/[0.15] transition-colors cursor-pointer z-10"
          onClick={onClose}
          aria-label="Close dialog"
        >
          ✕
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3.5 mb-4 shrink-0">
          <div className="relative w-12 h-12 rounded-[14px] bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 flex items-center justify-center shadow-lg text-white font-bold text-xl shrink-0">
            <span className="relative z-10">🌐</span>
            <span className="absolute -inset-1 rounded-[16px] bg-blue-500/20 animate-pulse pointer-events-none"></span>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
                Autonomous Internet Scanner
              </h2>
              <span className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full flex items-center gap-1.5 border ${
                status.is_scanning
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${status.is_scanning ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`}></span>
                {status.is_scanning ? 'Scanning Internet...' : '24/7 Daemon Active'}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Continuously crawls the web for <strong>IIT, NIT, IIIT, Tier-1 Colleges, City Hubs & FAANG</strong> hackathons.
            </p>
          </div>
        </div>

        {/* Telemetry Stats Bar */}
        <div className="grid grid-cols-3 gap-2.5 mb-4 shrink-0">
          <div className="p-2.5 rounded-[14px] bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] text-center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Scanner Mode</div>
            <div className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200 mt-0.5">
              Continuous (2h Loop)
            </div>
          </div>
          <div className="p-2.5 rounded-[14px] bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] text-center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Cycles Run</div>
            <div className="text-xs sm:text-sm font-black text-[#007AFF] dark:text-[#0A84FF] mt-0.5">
              {status.total_scans_run} Complete
            </div>
          </div>
          <div className="p-2.5 rounded-[14px] bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] text-center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">New Indexed</div>
            <div className="text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
              +{status.total_new_indexed} Hackathons
            </div>
          </div>
        </div>

        {/* Scrollable Scanner Body */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">

          {/* Action Hero: Instant Full Internet Scan */}
          <div className="p-4 rounded-[18px] bg-gradient-to-r from-blue-900/10 via-indigo-900/10 to-violet-900/10 dark:from-blue-950/30 dark:via-indigo-950/30 dark:to-violet-950/30 border border-blue-500/20 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>⚡ Instant Full Internet Sweep</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Crawl Unstop, Devpost & HackerEarth registries across all premier colleges, cities, and tech giants.
              </p>
            </div>
            <button
              onClick={handleTriggerFullSweep}
              disabled={isTriggering || status.is_scanning}
              className={`shrink-0 px-4 py-2.5 rounded-[12px] font-bold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer ${
                isTriggering || status.is_scanning
                  ? 'bg-slate-400 text-white cursor-not-allowed opacity-80'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/25 active:scale-95'
              }`}
            >
              {isTriggering || status.is_scanning ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  Sweeping Internet...
                </>
              ) : (
                <>
                  <span>🚀</span> Scan Internet Now
                </>
              )}
            </button>
          </div>

          {/* Instagram Hackathon Scanner */}
          <div className="p-4 rounded-[18px] bg-gradient-to-r from-[#F58529]/10 via-[#DD2A7B]/10 to-[#8134AF]/10 dark:from-[#F58529]/15 dark:via-[#DD2A7B]/15 dark:to-[#8134AF]/15 border border-[#DD2A7B]/20 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>📸 Instagram Hackathon Scanner</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Scans 20+ hackathon organizer accounts & trending hashtags (#hackathon, #devhack, #hackathonindia) on Instagram. Auto-verifies posts before listing.
              </p>
              {instagramMessage && (
                <div className={`mt-2 text-xs font-medium ${instagramMessage.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {instagramMessage.text}
                </div>
              )}
            </div>
            <button
              onClick={async () => {
                setIsInstagramScanning(true);
                setInstagramMessage(null);
                try {
                  const res = await fetch(`${resolvedBase}/api/scanner/instagram`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({}),
                  });
                  const data = await res.json();
                  if (res.ok && data.success) {
                    setInstagramMessage({ type: 'success', text: data.message || `Found ${data.total_found} posts, indexed ${data.new_indexed} new.` });
                    if (onSuccess) onSuccess();
                    fetchStatus();
                  } else {
                    setInstagramMessage({ type: 'error', text: data.message || 'Instagram scan encountered an issue.' });
                  }
                } catch {
                  setInstagramMessage({ type: 'error', text: 'Network error connecting to Instagram scanner.' });
                } finally {
                  setIsInstagramScanning(false);
                }
              }}
              disabled={isInstagramScanning || isTriggering}
              className={`w-full sm:w-auto justify-center shrink-0 px-4 py-2.5 rounded-[12px] font-bold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer ${
                isInstagramScanning
                  ? 'bg-slate-400 text-white cursor-not-allowed opacity-80'
                  : 'bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF] hover:from-[#E07420] hover:via-[#CC1E6C] hover:to-[#7029A0] text-white shadow-[#DD2A7B]/25 active:scale-95'
              }`}
            >
              {isInstagramScanning ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  Scanning IG...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                  </svg>
                  Scan Instagram
                </>
              )}
            </button>
          </div>

          {/* Web Discovery Scanner */}
          <div className="p-4 rounded-[18px] bg-gradient-to-r from-emerald-900/10 via-teal-900/10 to-cyan-900/10 dark:from-emerald-950/30 dark:via-teal-950/30 dark:to-cyan-950/30 border border-emerald-500/20 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>🌐 Open Internet Discovery</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Searches Google, MLH, Eventbrite & KonfHub for hackathons across India. Extracts metadata & auto-verifies legitimacy before listing.
              </p>
              {webDiscoveryMessage && (
                <div className={`mt-2 text-xs font-medium ${webDiscoveryMessage.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {webDiscoveryMessage.text}
                </div>
              )}
            </div>
            <button
              onClick={async () => {
                setIsWebDiscovering(true);
                setWebDiscoveryMessage(null);
                try {
                  const res = await fetch(`${resolvedBase}/api/scanner/web-discovery`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({}),
                  });
                  const data = await res.json();
                  if (res.ok && data.success) {
                    setWebDiscoveryMessage({ type: 'success', text: data.message || `Found ${data.total_found} events, indexed ${data.new_indexed} new.` });
                    if (onSuccess) onSuccess();
                    fetchStatus();
                  } else {
                    setWebDiscoveryMessage({ type: 'error', text: data.message || 'Web discovery encountered an issue.' });
                  }
                } catch {
                  setWebDiscoveryMessage({ type: 'error', text: 'Network error connecting to web discovery engine.' });
                } finally {
                  setIsWebDiscovering(false);
                }
              }}
              disabled={isWebDiscovering || isTriggering}
              className={`w-full sm:w-auto justify-center shrink-0 px-4 py-2.5 rounded-[12px] font-bold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer ${
                isWebDiscovering
                  ? 'bg-slate-400 text-white cursor-not-allowed opacity-80'
                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-500/25 active:scale-95'
              }`}
            >
              {isWebDiscovering ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  Discovering...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  Discover from Web
                </>
              )}
            </button>
          </div>

          {/* Targeted College / City Search Bar */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
              <span>🎯 Targeted College / City Web Scanner</span>
              <span className="text-[11px] text-slate-500 font-normal">Scans internet on demand</span>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleTriggerTargeted(targetKeyword);
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={targetKeyword}
                onChange={(e) => setTargetKeyword(e.target.value)}
                placeholder="Enter college or city (e.g. COEP Pune, IIIT Hyderabad, BITS, Mumbai, VJTI)..."
                className="flex-1 px-3.5 py-2.5 rounded-[12px] bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.12] text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
              />
              <button
                type="submit"
                disabled={isTriggering || status.is_scanning || !targetKeyword.trim()}
                className="px-4 py-2.5 rounded-[12px] bg-[#007AFF] hover:bg-[#0066D6] dark:bg-[#0A84FF] text-white text-xs font-bold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
              >
                🔍 Scan Keyword
              </button>
            </form>
          </div>

          {/* Monitored Channels Clusters */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
              📡 Monitored Internet Channels <span className="font-normal text-slate-500">(Click to scan channel now)</span>:
            </div>

            {/* Colleges */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                🏛️ Premier Colleges
              </div>
              <div className="flex flex-wrap gap-1.5">
                {collegeChannels.map((c) => (
                  <button
                    key={c.query}
                    onClick={() => handleTriggerTargeted(c.query)}
                    disabled={isTriggering || status.is_scanning}
                    className="px-2.5 py-1.5 rounded-[10px] text-xs font-medium bg-black/[0.04] dark:bg-white/[0.06] hover:bg-blue-500/15 hover:text-blue-600 dark:hover:text-blue-400 border border-black/[0.06] dark:border-white/[0.08] transition-colors cursor-pointer active:scale-95 disabled:opacity-50"
                    title={`Scan internet for ${c.label}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* City Hubs */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                🏙️ City Tech Hubs
              </div>
              <div className="flex flex-wrap gap-1.5">
                {cityChannels.map((c) => (
                  <button
                    key={c.query}
                    onClick={() => handleTriggerTargeted(c.query)}
                    disabled={isTriggering || status.is_scanning}
                    className="px-2.5 py-1.5 rounded-[10px] text-xs font-medium bg-black/[0.04] dark:bg-white/[0.06] hover:bg-emerald-500/15 hover:text-emerald-600 dark:hover:text-emerald-400 border border-black/[0.06] dark:border-white/[0.08] transition-colors cursor-pointer active:scale-95 disabled:opacity-50"
                    title={`Scan internet for ${c.label}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* FAANG / Big Tech */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                🚀 FAANG & Big Tech
              </div>
              <div className="flex flex-wrap gap-1.5">
                {faangChannels.map((c) => (
                  <button
                    key={c.query}
                    onClick={() => handleTriggerTargeted(c.query)}
                    disabled={isTriggering || status.is_scanning}
                    className="px-2.5 py-1.5 rounded-[10px] text-xs font-medium bg-black/[0.04] dark:bg-white/[0.06] hover:bg-amber-500/15 hover:text-amber-600 dark:hover:text-amber-400 border border-black/[0.06] dark:border-white/[0.08] transition-colors cursor-pointer active:scale-95 disabled:opacity-50"
                    title={`Scan internet for ${c.label}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Feedback Messages */}
          {scanMessage && (
            <div className="p-3 rounded-[12px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-medium flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span>✓</span>
                <span>{scanMessage}</span>
              </div>
              <button
                onClick={() => {
                  onClose();
                  if (onSuccess) onSuccess();
                }}
                className="px-2.5 py-1 rounded-[8px] bg-emerald-600 text-white font-bold text-[11px] hover:bg-emerald-700 cursor-pointer shrink-0"
              >
                View in Radar
              </button>
            </div>
          )}

          {scanError && (
            <div className="p-3 rounded-[12px] bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs font-medium flex items-center gap-2">
              <span>⚠️</span>
              <span>{scanError}</span>
            </div>
          )}

          {/* Real-time Crawler Console / Logs Window */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Live Crawler Console Logs
              </span>
              <span>{status.last_scan_logs?.length || 0} entries</span>
            </div>
            <div className="p-3 rounded-[14px] bg-[#0F172A] border border-slate-800 text-slate-300 font-mono text-[11px] leading-relaxed max-h-40 overflow-y-auto space-y-1 shadow-inner">
              {status.last_scan_logs && status.last_scan_logs.length > 0 ? (
                status.last_scan_logs.map((log, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="text-blue-400 select-none">›</span>
                    <span className={log.includes('New indexed') || log.includes('complete') ? 'text-emerald-400 font-semibold' : 'text-slate-300'}>
                      {log}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-slate-500 italic">
                  Daemon is in standby. Ready to sweep college & city channels on schedule or demand.
                </div>
              )}
              <div ref={logsEndRef} />
            </div>
          </div>

          {/* Collapsible: Direct URL 1-Click Auto-Extractor */}
          <div className="pt-2 border-t border-black/[0.06] dark:border-white/[0.08]">
            <button
              type="button"
              onClick={() => setShowDirectUrlTab(!showDirectUrlTab)}
              className="w-full flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer py-1"
            >
              <span className="flex items-center gap-1.5">
                <span>🔗</span> Have an exact hackathon link? 1-Click URL Auto-Extractor
              </span>
              <span>{showDirectUrlTab ? '▲' : '▼'}</span>
            </button>

            {showDirectUrlTab && (
              <form onSubmit={handleDirectUrlExtract} className="mt-2.5 p-3 rounded-[14px] bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] space-y-2">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Paste any Devpost, Unstop, Devfolio, or university website link. Our AI will automatically scrape title, dates, tags, and insert it into MongoDB.
                </div>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={directUrl}
                    onChange={(e) => setDirectUrl(e.target.value)}
                    placeholder="https://unstop.com/hackathons/... or https://devpost.com/..."
                    className="flex-1 px-3 py-2 rounded-[10px] bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.12] text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
                  />
                  <button
                    type="submit"
                    disabled={isUrlExtracting || !directUrl.trim()}
                    className="px-3.5 py-2 rounded-[10px] bg-[#007AFF] hover:bg-[#0066D6] dark:bg-[#0A84FF] text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    {isUrlExtracting ? 'Extracting...' : 'Auto-Extract & Add'}
                  </button>
                </div>
                {urlMessage && (
                  <div className={`text-xs mt-1 font-medium ${urlMessage.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {urlMessage.text}
                  </div>
                )}
              </form>
            )}
          </div>

        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between pt-3 mt-3 border-t border-black/[0.06] dark:border-white/[0.08] shrink-0 text-xs">
          <div className="text-slate-500 dark:text-slate-400 text-[11px]">
            {status.last_scanned_at ? `Last sweep: ${new Date(status.last_scanned_at).toLocaleTimeString()}` : 'Continuous sweep active'}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-[12px] bg-black/[0.05] dark:bg-white/[0.10] hover:bg-black/[0.10] dark:hover:bg-white/[0.15] text-slate-700 dark:text-slate-200 font-semibold cursor-pointer transition-colors"
          >
            Close Radar Console
          </button>
        </div>

      </div>
    </div>
  );
}
