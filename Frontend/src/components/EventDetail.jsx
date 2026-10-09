import React, { useEffect, useRef, useState } from 'react';
import { ArrowRightIcon, ArrowUpRightIcon } from './Icons';
import useCopyLink from '../hooks/useCopyLink';
import { validEventId, eventShareUrl } from '../utils/eventRoute';
import { requestApi } from '../utils/api';
import { listedText, safeRegistrationUrl, eventDeadline, eventFormat, eventLocation, eventTeam } from '../utils/eventPresentation';

export default function EventDetail({ eventId, apiBase, onBack }) {
  const [result, setResult] = useState({ id: eventId, phase: validEventId(eventId) ? 'loading' : 'notFound' });
  const [attempt, setAttempt] = useState(0);
  const heading = useRef(null);
  const current = result.id === eventId ? result : { phase: validEventId(eventId) ? 'loading' : 'notFound' };
  const event = current.phase === 'ready' ? current.event : null;
  const title = event ? listedText(event.title) || 'Untitled event' : current.phase === 'notFound' ? 'This event is no longer listed.' : current.phase === 'unavailable' ? 'Event details unavailable' : 'Event details';
  const shareUrl = eventShareUrl(eventId);
  const { status: copyStatus, isCopying, copy } = useCopyLink(shareUrl, undefined, 'Could not copy. Copy the address from your browser.');

  useEffect(() => {
    const previousTitle = document.title;
    return () => { document.title = previousTitle; };
  }, []);
  useEffect(() => { document.title = `${title} — Hackathon Notifier`; }, [title]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    heading.current?.focus({ preventScroll: true });
  }, [eventId, attempt]);

  useEffect(() => {
    if (!validEventId(eventId)) return;
    const controller = new AbortController();
    let active = true;
    // oxlint-disable-next-line react/set-state-in-effect -- Detail state synchronizes with an external request.
    setResult({ id: eventId, phase: 'loading' });
    const load = async () => {
      try {
        const suffix = `/${eventId.toLowerCase()}`;
        const { response, payload } = await requestApi(`${apiBase}${suffix}`, { signal: controller.signal });
        if (!active) return;
        if (response.status === 404) { setResult({ id: eventId, phase: 'notFound' }); return; }
        if (!response.ok) throw new Error('Unavailable');
        if (!active) return;
        if (!payload.success || !payload.data || String(payload.data._id).toLowerCase() !== eventId.toLowerCase()) throw new Error('Invalid event response');
        setResult({ id: eventId, phase: 'ready', event: payload.data });
      } catch {
        if (active) setResult({ id: eventId, phase: 'unavailable' });
      }
    };
    load();
    return () => { active = false; controller.abort(); };
  }, [eventId, apiBase, attempt]);

  const link = event && safeRegistrationUrl(event.link);
  const deadline = event && eventDeadline(event);
  const tags = [...new Set((Array.isArray(event?.tags) ? event.tags : []).map(listedText).filter(Boolean))];
  const description = listedText(event?.desc);
  const tagline = listedText(event?.tagline);
  const sourcePost = event && safeRegistrationUrl(event.instagram_post_url);
  const collectedDate = event?.scraped_at && new Date(event.scraped_at);
  const collected = collectedDate && !Number.isNaN(collectedDate.getTime()) ? collectedDate.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not reported';

  return (
    <section className="shell event-detail" aria-labelledby="event-detail-title" aria-busy={current.phase === 'loading'}>
      <a href="#events" onClick={onBack} className="home-text-link detail-back"><ArrowRightIcon /> Back to discovery</a>
      <header className="detail-heading">
        <p className="eyebrow">Event details{event && listedText(event.source) ? ` · ${event.source}` : ''}</p>
        <h1 id="event-detail-title" ref={heading} tabIndex={-1} className="display detail-title">{title}</h1>
        {tagline && tagline !== description && tagline !== event.title && <p className="detail-tagline">{tagline}</p>}
      </header>

      {current.phase === 'loading' && <><p role="status" className="detail-state-note">Loading event details…</p><div className="detail-loading" aria-hidden="true"><div className="space-y-5"><div className="skeleton h-6 w-2/3" /><div className="skeleton h-28 w-full" /><div className="skeleton h-28 w-full" /></div><div className="skeleton h-72 w-full" /></div></>}
      {current.phase === 'notFound' && <p role="status" className="detail-state-note">The listing may have been removed or the link may be incomplete. Return to discovery to find another event.</p>}
      {current.phase === 'unavailable' && <div role="alert" className="detail-state-note"><p>We couldn’t retrieve this listing. Please try again.</p><button type="button" className="btn btn-ink mt-4" onClick={() => setAttempt(value => value + 1)}>Retry details</button></div>}

      {event && <>
        <p role="status" className="sr-only">Event details loaded for {title}.</p>
        {deadline.closed && <p className="discovery-notice">Registration is closed in this listing. The source page remains available for reference.</p>}
        <div className="event-detail-layout">
          <aside className="detail-registration" aria-label="Registration">
            <div className="detail-registration-panel">
              <h2>Registration deadline</h2>
              <p className="detail-deadline">{deadline.iso ? <time dateTime={deadline.at || deadline.iso}>{deadline.text}</time> : deadline.text}</p>
              {deadline.note && <p className="detail-deadline-note">{deadline.note}</p>}
              <p className="detail-note">{deadline.at ? 'Closing time shown in UTC. Confirm any changes on the source page.' : 'The feed uses UTC calendar dates. Confirm the closing time and timezone on the source page.'}</p>
              <p className="detail-registration-status">{deadline.closed ? 'Registration closed' : listedText(event.status) || 'Registration status not listed'}</p>
              {link ? <><a href={link} className={`btn ${deadline.closed ? 'btn-ghost' : 'btn-accent'} detail-register-button`} target="_blank" rel="noopener noreferrer">{deadline.closed ? 'View source page' : 'Register on source page'} <ArrowUpRightIcon size={16} /><span className="sr-only"> (opens in a new tab)</span></a><p className="detail-destination">Opens {new URL(link).hostname}</p></> : <p className="detail-link-missing">Registration link unavailable.</p>}
              <button type="button" className="btn btn-ghost detail-share-button" onClick={copy} disabled={isCopying || !shareUrl}>{isCopying ? 'Copying…' : 'Copy event link'}</button>
              <p role="status" className="detail-copy-status">{copyStatus}</p>
            </div>
            <p className="detail-note detail-registration-note">Registration and event requirements are managed by the organizer. Listings can change after collection.</p>
          </aside>
          <div className="detail-content">
            <section className="detail-section" aria-labelledby="detail-overview-title">
              <h2 id="detail-overview-title">About this event</h2>
              <p className="detail-description">{description || 'The source did not provide a description. Check the registration page for the full brief.'}</p>
              {tags.length > 0 && <div className="detail-topics"><h3>Topics</h3><p>{tags.join(' · ')}</p></div>}
            </section>
            <section className="detail-section" aria-labelledby="detail-participation-title">
              <h2 id="detail-participation-title">Participation</h2>
              <dl className="detail-facts">
                <div><dt>Format</dt><dd>{eventFormat(event.mode)}</dd></div>
                <div><dt>Location</dt><dd>{eventLocation(event)}</dd></div>
                <div><dt>Team size</dt><dd>{eventTeam(event)}</dd></div>
                <div><dt>Prize</dt><dd>{listedText(event.prize) || 'Not listed'}</dd></div>
                <div className="detail-fact-wide"><dt>Eligibility</dt><dd>{listedText(event.eligibility) || 'Not listed. Confirm eligible ages, institutions, and regions with the organizer.'}</dd></div>
                {listedText(event.opportunity_type) && <div><dt>Event type</dt><dd>{event.opportunity_type}</dd></div>}
                {event.is_internship === true && <div><dt>Opportunity</dt><dd>Internship or hiring opportunity listed</dd></div>}
              </dl>
              <p className="detail-note">Confirm team rules, eligibility, fees, and prize conditions before registering.</p>
            </section>
            <section className="detail-section" aria-labelledby="detail-source-title">
              <h2 id="detail-source-title">Listing source</h2>
              <dl className="detail-facts">
                <div><dt>Platform</dt><dd>{listedText(event.source) || 'Not listed'}</dd></div>
                <div><dt>Organizer</dt><dd>{listedText(event.organizer) || 'Not listed'}</dd></div>
                {listedText(event.college_name) && <div><dt>Campus</dt><dd>{event.college_name}</dd></div>}
                <div><dt>Collected</dt><dd>{collected}</dd></div>
                {listedText(event.source_account) && <div><dt>Shared by</dt><dd>{event.source_account}</dd></div>}
              </dl>
              {sourcePost && <a href={sourcePost} target="_blank" rel="noopener noreferrer" className="home-text-link mt-4">View original source post <ArrowUpRightIcon size={16} /><span className="sr-only"> (opens in a new tab)</span></a>}
              {event.verified === true && <p className="detail-note">Automated source checks passed. Confirm requirements and availability with the organizer.</p>}
            </section>
          </div>
        </div>
      </>}
    </section>
  );
}
