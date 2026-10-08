import { useEffect } from 'react';
import { ArrowRightIcon } from './Icons';

export default function TermsAndConditions({ onBack, onShowToast }) {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack]);

  const copyPageLink = () => {
    navigator.clipboard?.writeText(window.location.href);
    if (onShowToast) onShowToast('Link to Terms & Conditions copied to clipboard!');
  };

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const sections = [
    { id: 'charter-acceptance', num: '01', title: 'Acceptance & Student Charter' },
    { id: 'non-commercial', num: '02', title: '100% Free & Open-Source' },
    { id: 'aggregation-links', num: '03', title: 'Aggregated Data & Direct Portals' },
    { id: 'od-attendance', num: '04', title: 'University OD Attendance Policy' },
    { id: 'prizes-escrow', num: '05', title: 'Prize Pools, Bounties & Escrow' },
    { id: 'privacy-tracking', num: '06', title: 'Privacy & Data Use' },
    { id: 'intellectual-property', num: '07', title: 'IP & Code Ownership' },
    { id: 'pipeline-uptime', num: '08', title: 'Radar Pipeline & Scraper SLA' },
    { id: 'fair-use', num: '09', title: 'Fair Use & Community Standards' },
    { id: 'grievance-contact', num: '10', title: 'Grievance Redressal & Contact' },
  ];

  return (
    <div className="terms-page w-full max-w-5xl mx-auto space-y-10 py-4 animate-card-in">
      {/* ── TOP ACTION BAR ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-line">
        <button
          onClick={onBack}
          className="btn btn-ghost"
        >
          <span className="text-base leading-none">←</span> Back to Hackathon Radar
        </button>

        <div className="flex items-center gap-2.5">
          <button
            onClick={copyPageLink}
            className="btn btn-ghost"
            title="Copy URL with direct link"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>
            Share Terms
          </button>
          <button
            onClick={() => window.print()}
            className="btn btn-ghost"
            title="Print or export as PDF"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
            Print PDF
          </button>
        </div>
      </div>

      {/* ── HERO BANNER ── */}
      <div className="bg-surface p-6 sm:p-10 rounded-surface border border-line space-y-5 relative overflow-hidden">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-control bg-sunken text-ok text-xs font-semibold tracking-wide border border-line">
            <span className="w-2 h-2 rounded-control bg-sunken"></span>
            ZERO COMMERCIAL FEES • STUDENT-FIRST CHARTER
          </div>
          <span className="text-[11px] font-mono text-muted">Effective: September 2026</span>
        </div>

        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-ink leading-[1.15]">
          Terms & Conditions & Code of Student Practice
        </h1>

        <p className="text-base sm:text-lg text-ink-2 leading-relaxed font-normal max-w-3xl">
          Hackathon Notifier operates strictly as a transparent, zero-middleman aggregator and notification radar for engineering and technology students across India. By accessing this platform or our automated Telegram broadcast system, you agree to the conditions, disclaimers, and academic policies described below.
        </p>

        {/* 4 Feature Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
          <div className="p-3.5 rounded-surface bg-sunken border border-line">
            <div className="text-xs font-semibold text-ink flex items-center gap-1.5 mb-1">
              <span className="text-ok">✓</span> 100% Free Forever
            </div>
            <div className="text-[11px] text-muted leading-snug">Zero subscription fees, paywalls, or premium tiers.</div>
          </div>
          <div className="p-3.5 rounded-surface bg-sunken border border-line">
            <div className="text-xs font-semibold text-ink flex items-center gap-1.5 mb-1">
              <span className="text-accent-text">✓</span> No User Tracking
            </div>
            <div className="text-[11px] text-muted leading-snug">Zero third-party trackers, telemetry cookies, or ad networks.</div>
          </div>
          <div className="p-3.5 rounded-surface bg-sunken border border-line">
            <div className="text-xs font-semibold text-ink flex items-center gap-1.5 mb-1">
              <span className="text-accent-text">✓</span> Student OD Policy
            </div>
            <div className="text-[11px] text-muted leading-snug">Autonomous OD generator per AICTE & state universities.</div>
          </div>
          <div className="p-3.5 rounded-surface bg-sunken border border-line">
            <div className="text-xs font-semibold text-ink flex items-center gap-1.5 mb-1">
              <span className="text-warn">✓</span> 100% Student IP
            </div>
            <div className="text-[11px] text-muted leading-snug">You own 100% of all code, pitch decks, and projects you build.</div>
          </div>
        </div>
      </div>

      {/* ── TABLE OF CONTENTS PILL NAV ── */}
      <div className="space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-2">
          <span>Table of Contents</span>
          <span className="text-[10px] px-2 py-0.5 rounded-control bg-sunken font-mono">10 Clauses</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => scrollToSection(s.id)}
              className="btn btn-ghost"
            >
              <span className="text-[10px] font-mono text-accent-text">{s.num}</span>
              <span>{s.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── DETAILED SECTIONS ── */}
      <div className="space-y-8">

        {/* 01 */}
        <section id="charter-acceptance" className="bg-surface p-6 sm:p-8 rounded-surface border border-line space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-surface bg-sunken text-accent-text flex items-center justify-center font-mono font-semibold text-xs">01</span>
            <h2 className="text-xl font-semibold text-ink">Acceptance of Terms & Student Purpose</h2>
          </div>
          <p className="text-sm text-ink-2 leading-relaxed font-normal">
            By visiting Hackathon Notifier, consuming our FastAPI endpoints, accessing curated opportunities, or subscribing to our official Telegram Bot (<code className="px-1.5 py-0.5 rounded bg-sunken font-mono text-xs">@Pranavhakathon_bot</code>), you unconditionally accept these Terms and Conditions.
          </p>
          <div className="p-4 rounded-surface bg-sunken border border-line text-accent-text text-xs leading-relaxed space-y-1 font-medium">
            <p className="font-semibold">Student Utility Purpose:</p>
            <p>This service was created solely to empower engineering students to discover genuine hackathons, pre-placement interviews (PPIs), cash prize opportunities, and technical conferences without being bombarded by marketing spammers or paywalls.</p>
          </div>
        </section>

        {/* 02 */}
        <section id="non-commercial" className="bg-surface p-6 sm:p-8 rounded-surface border border-line space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-surface bg-sunken text-ok flex items-center justify-center font-mono font-semibold text-xs">02</span>
            <h2 className="text-xl font-semibold text-ink">100% Free & Open-Source Software (FOSS)</h2>
          </div>
          <p className="text-sm text-ink-2 leading-relaxed font-normal">
            Hackathon Notifier is completely free. We will never charge students a single rupee to view hackathons, download attendance OD forms, receive sub-second alerts, or participate in listed events.
          </p>
          <ul className="text-xs sm:text-sm text-ink-2 space-y-2 list-disc list-inside">
            <li><strong>No Paywalls:</strong> Every feature, filter, query API, and telemetry metric is freely accessible to all engineering students worldwide.</li>
            <li><strong>MIT License:</strong> The frontend and backend architectures are governed under the permissive MIT Open Source License. You are free to inspect, fork, and self-host the repository.</li>
            <li><strong>Zero Commercial Sponsorship Mandates:</strong> Listings are ranked purely on deadline, location proximity, and verified authenticity — never by paid promotional slots.</li>
          </ul>
        </section>

        {/* 03 */}
        <section id="aggregation-links" className="bg-surface p-6 sm:p-8 rounded-surface border border-line space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-surface bg-sunken text-accent-text flex items-center justify-center font-mono font-semibold text-xs">03</span>
            <h2 className="text-xl font-semibold text-ink">Aggregated Data & Direct Platform Redirection</h2>
          </div>
          <p className="text-sm text-ink-2 leading-relaxed font-normal">
            Hackathon Notifier is an independent aggregator. We pull publicly accessible event listings from verified developer platforms including:
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs font-semibold text-ink">
            <div className="p-3 rounded-surface bg-sunken border border-line">⚡ Unstop (Govt/College Hacks)</div>
            <div className="p-3 rounded-surface bg-sunken border border-line">⚡ Devfolio (ETH / Web3 / Global)</div>
            <div className="p-3 rounded-surface bg-sunken border border-line">⚡ Devpost (International & AI)</div>
            <div className="p-3 rounded-surface bg-sunken border border-line">⚡ HackerEarth (Enterprise Sprints)</div>
            <div className="p-3 rounded-surface bg-sunken border border-line">⚡ Devnovate (Developer Challenges)</div>
            <div className="p-3 rounded-surface bg-sunken border border-line">⚡ Curated Premier (IITs / NITs / BITS)</div>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            When you click "Apply / Register", you are redirected directly to the official organizer registration page. Hackathon Notifier does NOT act as an intermediary, does NOT collect application fees, and does NOT store event submissions.
          </p>
        </section>

        {/* 04 */}
        <section id="od-attendance" className="bg-surface p-6 sm:p-8 rounded-surface border border-line space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-surface bg-sunken text-bad flex items-center justify-center font-mono font-semibold text-xs">04</span>
            <h2 className="text-xl font-semibold text-ink">University On-Duty (OD) Attendance Policy</h2>
          </div>
          <p className="text-sm text-ink-2 leading-relaxed font-normal">
            A hallmark feature of Hackathon Notifier is the instant On-Duty (OD) application letter generator formatted according to Indian university standards (AICTE, Anna University, Mumbai University, VTU, KTU, IPU, etc.).
          </p>
          <div className="p-4 rounded-surface bg-sunken border border-line text-warn text-xs leading-relaxed space-y-1.5 font-medium">
            <p className="font-semibold">⚠️ Academic Disclaimer & Faculty Authorization:</p>
            <p>The OD letter generated by Hackathon Notifier serves as a standard format draft. Actual grant of academic attendance credit or leave remains exclusively at the discretion of your respective College Principal, Head of Department (HOD), or Class Teacher. Users must ensure compliance with their institution's minimum attendance rules (typically 75% or 80%).</p>
          </div>
        </section>

        {/* 05 */}
        <section id="prizes-escrow" className="bg-surface p-6 sm:p-8 rounded-surface border border-line space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-surface bg-sunken text-warn flex items-center justify-center font-mono font-semibold text-xs">05</span>
            <h2 className="text-xl font-semibold text-ink">Prize Pools, Bounties & Escrow Disclaimer</h2>
          </div>
          <p className="text-sm text-ink-2 leading-relaxed font-normal">
            Reported cash prize pools, swags, certificates, and Pre-Placement Interviews (PPIs) are parsed directly from organizers' public announcements. Hackathon Notifier verifies listings through heuristics and keyword checks but does not guarantee host compliance.
          </p>
          <ul className="text-xs sm:text-sm text-ink-2 space-y-2 list-disc list-inside">
            <li><strong>Disbursement Responsibility:</strong> The individual hackathon host organization (university student chapter, corporate entity, or foundation) is solely responsible for judging criteria and prize disbursement.</li>
            <li><strong>Zero Cut / Commission:</strong> We take 0% of student prize winnings. Every rupee, dollar, or bounty won by your team belongs 100% to you.</li>
            <li><strong>Fraud Reporting:</strong> If any listed organizer fails to honor stated terms or requests unfair fees, users can notify us immediately via our Telegram bot for radar delisting.</li>
          </ul>
        </section>

        {/* 06 */}
        <section id="privacy-tracking" className="bg-surface p-6 sm:p-8 rounded-surface border border-line space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-surface bg-sunken text-accent-text flex items-center justify-center font-mono font-semibold text-xs">06</span>
            <h2 className="text-xl font-semibold text-ink">Student Privacy & Data Use</h2>
          </div>
          <p className="text-sm text-ink-2 leading-relaxed font-normal">
            Browsing does not require an account. Application visit metrics are disabled by default; if enabled by the operator, they record coarse device categories and visit times, without IP addresses, full browser identifiers, or referrers. Hosting providers may maintain access logs. Existing historical records are not automatically removed.
          </p>
          <div className="space-y-2.5 text-xs sm:text-sm text-ink-2">
            <div className="p-3.5 rounded-surface bg-sunken border border-line">
              <strong>No Personal Accounts Required:</strong> You do not need to register, provide your phone number, or link a social account to search and filter hackathons.
            </div>
            <div className="p-3.5 rounded-surface bg-sunken border border-line">
              <strong>Location Search:</strong> With your permission, browser coordinates are sent to our API to sort nearby events. They are not saved in the event database. Hosting access logs may include request URLs.
            </div>
            <div className="p-3.5 rounded-surface bg-sunken border border-line">
              <strong>Telegram Bot Data:</strong> If you use the bot, subscription records and notification preferences are stored to deliver alerts. Telegram handles messages under its own privacy policy.
            </div>
          </div>
        </section>

        {/* 07 */}
        <section id="intellectual-property" className="bg-surface p-6 sm:p-8 rounded-surface border border-line space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-surface bg-sunken text-accent-text flex items-center justify-center font-mono font-semibold text-xs">07</span>
            <h2 className="text-xl font-semibold text-ink">Intellectual Property (IP) Rights</h2>
          </div>
          <p className="text-sm text-ink-2 leading-relaxed font-normal">
            Students retain 100% intellectual property rights over any software, algorithms, designs, or prototypes they build while participating in hackathons discovered via this portal. Hackathon Notifier claims zero equity, IP claims, or licensing rights over your creations.
          </p>
        </section>

        {/* 08 */}
        <section id="pipeline-uptime" className="bg-surface p-6 sm:p-8 rounded-surface border border-line space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-surface bg-sunken text-accent-text flex items-center justify-center font-mono font-semibold text-xs">08</span>
            <h2 className="text-xl font-semibold text-ink">Autonomous Radar Pipeline & Service Availability</h2>
          </div>
          <p className="text-sm text-ink-2 leading-relaxed font-normal">
            Our background scraping engine runs automated sweeps every 3–4 hours across platforms to ensure registration deadlines and prize pools remain accurate.
          </p>
          <div className="p-4 rounded-surface bg-sunken border border-line text-xs space-y-1 text-ink-2">
            <p className="font-semibold text-ink">Cloud Infrastructure Notice:</p>
            <p>On free-tier cloud instances (e.g. Render spin-ups), initial server wake-up may take 20–30 seconds. In the event of temporary platform downtime or API rate limiting by third-party portals, the website automatically falls back to cached data.</p>
          </div>
        </section>

        {/* 09 */}
        <section id="fair-use" className="bg-surface p-6 sm:p-8 rounded-surface border border-line space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-surface bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 flex items-center justify-center font-mono font-semibold text-xs">09</span>
            <h2 className="text-xl font-semibold text-ink">Fair Use & Community Standards</h2>
          </div>
          <p className="text-sm text-ink-2 leading-relaxed font-normal">
            To preserve server availability for all students, users must not:
          </p>
          <ul className="text-xs sm:text-sm text-ink-2 space-y-1.5 list-disc list-inside">
            <li>Execute automated Denial of Service (DoS) or aggressive endpoint flooding (our API implements rate limiting at 60 requests/minute).</li>
            <li>Submit fraudulent event listings, counterfeit prize claims, or misleading OD documentation.</li>
            <li>Attempt to bypass security headers, IP debouncing, or rate limiter protections.</li>
          </ul>
        </section>

        {/* 10 */}
        <section id="grievance-contact" className="bg-surface p-6 sm:p-8 rounded-surface border border-line space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-surface bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center font-mono font-semibold text-xs">10</span>
            <h2 className="text-xl font-semibold text-ink">Grievance Redressal & Contact Channels</h2>
          </div>
          <p className="text-sm text-ink-2 leading-relaxed font-normal">
            If you represent a university or hackathon organizing committee and wish to update, feature, or request removal of an event listing, contact the maintainers directly:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
            <div className="p-4 rounded-surface bg-sunken border border-line space-y-1">
              <span className="text-[10px] uppercase font-semibold text-muted">Telegram Bot Helpdesk</span>
              <a href="https://t.me/Pranavhakathon_bot" target="_blank" rel="noreferrer" className="block font-semibold text-accent-text hover:underline text-sm">
                @Pranavhakathon_bot ↗
              </a>
              <span className="text-[11px] text-muted block">Fastest response for student queries & listings</span>
            </div>
            <div className="p-4 rounded-surface bg-sunken border border-line space-y-1">
              <span className="text-[10px] uppercase font-semibold text-muted">Developer & Maintainer</span>
              <span className="block font-semibold text-ink text-sm">Pranav Deshmukh</span>
              <span className="text-[11px] text-muted block">B.Tech 2nd Year • Lead Architect</span>
            </div>
          </div>
        </section>

      </div>

      {/* ── BOTTOM RETURN ACTION ── */}
      <div className="text-ink rounded-surface p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-5 border border-line">
        <div className="space-y-1 text-center sm:text-left">
          <div className="text-[10px] font-mono tracking-wider text-accent-text uppercase font-semibold">● Ready to Build Something Incredible?</div>
          <div className="text-xl font-semibold tracking-tight">Explore 2,700+ verified hackathons now.</div>
          <div className="text-xs text-accent-text font-normal">Filtered for genuine cash prizes, OD approval letters, and direct SDE interview shortlists.</div>
        </div>
        <button
          onClick={onBack}
          className="btn btn-ghost"
        >
          Return to Hackathon Radar <ArrowRightIcon />
        </button>
      </div>
    </div>
  );
}
