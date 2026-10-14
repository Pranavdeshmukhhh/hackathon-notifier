import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../App';

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Homepage API failures & error recovery', () => {
  it('displays error recovery box when API fails to load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Backend connection failed'))
    );

    render(<App />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Unable to load hackathons');
    expect(alert).toHaveTextContent('Backend connection failed');

    const retryBtn = screen.getByRole('button', { name: /Try again/i });
    expect(retryBtn).toBeInTheDocument();
  });

  it('retries fetching events when Try again button is clicked', async () => {
    let fail = true;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        if (fail) throw new Error('Network error');
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: 'ev-recovered', title: 'Recovered Hackathon' }],
        };
      })
    );

    render(<App />);

    const retryBtn = await screen.findByRole('button', { name: /Try again/i });
    fail = false;
    fireEvent.click(retryBtn);

    expect(await screen.findByText('Recovered Hackathon')).toBeInTheDocument();
  });
});
