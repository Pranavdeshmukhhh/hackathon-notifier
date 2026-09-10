import React from 'react';

const CalendarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const GlobeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const MapPinIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const UsersIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const TrophyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M4 22h16" />
    <path d="M10 14.66V17c0 .55-.45 1-1 1H8c-.55 0-1 .45-1 1v1c0 .55.45 1 1 1h8c.55 0 1-.45 1-1v-1c0-.55-.45-1-1-1h-1c-.55 0-1-.45-1-1v-2.34" />
    <path d="M6 4h12v5a6 6 0 0 1-12 0V4z" />
  </svg>
);

const BuildingIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
    <path d="M9 22v-4h6v4" />
    <path d="M8 6h.01" /><path d="M16 6h.01" /><path d="M12 6h.01" />
    <path d="M8 10h.01" /><path d="M16 10h.01" /><path d="M12 10h.01" />
    <path d="M8 14h.01" /><path d="M16 14h.01" /><path d="M12 14h.01" />
  </svg>
);

const BriefcaseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

// Safely validate URL protocol (must start with http:// or https://)
function getSafeUrl(url) {
  if (typeof url === 'string' && /^https?:\/\//i.test(url.trim())) {
    return url.trim();
  }
  return '#';
}

const HackathonCard = ({ hackathon }) => {
  const isPast        = hackathon.is_past === true;
  const source        = hackathon.source || 'Unknown';
  const isTopCollege  = hackathon.is_top_college === true;
  const collegeType   = hackathon.college_type || '';
  const collegeName   = hackathon.college_name || '';
  const isInternship  = hackathon.is_internship === true;
  const location      = cleanLocation(hackathon.location || '');
  const distanceKm    = hackathon.distance_km != null ? parseFloat(hackathon.distance_km.toFixed(1)) : undefined;
  const registrations = formatRegistrations(hackathon.total_registrations || hackathon.registrations);
  const prize         = hackathon.prize || '';
  const minTeam       = hackathon.min_team_size;
  const maxTeam       = hackathon.max_team_size;
  const bannerClass   = getBannerClass(source);
  const safeLink      = getSafeUrl(hackathon.link);

  return (
    <div className={`hack-card${isPast ? ' hack-card--past' : ''}`}>
      {/* Colored top banner strip based on source */}
      <div className={`hack-card-banner hack-card-banner--${bannerClass}`} />

      <div className="hack-card-body">
        {/* Badges row */}
        <div className="hack-card-top-row">
          <span className={`source-badge source-badge--${source.toLowerCase()}`}>{source}</span>
          {hackathon.status && (
            <span className={`status-badge status-badge--${hackathon.status.toLowerCase()}`}>{hackathon.status}</span>
          )}
          {isTopCollege && (
            <span className={`college-badge college-badge--${collegeType.toLowerCase()}`} title={collegeName}>
              <BuildingIcon /> {collegeType}
            </span>
          )}
          {isInternship && (
            <span className="internship-badge">
              <BriefcaseIcon /> Internship
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="hack-card-title">{hackathon.title}</h3>

        {/* Prize — prominent display */}
        {prize && (
          <div className="hack-card-prize">
            <TrophyIcon /> <span>{prize}</span>
          </div>
        )}

        {/* Location row */}
        {location && (
          <div className="hack-card-location">
            <MapPinIcon />
            <span>
              {location}
              {distanceKm !== undefined && (
                <span className="distance-label"> · {distanceKm} km away</span>
              )}
            </span>
          </div>
        )}

        {/* Meta: deadline + mode + registrations + team */}
        <div className="hack-card-meta">
          <div className="hack-card-meta-item">
            <CalendarIcon />
            <span>{hackathon.deadline || 'TBA'}</span>
          </div>
          {hackathon.mode && hackathon.mode !== 'Unknown' && (
            <div className="hack-card-meta-item">
              <GlobeIcon />
              <span>{hackathon.mode}</span>
            </div>
          )}
          {registrations && (
            <div className="hack-card-meta-item hack-card-meta-regs">
              <UsersIcon />
              <span>{registrations} registered</span>
            </div>
          )}
          {(minTeam || maxTeam) && (
            <div className="hack-card-meta-item">
              <UsersIcon />
              <span>
                Team:{' '}
                {minTeam && maxTeam && minTeam !== maxTeam
                  ? `${minTeam}–${maxTeam}`
                  : minTeam || maxTeam
                }
              </span>
            </div>
          )}
        </div>

        {/* Tags */}
        {hackathon.tags && hackathon.tags.length > 0 && (
          <div className="hack-card-tags">
            {hackathon.tags.slice(0, 3).map((tag, i) => <span key={i}>{tag}</span>)}
            {hackathon.tags.length > 3 && <span className="hack-card-tags-more">+{hackathon.tags.length - 3}</span>}
          </div>
        )}

        {/* Footer CTA */}
        <div className="hack-card-footer">
          <a
            href={safeLink}
            target={safeLink !== '#' ? "_blank" : undefined}
            rel={safeLink !== '#' ? "noopener noreferrer" : undefined}
            className="view-details-btn"
          >
            Register Now <ExternalLinkIcon />
          </a>
        </div>
      </div>
    </div>
  );
};

export default HackathonCard;
