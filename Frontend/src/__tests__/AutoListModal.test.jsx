import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AutoListModal from '../components/AutoListModal';

beforeEach(() => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false })); });
afterEach(() => { vi.unstubAllGlobals(); });
const success = data => ({ ok: true, status: 200, json: async () => data });

describe('Public scanner status', () => {
  it('shows a failed request honestly instead of inventing idle activity or counters', async () => {
    render(<AutoListModal onClose={() => {}} apiBase="http://127.0.0.1:8001/api/hackathons" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No activity can be confirmed.');
    expect(screen.queryByText(/No discovery scan in progress/)).not.toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
  it('retries and displays only the facts reported by the service', async () => {
    fetch.mockResolvedValueOnce({ ok: false }).mockResolvedValue(success({ is_scanning: false, total_scans_run: 3, total_new_indexed: 7, active_keywords: { cities: ['Pune', null] } }));
    render(<AutoListModal onClose={() => {}} apiBase="http://127.0.0.1:8001/api/v1/hackathons" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry status' }));
    expect(await screen.findByText('No discovery scan in progress')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Pune')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:8001/api/scanner/status', expect.anything());
    expect(fetch.mock.calls.every(([, options]) => !options?.method || options.method === 'GET')).toBe(true);
  });
  it('calls onClose and contains keyboard focus', async () => {
    const onClose = vi.fn();
    render(<AutoListModal onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'Scanner status' })).toBeInTheDocument();
    const close = screen.getByRole('button', { name: 'Close dialog' });
    expect(close).toHaveFocus();
    await screen.findByRole('alert');
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
