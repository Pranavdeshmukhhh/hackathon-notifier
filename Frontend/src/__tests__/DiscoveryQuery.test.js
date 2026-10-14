import { describe, it, expect } from 'vitest';
import {
  calculateDistanceKm,
  parseDiscoveryStateFromUrl,
  syncDiscoveryStateToUrl,
  buildDiscoveryQueryParams,
  filterAndSortEvents,
} from '../utils/discoveryQuery';

describe('DiscoveryQuery Utilities', () => {
  it('calculateDistanceKm computes distance between valid coordinates', () => {
    // Distance between New York (40.7128, -74.0060) and London (51.5074, -0.1278) ~ 5570 km
    const dist = calculateDistanceKm(40.7128, -74.006, 51.5074, -0.1278);
    expect(dist).toBeGreaterThan(5500);
    expect(dist).toBeLessThan(5600);
  });

  it('calculateDistanceKm returns null for missing or invalid coordinates', () => {
    expect(calculateDistanceKm(null, 10, 20, 30)).toBeNull();
    expect(calculateDistanceKm(10, NaN, 20, 30)).toBeNull();
  });

  it('parseDiscoveryStateFromUrl extracts search, filters, and page', () => {
    const loc = {
      search: '?q=AI&format=online&status=open&source=devfolio&sort=newest&saved=1&page=3',
    };
    const state = parseDiscoveryStateFromUrl(loc);
    expect(state).toEqual({
      search: 'AI',
      format: 'online',
      status: 'open',
      source: 'devfolio',
      sort: 'newest',
      savedOnly: true,
      page: 3,
    });
  });

  it('parseDiscoveryStateFromUrl provides safe defaults for empty search', () => {
    const state = parseDiscoveryStateFromUrl({ search: '' });
    expect(state).toEqual({
      search: '',
      format: 'all',
      status: 'all',
      source: 'all',
      sort: 'deadline_asc',
      savedOnly: false,
      page: 1,
    });
  });

  it('buildDiscoveryQueryParams generates expected query strings', () => {
    const qs = buildDiscoveryQueryParams({
      search: 'web3',
      format: 'offline',
      status: 'closing',
      source: 'devfolio',
      page: 2,
      coords: { lat: 18.5204, lng: 73.8567 },
    });
    const params = new URLSearchParams(qs);
    expect(params.get('q')).toBe('web3');
    expect(params.get('format')).toBe('offline');
    expect(params.get('status')).toBe('closing');
    expect(params.get('source')).toBe('devfolio');
    expect(params.get('page')).toBe('2');
    expect(params.get('lat')).toBe('18.5204');
    expect(params.get('lng')).toBe('73.8567');
  });

  it('filterAndSortEvents correctly filters by search, format, status, and saved', () => {
    const events = [
      {
        id: '1',
        title: 'Open Online Hack',
        formatKey: 'online',
        formatLabel: 'Online',
        sourceLabel: 'Devfolio',
        sourceKey: 'devfolio',
        lifecycleKey: 'open',
        lifecycleLabel: 'Open',
        raw: { deadline: '2099-01-01', format: 'online' },
      },
      {
        id: '2',
        title: 'Closed In-person Hack',
        formatKey: 'offline',
        formatLabel: 'In-person',
        sourceLabel: 'Unstop',
        sourceKey: 'unstop',
        lifecycleKey: 'closed',
        lifecycleLabel: 'Closed',
        raw: { deadline: '2020-01-01', format: 'offline' },
      },
    ];

    // Filter by online
    const online = filterAndSortEvents(events, { format: 'online' });
    expect(online).toHaveLength(1);
    expect(online[0].id).toBe('1');

    // Filter by query
    const queried = filterAndSortEvents(events, { search: 'In-person' });
    expect(queried).toHaveLength(1);
    expect(queried[0].id).toBe('2');

    // Filter savedOnly
    const saved = filterAndSortEvents(events, { savedOnly: true, savedIds: ['2'] });
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe('2');
  });
});
