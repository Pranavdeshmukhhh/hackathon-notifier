import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import EventDetail from '../components/EventDetail';

const id = '0123456789abcdef01234567';
const otherId = 'abcdef0123456789abcdef01';
const sample = { _id: id, title: 'Sample campus challenge', source: 'Sample platform', link: 'https://example.com/register', desc: 'Build practical tools for student life.', mode: 'In-person', location: 'Pune', deadline_iso: '2099-10-20', min_team_size: 2, max_team_size: 4, eligibility: 'University students', organizer: 'Sample organizers', prize: 'Source-listed equipment', tags: ['Web', 'Open source'] };
const response = (data = sample) => ({ ok: true, status: 200, json: async () => ({ success: true, data }) });
const props = { eventId: id, apiBase: 'http://127.0.0.1:8001/api/hackathons' };

beforeEach(() => {
  window.history.replaceState({}, '', `/?q=private-preference&lat=12&lng=34#event/${id}`);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Event detail experience', () => {
  it('presents the source facts with a safe registration destination', async () => {
    render(<EventDetail {...props} />);
    await screen.findByRole('heading', { name: sample.title, level: 1 });
    expect(screen.getByText(sample.desc)).toBeInTheDocument();
    expect(screen.getByText('University students')).toBeInTheDocument();
    expect(screen.getByText('Sample organizers')).toBeInTheDocument();
    expect(screen.getByText('2–4 members')).toBeInTheDocument();
    const registration = screen.getByRole('link', { name: /register on source page/i });
    expect(registration).toHaveAttribute('href', sample.link);
    expect(registration).toHaveAttribute('target', '_blank');
    expect(registration).toHaveAttribute('rel', 'noopener noreferrer');
    expect(document.title).toBe(`${sample.title} — Hackathon Notifier`);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('copies a shareable event link without filters or coordinates', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<EventDetail {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Copy event link' }));
    await screen.findByText('Link copied');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${window.location.origin}/#event/${id}`);
  });

  it('handles blocked clipboard access without reporting success', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) } });
    render(<EventDetail {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Copy event link' }));
    await screen.findByText('Could not copy. Copy the address from your browser.');
    expect(screen.queryByText('Link copied')).not.toBeInTheDocument();
  });

  it('shows missing eligibility, prize, and organizer without guessing from a campus name', async () => {
    fetch.mockResolvedValue(response({ _id: id, title: 'Campus event', college_name: 'Sample campus', prize: 'Not specified' }));
    render(<EventDetail {...props} />);
    await screen.findByRole('heading', { name: 'Campus event', level: 1 });
    expect(screen.getByText(/Not listed. Confirm eligible ages/)).toBeInTheDocument();
    expect(screen.getAllByText('Not listed').length).toBeGreaterThanOrEqual(5);
    expect(screen.getByText('Registration link unavailable.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /register on source page/i })).not.toBeInTheDocument();
  });

  it('keeps closed events available for reference without an active registration claim', async () => {
    fetch.mockResolvedValue(response({ ...sample, is_past: true }));
    render(<EventDetail {...props} />);
    await screen.findByRole('heading', { name: sample.title, level: 1 });
    expect(screen.getByRole('link', { name: /view source page/i })).toHaveAttribute('href', sample.link);
    expect(screen.queryByRole('link', { name: /register on source page/i })).not.toBeInTheDocument();
  });

  it('distinguishes removed listings from network failures', async () => {
    fetch.mockResolvedValue({ ok: false, status: 404 });
    render(<EventDetail {...props} />);
    await screen.findByRole('heading', { name: 'This event is no longer listed.' });
    expect(screen.queryByRole('button', { name: 'Retry details' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to discovery' })).toHaveAttribute('href', '#events');
  });

  it('rejects malformed identifiers without requesting arbitrary URLs', () => {
    render(<EventDetail {...props} eventId="../../admin" />);
    expect(screen.getByRole('heading', { name: 'This event is no longer listed.' })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retries an unavailable API and never uses a production fallback unless authorized by configuration', async () => {
    fetch.mockRejectedValueOnce(new TypeError('Network down')).mockResolvedValue(response());
    render(<EventDetail {...props} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t retrieve this listing.');
    expect(fetch).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Retry details' }));
    await screen.findByRole('heading', { name: sample.title, level: 1 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('heading', { name: sample.title, level: 1 })).toHaveFocus();
  });

  it('does not let a late response replace the newly opened event', async () => {
    let resolveOld;
    fetch.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValue(response({ ...sample, _id: otherId, title: 'Newly opened event' }));
    const { rerender } = render(<EventDetail {...props} />);
    expect(screen.getByText('Loading event details…')).toBeInTheDocument();
    rerender(<EventDetail {...props} eventId={otherId} />);
    await screen.findByRole('heading', { name: 'Newly opened event' });
    await act(async () => resolveOld(response()));
    expect(screen.getByRole('heading', { name: 'Newly opened event' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: sample.title })).not.toBeInTheDocument();
  });

  it('renders untrusted description markup as inert text', async () => {
    fetch.mockResolvedValue(response({ ...sample, desc: '<script>alert(1)</script><img onerror="alert(1)">' }));
    const { container } = render(<EventDetail {...props} />);
    await screen.findByRole('heading', { name: sample.title, level: 1 });
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(/<script>alert/)).toBeInTheDocument();
  });

  it('rejects a mismatched record instead of showing the wrong event', async () => {
    fetch.mockResolvedValue(response({ ...sample, _id: otherId }));
    render(<EventDetail {...props} />);
    await screen.findByRole('alert');
    expect(screen.queryByRole('heading', { name: sample.title })).not.toBeInTheDocument();
  });
});
