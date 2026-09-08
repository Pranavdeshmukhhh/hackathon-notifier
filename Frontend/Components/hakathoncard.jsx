import React from 'react';

const CalendarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const GlobeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const MapPinIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

// Clean a location string: remove pure-mode tokens like "Online" / "Offline"
// Unstop sometimes sends "Online" or "Online, Pune" — show only the city part
function cleanLocation(raw) {
  if (!raw) return '';
  // Remove leading/trailing "Online," or "Offline," tokens (case-insensitive)
  let cleaned = raw
    .replace(/^(online|offline)[,\s]*/i, '')
    .replace(/[,\s]*(online|offline)$/i, '')
    .trim();
  return cleaned;
}

const HackathonCard = ({ hackathon }) => {
  const isPast = hackathon.is_past === true;
  const source = hackathon.source || 'Unknown';
  const isTopCollege = hackathon.is_top_college === true;
  const collegeType = hackathon.college_type || '';
  const collegeName = hackathon.college_name || '';
  const isInternship = hackathon.is_internship === true;
  // Clean location: strip mode noise and show a human-readable city/venue
  const rawLocation = hackathon.location || '';
  const location = cleanLocation(rawLocation);
  // Round distance to 1 decimal place
  const distanceKm = hackathon.distance_km != null
    ? parseFloat(hackathon.distance_km.toFixed(1))
    : undefined;

  return (
    <div className={`hack-card${isPast ? ' hack-card--past' : ''}`}>
      <div className="hack-card-body">
        {/* Source badge + Status + Classification badges */}
        <div className="hack-card-top-row">
          <span className={`source-badge source-badge--${source.toLowerCase()}`}>
            {source}
          </span>
          {hackathon.status && (
            <span className={`status-badge status-badge--${hackathon.status.toLowerCase()}`}>
              {hackathon.status}
            </span>
          )}
          {isTopCollege && (
            <span
              className={`college-badge college-badge--${collegeType.toLowerCase()}`}
              title={collegeName}
            >
              {collegeType}
            </span>
          )}
          {isInternship && (
            <span className="internship-badge">
              Internship
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="hack-card-title">{hackathon.title}</h3>

        {/* Location row */}
        {location && (
          <div className="hack-card-location">
            <MapPinIcon />
            <span>
              {location}
              {distanceKm !== undefined && (
                <span className="distance-label"> • {distanceKm} km away</span>
              )}
            </span>
          </div>
        )}

        {/* Meta row: deadline + mode */}
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
        </div>

        {/* Tags */}
        {hackathon.tags && hackathon.tags.length > 0 && (
          <div className="hack-card-tags">
            {hackathon.tags.slice(0, 3).map((tag, i) => (
              <span key={i}>{tag}</span>
            ))}
            {hackathon.tags.length > 3 && (
              <span className="hack-card-tags-more">
                +{hackathon.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="hack-card-footer">
          <a href={hackathon.link} target="_blank" rel="noopener noreferrer">
            View Details
            <ExternalLinkIcon />
          </a>
        </div>
      </div>
    </div>
  );
};

export default HackathonCard;
