import React, { useEffect, useState } from 'react';
import Dialog from './Dialog';
import { requestApi } from '../utils/api';

const count = value => Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString('en-IN') : 'Not reported';

/** Public status only. Administrative scanning remains in the authenticated API. */
export default function AutoListModal({ onClose, apiBase }) {
  const [result, setResult] = useState({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const base = apiBase?.replace(/\/api(?:\/v1)?\/hackathons\/?$/, '')
    || (import.meta.env.PROD ? 'https://hackathon-notifier.onrender.com' : 'http://localhost:8000');

  useEffect(() => {
    const controller = new AbortController();
    let timer;
    const load = async () => {
      try {
        const { response, payload } = await requestApi(`${base}/api/scanner/status`, { signal: controller.signal });
        if (!response.ok || !payload || typeof payload.is_scanning !== 'boolean') throw new Error('Status unavailable');
        if (controller.signal.aborted) return;
        setResult({ phase: 'ready', data: payload });
        if (payload.is_scanning) timer = setTimeout(load, 10_000);
      } catch {
        if (!controller.signal.aborted) setResult({ phase: 'unavailable' });
      }
    };
    // oxlint-disable-next-line react/set-state-in-effect -- Synchronize an external status request.
    setResult({ phase: 'loading' });
    load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [base, attempt]);

  const status = result.data;
  const collected = typeof status?.last_scanned_at === 'string' ? new Date(status.last_scanned_at) : null;
  const lastRun = collected && !Number.isNaN(collected.getTime()) ? collected.toLocaleString('en-IN') : 'Not reported';
  const channels = [...new Set(Object.values(status?.active_keywords || {}).flat()
    .filter(value => typeof value === 'string' && value.trim()))];

  return (
    <Dialog label="Scanner status" onClose={onClose} className="dialog-compact">
      <header className="dialog-heading mb-6"><p className="eyebrow mb-2">Listing collection</p><h2 className="text-xl font-semibold">Scanner status</h2></header>
      <div className="dialog-body space-y-6" aria-busy={result.phase === 'loading'}>
        {result.phase === 'loading' && <p role="status" className="text-sm text-muted">Loading scanner status…</p>}
        {result.phase === 'unavailable' && <div role="alert"><p className="text-sm text-ink-2">Scanner status is unavailable. No activity can be confirmed.</p><button type="button" className="btn btn-ghost mt-4" onClick={() => setAttempt(value => value + 1)}>Retry status</button></div>}
        {status && <>
          <p role="status" className="text-sm text-ink">{status.is_scanning ? 'Discovery scan in progress' : 'No discovery scan in progress'}</p>
          <dl className="text-sm">
            <div className="dl-row"><dt>Last reported run</dt><dd>{lastRun}</dd></div>
            <div className="dl-row"><dt>Reported runs</dt><dd>{count(status.total_scans_run)}</dd></div>
            <div className="dl-row"><dt>Reported new listings</dt><dd>{count(status.total_new_indexed)}</dd></div>
          </dl>
          {channels.length > 0 && <div><h3 className="text-sm font-semibold mb-2">Reported discovery topics</h3><p className="text-sm text-ink-2">{channels.join(' · ')}</p></div>}
          <p className="text-sm text-muted">Activity is reported by the discovery scanner process. Scheduled platform collection may run separately; these counters are not lifetime totals.</p>
          <button type="button" className="btn btn-ghost" onClick={() => setAttempt(value => value + 1)}>Refresh status</button>
        </>}
        <p className="text-sm text-muted">Scans and new listings require administrator authorization. Opening this view does not start a scan.</p>
      </div>
      <button type="button" className="btn btn-ink mt-6" onClick={onClose}>Close</button>
    </Dialog>
  );
}
