import React from 'react';
import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';

let App;
beforeAll(async () => {
  vi.stubEnv('VITE_API_URL', 'http://127.0.0.1:8001');
  ({ default: App } = await import('../App'));
});
beforeEach(() => {
  window.history.replaceState({}, '', '/');
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestIdleCallback', vi.fn());
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());
afterAll(() => vi.unstubAllEnvs());

function response(data = [{ _id: 'sample', title: 'Sample event', link: 'https://example.com' }], total = data.length) {
  return { ok: true, status: 200, headers: new Headers({ ETag: 'sample' }), json: async () => ({ success: true, data, upcoming_total: total, missed_total: 0, all_total: total, stats: { sources: ['Devpost', 'Unstop'] } }) };
}

describe('Student discovery experience', () => {
  it('combines labelled filters, removes one filter, and updates the shareable URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    await screen.findByRole('heading', { name: 'Sample event' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Format' }), { target: { value: 'Online' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Event type' }), { target: { value: 'Top College' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Platform' }), { target: { value: 'Devpost' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Closes within 7 days' }));
    await waitFor(() => expect(new URL(fetchMock.mock.calls.at(-1)[0]).searchParams.get('deadline_days')).toBe('7'));
    const query = new URL(fetchMock.mock.calls.at(-1)[0]).searchParams;
    expect(query.get('format')).toBe('Online');
    expect(query.get('category')).toBe('Top College');
    expect(query.get('source')).toBe('Devpost');
    expect(window.location.search).toContain('closing=7');
    fireEvent.click(screen.getByRole('button', { name: 'Remove format filter: Online' }));
    await waitFor(() => expect(new URL(fetchMock.mock.calls.at(-1)[0]).searchParams.has('format')).toBe(false));
    expect(screen.getByRole('combobox', { name: 'Event type' })).toHaveValue('Top College');
  });

  it('restores a shared page and search without resetting pagination during mount', async () => {
    window.history.replaceState({}, '', '/?q=web&format=Hybrid&page=2');
    const fetchMock = vi.fn().mockResolvedValue(response(undefined, 14));
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    await screen.findByRole('heading', { name: 'Sample event' });
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('web');
    expect(screen.getByRole('combobox', { name: 'Format' })).toHaveValue('Hybrid');
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('page')).toBe('2');
    expect(window.location.search).toContain('page=2');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('separates no matches from an outage and recovers with reset filters', async () => {
    vi.stubGlobal('fetch', vi.fn(url => Promise.resolve(new URL(url).searchParams.has('format') ? response([], 0) : response())));
    render(<App />);
    await screen.findByRole('heading', { name: 'Sample event' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Format' }), { target: { value: 'Hybrid' } });
    await screen.findByText('No events match these filters.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset all filters' }));
    await screen.findByRole('heading', { name: 'Sample event' });
    expect(screen.getByRole('combobox', { name: 'Format' })).toHaveValue('All');
  });

  it('keeps cached listings visible and states that a refresh failed', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response()).mockRejectedValue(new TypeError('Offline'));
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    await screen.findByRole('heading', { name: 'Sample event' });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh listings' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not refresh. Showing previously loaded listings.');
    expect(screen.getByRole('heading', { name: 'Sample event' })).toBeInTheDocument();
  });

  it('respects a newer sort choice when an earlier location request completes', async () => {
    let locate;
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: success => { locate = success; } } });
    const fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    await screen.findByRole('heading', { name: 'Sample event' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort by' }), { target: { value: 'distance' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort by' }), { target: { value: 'name' } });
    await act(async () => locate({ coords: { latitude: 0, longitude: 0 } }));
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toHaveValue('name');
    const query = new URL(fetchMock.mock.calls.at(-1)[0]).searchParams;
    expect(query.get('sort')).toBe('name');
    expect(query.has('lat')).toBe(false);
    expect(window.location.search).not.toContain('lat=');
  });

  it('loads a shared event directly without requesting the discovery feed', async () => {
    const id = '0123456789abcdef01234567';
    window.history.replaceState({}, '', `/#event/${id}`);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: { _id: id, title: 'Shared sample event' } }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    await screen.findByRole('heading', { name: 'Shared sample event', level: 1 });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe(`http://127.0.0.1:8001/api/hackathons/${id}`);
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('returns to the same filtered discovery and restores the opener’s focus', async () => {
    const id = '0123456789abcdef01234567';
    const data = { _id: id, title: 'Filtered sample event', link: 'https://example.com' };
    window.history.replaceState({}, '', '/?format=Offline#events');
    vi.stubGlobal('fetch', vi.fn(url => Promise.resolve(url.endsWith(`/${id}`) ? { ok: true, status: 200, json: async () => ({ success: true, data }) } : response([data]))));
    vi.stubGlobal('requestAnimationFrame', callback => setTimeout(callback, 0));
    vi.stubGlobal('cancelAnimationFrame', clearTimeout);
    render(<App />);
    const opener = await screen.findByRole('link', { name: 'View details for Filtered sample event' });
    fireEvent.click(opener);
    await screen.findByRole('heading', { name: 'Filtered sample event', level: 1 });
    fireEvent.click(screen.getByRole('link', { name: 'Back to discovery' }));
    await screen.findByRole('searchbox', { name: 'Search' });
    expect(screen.getByRole('combobox', { name: 'Format' })).toHaveValue('Offline');
    await waitFor(() => expect(opener).toHaveFocus());
    expect(window.location.search).toBe('?format=Offline');
  });
});
