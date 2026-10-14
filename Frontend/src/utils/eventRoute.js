export function getEventIdFromUrl(locationObj = typeof window !== 'undefined' ? window.location : { search: '', pathname: '' }) {
  const params = new URLSearchParams(locationObj?.search || '');
  const queryId = params.get('event') || params.get('id');
  if (queryId) return decodeURIComponent(queryId);

  const match = (locationObj?.pathname || '').match(/^\/events\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function buildEventShareUrl(eventId, locationObj = typeof window !== 'undefined' ? window.location : { href: 'http://localhost/' }) {
  const url = new URL(locationObj?.href || 'http://localhost/');
  if (eventId) {
    url.searchParams.set('event', String(eventId));
  } else {
    url.searchParams.delete('event');
  }
  return url.toString();
}

export function pushEventRoute(eventId) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (eventId) {
    url.searchParams.set('event', String(eventId));
  } else {
    url.searchParams.delete('event');
  }
  window.history.pushState({ eventId }, '', url.toString());
}

export default {
  getEventIdFromUrl,
  buildEventShareUrl,
  pushEventRoute,
};
