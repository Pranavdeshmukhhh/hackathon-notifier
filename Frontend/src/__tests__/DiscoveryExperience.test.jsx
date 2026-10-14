import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const sampleEvents = [
  {
    id: 'ev-1',
    title: 'HackNITR Online',
    format: 'online',
    source: 'devfolio',
    lifecycle_state: 'open',
    registration_deadline: '2099-12-31',
  },
  {
    id: 'ev-2',
    title: 'In-person Pune Hack',
    format: 'offline',
    source: 'unstop',
    lifecycle_state: 'open',
    registration_deadline: '2099-11-30',
  },
];

describe('Student discovery experience in App', () => {
  it('loads and renders hackathons with search and format filtering', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => sampleEvents,
      })
    );

    render(<App />);

    expect(await screen.findByText('HackNITR Online')).toBeInTheDocument();
    expect(screen.getByText('In-person Pune Hack')).toBeInTheDocument();

    // Search filtering
    const searchInput = screen.getByRole('searchbox', { name: /Search hackathons/i });
    fireEvent.change(searchInput, { target: { value: 'Online' } });

    await waitFor(() => {
      expect(screen.getByText('HackNITR Online')).toBeInTheDocument();
      expect(screen.queryByText('In-person Pune Hack')).not.toBeInTheDocument();
    });

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } });
    await waitFor(() => {
      expect(screen.getByText('In-person Pune Hack')).toBeInTheDocument();
    });
  });

  it('filters by format when format segment is clicked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => sampleEvents,
      })
    );

    render(<App />);
    await screen.findByText('HackNITR Online');

    const inPersonSegment = screen.getByRole('button', { name: 'In-person' });
    fireEvent.click(inPersonSegment);

    await waitFor(() => {
      expect(screen.queryByText('HackNITR Online')).not.toBeInTheDocument();
      expect(screen.getByText('In-person Pune Hack')).toBeInTheDocument();
    });
  });

  it('opens detail modal when Details button is clicked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => sampleEvents,
      })
    );

    render(<App />);
    await screen.findByText('HackNITR Online');

    const detailButtons = screen.getAllByRole('button', { name: 'Details' });
    fireEvent.click(detailButtons[0]);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument();
  });
});
