export function getEventIdFromUrl(
  locationObj = typeof window !== 'undefined' ? window.location : { search: '', pathname: '' }
) {
  const params = new URLSearchParams(locationObj?.search || '');
  const queryId = params.get('event') || params.get('id');
  if (queryId) return queryId;

  const match = (locationObj?.pathname || '').match(/^\/events\/([^/]+)$/);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); } catch { return null; }
}

export function buildEventShareUrl(
  eventId,
  locationObj = typeof window !== 'undefined' ? window.location : { href: 'http://localhost/' }
) {
  const url = new URL(locationObj?.href || 'http://localhost/');
  if (eventId) {
    url.searchParams.set('event', String(eventId));
  } else {
    url.searchParams.delete('event');
    url.searchParams.delete('id');
    if (/^\/events\/[^/]+$/.test(url.pathname)) url.pathname = '/';
  }
  return url.toString();
}

export function pushEventRoute(eventId) {
  if (typeof window === 'undefined') return;
  const next = buildEventShareUrl(eventId, window.location);
  if (next === window.location.href) return;
  window.history.pushState({ eventId: eventId || null }, '', next);
}

export default {getEventIdFromUrl, buildEventShareUrl, pushEventRoute};
