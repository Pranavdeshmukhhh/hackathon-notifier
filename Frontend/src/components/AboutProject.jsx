import React from 'react';
import { ArrowUpRightIcon, TelegramIcon } from './Icons';

export default function AboutProject({ sectionRef, onTerms }) {
  return (
    <section ref={sectionRef} id="about" className="shell about-project scroll-mt-20" aria-labelledby="about-title">
      <div className="about-copy">
        <p className="eyebrow mb-4">About the project</p>
        <h2 id="about-title" className="display text-[clamp(2rem,4vw,2.75rem)]">Built around the details students need.</h2>
        <p className="mt-5 text-ink-2 leading-relaxed">Hackathons get shared across platforms, campus websites, and chat groups. Hackathon Notifier brings the listings together so you can spend less time hunting for a registration link.</p>
        <p className="mt-4 text-sm text-muted">Created by Pranav Deshmukh. Registration and event requirements are managed by the organizers.</p>
        <button className="home-text-link mt-3" type="button" onClick={onTerms}>Read terms and data use <ArrowUpRightIcon /></button>
      </div>
      <div>
        <h3 className="text-base font-semibold mb-2">From discovery to registration</h3>
        <ol className="registration-guide">
          <li><span className="mono text-muted" aria-hidden="true">01</span><div><h4>Find an event</h4><p>Search a topic, city, or campus. Compare online and in-person formats.</p></div></li>
          <li><span className="mono text-muted" aria-hidden="true">02</span><div><h4>Check the requirements</h4><p>Confirm deadlines, eligibility, and team rules on the organizer’s page.</p></div></li>
          <li><span className="mono text-muted" aria-hidden="true">03</span><div><h4>Register with the organizer</h4><p>Use the listing’s registration link to reach the official platform.</p></div></li>
        </ol>
        <div className="telegram-note">
          <p className="text-sm text-ink-2">Prefer a notification? Subscribe through the Telegram bot for event alerts.</p>
          <a href="https://t.me/Pranavhakathon_bot" target="_blank" rel="noopener noreferrer" className="home-text-link"><TelegramIcon /> Open Telegram <ArrowUpRightIcon /></a>
        </div>
      </div>
    </section>
  );
}
