import React from 'react';
import { ArrowUpRightIcon } from './Icons';

/* ── Small inline icons (1.6 stroke so they read as hairline, not clip-art) ── */
const Svg = ({ children, size = 14, ...rest }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="shrink-0"
    aria-hidden="true"
    {...rest}
  >
    {children}
  </svg>
);

const GlobeIcon = () => (
  <Svg><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z" /></Svg>
);
const ShareIcon = () => (
  <Svg size={16}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></Svg>
);
const MapPinIcon = () => (
  <Svg><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></Svg>
);
const TrophyIcon = () => (
  <Svg><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.45 1-1 1H8c-.55 0-1 .45-1 1v1c0 .55.45 1 1 1h8c.55 0 1-.45 1-1v-1c0-.55-.45-1-1-1h-1c-.55 0-1-.45-1-1v-2.34" /><path d="M6 4h12v5a6 6 0 0 1-12 0V4z" /></Svg>
);
const BuildingIcon = () => (
  <Svg size={12}><rect x="4" y="2" width="16" height="20" rx="1" /><path d="M9 22v-4h6v4" /><path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01" /></Svg>
);
const BriefcaseIcon = () => (
  <Svg size={12}><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></Svg>
);
const CheckIcon = ({ size = 12 }) => (
  <Svg size={size} strokeWidth="2.2"><polyline points="20 6 9 17 4 12" /></Svg>
);
const InstagramIcon = () => (
  <Svg size={12}><rect x="2" y="2" width="20" height="20" rx="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></Svg>
);
const SearchGlyph = () => (
  <Svg size={12}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></Svg>
);

/* ── Helpers ─────────────────────────────────────────────────────────────── */

// Strip "Online"/"Offline" mode tokens from a location string
function cleanLocation(raw) {
  if (!raw) return '';
  return raw
    .replace(/^(online|offline)[,\s]*/i, '')
    .replace(/[,\s]*(online|offline)$/i, '')
    .trim();
}

// Safely validate URL protocol (must start with http:// or https://)
function getSafeUrl(url) {
  if (typeof url === 'string' && /^https?:\/\//i.test(url.trim())) {
    return url.trim();
  }
  return '#';
}

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

/* ── Component ───────────────────────────────────────────────────────────── */
const HackathonCard = ({ hackathon, onShare, viewMode = 'grid' }) => {
  const [copied, setCopied] = React.useState(false);
  const isPast        = hackathon.is_past === true;
  const source        = hackathon.source || 'Unknown';
  const isTopCollege  = hackathon.is_top_college === true;
  const collegeType   = hackathon.college_type || '';
  const collegeName   = hackathon.college_name || '';
  const isInternship  = hackathon.is_internship === true;
  const venue         = cleanLocation(hackathon.venue || '');
  const location      = cleanLocation(hackathon.location || '');
  const displayLocation = venue && location && !venue.toLowerCase().includes(location.toLowerCase()) && !location.toLowerCase().includes(venue.toLowerCase())
    ? `${venue}, ${location}`
    : (venue || location);
  const distanceKm    = hackathon.distance_km != null ? parseFloat(hackathon.distance_km.toFixed(1)) : undefined;
  const displayPrize  = getDisplayPrize(hackathon.prize, hackathon);
  const displayRegistrations = getDisplayRegistrations(hackathon.total_registrations ?? hackathon.registrations, hackathon);
  const minTeam       = hackathon.min_team_size;
  const maxTeam       = hackathon.max_team_size;
  const safeLink      = getSafeUrl(hackathon.link);
  const isLinkDead    = safeLink === '#';
  const isLive        = (hackathon.status || '').toLowerCase() === 'live';

  const handleCopy = (e) => {
    e.preventDefault();
    if (!isLinkDead && navigator.clipboard) {
      navigator.clipboard.writeText(safeLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
    onShare?.(hackathon.title);
  };

  const rafRef = React.useRef(null);
  React.useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  // Cursor-follow spotlight (pure CSS variables; no re-render)
  const handleMouseMove = (e) => {
    const card = e.currentTarget;
    const { clientX, clientY } = e;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${clientX - rect.left}px`);
      card.style.setProperty('--my', `${clientY - rect.top}px`);
    });
  };

  const teamDisplay = (minTeam || maxTeam)
    ? (minTeam && maxTeam && minTeam !== maxTeam ? `Team ${minTeam}–${maxTeam}` : `Team ${minTeam || maxTeam}`)
    : 'Open Participation';

  const ctaLabel = isLinkDead ? 'Link Unavailable' : isPast ? 'View Details' : 'Register Now';
  const linkProps = {
    href: safeLink,
    target: isLinkDead ? undefined : '_blank',
    rel: isLinkDead ? undefined : 'noopener noreferrer',
    'aria-disabled': isLinkDead ? 'true' : undefined,
    onClick: (e) => {
      if (isLinkDead) { e.preventDefault(); return; }
      onShare?.(`Opening ${source} portal for ${hackathon.title}`);
    },
  };

  // ── COMPACT LIST ROW ──
  if (viewMode === 'compact') {
    return (
      <div className="hrow" data-past={isPast}>
        <div className="hrow-main flex md:flex-col items-center md:items-start gap-x-4 gap-y-1.5">
          <span className="hcard-source">{source}</span>
          {isPast ? (
            <span className="tag tag-bad">Lost opportunity</span>
          ) : hackathon.status ? (
            <span className="hcard-status">
              <span className="dot" style={{ color: isLive ? 'var(--ok)' : 'var(--faint)' }} />
              {hackathon.status}
            </span>
          ) : null}
        </div>

        <div className="hrow-main min-w-0 space-y-2">
          <div className="flex items-center gap-3 min-w-0">
            <h3 className="hrow-title">{hackathon.title}</h3>
            {isTopCollege && (
              <span className="tag tag-accent hidden sm:inline-flex" title={collegeName}><BuildingIcon /> {collegeType}</span>
            )}
            {isInternship && <span className="tag hidden sm:inline-flex"><BriefcaseIcon /> Internship</span>}
            {hackathon.verified && <span className="tag tag-ok hidden lg:inline-flex"><CheckIcon /> Verified</span>}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-muted">
            <span>{hackathon.deadline || 'TBA'}</span>
            <span className="flex items-center gap-1.5">
              <GlobeIcon /> {displayLocation || 'Online / Virtual'}
              {distanceKm !== undefined && <span className="text-accent-text">· {distanceKm} km</span>}
            </span>
            <span className="text-ink">{displayRegistrations}</span>
          </div>
        </div>

        <div>
          {displayPrize.isExplicit ? (
            <span className="hcard-prize-value !text-[28px]">{displayPrize.text}</span>
          ) : (
            <span className="hcard-prize-soft"><TrophyIcon />{displayPrize.text}</span>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <a {...linkProps} className={`btn flex-1 sm:flex-initial justify-center ${isPast || isLinkDead ? 'btn-ghost' : 'btn-ink'}`}>
            <span>{ctaLabel}</span>
            {!isLinkDead && <ArrowUpRightIcon size={14} />}
          </a>
          <button type="button" className="icon-btn shrink-0" data-copied={copied} onClick={handleCopy} title={copied ? 'Link copied!' : 'Copy link'} aria-label="Copy link">
            {copied ? <CheckIcon size={15} /> : <ShareIcon />}
          </button>
        </div>
      </div>
    );
  }

  // ── STANDARD CARD ──
  return (
    <article className="hcard" data-past={isPast} onMouseMove={handleMouseMove}>
      <div className="hcard-body">
        {/* Source + status */}
        <div className="flex items-center justify-between gap-3">
          <span className="hcard-source">{source}</span>
          {hackathon.status && !isPast && (
            <span className="hcard-status">
              <span className="dot" style={{ color: isLive ? 'var(--ok)' : 'var(--faint)' }} />
              {hackathon.status}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="hcard-title">{hackathon.title}</h3>

        {/* Badges */}
        <div className="min-h-[22px] flex flex-wrap items-center gap-1.5">
          {isPast && <span className="tag tag-bad">Lost opportunity · ended</span>}
          {isTopCollege && (
            <span className="tag tag-accent" title={collegeName}><BuildingIcon /> {collegeType}</span>
          )}
          {isInternship && <span className="tag"><BriefcaseIcon /> Internship</span>}
          {hackathon.verified && (
            <span className="tag tag-ok" title={`Verification confidence: ${((hackathon.verification_confidence || 0) * 100).toFixed(0)}%`}>
              <CheckIcon /> Verified
            </span>
          )}
          {hackathon.discovery_source === 'instagram' && (
            <span className="tag" title={hackathon.source_account || 'Instagram'}>
              <InstagramIcon /> {hackathon.source_account || 'IG'}
            </span>
          )}
          {hackathon.discovery_source === 'web_discovery' && (
            <span className="tag"><SearchGlyph /> Web found</span>
          )}
        </div>

        {/* Prize */}
        <div className="min-h-[62px]">
          <div className="eyebrow mb-2">Prize pool</div>
          {displayPrize.isExplicit ? (
            <div className="hcard-prize-value">{displayPrize.text}</div>
          ) : (
            <div className="hcard-prize-soft"><TrophyIcon /><span>{displayPrize.text}</span></div>
          )}
        </div>

        {/* Location */}
        <div className="min-h-[22px] flex items-center gap-2 text-[13px] text-muted">
          {displayLocation ? (
            <>
              <MapPinIcon />
              <span className="line-clamp-1">
                {displayLocation}
                {distanceKm !== undefined && <span className="text-accent-text ml-1.5">· {distanceKm} km away</span>}
              </span>
            </>
          ) : (
            <>
              <GlobeIcon />
              <span className="line-clamp-1">Online Event · Global Access</span>
            </>
          )}
        </div>

        {/* Meta */}
        <dl className="hcard-meta">
          <div><dt className="k">Deadline</dt><dd className="v">{hackathon.deadline || 'TBA'}</dd></div>
          <div><dt className="k">Mode</dt><dd className="v">{hackathon.mode || 'Virtual'}</dd></div>
          <div><dt className="k">Entrants</dt><dd className="v !text-accent-text">{displayRegistrations}</dd></div>
          <div><dt className="k">Team</dt><dd className="v">{teamDisplay}</dd></div>
        </dl>

        {/* Tags */}
        <div className="min-h-[22px] flex flex-wrap items-center gap-1.5">
          {hackathon.tags && hackathon.tags.length > 0 ? (
            <>
              {hackathon.tags.slice(0, 3).map((tag, i) => (
                <span key={i} className="tag tag-quiet">{tag}</span>
              ))}
              {hackathon.tags.length > 3 && (
                <span className="tag tag-quiet">+{hackathon.tags.length - 3}</span>
              )}
            </>
          ) : (
            <span className="tag tag-quiet">Hackathon</span>
          )}
        </div>
      </div>

      {/* Footer CTA */}
      <div className="hcard-foot">
        <a {...linkProps} className="hcard-cta">
          <span>{ctaLabel}</span>
          {!isLinkDead && <ArrowUpRightIcon size={18} />}
        </a>
        <button
          type="button"
          className="hcard-share"
          data-copied={copied}
          onClick={handleCopy}
          title={copied ? 'Link copied!' : 'Copy registration link'}
          aria-label="Copy link"
        >
          {copied ? <CheckIcon size={16} /> : <ShareIcon />}
        </button>
      </div>
    </article>
  );
};

export default HackathonCard;
