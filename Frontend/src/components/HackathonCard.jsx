import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRightIcon } from './Icons';
import { listedText, safeRegistrationUrl, eventFormat, eventLocation, eventTeam, eventDeadline } from '../utils/eventPresentation';

export default function HackathonCard({ hackathon, onShare, viewMode = 'grid' }) {
  const [copyStatus, setCopyStatus] = useState('');
  const timer = useRef(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; clearTimeout(timer.current); };
  }, []);
  const link = safeRegistrationUrl(hackathon.link);
  const past = hackathon.is_past === true;
  const deadline = eventDeadline(hackathon);
  const format = eventFormat(hackathon.mode);
  const distance = typeof hackathon.distance_km === 'number' && Number.isFinite(hackathon.distance_km) && hackathon.distance_km >= 0
    ? hackathon.distance_km.toFixed(1) : null;
  const tags = [...new Set((Array.isArray(hackathon.tags) ? hackathon.tags : []).filter(tag => typeof tag === 'string' && listedText(tag)))];
  const topCollege = hackathon.is_top_college === true;
  const internship = hackathon.is_internship === true;
  const account = listedText(hackathon.source_account);
  const participants = hackathon.total_registrations ?? hackathon.registrations;
  const entrants = participants != null && /^\d[\d,]*(?:\.\d+)?[km]?\+?$/i.test(String(participants).trim())
    ? `${participants} registered` : '';

  const copyLink = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(link);
      if (!mounted.current) return;
      setCopyStatus('Link copied');
      onShare?.(hackathon.title);
    } catch { if (!mounted.current) return; setCopyStatus('Could not copy. Use the registration link.'); }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopyStatus(''), 4000);
  };

  return (
    <article className={`hcard event-card${viewMode === 'compact' ? ' event-card-compact' : ''}`} data-past={past}>
      <div className="event-heading">
        <div className="event-source-line">
          <span>{listedText(hackathon.source) || 'Platform not listed'}</span>
          <span className={past ? 'text-muted' : 'text-accent-text'}>{past ? 'Registration closed' : listedText(hackathon.status) || 'Status not listed'}</span>
        </div>
        <h3 className="event-title">{listedText(hackathon.title) || 'Untitled event'}</h3>
        {(topCollege || internship) && (
          <p className="event-context">
            {topCollege && <span title={listedText(hackathon.college_name) || undefined}>{listedText(hackathon.college_name) || listedText(hackathon.college_type) || 'Top college event'}</span>}
            {internship && <span>Internship opportunity</span>}
          </p>
        )}
        {tags.length > 0 && <p className="event-topics">{tags.slice(0, 3).join(' · ')}{tags.length > 3 ? ` · +${tags.length - 3} topics` : ''}</p>}
      </div>

      <dl className="event-facts">
        <div className="event-deadline"><dt>Registration deadline</dt><dd>{deadline.iso ? <time dateTime={deadline.iso}>{deadline.text}</time> : deadline.text}{deadline.note && <span className="event-deadline-note">{deadline.note}</span>}</dd></div>
        <div><dt>Format</dt><dd>{format}</dd></div>
        <div className="event-location"><dt>Location</dt><dd>{eventLocation(hackathon)}{distance !== null && format !== 'Online' && <span className="event-distance">{distance} km away</span>}</dd></div>
        <div><dt>Prize</dt><dd>{listedText(hackathon.prize) || 'Not listed'}</dd></div>
        <div><dt>Team size</dt><dd>{eventTeam(hackathon)}</dd></div>
        <div><dt>Eligibility</dt><dd>Check organizer</dd></div>
      </dl>

      <div className="event-footnotes">
        {entrants && <span>{entrants}</span>}
        {hackathon.verified === true && <span title="Automated source checks; confirm requirements with the organizer">Source checks passed</span>}
        {account && <span>Via {account}</span>}
      </div>
      <div className="event-actions">
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" className="btn btn-ghost event-register">
            {past ? 'View event page' : 'Register'} <ArrowUpRightIcon size={16} /><span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : <span className="event-link-unavailable">Registration link unavailable</span>}
        <button type="button" className="btn btn-ghost event-copy" disabled={!link} onClick={copyLink} aria-label={`Copy link for ${hackathon.title || 'event'}`}>Copy link</button>
        <p role="status" className="event-copy-status">{copyStatus}</p>
      </div>
    </article>
  );
}
