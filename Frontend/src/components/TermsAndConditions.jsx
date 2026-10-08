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
    <div className="w-full max-w-5xl mx-auto space-y-10 py-4 animate-card-in">
      {/* ── TOP ACTION BAR ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-black/[0.08] dark:border-white/[0.10]">
        <button
          onClick={onBack}
          className="h-10 min-h-[40px] px-4 rounded-[12px] apple-squircle apple-touch-target apple-spring-press apple-dual-bevel bg-black/[0.05] dark:bg-white/[0.08] hover:bg-black/[0.08] dark:hover:bg-white/[0.14] text-slate-800 dark:text-slate-200 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs"
        >
          <span className="text-base leading-none">←</span> Back to Hackathon Radar
        </button>

        <div className="flex items-center gap-2.5">
          <button
            onClick={copyPageLink}
            className="h-10 min-h-[40px] px-3.5 rounded-[12px] apple-squircle apple-touch-target apple-spring-press apple-dual-bevel bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Copy URL with direct link"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>
            Share Terms
          </button>
          <button
            onClick={() => window.print()}
            className="h-10 min-h-[40px] px-3.5 rounded-[12px] apple-squircle apple-touch-target apple-spring-press apple-dual-bevel bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Print or export as PDF"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
            Print PDF
          </button>
        </div>
      </div>

      {/* ── HERO BANNER ── */}
      <div className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-2xl p-6 sm:p-10 rounded-[28px] border border-black/[0.08] dark:border-white/[0.10] shadow-[0_4px_24px_rgba(0,0,0,0.04)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.40)] space-y-5 crystal-chamfer crystal-sheen relative overflow-hidden">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-bold tracking-wide border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse"></span>
            ZERO COMMERCIAL FEES • STUDENT-FIRST CHARTER
          </div>
          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">Effective: September 2026 • v4.2 HIG</span>
        </div>

        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-950 dark:text-white leading-[1.15]">
          Terms & Conditions & Code of Student Practice
        </h1>

        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed font-normal max-w-3xl">
          Hackathon Notifier operates strictly as a transparent, zero-middleman aggregator and notification radar for engineering and technology students across India. By accessing this platform or our automated Telegram broadcast system, you agree to the conditions, disclaimers, and academic policies described below.
        </p>

        {/* 4 Feature Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
          <div className="p-3.5 rounded-[16px] bg-[#F2F2F7] dark:bg-[#2C2C2E] border border-black/[0.04] dark:border-white/[0.06] crystal-chamfer">
            <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-1">
              <span className="text-emerald-500">✓</span> 100% Free Forever
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">Zero subscription fees, paywalls, or premium tiers.</div>
          </div>
          <div className="p-3.5 rounded-[16px] bg-[#F2F2F7] dark:bg-[#2C2C2E] border border-black/[0.04] dark:border-white/[0.06] crystal-chamfer">
            <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-1">
              <span className="text-blue-500">✓</span> No User Tracking
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">Zero third-party trackers, telemetry cookies, or ad networks.</div>
          </div>
          <div className="p-3.5 rounded-[16px] bg-[#F2F2F7] dark:bg-[#2C2C2E] border border-black/[0.04] dark:border-white/[0.06] crystal-chamfer">
            <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-1">
              <span className="text-purple-500">✓</span> Student OD Policy
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">Autonomous OD generator per AICTE & state universities.</div>
          </div>
          <div className="p-3.5 rounded-[16px] bg-[#F2F2F7] dark:bg-[#2C2C2E] border border-black/[0.04] dark:border-white/[0.06] crystal-chamfer">
            <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mb-1">
              <span className="text-amber-500">✓</span> 100% Student IP
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">You own 100% of all code, pitch decks, and projects you build.</div>
          </div>
        </div>
      </div>

      {/* ── TABLE OF CONTENTS PILL NAV ── */}
      <div className="space-y-3">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
          <span>Table of Contents</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/[0.05] dark:bg-white/[0.08] font-mono">10 Clauses</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => scrollToSection(s.id)}
              className="px-3.5 py-2 rounded-[12px] bg-white dark:bg-[#1C1C1E] border border-black/[0.08] dark:border-white/[0.10] hover:border-[#007AFF] text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-[#007AFF] dark:hover:text-[#0A84FF] transition-all cursor-pointer shadow-2xs flex items-center gap-1.5"
            >
              <span className="text-[10px] font-mono text-[#007AFF] dark:text-[#0A84FF]">{s.num}</span>
              <span>{s.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── DETAILED SECTIONS ── */}
      <div className="space-y-8">

        {/* 01 */}
        <section id="charter-acceptance" className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl p-6 sm:p-8 rounded-[24px] border border-black/[0.08] dark:border-white/[0.10] shadow-sm space-y-4 crystal-chamfer">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-[10px] bg-[#007AFF]/10 text-[#007AFF] dark:bg-[#0A84FF]/20 dark:text-[#0A84FF] flex items-center justify-center font-mono font-bold text-xs">01</span>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Acceptance of Terms & Student Purpose</h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
            By visiting Hackathon Notifier, consuming our FastAPI endpoints, accessing curated opportunities, or subscribing to our official Telegram Bot (<code className="px-1.5 py-0.5 rounded bg-black/[0.05] dark:bg-white/[0.08] font-mono text-xs">@Pranavhakathon_bot</code>), you unconditionally accept these Terms and Conditions.
          </p>
          <div className="p-4 rounded-[16px] bg-blue-500/10 border border-blue-500/20 text-blue-900 dark:text-blue-200 text-xs leading-relaxed space-y-1 font-medium">
            <p className="font-bold">Student Utility Purpose:</p>
            <p>This service was created solely to empower engineering students to discover genuine hackathons, pre-placement interviews (PPIs), cash prize opportunities, and technical conferences without being bombarded by marketing spammers or paywalls.</p>
          </div>
        </section>

        {/* 02 */}
        <section id="non-commercial" className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl p-6 sm:p-8 rounded-[24px] border border-black/[0.08] dark:border-white/[0.10] shadow-sm space-y-4 crystal-chamfer">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-mono font-bold text-xs">02</span>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">100% Free & Open-Source Software (FOSS)</h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
            Hackathon Notifier is completely free. We will never charge students a single rupee to view hackathons, download attendance OD forms, receive sub-second alerts, or participate in listed events.
          </p>
          <ul className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 space-y-2 list-disc list-inside">
            <li><strong>No Paywalls:</strong> Every feature, filter, query API, and telemetry metric is freely accessible to all engineering students worldwide.</li>
            <li><strong>MIT License:</strong> The frontend and backend architectures are governed under the permissive MIT Open Source License. You are free to inspect, fork, and self-host the repository.</li>
            <li><strong>Zero Commercial Sponsorship Mandates:</strong> Listings are ranked purely on deadline, location proximity, and verified authenticity — never by paid promotional slots.</li>
          </ul>
        </section>

        {/* 03 */}
        <section id="aggregation-links" className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl p-6 sm:p-8 rounded-[24px] border border-black/[0.08] dark:border-white/[0.10] shadow-sm space-y-4 crystal-chamfer">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-[10px] bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-mono font-bold text-xs">03</span>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Aggregated Data & Direct Platform Redirection</h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
            Hackathon Notifier is an independent aggregator. We pull publicly accessible event listings from verified developer platforms including:
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
            <div className="p-3 rounded-[12px] bg-[#F2F2F7] dark:bg-[#2C2C2E] border border-black/[0.04] dark:border-white/[0.06]">⚡ Unstop (Govt/College Hacks)</div>
            <div className="p-3 rounded-[12px] bg-[#F2F2F7] dark:bg-[#2C2C2E] border border-black/[0.04] dark:border-white/[0.06]">⚡ Devfolio (ETH / Web3 / Global)</div>
            <div className="p-3 rounded-[12px] bg-[#F2F2F7] dark:bg-[#2C2C2E] border border-black/[0.04] dark:border-white/[0.06]">⚡ Devpost (International & AI)</div>
            <div className="p-3 rounded-[12px] bg-[#F2F2F7] dark:bg-[#2C2C2E] border border-black/[0.04] dark:border-white/[0.06]">⚡ HackerEarth (Enterprise Sprints)</div>
            <div className="p-3 rounded-[12px] bg-[#F2F2F7] dark:bg-[#2C2C2E] border border-black/[0.04] dark:border-white/[0.06]">⚡ Devnovate (Developer Challenges)</div>
            <div className="p-3 rounded-[12px] bg-[#F2F2F7] dark:bg-[#2C2C2E] border border-black/[0.04] dark:border-white/[0.06]">⚡ Curated Premier (IITs / NITs / BITS)</div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            When you click "Apply / Register", you are redirected directly to the official organizer registration page. Hackathon Notifier does NOT act as an intermediary, does NOT collect application fees, and does NOT store event submissions.
          </p>
        </section>

        {/* 04 */}
        <section id="od-attendance" className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl p-6 sm:p-8 rounded-[24px] border border-black/[0.08] dark:border-white/[0.10] shadow-sm space-y-4 crystal-chamfer">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-[10px] bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center font-mono font-bold text-xs">04</span>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">University On-Duty (OD) Attendance Policy</h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
            A hallmark feature of Hackathon Notifier is the instant On-Duty (OD) application letter generator formatted according to Indian university standards (AICTE, Anna University, Mumbai University, VTU, KTU, IPU, etc.).
          </p>
          <div className="p-4 rounded-[16px] bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-xs leading-relaxed space-y-1.5 font-medium">
            <p className="font-bold">⚠️ Academic Disclaimer & Faculty Authorization:</p>
            <p>The OD letter generated by Hackathon Notifier serves as a standard format draft. Actual grant of academic attendance credit or leave remains exclusively at the discretion of your respective College Principal, Head of Department (HOD), or Class Teacher. Users must ensure compliance with their institution's minimum attendance rules (typically 75% or 80%).</p>
          </div>
        </section>

        {/* 05 */}
        <section id="prizes-escrow" className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl p-6 sm:p-8 rounded-[24px] border border-black/[0.08] dark:border-white/[0.10] shadow-sm space-y-4 crystal-chamfer">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-mono font-bold text-xs">05</span>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Prize Pools, Bounties & Escrow Disclaimer</h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
            Reported cash prize pools, swags, certificates, and Pre-Placement Interviews (PPIs) are parsed directly from organizers' public announcements. Hackathon Notifier verifies listings through heuristics and keyword checks but does not guarantee host compliance.
          </p>
          <ul className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 space-y-2 list-disc list-inside">
            <li><strong>Disbursement Responsibility:</strong> The individual hackathon host organization (university student chapter, corporate entity, or foundation) is solely responsible for judging criteria and prize disbursement.</li>
            <li><strong>Zero Cut / Commission:</strong> We take 0% of student prize winnings. Every rupee, dollar, or bounty won by your team belongs 100% to you.</li>
            <li><strong>Fraud Reporting:</strong> If any listed organizer fails to honor stated terms or requests unfair fees, users can notify us immediately via our Telegram bot for radar delisting.</li>
          </ul>
        </section>

        {/* 06 */}
        <section id="privacy-tracking" className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl p-6 sm:p-8 rounded-[24px] border border-black/[0.08] dark:border-white/[0.10] shadow-sm space-y-4 crystal-chamfer">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-[10px] bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center font-mono font-bold text-xs">06</span>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Student Privacy & Data Use</h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
            Browsing does not require an account. Application visit metrics are disabled by default; if enabled by the operator, they record coarse device categories and visit times, without IP addresses, full browser identifiers, or referrers. Hosting providers may maintain access logs. Existing historical records are not automatically removed.
          </p>
          <div className="space-y-2.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            <div className="p-3.5 rounded-[14px] bg-[#F2F2F7] dark:bg-[#2C2C2E] border border-black/[0.04] dark:border-white/[0.06]">
              <strong>No Personal Accounts Required:</strong> You do not need to register, provide your phone number, or link a social account to search and filter hackathons.
            </div>
            <div className="p-3.5 rounded-[14px] bg-[#F2F2F7] dark:bg-[#2C2C2E] border border-black/[0.04] dark:border-white/[0.06]">
              <strong>Location Search:</strong> With your permission, browser coordinates are sent to our API to sort nearby events. They are not saved in the event database. Hosting access logs may include request URLs.
            </div>
            <div className="p-3.5 rounded-[14px] bg-[#F2F2F7] dark:bg-[#2C2C2E] border border-black/[0.04] dark:border-white/[0.06]">
              <strong>Telegram Bot Data:</strong> If you use the bot, subscription records and notification preferences are stored to deliver alerts. Telegram handles messages under its own privacy policy.
            </div>
          </div>
        </section>

        {/* 07 */}
        <section id="intellectual-property" className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl p-6 sm:p-8 rounded-[24px] border border-black/[0.08] dark:border-white/[0.10] shadow-sm space-y-4 crystal-chamfer">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-[10px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-mono font-bold text-xs">07</span>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Intellectual Property (IP) Rights</h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
            Students retain 100% intellectual property rights over any software, algorithms, designs, or prototypes they build while participating in hackathons discovered via this portal. Hackathon Notifier claims zero equity, IP claims, or licensing rights over your creations.
          </p>
        </section>

        {/* 08 */}
        <section id="pipeline-uptime" className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl p-6 sm:p-8 rounded-[24px] border border-black/[0.08] dark:border-white/[0.10] shadow-sm space-y-4 crystal-chamfer">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-[10px] bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center font-mono font-bold text-xs">08</span>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Autonomous Radar Pipeline & Service Availability</h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
            Our background scraping engine runs automated sweeps every 3–4 hours across platforms to ensure registration deadlines and prize pools remain accurate.
          </p>
          <div className="p-4 rounded-[16px] bg-[#F2F2F7] dark:bg-[#2C2C2E] border border-black/[0.04] dark:border-white/[0.06] text-xs space-y-1 text-slate-600 dark:text-slate-400">
            <p className="font-semibold text-slate-900 dark:text-white">Cloud Infrastructure Notice:</p>
            <p>On free-tier cloud instances (e.g. Render spin-ups), initial server wake-up may take 20–30 seconds. In the event of temporary platform downtime or API rate limiting by third-party portals, the website automatically falls back to cached data.</p>
          </div>
        </section>

        {/* 09 */}
        <section id="fair-use" className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl p-6 sm:p-8 rounded-[24px] border border-black/[0.08] dark:border-white/[0.10] shadow-sm space-y-4 crystal-chamfer">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-[10px] bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 flex items-center justify-center font-mono font-bold text-xs">09</span>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Fair Use & Community Standards</h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
            To preserve server availability for all students, users must not:
          </p>
          <ul className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 space-y-1.5 list-disc list-inside">
            <li>Execute automated Denial of Service (DoS) or aggressive endpoint flooding (our API implements rate limiting at 60 requests/minute).</li>
            <li>Submit fraudulent event listings, counterfeit prize claims, or misleading OD documentation.</li>
            <li>Attempt to bypass security headers, IP debouncing, or rate limiter protections.</li>
          </ul>
        </section>

        {/* 10 */}
        <section id="grievance-contact" className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl p-6 sm:p-8 rounded-[24px] border border-black/[0.08] dark:border-white/[0.10] shadow-sm space-y-4 crystal-chamfer">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-[10px] bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center font-mono font-bold text-xs">10</span>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Grievance Redressal & Contact Channels</h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
            If you represent a university or hackathon organizing committee and wish to update, feature, or request removal of an event listing, contact the maintainers directly:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
            <div className="p-4 rounded-[16px] bg-[#F2F2F7] dark:bg-[#2C2C2E] border border-black/[0.04] dark:border-white/[0.06] space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Telegram Bot Helpdesk</span>
              <a href="https://t.me/Pranavhakathon_bot" target="_blank" rel="noreferrer" className="block font-bold text-[#007AFF] dark:text-[#0A84FF] hover:underline text-sm">
                @Pranavhakathon_bot ↗
              </a>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Fastest response for student queries & listings</span>
            </div>
            <div className="p-4 rounded-[16px] bg-[#F2F2F7] dark:bg-[#2C2C2E] border border-black/[0.04] dark:border-white/[0.06] space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Developer & Maintainer</span>
              <span className="block font-bold text-slate-900 dark:text-white text-sm">Pranav Deshmukh</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">B.Tech 2nd Year • Lead Architect</span>
            </div>
          </div>
        </section>

      </div>

      {/* ── BOTTOM RETURN ACTION ── */}
      <div className="bg-gradient-to-r from-[#007AFF] to-[#5856D6] text-white rounded-[24px] p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-5 shadow-lg border border-blue-400/30 crystal-chamfer crystal-sheen">
        <div className="space-y-1 text-center sm:text-left">
          <div className="text-[10px] font-mono tracking-wider text-blue-100 uppercase font-bold">● Ready to Build Something Incredible?</div>
          <div className="text-xl font-bold tracking-tight">Explore 2,700+ verified hackathons now.</div>
          <div className="text-xs text-blue-100 font-normal">Filtered for genuine cash prizes, OD approval letters, and direct SDE interview shortlists.</div>
        </div>
        <button
          onClick={onBack}
          className="h-12 min-h-[44px] px-6 rounded-[14px] apple-squircle apple-touch-target apple-spring-press apple-dual-bevel bg-white text-[#007AFF] text-xs sm:text-sm font-bold hover:bg-slate-50 transition shadow-md whitespace-nowrap flex items-center gap-2 cursor-pointer shrink-0"
        >
          Return to Hackathon Radar <ArrowRightIcon />
        </button>
      </div>
    </div>
  );
}
