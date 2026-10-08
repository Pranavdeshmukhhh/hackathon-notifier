import React, { useState, useEffect, useRef } from 'react';
import Dialog from './Dialog';

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
      logsEndRef.current.scrollIntoView({ behavior: 'auto' });
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
    if (e.currentTarget.querySelector('button[type="submit"]')?.disabled) return;
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
    { label: ' IITs', query: 'iit' },
    { label: ' NITs', query: 'nit' },
    { label: ' IIIT Hyderabad', query: 'iiit hyderabad' },
    { label: ' BITS Pilani', query: 'bits' },
    { label: ' COEP Pune', query: 'coep' },
    { label: ' PICT Pune', query: 'pict' },
    { label: ' VJTI Mumbai', query: 'vjti' },
    { label: ' DTU / NSUT', query: 'dtu' },
  ];

  const cityChannels = [
    { label: ' Pune Tech', query: 'pune' },
    { label: ' Hyderabad Hub', query: 'hyderabad' },
    { label: ' Bengaluru', query: 'bengaluru' },
    { label: ' Mumbai', query: 'mumbai' },
    { label: ' Delhi-NCR', query: 'delhi' },
  ];

  const faangChannels = [
    { label: ' FAANG / MANGO', query: 'faang' },
    { label: ' Google Cloud', query: 'google' },
    { label: ' Amazon AWS', query: 'amazon' },
    { label: ' Meta / Facebook', query: 'meta' },
    { label: ' Microsoft', query: 'microsoft' },
  ];

  return (
    <Dialog label="Scanner status" onClose={onClose}>
        {/* Modal Header */}
        <div className="dialog-heading flex items-center gap-3.5 mb-4 shrink-0">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg sm:text-xl font-semibold text-ink tracking-tight">
                Scanner status
              </h2>
              <span className={`text-[10px] uppercase font-semibold tracking-wider px-2.5 py-0.5 rounded-control flex items-center gap-1.5 border ${
                status.is_scanning
                  ? 'bg-sunken text-warn  border-line'
                  : 'bg-sunken text-ok  border-line'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-control ${status.is_scanning ? 'bg-sunken ' : 'bg-sunken'}`}></span>
                {status.is_scanning ? 'Scanning Internet...' : 'Idle'}
              </span>
            </div>
            <p className="text-xs text-ink-2 mt-0.5">
              Continuously crawls the web for <strong>IIT, NIT, IIIT, Tier-1 Colleges, City Hubs & FAANG</strong> hackathons.
            </p>
          </div>
        </div>

        <p className="mb-4 text-sm text-ink-2" role="note">
          Scanner controls are available to administrators through the authenticated API.
          This public view shows status only.
        </p>

        {/* Telemetry Stats Bar */}
        <div className="grid grid-cols-3 gap-2.5 mb-4 shrink-0">
          <div className="p-2.5 rounded-surface bg-sunken border border-line text-center">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Scanner Mode</div>
            <div className="text-xs sm:text-sm font-semibold text-ink mt-0.5">
              Operator configured
            </div>
          </div>
          <div className="p-2.5 rounded-surface bg-sunken border border-line text-center">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Cycles Run</div>
            <div className="text-xs sm:text-sm font-semibold text-accent-text mt-0.5">
              {status.total_scans_run} Complete
            </div>
          </div>
          <div className="p-2.5 rounded-surface bg-sunken border border-line text-center">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">New Indexed</div>
            <div className="text-xs sm:text-sm font-semibold text-ok mt-0.5">
              +{status.total_new_indexed} Hackathons
            </div>
          </div>
        </div>

        {/* Scrollable Scanner Body */}
        <div className="dialog-body flex-1 space-y-4">

          {/* Action Hero: Instant Full Internet Scan */}
          <div className="p-4 rounded-surface border border-line flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-sm text-ink flex items-center gap-1.5">
                <span> Instant Full Internet Sweep</span>
              </div>
              <p className="text-xs text-ink-2 mt-0.5">
                Crawl Unstop, Devpost & HackerEarth registries across all premier colleges, cities, and tech giants.
              </p>
            </div>
            <button
              onClick={handleTriggerFullSweep}
              disabled
              className="btn btn-ghost"
            >
              {isTriggering || status.is_scanning ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-line border-t-transparent rounded-control animate-spin"></span>
                  Sweeping Internet...
                </>
              ) : (
                <>
                  <span></span> Scan Internet Now
                </>
              )}
            </button>
          </div>

          {/* Instagram Hackathon Scanner */}
          <div className="p-4 rounded-surface border border-line flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-sm text-ink flex items-center gap-1.5">
                <span> Instagram Hackathon Scanner</span>
              </div>
              <p className="text-xs text-ink-2 mt-0.5">
                Scans 20+ hackathon organizer accounts & trending hashtags (#hackathon, #devhack, #hackathonindia) on Instagram. Auto-verifies posts before listing.
              </p>
              {instagramMessage && (
                <div className="btn btn-ghost">
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
              disabled
              className="btn btn-ghost"
            >
              {isInstagramScanning ? (
                <>
                  <span className="btn btn-ghost"></span>
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
          <div className="p-4 rounded-surface border border-line flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-sm text-ink flex items-center gap-1.5">
                <span> Open Internet Discovery</span>
              </div>
              <p className="text-xs text-ink-2 mt-0.5">
                Searches Google, MLH, Eventbrite & KonfHub for hackathons across India. Extracts metadata & auto-verifies legitimacy before listing.
              </p>
              {webDiscoveryMessage && (
                <div className={`mt-2 text-xs font-medium ${webDiscoveryMessage.type === 'success' ? 'text-ok ' : 'text-bad '}`}>
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
              disabled
              className="btn btn-ghost"
            >
              {isWebDiscovering ? (
                <>
                  <span className="btn btn-ghost"></span>
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
            <div className="text-xs font-semibold text-ink-2 flex items-center justify-between">
              <span> Targeted College / City Web Scanner</span>
              <span className="text-[11px] text-muted font-normal">Scans internet on demand</span>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (e.currentTarget.querySelector('button[type="submit"]')?.disabled) return;
                handleTriggerTargeted(targetKeyword);
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={targetKeyword}
                onChange={(e) => setTargetKeyword(e.target.value)}
                placeholder="Enter college or city (e.g. COEP Pune, IIIT Hyderabad, BITS, Mumbai, VJTI)..."
                className="flex-1 px-3.5 py-2.5 rounded-surface bg-sunken border border-line text-xs sm:text-sm text-ink placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
              />
              <button
                type="submit"
                disabled
                className="btn btn-ghost"
              >
                 Scan Keyword
              </button>
            </form>
          </div>

          {/* Monitored Channels Clusters */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-ink-2">
               Monitored Internet Channels <span className="font-normal text-muted">(Administrator access required)</span>:
            </div>

            {/* Colleges */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                 Premier Colleges
              </div>
              <div className="flex flex-wrap gap-1.5">
                {collegeChannels.map((c) => (
                  <button
                    key={c.query}
                    onClick={() => handleTriggerTargeted(c.query)}
                    disabled
                    className="btn btn-ghost"
                    title={`Scan internet for ${c.label}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* City Hubs */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                 City Tech Hubs
              </div>
              <div className="flex flex-wrap gap-1.5">
                {cityChannels.map((c) => (
                  <button
                    key={c.query}
                    onClick={() => handleTriggerTargeted(c.query)}
                    disabled
                    className="btn btn-ghost"
                    title={`Scan internet for ${c.label}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* FAANG / Big Tech */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                 FAANG & Big Tech
              </div>
              <div className="flex flex-wrap gap-1.5">
                {faangChannels.map((c) => (
                  <button
                    key={c.query}
                    onClick={() => handleTriggerTargeted(c.query)}
                    disabled
                    className="btn btn-ghost"
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
            <div className="p-3 rounded-surface bg-sunken border border-line text-ok text-xs font-medium flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span></span>
                <span>{scanMessage}</span>
              </div>
              <button
                onClick={() => {
                  onClose();
                  if (onSuccess) onSuccess();
                }}
                className="btn btn-ghost"
              >
                View in Radar
              </button>
            </div>
          )}

          {scanError && (
            <div className="p-3 rounded-surface bg-sunken border border-line text-bad text-xs font-medium flex items-center gap-2">
              <span></span>
              <span>{scanError}</span>
            </div>
          )}

          {/* Real-time Crawler Console / Logs Window */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-control bg-sunken"></span>
                Live Crawler Console Logs
              </span>
              <span>{status.last_scan_logs?.length || 0} entries</span>
            </div>
            <div className="p-3 rounded-surface bg-sunken border border-line text-muted font-mono text-[11px] leading-relaxed max-h-40 overflow-y-auto space-y-1">
              {status.last_scan_logs && status.last_scan_logs.length > 0 ? (
                status.last_scan_logs.map((log, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="text-accent-text select-none">›</span>
                    <span className={log.includes('New indexed') || log.includes('complete') ? 'text-ok font-semibold' : 'text-muted'}>
                      {log}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-muted italic">
                  Daemon is in standby. Ready to sweep college & city channels on schedule or demand.
                </div>
              )}
              <div ref={logsEndRef} />
            </div>
          </div>

          {/* Collapsible: Direct URL 1-Click Auto-Extractor */}
          <div className="pt-2 border-t border-line">
            <button
              type="button"
              onClick={() => setShowDirectUrlTab(!showDirectUrlTab)}
              className="btn btn-ghost"
            >
              <span className="flex items-center gap-1.5">
                <span></span> Have an exact hackathon link? 1-Click URL Auto-Extractor
              </span>
              <span>{showDirectUrlTab ? '▲' : '▼'}</span>
            </button>

            {showDirectUrlTab && (
              <form onSubmit={handleDirectUrlExtract} className="mt-2.5 p-3 rounded-surface bg-sunken border border-line space-y-2">
                <div className="text-[11px] text-muted">
                  Adding events from a URL requires administrator access through the authenticated API.
                </div>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={directUrl}
                    onChange={(e) => setDirectUrl(e.target.value)}
                    placeholder="https://unstop.com/hackathons/... or https://devpost.com/..."
                    className="flex-1 px-3 py-2 rounded-surface bg-sunken border border-line text-xs text-ink placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
                  />
                  <button
                    type="submit"
                    disabled
                    className="btn btn-ghost"
                  >
                    {isUrlExtracting ? 'Extracting...' : 'Auto-Extract & Add'}
                  </button>
                </div>
                {urlMessage && (
                  <div className="btn btn-ghost">
                    {urlMessage.text}
                  </div>
                )}
              </form>
            )}
          </div>

        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between pt-3 mt-3 border-t border-line shrink-0 text-xs">
          <div className="text-muted text-[11px]">
            {status.last_scanned_at ? `Last sweep: ${new Date(status.last_scanned_at).toLocaleTimeString()}` : 'No scan recorded'}
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost"
          >
            Close Radar Console
          </button>
        </div>

    </Dialog>
  );
}
