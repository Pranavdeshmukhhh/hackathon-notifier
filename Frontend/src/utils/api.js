const API_BASE = (import.meta.env?.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.detail || errBody.message || `Request failed (${response.status})`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPublicEvents(queryParams = '') {
  const qs = queryParams ? (queryParams.startsWith('?') ? queryParams : `?${queryParams}`) : '';
  const endpoints = [
    `${API_BASE}/events${qs}`,
    `${API_BASE}/public/events${qs}`,
    `/api/public/events${qs}`,
    `/events.json`,
  ];

  let lastError = null;
  for (let i = 0; i < endpoints.length; i++) {
    try {
      const payload = await fetchJsonWithTimeout(endpoints[i]);
      const list = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.events)
          ? payload.events
          : Array.isArray(payload?.items)
            ? payload.items
            : Array.isArray(payload?.data)
              ? payload.data
              : null;

      if (Array.isArray(list)) {
        return {
          events: list,
          total: typeof payload?.total === 'number' ? payload.total : list.length,
          recovered: i > 0,
        };
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Could not load hackathons from the server.');
}

export const fetchEvents = fetchPublicEvents;

export async function fetchEventById(eventId) {
  if (!eventId) throw new Error('Event ID is required.');
  return fetchJsonWithTimeout(`${API_BASE}/events/${encodeURIComponent(eventId)}`);
}

export async function submitAutoListUrl(url, extra = {}) {
  return fetchJsonWithTimeout(`${API_BASE}/auto-list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, ...extra }),
  });
}

export default {
  fetchPublicEvents,
  fetchEvents,
  fetchEventById,
  submitAutoListUrl,
};
