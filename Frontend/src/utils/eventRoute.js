export const validEventId = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
export const eventHash = id => validEventId(id) ? `#event/${id.toLowerCase()}` : null;

export function readEventRoute(hash = window.location.hash) {
  if (hash.startsWith('#event/')) return { view: 'event', id: hash.slice(7) };
  return { view: hash === '#terms' ? 'terms' : 'radar', id: null };
}

export function eventShareUrl(id, pageUrl = window.location.href) {
  const hash = eventHash(id);
  if (!hash) return null;
  const url = new URL(pageUrl);
  url.search = ''; // Event links do not share discovery preferences or location.
  url.hash = hash;
  return url.href;
}
