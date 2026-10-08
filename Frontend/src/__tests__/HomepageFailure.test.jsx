import React from 'react';
import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

let App;
beforeAll(async () => {
  vi.stubEnv('VITE_API_URL', 'http://127.0.0.1:8001');
  ({ default: App } = await import('../App'));
});
beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    disconnect() {}
  });
});
afterEach(() => vi.unstubAllGlobals());
afterAll(() => vi.unstubAllEnvs());

describe('Homepage API failures', () => {
  it('keeps loading visible when Strict Mode cancels an earlier request', async () => {
    let resolveLatest;
    vi.stubGlobal('fetch', vi.fn((_url, { signal }) => new Promise((resolve, reject) => {
      resolveLatest = resolve;
      signal.addEventListener('abort', () => reject(new DOMException('Canceled', 'AbortError')), { once: true });
    })));
    render(<React.StrictMode><App /></React.StrictMode>);
    await act(async () => {});
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh listings' })).toBeDisabled();
    expect(screen.queryByText('Nothing new right now — check back soon.')).not.toBeInTheDocument();
    await act(async () => resolveLatest({ ok: false, status: 503 }));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load listings.');
  });

  it('shows an unavailable source and retry action on server failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load listings. Please try again.');
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh listings' })).toBeEnabled();
    expect(screen.queryByText('Nothing new right now — check back soon.')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('keeps an explicitly configured API authoritative on network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load listings. Please try again.');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toMatch(/^http:\/\/127\.0\.0\.1:8001\/api\/hackathons\?/);
  });
});
