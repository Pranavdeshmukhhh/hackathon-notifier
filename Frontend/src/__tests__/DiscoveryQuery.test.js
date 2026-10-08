import { describe, it, expect } from 'vitest';
import { readDiscoveryQuery, writeDiscoveryQuery, buildDiscoveryParams } from '../utils/discoveryQuery';

describe('Shareable discovery queries', () => {
  it('round trips independently combined filters and pagination', () => {
    const state = { ...readDiscoveryQuery(''), search: 'web Pune', category: 'Top College', source: 'Devpost', format: 'Online', closingSoon: true, tab: 'all', sort: 'name', limit: 24, page: 2 };
    expect(readDiscoveryQuery(writeDiscoveryQuery(state))).toEqual(state);
  });
  it('validates unsupported values instead of sending arbitrary pagination', () => {
    expect(readDiscoveryQuery('?format=broken&type=broken&sort=broken&status=broken&size=999&page=1.5')).toEqual(readDiscoveryQuery(''));
    expect(readDiscoveryQuery('?page=1001').page).toBe(1);
    expect(readDiscoveryQuery('?q=' + 'a'.repeat(200)).search).toHaveLength(100);
  });
  it('never exposes location or a location-dependent sort in shared URLs', () => {
    expect(writeDiscoveryQuery({ ...readDiscoveryQuery(''), sort: 'distance', lat: 12.345, lng: 67.89 })).toBe('');
  });
  it('encodes search and platform independently and includes zero coordinates', () => {
    const query = new URLSearchParams(buildDiscoveryParams({ ...readDiscoveryQuery(''), search: 'web & hardware', source: 'A|B', category: 'Top College', format: 'Hybrid', closingSoon: true, lat: 0, lng: 0 }));
    expect(query.get('search')).toBe('web & hardware');
    expect(query.get('source')).toBe('A|B');
    expect(query.get('format')).toBe('Hybrid');
    expect(query.get('category')).toBe('Top College');
    expect(query.get('deadline_days')).toBe('7');
    expect(query.get('lat')).toBe('0');
    expect(query.get('lng')).toBe('0');
  });
  it('omits incomplete coordinates and unused filters', () => {
    const query = new URLSearchParams(buildDiscoveryParams({ ...readDiscoveryQuery(''), lat: 12, lng: NaN }));
    for (const key of ['search', 'source', 'format', 'deadline_days', 'lat', 'lng']) expect(query.has(key)).toBe(false);
  });
});
