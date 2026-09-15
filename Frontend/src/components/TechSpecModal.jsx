import React, { useEffect } from 'react';
import { LogoIcon } from './Icons';

/**
 * TechSpecModal — System architecture overlay dialog.
 * Fixed: React version now matches package.json (React 19).
 */
export default function TechSpecModal({ onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md" onClick={onClose}>
      <div className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-2xl border border-black/[0.08] dark:border-white/[0.12] rounded-[24px] p-6 w-full max-w-lg shadow-2xl relative animate-sheet-pop crystal-chamfer" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="System Architecture">
        <button className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full bg-black/[0.05] dark:bg-white/[0.10] text-slate-500 dark:text-slate-400 hover:bg-black/[0.10] dark:hover:bg-white/[0.15] transition-colors" onClick={onClose} aria-label="Close dialog">✕</button>
        <div className="flex items-center gap-3.5 mb-5">
          <div className="w-11 h-11 rounded-[12px] bg-gradient-to-br from-[#007AFF] to-[#0055D4] flex items-center justify-center shadow-sm shrink-0">
             <LogoIcon />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">System Architecture</h2>
            <p className="text-xs font-semibold text-[#007AFF] dark:text-[#0A84FF]">Autonomous Scraper & Notification Engine</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
           <span className="px-2.5 py-1 rounded-[6px] text-[10px] font-bold tracking-wide uppercase bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">Radar: 24/7 Active</span>
           <span className="px-2.5 py-1 rounded-[6px] text-[10px] font-bold tracking-wide uppercase bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">100% Automated</span>
        </div>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mb-5 leading-relaxed font-normal">
          Autonomous hackathon discovery engine engineered specifically for Indian engineering students. Aggregates verified hackathons across Devfolio, Unstop, Devpost, HackerEarth and Devnovate with sub-second latency and zero telemetry ads.
        </p>
        <div className="space-y-3 mb-5">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-900 dark:text-white">Stack & Services</h3>
          <div className="grid grid-cols-2 gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#007AFF]"></span> FastAPI (Python 3.12)</div>
            <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#34C759]"></span> MongoDB Atlas Cloud</div>
            <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#5856D6]"></span> React 19 + Vite 8</div>
            <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#30B0C7]"></span> Telegram Bot (@Pranavhakathon_bot)</div>
            <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#AF52DE]"></span> BeautifulSoup + curl_cffi</div>
            <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#00C7BE]"></span> Nominatim Geocoder</div>
          </div>
        </div>
        <div className="pt-3 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span>Crafted by Pranav Deshmukh · B.Tech 2nd Year</span>
          <span className="font-mono text-[10px] text-[#007AFF] dark:text-[#0A84FF] font-bold uppercase tracking-wider">Apple HIG Standards</span>
        </div>
      </div>
    </div>
  );
}
