import { afterEach, describe, expect, it, vi } from 'vitest';
import { listingsApiUrl, listingsPayload, requestApi } from '../utils/api';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('API recovery', () => {
  it.each(['', '/api', '/api/v1', '/api/hackathons', '/api/v1/hackathons/'])('accepts the documented API form %s', path => {
    expect(listingsApiUrl(`https://example.com${path}`)).toBe(`https://example.com${path.includes('/v1') ? '/api/v1' : '/api'}/hackathons`);
  });
  it('keeps local previews local without configuration', () => {
    expect(listingsApiUrl(undefined, false)).toBe('http://localhost:8000/api/hackathons');
  });
  it('bounds a stalled response body as well as the connection', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => new Promise(() => {}) }));
    const result = requestApi('https://example.com/api', { timeout: 100 });
    const assertion = expect(result).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it('cancels obsolete work without reporting a timeout', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const result = requestApi('https://example.com/api', { signal: controller.signal });
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  });
  it.each([{ success: false, data: [] }, { success: true, data: null }, { success: true, data: [null] }, { success: true, data: [], upcoming_total: 'many' }])('rejects a broken payload %s', value => {
    expect(() => listingsPayload(value)).toThrow();
  });
  it('handles malformed optional sources without crashing the page', () => {
    expect(listingsPayload({ success: true, data: [], stats: { sources: {} } }).stats.sources).toEqual([]);
  });
});
