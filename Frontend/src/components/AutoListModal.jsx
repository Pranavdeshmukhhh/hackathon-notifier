import React, { useState, useEffect } from 'react';

/**
 * AutoListModal — Interactive submission and auto-discovery modal.
 * Allows organizers, developers, and students to auto-extract and list any hackathon
 * directly into the live radar database with automated classification & geocoding.
 */
export default function AutoListModal({ onClose, onSuccess, apiBase }) {
  const [link, setLink] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [source, setSource] = useState('');
  const [mode, setMode] = useState('Virtual');
  const [location, setLocation] = useState('Online');
  const [deadline, setDeadline] = useState('');
  const [prize, setPrize] = useState('');
  const [tags, setTags] = useState([]);
  const [customTag, setCustomTag] = useState('');

  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submittedData, setSubmittedData] = useState(null);

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

  // Derive root API url
  const resolvedBase = apiBase
    ? apiBase.replace(/\/api\/hackathons\/?$/, '')
    : (import.meta.env.PROD ? 'https://hackathon-notifier.onrender.com' : 'http://localhost:8000');

  const handleExtract = async () => {
    if (!link.trim()) {
      setExtractError('Please enter a hackathon URL first.');
      return;
    }
    setExtractError(null);
    setIsExtracting(true);

    try {
      const res = await fetch(`${resolvedBase}/api/hackathons/preview-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: link.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.title) setTitle(data.title);
        if (data.desc) setDesc(data.desc);
        if (data.source) setSource(data.source);
        if (data.mode) setMode(data.mode);
        if (data.location) setLocation(data.location);
        if (data.tags && data.tags.length > 0) {
          setTags((prev) => Array.from(new Set([...prev, ...data.tags])));
        }
      } else {
        setExtractError(data.message || 'Could not auto-extract metadata. You can fill details manually.');
      }
    } catch {
      setExtractError('Extraction network timeout. You can enter details manually.');
    } finally {
      setIsExtracting(false);
    }
  };

  const toggleTag = (tag) => {
    const t = tag.toLowerCase().trim();
    if (tags.includes(t)) {
      setTags(tags.filter((x) => x !== t));
    } else {
      setTags([...tags, t]);
    }
  };

  const handleAddCustomTag = (e) => {
    e.preventDefault();
    if (!customTag.trim()) return;
    const t = customTag.toLowerCase().trim();
    if (!tags.includes(t)) {
      setTags([...tags, t]);
    }
    setCustomTag('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!link.trim()) {
      setSubmitError('Hackathon URL is required.');
      return;
    }
    if (!title.trim()) {
      setSubmitError('Hackathon title is required.');
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const payload = {
        link: link.trim(),
        title: title.trim(),
        desc: desc.trim(),
        source: source.trim() || undefined,
        mode: mode,
        location: location.trim(),
        deadline: deadline.trim() || undefined,
        prize: prize.trim() || undefined,
        tags: tags,
        fetch_metadata: false, // user already reviewed or extracted
      };

      const res = await fetch(`${resolvedBase}/api/hackathons/auto-list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setSubmittedData(data.data);
        if (onSuccess) onSuccess(data.data);
      } else {
        setSubmitError(data.message || 'Failed to list hackathon. Please try again.');
      }
    } catch {
      setSubmitError('Network failure connecting to radar API.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const quickPresets = [
    { label: '🔥 FAANG / MANGO', tag: 'faang' },
    { label: '🏛️ IIIT Hyderabad', tag: 'iiit' },
    { label: '🏙️ Pune Tech', tag: 'pune' },
    { label: '🎓 IIT / NIT', tag: 'iit' },
    { label: '🤖 AI / ML', tag: 'ai' },
    { label: '⛓️ Web3', tag: 'web3' },
    { label: '💼 Internship', tag: 'internship' },
    { label: '🌱 Beginner', tag: 'beginner' },
  ];

  const quickLocations = [
    'Pune, Maharashtra, India',
    'Hyderabad, Telangana, India',
    'Bengaluru, Karnataka, India',
    'Mumbai, Maharashtra, India',
    'New Delhi, Delhi, India',
    'Online',
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-black/50 backdrop-blur-md overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-2xl border border-black/[0.08] dark:border-white/[0.12] rounded-[24px] p-5 sm:p-7 w-full max-w-2xl shadow-2xl relative my-auto animate-sheet-pop max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Auto-List Hackathon"
      >
        {/* Close Button */}
        <button
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-black/[0.05] dark:bg-white/[0.10] text-slate-500 dark:text-slate-400 hover:bg-black/[0.10] dark:hover:bg-white/[0.15] transition-colors cursor-pointer"
          onClick={onClose}
          aria-label="Close dialog"
        >
          ✕
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3.5 mb-4 shrink-0">
          <div className="w-11 h-11 rounded-[12px] bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-sm text-white font-bold text-lg shrink-0">
            ⚡
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              Auto-List Hackathon
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Live Radar
              </span>
            </h2>
            <p className="text-xs font-semibold text-[#007AFF] dark:text-[#0A84FF]">
              Instant discovery & auto-enrichment engine for student hackathons
            </p>
          </div>
        </div>

        {/* SUCCESS VIEW */}
        {submittedData ? (
          <div className="py-6 px-4 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-3xl shadow-inner">
              ✓
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Hackathon Successfully Listed!
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
              <strong>{submittedData.title}</strong> has been classified, geocoded, and added to the radar feed.
            </p>
            <div className="p-4 rounded-[16px] bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] text-left text-xs space-y-1.5 max-w-md mx-auto">
              <div className="flex justify-between">
                <span className="text-slate-500">Mode:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{submittedData.mode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Location:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{submittedData.location || 'Online'}</span>
              </div>
              {submittedData.college_type && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Tier:</span>
                  <span className="font-bold text-[#007AFF] dark:text-[#0A84FF]">{submittedData.college_type} ({submittedData.college_name || 'Top Tier'})</span>
                </div>
              )}
              {submittedData.lat && submittedData.lng && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Geocoded GPS:</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400">✓ {submittedData.lat.toFixed(4)}, {submittedData.lng.toFixed(4)}</span>
                </div>
              )}
            </div>
            <div className="flex justify-center gap-3 pt-2">
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-[12px] bg-[#007AFF] hover:bg-[#0066D6] dark:bg-[#0A84FF] dark:hover:bg-[#0077ED] text-white text-xs font-bold shadow-md cursor-pointer transition-all"
              >
                Done / Explore in Feed
              </button>
              <button
                onClick={() => {
                  setSubmittedData(null);
                  setLink('');
                  setTitle('');
                  setDesc('');
                  setTags([]);
                }}
                className="px-4 py-2.5 rounded-[12px] bg-black/[0.05] dark:bg-white/[0.08] text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-black/[0.1] transition-all cursor-pointer"
              >
                + List Another
              </button>
            </div>
          </div>
        ) : (
          /* FORM VIEW */
          <form onSubmit={handleSubmit} className="overflow-y-auto pr-1 space-y-4 text-xs">
            {/* Auto-Extract URL Box */}
            <div className="p-3.5 rounded-[16px] bg-gradient-to-br from-amber-500/[0.06] via-orange-500/[0.04] to-transparent border border-amber-500/20">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 mb-1.5">
                ⚡ 1-Click URL Auto-Extractor
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="Paste URL (Unstop, Devpost, Devfolio, MLH, college portal...)"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-[10px] bg-white dark:bg-[#2C2C2E] border border-black/[0.1] dark:border-white/[0.15] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
                  required
                />
                <button
                  type="button"
                  onClick={handleExtract}
                  disabled={isExtracting}
                  className="px-3.5 py-2 rounded-[10px] bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold text-xs shrink-0 shadow-sm disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {isExtracting ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      Extracting…
                    </>
                  ) : (
                    '⚡ Auto-Fill'
                  )}
                </button>
              </div>
              {extractError && (
                <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                  {extractError}
                </p>
              )}
            </div>

            {/* Title & Platform */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Hackathon Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Pune Techathon 2026 or Megathon"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-[10px] bg-white dark:bg-[#2C2C2E] border border-black/[0.1] dark:border-white/[0.15] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
                  required
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Platform / Source
                </label>
                <input
                  type="text"
                  placeholder="e.g. Devfolio, Unstop"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full px-3 py-2 rounded-[10px] bg-white dark:bg-[#2C2C2E] border border-black/[0.1] dark:border-white/[0.15] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
                />
              </div>
            </div>

            {/* Mode & Location */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Event Format / Mode
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {['Virtual', 'Offline', 'Hybrid'].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setMode(m);
                        if (m === 'Virtual' && (!location || location === 'Online')) {
                          setLocation('Online');
                        }
                      }}
                      className={`py-1.5 px-2 rounded-[8px] font-semibold text-xs transition-all cursor-pointer ${
                        mode.toLowerCase() === m.toLowerCase()
                          ? 'bg-[#007AFF] text-white shadow-xs'
                          : 'bg-black/[0.04] dark:bg-white/[0.08] text-slate-700 dark:text-slate-300 hover:bg-black/[0.08]'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  City / Venue Location
                </label>
                <input
                  type="text"
                  placeholder="e.g. Pune, Maharashtra or Online"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3 py-2 rounded-[10px] bg-white dark:bg-[#2C2C2E] border border-black/[0.1] dark:border-white/[0.15] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {quickLocations.map((loc) => (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => setLocation(loc)}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.08] text-slate-600 dark:text-slate-300 hover:bg-[#007AFF]/15 hover:text-[#007AFF] transition-colors cursor-pointer"
                    >
                      {loc.split(',')[0]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Deadline & Prize */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Registration Deadline
                </label>
                <input
                  type="text"
                  placeholder="e.g. 2026-10-31 or Oct 31, 2026"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full px-3 py-2 rounded-[10px] bg-white dark:bg-[#2C2C2E] border border-black/[0.1] dark:border-white/[0.15] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Prize Pool
                </label>
                <input
                  type="text"
                  placeholder="e.g. ₹5,00,000 or $10,000"
                  value={prize}
                  onChange={(e) => setPrize(e.target.value)}
                  className="w-full px-3 py-2 rounded-[10px] bg-white dark:bg-[#2C2C2E] border border-black/[0.1] dark:border-white/[0.15] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
                />
              </div>
            </div>

            {/* Quick Tag Badges */}
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Categories & Technology Tags
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {quickPresets.map((p) => {
                  const active = tags.includes(p.tag);
                  return (
                    <button
                      key={p.tag}
                      type="button"
                      onClick={() => toggleTag(p.tag)}
                      className={`text-[11px] px-2.5 py-1 rounded-[8px] font-semibold transition-all cursor-pointer ${
                        active
                          ? 'bg-[#007AFF] text-white shadow-xs'
                          : 'bg-black/[0.04] dark:bg-white/[0.08] text-slate-700 dark:text-slate-300 hover:bg-black/[0.08]'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add custom tag (e.g. coep, solana, iot) and press Enter"
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddCustomTag(e);
                  }}
                  className="flex-1 px-3 py-1.5 rounded-[8px] bg-white dark:bg-[#2C2C2E] border border-black/[0.1] dark:border-white/[0.15] text-slate-900 dark:text-white placeholder-slate-400 text-xs focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
                />
                <button
                  type="button"
                  onClick={handleAddCustomTag}
                  className="px-3 py-1.5 rounded-[8px] bg-black/[0.06] dark:bg-white/[0.1] text-slate-700 dark:text-slate-300 font-semibold cursor-pointer"
                >
                  + Add
                </button>
              </div>

              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#007AFF]/10 text-[#007AFF] dark:bg-[#0A84FF]/20 dark:text-[#0A84FF] border border-[#007AFF]/20"
                    >
                      #{t}
                      <button
                        type="button"
                        onClick={() => toggleTag(t)}
                        className="hover:text-red-500 cursor-pointer ml-0.5"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Description / Key Themes
              </label>
              <textarea
                rows={2}
                placeholder="Brief summary of challenges, tracks, prizes, or eligibility..."
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                className="w-full px-3 py-2 rounded-[10px] bg-white dark:bg-[#2C2C2E] border border-black/[0.1] dark:border-white/[0.15] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
              />
            </div>

            {/* LIVE PREVIEW CARD */}
            <div className="p-3 rounded-[16px] bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08]">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Live Radar Preview Card
              </div>
              <div className="p-3 rounded-[12px] bg-white dark:bg-[#252528] border border-black/[0.06] dark:border-white/[0.1] shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm leading-snug">
                    {title || 'Hackathon Title'}
                  </h4>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold shrink-0">
                    {mode}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                  {desc || 'Event description and problem statements will appear here.'}
                </p>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-black/[0.04] dark:border-white/[0.06] text-[10px]">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">
                    📍 {location || 'Online'}
                  </span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {prize ? `🏆 ${prize}` : 'Prizes TBA'}
                  </span>
                </div>
              </div>
            </div>

            {/* Error notice */}
            {submitError && (
              <div className="p-2.5 rounded-[10px] bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-semibold">
                {submitError}
              </div>
            )}

            {/* SUBMIT BUTTON */}
            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-[12px] bg-black/[0.04] dark:bg-white/[0.08] hover:bg-black/[0.08] text-slate-700 dark:text-slate-300 font-semibold text-xs cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-[12px] bg-gradient-to-r from-[#007AFF] to-[#0055D4] hover:from-[#0066D6] hover:to-[#0047B8] text-white font-bold text-xs shadow-md hover:shadow-lg hover:shadow-[#007AFF]/25 disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    Auto-Listing…
                  </>
                ) : (
                  '⚡ Auto-List Hackathon Now'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
