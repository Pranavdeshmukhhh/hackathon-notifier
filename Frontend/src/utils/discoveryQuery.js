import { normalizeEventPresentation, parseValidDate } from './eventPresentation';

export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
    return null;
  }
  if (Math.abs(lat1)>90 || Math.abs(lat2)>90 || Math.abs(lon1)>180 || Math.abs(lon2)>180) return null;
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

export function parseDiscoveryStateFromUrl(locationObj = typeof window !== 'undefined' ? window.location : { search: '' }) {
  const params = new URLSearchParams(locationObj?.search || '');
  const option = (key, allowed, fallback) => allowed.includes(params.get(key)) ? params.get(key) : fallback;
  const source = params.get('source') || 'all';
  return {
    search: (params.get('q') || '').slice(0, 100),
    format: option('format', ['all', 'online', 'offline', 'hybrid'], 'all'),
    status: option('status', ['all', 'open', 'closing', 'upcoming', 'closed', 'unknown', 'open_all'], 'all'),
    source: /^[\w -]{1,50}$/.test(source) ? source : 'all',
    sort: option('sort', ['deadline_asc', 'newest', 'distance_asc'], 'deadline_asc'),
    savedOnly: params.get('saved') === '1',
    page: Math.min(1000, Math.max(1, parseInt(params.get('page') || '1', 10) || 1)),
  };
}

export function syncDiscoveryStateToUrl(
  state = {},
  locationObj = typeof window !== 'undefined' ? window.location : null
) {
  if (typeof window === 'undefined' || !locationObj) return;
  const params = new URLSearchParams(locationObj.search || '');

  const setOrDelete = (key, val, defaultVal = '') => {
    if (val && val !== defaultVal) {
      params.set(key, String(val));
    } else {
      params.delete(key);
    }
  };

  setOrDelete('q', state.search?.trim(), '');
  setOrDelete('format', state.format, 'all');
  setOrDelete('status', state.status, 'all');
  setOrDelete('source', state.source, 'all');
  setOrDelete('sort', state.sort, 'deadline_asc');
  setOrDelete('saved', state.savedOnly ? '1' : '', '');
  setOrDelete('page', state.page > 1 ? String(state.page) : '', '');

  const nextQuery = params.toString();
  const nextUrl = `${locationObj.pathname}${nextQuery ? `?${nextQuery}` : ''}${locationObj.hash || ''}`;
  if (nextUrl !== `${locationObj.pathname}${locationObj.search}${locationObj.hash || ''}`) {
    window.history.replaceState(null, '', nextUrl);
  }
}

export function buildDiscoveryQueryParams({
  search = '',
  format = 'all',
  status = 'all',
  source = 'all',
  sort = 'deadline_asc',
  page = 1,
  limit = 12,
  coords = null,
  savedIds = null,
} = {}) {
  const params = new URLSearchParams();
  if (search && search.trim()) params.set('search', search.trim().slice(0, 100));
  if (format && format !== 'all') params.set('format', { online: 'Online', offline: 'Offline', hybrid: 'Hybrid' }[format] || 'All');
  if (status && status !== 'all') params.set('status', status.toLowerCase());
  if (source && source !== 'all') params.set('source', source.toLowerCase());
  if (sort) params.set('sort', { deadline_asc: 'deadline', distance_asc: 'distance', newest: 'newest' }[sort] || 'deadline');
  params.set('tab', status === 'closed' ? 'missed' : 'upcoming');
  if (savedIds) {
    params.set('tab', 'all');
    params.set('ids', savedIds.length ? savedIds.slice(0, 200).join(',') : 'none');
  }
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
    status = 'all',
    source = 'all',
    sort = 'deadline_asc',
    savedOnly = false,
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
    const rawLat = ev?.latitude ?? ev?.lat ?? ev?.raw?.latitude ?? ev?.raw?.lat;
    const rawLng = ev?.longitude ?? ev?.lng ?? ev?.raw?.longitude ?? ev?.raw?.lng;
    const lat = Number(rawLat);
    const lng = Number(rawLng);
    if (userCoords && rawLat != null && rawLng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
      item.distanceKm = calculateDistanceKm(userCoords.lat, userCoords.lng, lat, lng);
    }
    return item;
  });

  const filtered = normalized.filter((item) => {
    if (hideClosed && item.lifecycleKey === 'closed') return false;
    if (savedOnly && !savedSet.has(item.id)) return false;

    if (format && format !== 'all') {
      if (item.formatKey !== format.toLowerCase()) return false;
    }

    if (status && status !== 'all') {
      if (status === 'open_all') {
        if (item.lifecycleKey === 'closed') return false;
      } else if (item.lifecycleKey !== status.toLowerCase()) {
        return false;
      }
    }

    if (source && source !== 'all') {
      if (item.sourceKey !== source.toLowerCase()) return false;
    }

    if (query) {
      const searchableFields = [
        item.title,
        item.organizer,
        item.sourceLabel,
        item.formatLabel,
        item.locationLabel,
        item.eligibilityLabel,
        item.prizeLabel,
        item.summary,
        ...(item.tags || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (!searchableFields.includes(query)) return false;
    }

    return true;
  });

  return filtered.sort((a, b) => {
    // Keep active opportunities above closed ones unless explicitly filtering closed
    if (status !== 'closed') {
      if (a.lifecycleKey === 'closed' && b.lifecycleKey !== 'closed') return 1;
      if (a.lifecycleKey !== 'closed' && b.lifecycleKey === 'closed') return -1;
    }

    if (sort === 'distance_asc') {
      const da = a.distanceKm ?? Number.POSITIVE_INFINITY;
      const db = b.distanceKm ?? Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
    }

    if (sort === 'newest') {
      const ta =
        parseValidDate(a.raw?.created_at || a.raw?.scraped_at || a.raw?.start_date)?.getTime() || 0;
      const tb =
        parseValidDate(b.raw?.created_at || b.raw?.scraped_at || b.raw?.start_date)?.getTime() || 0;
      if (tb !== ta) return tb - ta;
    }

    // Default: soonest registration deadline first
    const da =
      parseValidDate(a.raw?.registration_deadline || a.raw?.deadline_iso || a.raw?.deadline)?.getTime() ??
      Number.POSITIVE_INFINITY;
    const db =
      parseValidDate(b.raw?.registration_deadline || b.raw?.deadline_iso || b.raw?.deadline)?.getTime() ??
      Number.POSITIVE_INFINITY;
    return da - db;
  });
}

export default {
  calculateDistanceKm,
  parseDiscoveryStateFromUrl,
  syncDiscoveryStateToUrl,
  buildDiscoveryQueryParams,
  filterAndSortEvents,
};
