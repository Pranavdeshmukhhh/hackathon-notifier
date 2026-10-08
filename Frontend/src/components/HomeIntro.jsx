import React from 'react';
import { ArrowRightIcon, TelegramIcon } from './Icons';

export default function HomeIntro({ onBrowse, onShortcut, loading, error, lastCollected, homeRef, updatesRef }) {
  const date = lastCollected ? new Date(lastCollected) : null;
  const collected = date && !Number.isNaN(date.getTime())
    ? date.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'Not reported';

  return (
    <section ref={homeRef} id="home" className="shell home-intro" aria-labelledby="home-title">
      <div className="home-copy">
        <p className="eyebrow">For students who like to build</p>
        <h1 id="home-title" className="display home-title">Find a hackathon<br />worth building for.</h1>
        <p className="home-description">Deadlines, formats, and registration links from across the hackathon community. Compare opportunities and find your next team project.</p>
        <div className="home-actions flex flex-wrap items-center gap-4 mt-6">
          <button type="button" className="btn btn-accent btn-lg" onClick={onBrowse}>Browse hackathons <ArrowRightIcon /></button>
          <a href="https://t.me/Pranavhakathon_bot" target="_blank" rel="noopener noreferrer" className="home-text-link"><TelegramIcon /> Get Telegram alerts</a>
        </div>
      </div>
      <aside ref={updatesRef} id="dashboard" className="home-notes scroll-mt-24" aria-label="Listing information">
        <h2 className="home-registration-note text-base font-semibold mb-3">Before you register</h2>
        <p className="home-registration-note text-sm text-ink-2 leading-relaxed">Check the organizer’s page for the final deadline, eligibility, and team requirements. Listings can change after collection.</p>
        <dl className="home-update">
          <div><dt>Latest collection</dt><dd>{loading ? 'Loading…' : error ? 'Unavailable' : collected}</dd></div>
        </dl>
        <p className="home-registration-note text-sm text-muted">No account needed to browse.</p>
      </aside>
      <div className="home-shortcuts" aria-label="Discovery shortcuts">
        <span className="text-sm text-muted">Start with</span>
        <button className="home-text-link" type="button" onClick={() => onShortcut('online')}>Online events <ArrowRightIcon /></button>
        <button className="home-text-link" type="button" onClick={() => onShortcut('inperson')}>In-person events <ArrowRightIcon /></button>
        <button className="home-text-link" type="button" onClick={() => onShortcut('college')}>Top college events <ArrowRightIcon /></button>
      </div>
    </section>
  );
}
