import { normalizeEventPresentation } from './eventPresentation';

export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some((v) => typeof v !== 'number' || Number.isNaN(v))) {
    return null;
  }
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function buildDiscoveryQueryParams({
  search = '',
  format = 'all',
  source = 'all',
  sort = 'deadline_asc',
  page = 1,
  limit = 12,
  coords = null,
} = {}) {
  const params = new URLSearchParams();
  if (search && search.trim()) params.set('q', search.trim());
  if (format && format !== 'all') params.set('format', format.toLowerCase());
  if (source && source !== 'all') params.set('source', source.toLowerCase());
  if (sort) params.set('sort', sort);
  if (page > 1) params.set('page', String(page));
  if (limit) params.set('limit', String(limit));
  if (coords?.lat != null && coords?.lng != null) {
    params.set('lat', String(coords.lat));
    params.set('lng', String(coords.lng));
  }
  return params.toString();
}

export function filterAndSortEvents(
  events = [],
  {
    search = '',
    format = 'all',
    source = 'all',
    sort = 'deadline_asc',
    scope = 'all', // 'all' | 'closing' | 'saved'
    savedIds = [],
    hideClosed = false,
    userCoords = null,
  } = {}
) {
  if (!Array.isArray(events)) return [];
  const query = String(search || '').trim().toLowerCase();
  const savedSet = new Set(savedIds);

  const normalized = events.map((ev) => {
    const item = ev?.sourceLabel ? { ...ev } : normalizeEventPresentation(ev);
    const lat = Number(ev?.latitude ?? ev?.raw?.latitude);
    const lng = Number(ev?.longitude ?? ev?.raw?.longitude);
    if (userCoords && !Number.isNaN(lat) && !Number.isNaN(lng) && lat !== 0 && lng !== 0) {
      item.distanceKm = calculateDistanceKm(userCoords.lat, userCoords.lng, lat, lng);
    }
    return item;
  });

  const filtered = normalized.filter((item) => {
    if (hideClosed && item.lifecycleKey === 'closed') return false;
    if (scope === 'saved' && !savedSet.has(item.id)) return false;
    if (scope === 'closing' && item.lifecycleKey !== 'closing') return false;
    if (format && format !== 'all' && item.formatKey !== format.toLowerCase()) return false;
    if (source && source !== 'all' && item.sourceKey !== source.toLowerCase()) return false;

    if (query) {
      const haystack = [
        item.title,
        item.locationLabel,
        item.sourceLabel,
        item.organizer,
        item.summary,
        item.prizeLabel,
        ...(item.tags || []),
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  return filtered.sort((a, b) => {
    if (a.lifecycleKey === 'closed' && b.lifecycleKey !== 'closed') return 1;
    if (a.lifecycleKey !== 'closed' && b.lifecycleKey === 'closed') return -1;

    if (sort === 'distance_asc') {
      const da = a.distanceKm ?? Number.POSITIVE_INFINITY;
      const db = b.distanceKm ?? Number.POSITIVE_INFINITY;
      return da - db;
    }

    if (sort === 'newest') {
      const ta = new Date(a.raw?.created_at || a.raw?.scraped_at || a.raw?.start_date || 0).getTime() || 0;
      const tb = new Date(b.raw?.created_at || b.raw?.scraped_at || b.raw?.start_date || 0).getTime() || 0;
      return tb - ta;
    }

    const da =
      new Date(a.raw?.registration_deadline || a.raw?.end_date || '2099-12-31').getTime() ||
      Number.POSITIVE_INFINITY;
    const db =
      new Date(b.raw?.registration_deadline || b.raw?.end_date || '2099-12-31').getTime() ||
      Number.POSITIVE_INFINITY;
    return da - db;
  });
}

export default {
  calculateDistanceKm,
  buildDiscoveryQueryParams,
  filterAndSortEvents,
};
