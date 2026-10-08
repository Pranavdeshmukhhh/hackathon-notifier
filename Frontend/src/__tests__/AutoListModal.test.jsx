import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AutoListModal from '../components/AutoListModal';

beforeEach(() => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false })); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('AutoListModal Component (Autonomous Internet Scanner)', () => {
  it('renders modal header, telemetry stats, and monitored channels', () => {
    render(<AutoListModal onClose={() => {}} onSuccess={() => {}} />);

    expect(screen.getByRole('dialog', { name: /autonomous internet scanner/i })).toBeInTheDocument();
    expect(screen.getByText(/Operator configured/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /scan internet now/i })).toBeDisabled();
    expect(screen.getByPlaceholderText(/enter college or city/i)).toBeInTheDocument();
    expect(screen.getByText(/🔥 FAANG \/ MANGO/i)).toBeInTheDocument();
    expect(screen.getByText(/🏛️ IIIT Hyderabad/i)).toBeInTheDocument();
    expect(screen.getByText(/🏙️ Pune Tech/i)).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn();
    render(<AutoListModal onClose={handleClose} onSuccess={() => {}} />);

    const closeBtn = screen.getByLabelText(/close dialog/i);
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('updates target keyword input on change', () => {
    render(<AutoListModal onClose={() => {}} onSuccess={() => {}} />);

    const input = screen.getByPlaceholderText(/enter college or city/i);
    fireEvent.change(input, { target: { value: 'COEP Pune' } });
    expect(input.value).toBe('COEP Pune');
  });

  it('toggles direct url accordion when clicked', () => {
    render(<AutoListModal onClose={() => {}} onSuccess={() => {}} />);

    const accordionBtn = screen.getByText(/Have an exact hackathon link\?/i);
    fireEvent.click(accordionBtn);
    expect(screen.getByPlaceholderText(/https:\/\/unstop\.com/i)).toBeInTheDocument();
  });

  it('does not issue write requests when the disabled forms are submitted', () => {
    render(<AutoListModal onClose={() => {}} onSuccess={() => {}} />);
    const keyword = screen.getByPlaceholderText(/enter college or city/i);
    fireEvent.change(keyword, { target: { value: 'COEP Pune' } });
    fireEvent.submit(keyword.closest('form'));
    fireEvent.click(screen.getByText(/Have an exact hackathon link\?/i));
    const url = screen.getByPlaceholderText(/https:\/\/unstop\.com/i);
    fireEvent.change(url, { target: { value: 'https://example.com/event' } });
    fireEvent.submit(url.closest('form'));
    expect(fetch.mock.calls.every(([, options]) => !options?.method || options.method === 'GET')).toBe(true);
  });
});
