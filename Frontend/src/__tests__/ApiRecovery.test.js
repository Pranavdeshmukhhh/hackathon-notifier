import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPublicEvents, fetchEventById, submitAutoListUrl } from '../utils/api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('API recovery', () => {
  it('loads events from primary endpoint when response is an array', async () => {
    const sampleEvents = [{ id: 'ev-1', title: 'Test Hackathon' }];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => sampleEvents,
      })
    );

    const result = await fetchPublicEvents();
    expect(result.events).toHaveLength(1);
    expect(result.events[0].title).toBe('Test Hackathon');
    expect(result.recovered).toBe(false);
  });

  it('loads events when wrapped in { events: [...] }', async () => {
    const sampleEvents = [{ id: 'ev-2', title: 'Wrapped Event' }];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ events: sampleEvents, total: 1 }),
      })
    );

    const result = await fetchPublicEvents();
    expect(result.events).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('recovers using fallback endpoint when primary endpoint fails', async () => {
    const sampleEvents = [{ id: 'ev-3', title: 'Fallback Event' }];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ items: sampleEvents }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchPublicEvents();
    expect(result.events).toHaveLength(1);
    expect(result.recovered).toBe(true);
  });

  it('throws an error when all fallback endpoints fail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Server unavailable' }),
      })
    );

    await expect(fetchPublicEvents()).rejects.toThrow(/Server unavailable|Request failed/);
  });

  it('fetchEventById validates that an ID is provided', async () => {
    await expect(fetchEventById('')).rejects.toThrow('Event ID is required.');
  });

  it('fetchEventById retrieves event details by ID', async () => {
    const sampleEvent = { id: '123', title: 'Specific Event' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => sampleEvent,
      })
    );

    const result = await fetchEventById('123');
    expect(result.title).toBe('Specific Event');
  });

  it('submitAutoListUrl posts valid JSON payload to auto-list endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, message: 'Queued' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await submitAutoListUrl('https://example.com/hackathon');
    expect(res.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auto-list'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/hackathon' }),
      })
    );
  });
});
