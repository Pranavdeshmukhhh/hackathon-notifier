export const EVENT_TYPES = [
  ['All', 'All event types'], ['Hackathon', 'Hackathons'],
  ['Top College', 'Top college events'], ['Internship', 'Internship opportunities'],
  ['Unique Sources', 'Curated events'],
];
export const FORMATS = [['All', 'Any format'], ['Online', 'Online'], ['Offline', 'In person'], ['Hybrid', 'Hybrid']];

export function readDiscoveryQuery(search = window.location.search) {
  const query = new URLSearchParams(search);
  const pick = (key, values, fallback) => values.includes(query.get(key)) ? query.get(key) : fallback;
  const page = Number(query.get('page'));
  return {
    search: (query.get('q') || '').trim().slice(0, 100),
    category: pick('type', EVENT_TYPES.map(([value]) => value), 'All'),
    source: (query.get('platform') || 'All').trim().slice(0, 50) || 'All',
    format: pick('format', FORMATS.map(([value]) => value), 'All'),
    closingSoon: query.get('closing') === '7',
    tab: pick('status', ['upcoming', 'missed', 'all'], 'upcoming'),
    sort: pick('sort', ['deadline', 'newest', 'name'], 'deadline'),
    limit: Number(pick('size', ['12', '24', '48', '96'], '12')),
    page: Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1,
  };
}

export function writeDiscoveryQuery(state) {
  const query = new URLSearchParams();
  if (state.search.trim()) query.set('q', state.search.trim());
  if (state.category !== 'All') query.set('type', state.category);
  if (state.source !== 'All') query.set('platform', state.source);
  if (state.format !== 'All') query.set('format', state.format);
  if (state.closingSoon) query.set('closing', '7');
  if (state.tab !== 'upcoming') query.set('status', state.tab);
  // Location is deliberately absent from shareable links.
  if (state.sort !== 'deadline' && state.sort !== 'distance') query.set('sort', state.sort);
  if (state.limit !== 12) query.set('size', String(state.limit));
  if (state.page > 1) query.set('page', String(state.page));
  return query.toString();
}

export function buildDiscoveryParams(state) {
  const query = new URLSearchParams({
    page: String(state.page), limit: String(state.limit), category: state.category,
    sort: state.sort, tab: state.tab,
  });
  if (state.source !== 'All') query.set('source', state.source);
  if (state.search.trim()) query.set('search', state.search.trim());
  if (state.format !== 'All') query.set('format', state.format);
  if (state.closingSoon) query.set('deadline_days', '7');
  if (typeof state.lat === 'number' && typeof state.lng === 'number' && Number.isFinite(state.lat) && Number.isFinite(state.lng)) {
    query.set('lat', String(state.lat)); query.set('lng', String(state.lng));
  }
  return `?${query}`;
}
