import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeApiBase, fetchPublicEvents } from '../utils/api';
import { normalizeEventPresentation, deriveEventStatus } from '../utils/eventPresentation';
import { buildDiscoveryQueryParams, parseDiscoveryStateFromUrl } from '../utils/discoveryQuery';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Production integration contract', () => {
  it('accepts documented server root, API root, version, and endpoint URLs', () => {
    expect(normalizeApiBase('https://api.example.com/')).toBe('https://api.example.com/api');
    expect(normalizeApiBase('https://api.example.com/api/hackathons')).toBe('https://api.example.com/api');
    expect(normalizeApiBase('https://api.example.com/api/v1')).toBe('https://api.example.com/api/v1');
    expect(normalizeApiBase('/api')).toBe('/api');
  });

  it('requests the actual backend route and preserves server totals across pages', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      success: true, data: [{ _id: 'page-2-event', title: 'Event on page 2' }], upcoming_total: 25, all_total: 30,
    }) });
    vi.stubGlobal('fetch', fetchMock);
    const query = buildDiscoveryQueryParams({ search: 'robotics', format: 'offline', page: 2 });
    const result = await fetchPublicEvents(query);
    expect(fetchMock.mock.calls[0][0]).toContain('/api/hackathons?');
    const url = new URL(fetchMock.mock.calls[0][0], 'https://example.com');
    expect(url.searchParams.get('search')).toBe('robotics');
    expect(url.searchParams.get('format')).toBe('Offline');
    expect(url.searchParams.get('page')).toBe('2');
    expect(result.total).toBe(25);
    expect(result.paginated).toBe(true);
  });

  it('does not retry alternate routes when the server reports an outage', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: 'Listings temporarily unavailable' }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchPublicEvents()).rejects.toThrow('Listings temporarily unavailable');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('renders actual backend fields, including structured deadlines and team requirements', () => {
    const event = normalizeEventPresentation({ _id: 'a1', title: 'A real event', source: 'Unstop', mode: 'Virtual',
      deadline_iso: '2099-12-01', registration_deadline: { date: '2099-12-01' }, desc: 'Real description',
      min_team_size: 2, max_team_size: 4, link: 'https://example.com/registration' });
    expect(event.id).toBe('a1');
    expect(event.description).toBe('Real description');
    expect(event.teamLabel).toBe('2–4 members');
    expect(event.deadlineLabel).toContain('Dec 1');
    expect(event.formatKey).toBe('online');
    expect(event.url).toBe('https://example.com/registration');
  });

  it('treats exact deadlines and date-only deadlines differently on the same day', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-30T12:00:00Z'));
    expect(deriveEventStatus({ registration_deadline: { at: '2026-10-30T11:00:00Z' } }).key).toBe('closed');
    expect(deriveEventStatus({ deadline_iso: '2026-10-30' }).key).toBe('closing');
    expect(deriveEventStatus({}).key).toBe('unknown');
  });

  it('does not render executable registration links', () => {
    expect(normalizeEventPresentation({ title: 'Unsafe', link: 'javascript:alert(1)' }).url).toBeNull();
  });

  it('normalizes malformed shared filter links and bounds requests', () => {
    const state = parseDiscoveryStateFromUrl({ search: '?page=999999&status=bogus&format=wrong&sort=x' });
    expect(state.page).toBe(1000);
    expect(state.status).toBe('all');
    expect(state.format).toBe('all');
    expect(state.sort).toBe('deadline_asc');
    const query = new URLSearchParams(buildDiscoveryQueryParams({ savedIds: [] }));
    expect(query.get('ids')).toBe('none');
    expect(query.get('tab')).toBe('all');
  });
});
