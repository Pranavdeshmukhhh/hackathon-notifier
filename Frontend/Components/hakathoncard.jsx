import React from 'react';

const CalendarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const GlobeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const ShareIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

const MapPinIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const UsersIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const TrophyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M4 22h16" />
    <path d="M10 14.66V17c0 .55-.45 1-1 1H8c-.55 0-1 .45-1 1v1c0 .55.45 1 1 1h8c.55 0 1-.45 1-1v-1c0-.55-.45-1-1-1h-1c-.55 0-1-.45-1-1v-2.34" />
    <path d="M6 4h12v5a6 6 0 0 1-12 0V4z" />
  </svg>
);

const BuildingIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
    <path d="M9 22v-4h6v4" />
    <path d="M8 6h.01" /><path d="M16 6h.01" /><path d="M12 6h.01" />
    <path d="M8 10h.01" /><path d="M16 10h.01" /><path d="M12 10h.01" />
    <path d="M8 14h.01" /><path d="M16 14h.01" /><path d="M12 14h.01" />
  </svg>
);

const BriefcaseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </svg>
);

// Strip "Online"/"Offline" mode tokens from a location string
function cleanLocation(raw) {
  if (!raw) return '';
  return raw
    .replace(/^(online|offline)[,\s]*/i, '')
    .replace(/[,\s]*(online|offline)$/i, '')
    .trim();
}

// Format large registration numbers: 12345 → "12.3k"
function formatRegistrations(n) {
  if (!n || isNaN(n)) return null;
  const num = parseInt(n, 10);
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return `${num}`;
}

// Get banner class from source
function getBannerClass(source) {
  const s = (source || '').toLowerCase().replace(/\s+/g, '');
  const map = {
    devfolio: 'devfolio',
    unstop: 'unstop',
    devpost: 'devpost',
    hackerearth: 'hackerearth',
    devnovate: 'devnovate',
  };
  return map[s] || 'unknown';
}

const sourceGradients = {
  devfolio: 'from-blue-600 via-indigo-600 to-violet-600',
  unstop: 'from-cyan-500 via-blue-600 to-indigo-600',
  devpost: 'from-teal-500 via-emerald-600 to-blue-600',
  hackerearth: 'from-purple-600 via-indigo-600 to-blue-700',
  devnovate: 'from-pink-500 via-rose-500 to-purple-600',
};

// Safely validate URL protocol (must start with http:// or https://)
function getSafeUrl(url) {
  if (typeof url === 'string' && /^https?:\/\//i.test(url.trim())) {
    return url.trim();
  }
  return '#';
}

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600 dark:text-emerald-400 shrink-0">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

function getDisplayPrize(rawPrize, hackathon) {
  const p = (rawPrize || '').trim();
  if (p && p !== '$0' && p !== '₹0' && p.toLowerCase() !== 'none' && p.toLowerCase() !== 'null') {
    return { text: p, isExplicit: true };
  }
  if (hackathon.is_internship) {
    return { text: 'PPI / Internship Stipend Pool', isExplicit: false };
  }
  const text = ((hackathon.tags || []).join(' ') + ' ' + (hackathon.desc || '')).toLowerCase();
  if (text.includes('swag') || text.includes('goodie') || text.includes('merch') || text.includes('kit')) {
    return { text: 'Swags & Goodies Pool', isExplicit: false };
  }
  if (text.includes('certificate') || text.includes('credit') || text.includes('voucher')) {
    return { text: 'Certificates & Cloud Credits', isExplicit: false };
  }
  if (hackathon.is_top_college) {
    return { text: 'College Trophy & Merit Pool', isExplicit: false };
  }
  return { text: 'Free Entry · Prize Pool TBA', isExplicit: false };
}

function getDisplayRegistrations(rawRegs, hackathon) {
  const n = parseInt(rawRegs, 10);
  if (!isNaN(n) && n > 0) {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k registered`;
    return `${n} registered`;
  }
  if (hackathon.status && hackathon.status.toLowerCase() === 'open') {
    return 'Open for Registrations';
  }
  if (hackathon.is_past) {
    return 'Registrations Closed';
  }
  return 'Active Registrations';
}

const HackathonCard = ({ hackathon, onShare }) => {
  const [copied, setCopied] = React.useState(false);
  const isPast        = hackathon.is_past === true;
  const source        = hackathon.source || 'Unknown';
  const isTopCollege  = hackathon.is_top_college === true;
  const collegeType   = hackathon.college_type || '';
  const collegeName   = hackathon.college_name || '';
  const isInternship  = hackathon.is_internship === true;
  const location      = cleanLocation(hackathon.location || '');
  const distanceKm    = hackathon.distance_km != null ? parseFloat(hackathon.distance_km.toFixed(1)) : undefined;
  const displayPrize  = getDisplayPrize(hackathon.prize, hackathon);
  const displayRegistrations = getDisplayRegistrations(hackathon.total_registrations ?? hackathon.registrations, hackathon);
  const minTeam       = hackathon.min_team_size;
  const maxTeam       = hackathon.max_team_size;
  const bannerClass   = getBannerClass(source);
  const bannerGradient = sourceGradients[bannerClass] || 'from-blue-600 to-indigo-600';
  const safeLink      = getSafeUrl(hackathon.link);

  const handleCopy = (e) => {
    e.preventDefault();
    if (safeLink !== '#' && navigator.clipboard) {
      navigator.clipboard.writeText(safeLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
    onShare?.(hackathon.title);
  };

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
  };

  const teamDisplay = (minTeam || maxTeam)
    ? (minTeam && maxTeam && minTeam !== maxTeam ? `Team ${minTeam}–${maxTeam}` : `Team ${minTeam || maxTeam}`)
    : 'Open Participation';

  return (
    <div 
      onMouseMove={handleMouseMove}
      className={`group relative overflow-hidden rounded-[24px] border border-black/[0.08] dark:border-white/[0.12] bg-white/95 dark:bg-[#1C1C1E]/90 backdrop-blur-xl shadow-[0_2px_14px_-2px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_24px_-2px_rgba(0,0,0,0.45)] hover:shadow-xl dark:hover:shadow-[0_20px_48px_rgba(0,0,0,0.70)] hover:border-[#007AFF]/35 dark:hover:border-[#0A84FF]/45 ios-card-spring apple-touch-layer apple-specular-spotlight crystal-chamfer crystal-sheen flex flex-col justify-between h-full ${isPast ? 'opacity-60 grayscale-[0.4]' : ''}`}
    >
      {/* Platform Branded Subtle Accent Hairline */}
      <div className={`h-1 group-hover:h-1.5 w-full bg-gradient-to-r ${bannerGradient} opacity-90 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:opacity-100`} />
      {/* Specular Ambient Sheen */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.04] dark:from-white/[0.04] to-transparent pointer-events-none" />

      <div className="p-5 sm:p-6 flex flex-col gap-3.5 flex-1 relative z-10">
        {/* Badges row: uniform min-h for perfect row baseline */}
        <div className="min-h-[26px] flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-[8px] text-[11px] font-semibold tracking-wider uppercase bg-[#007AFF]/10 text-[#007AFF] dark:bg-[#0A84FF]/15 dark:text-[#0A84FF] border border-[#007AFF]/20 dark:border-[#0A84FF]/30 crystal-pill">
            {source}
          </span>
          {hackathon.status && (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-[8px] text-[11px] font-semibold crystal-pill ${hackathon.status.toLowerCase() === 'live' ? 'bg-[#34C759]/10 text-[#34C759] dark:bg-[#30D158]/15 dark:text-[#30D158] border border-[#34C759]/25 dark:border-[#30D158]/30' : 'bg-black/[0.04] text-slate-700 dark:bg-white/[0.08] dark:text-slate-300 border border-black/[0.06] dark:border-white/[0.08]'}`}>
              {hackathon.status}
            </span>
          )}
          {isTopCollege && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[8px] text-[11px] font-semibold bg-[#5856D6]/10 text-[#5856D6] dark:bg-[#5E5CE6]/15 dark:text-[#5E5CE6] border border-[#5856D6]/20 dark:border-[#5E5CE6]/30 crystal-pill" title={collegeName}>
              <BuildingIcon /> {collegeType}
            </span>
          )}
          {isInternship && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[8px] text-[11px] font-semibold bg-[#AF52DE]/10 text-[#AF52DE] dark:bg-[#BF5AF2]/15 dark:text-[#BF5AF2] border border-[#AF52DE]/20 dark:border-[#BF5AF2]/30 crystal-pill">
              <BriefcaseIcon /> Internship
            </span>
          )}
        </div>

        {/* Title: uniform 46px envelope to prevent jagged baselines */}
        <div className="min-h-[46px] flex items-center">
          <h3 className="text-[17px] font-bold tracking-tight text-slate-900 dark:text-white leading-snug line-clamp-2 group-hover:text-[#007AFF] dark:group-hover:text-[#0A84FF] transition-colors">
            {hackathon.title}
          </h3>
        </div>

        {/* Prize Pool — ALWAYS visible on every card */}
        <div className="min-h-[30px] flex items-center">
          <div className={`flex items-center gap-1.5 text-xs sm:text-sm font-bold px-3 py-1 rounded-[10px] border w-fit crystal-pill ${
            displayPrize.isExplicit
              ? 'text-emerald-800 dark:text-emerald-300 bg-emerald-500/10 dark:bg-emerald-500/15 border-emerald-500/25 dark:border-emerald-500/30'
              : 'text-slate-700 dark:text-slate-300 bg-black/[0.03] dark:bg-white/[0.06] border-black/[0.06] dark:border-white/[0.08]'
          }`}>
            <TrophyIcon />
            <span>{displayPrize.text}</span>
          </div>
        </div>

        {/* Location row: guaranteed min-h-[22px] with clean virtual/global fallback */}
        <div className="min-h-[22px] flex items-center gap-1.5 text-[13px] text-slate-600 dark:text-slate-400 font-medium">
          {location ? (
            <>
              <span className="shrink-0 text-slate-500 dark:text-slate-400"><MapPinIcon /></span>
              <span className="line-clamp-1">
                {location}
                {distanceKm !== undefined && (
                  <span className="text-[#007AFF] dark:text-[#0A84FF] font-semibold ml-1.5">· {distanceKm} km away</span>
                )}
              </span>
            </>
          ) : (
            <>
              <span className="shrink-0 text-slate-400 dark:text-slate-500"><GlobeIcon /></span>
              <span className="line-clamp-1 text-slate-500 dark:text-slate-400">Online Event · Global Access</span>
            </>
          )}
        </div>

        {/* Meta Grid: Symmetrical 2x2 matrix with 100% horizontal baseline parity */}
        <div className="grid grid-cols-2 gap-y-2.5 gap-x-4 mt-auto pt-3.5 border-t border-black/[0.06] dark:border-white/[0.08] text-[13px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5 overflow-hidden">
            <CalendarIcon />
            <span className="font-medium text-slate-700 dark:text-slate-300 truncate">{hackathon.deadline || 'TBA'}</span>
          </div>
          <div className="flex items-center gap-1.5 overflow-hidden">
            <GlobeIcon />
            <span className="font-medium text-slate-700 dark:text-slate-300 truncate">{hackathon.mode || 'Virtual'}</span>
          </div>
          {/* Registered Participants — ALWAYS visible on every card */}
          <div className="flex items-center gap-1.5 text-[#007AFF] dark:text-[#0A84FF] overflow-hidden">
            <UsersIcon />
            <span className="font-bold truncate">{displayRegistrations}</span>
          </div>
          <div className="flex items-center gap-1.5 overflow-hidden">
            <UsersIcon />
            <span className="font-medium text-slate-700 dark:text-slate-300 truncate">{teamDisplay}</span>
          </div>
        </div>

        {/* Tags */}
        <div className="min-h-[26px] flex flex-wrap items-center gap-1.5 pt-1">
          {hackathon.tags && hackathon.tags.length > 0 ? (
            <>
              {hackathon.tags.slice(0, 3).map((tag, i) => (
                <span key={i} className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-[6px] bg-black/[0.04] text-slate-600 dark:bg-white/[0.06] dark:text-slate-400 border border-black/[0.06] dark:border-white/[0.08]">
                  {tag}
                </span>
              ))}
              {hackathon.tags.length > 3 && (
                <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-[6px] bg-black/[0.04] text-slate-500 dark:bg-white/[0.06] dark:text-slate-400 border border-black/[0.06] dark:border-white/[0.08]">
                  +{hackathon.tags.length - 3}
                </span>
              )}
            </>
          ) : (
            <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-[6px] bg-black/[0.02] text-slate-400 dark:bg-white/[0.03] dark:text-slate-500 border border-black/[0.04] dark:border-white/[0.06]">
              Hackathon
            </span>
          )}
        </div>
      </div>

      {/* Card Footer CTA: Mathematically aligned 40px (5x8pt) button height */}
      <div className="px-5 py-3.5 bg-[#F2F2F7]/70 dark:bg-[#2C2C2E]/40 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between gap-3 relative z-10">
        <a
          href={safeLink}
          target={safeLink !== '#' ? "_blank" : undefined}
          rel={safeLink !== '#' ? "noopener noreferrer" : undefined}
          onClick={() => {
            if (safeLink !== '#') {
              onShare?.(`Opening official ${source} portal for ${hackathon.title}`);
            }
          }}
          className="h-10 flex-1 inline-flex items-center justify-center gap-2 px-4 rounded-[12px] bg-[#007AFF] hover:bg-[#0066D6] dark:bg-[#0A84FF] dark:hover:bg-[#0077ED] text-white font-semibold text-xs sm:text-sm shadow-xs hover:shadow-md hover:shadow-[#007AFF]/25 transition-all duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.96] apple-touch-layer cursor-pointer crystal-chamfer"
        >
          <span>Register Now</span>
          <span className="transition-transform duration-200 group-hover:translate-x-0.5"><ExternalLinkIcon /></span>
        </a>
        <button
          type="button"
          className={`h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-[12px] border transition-all duration-250 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-85 hover:scale-105 apple-touch-layer cursor-pointer crystal-chamfer ${copied ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 scale-105' : 'bg-white dark:bg-white/[0.08] border-black/[0.08] dark:border-white/[0.10] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.14]'}`}
          onClick={handleCopy}
          title={copied ? "Link copied!" : "Copy registration link"}
          aria-label="Copy link"
        >
          {copied ? <CheckIcon /> : <ShareIcon />}
        </button>
      </div>
    </div>
  );
};

export default HackathonCard;
