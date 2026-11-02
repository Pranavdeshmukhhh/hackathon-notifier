// Vercel proxies /api; development proxies only to an isolated local API.
export function normalizeApiBase(value = '/api') {
  const root = (value.trim() || '/api').replace(/\/+$/, '').replace(/\/(?:hackathons|events)$/, '');
  return /\/api(?:\/v1)?$/.test(root) ? root : `${root}/api`;
}
const API_BASE = normalizeApiBase(import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '/api');

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const upstream = options.signal;
  const abort = () => controller.abort(upstream?.reason);
  if (upstream?.aborted) abort();
  upstream?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const error = new Error(body.error || body.message || (typeof body.detail === 'string' && body.detail) || `Request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    if (payload?.success === false) throw new Error(payload.error || payload.message || 'The request was not accepted.');
    return payload;
  } catch (error) {
    if (controller.signal.aborted && !upstream?.aborted) throw new Error('The server is taking a little longer. Please try again.');
    throw error;
  } finally {
    clearTimeout(timer);
    upstream?.removeEventListener('abort', abort);
  }
}

export async function fetchPublicEvents(queryParams = '', { signal } = {}) {
  const query = new URLSearchParams(queryParams);
  const endpoints = [...new Set([`${API_BASE}/hackathons`, `${API_BASE.replace(/\/v1$/, '')}/v1/hackathons`])];
  let lastError;
  for (let i = 0; i < endpoints.length; i++) {
    try {
      const payload = await fetchJsonWithTimeout(`${endpoints[i]}${query.size ? `?${query}` : ''}`, { signal });
      const list = Array.isArray(payload) ? payload : [payload?.data,payload?.events,payload?.items].find(Array.isArray);
      if (!Array.isArray(list) || payload?.success === false) throw new Error('The server returned an invalid event feed. Please try again.');
      const paginated = Number.isFinite(payload?.upcoming_total);
      const total = paginated
        ? (query.get('tab') === 'all' ? payload.all_total : query.get('tab') === 'missed' ? payload.missed_total : payload.upcoming_total)
        : payload?.total ?? list.length;
      return { events: list, total, stats: payload?.stats || null, paginated, recovered: i > 0 };
    } catch (error) {
      lastError = error;
      if (signal?.aborted || ![404, 405].includes(error.status)) throw error;
    }
  }
  throw lastError;
}
export const fetchEvents = fetchPublicEvents;
export async function fetchEventById(eventId, { signal } = {}) {
  if (!eventId) throw new Error('Event ID is required.');
  const payload = await fetchJsonWithTimeout(`${API_BASE}/hackathons/${encodeURIComponent(eventId)}`, { signal });
  const event = payload?.data || payload;
  if (!event || typeof event !== 'object' || Array.isArray(event) || !event.title) throw new Error('The server returned invalid event details.');
  return event;
}
// Suggestions enter a review queue; they never start a scan or publish a listing.
export async function submitAutoListUrl(url) {
  const result = await fetchJsonWithTimeout(`${API_BASE}/submissions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
  });
  if (result?.success !== true) throw new Error('The server did not confirm your submission.');
  return result;
}
export default { fetchPublicEvents, fetchEvents, fetchEventById, submitAutoListUrl };
