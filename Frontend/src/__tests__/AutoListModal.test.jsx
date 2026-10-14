import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AutoListModal from '../components/AutoListModal';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AutoListModal Component', () => {
  it('renders modal dialog with form when open', () => {
    render(<AutoListModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: /Submit a hackathon/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/https:\/\/devfolio.co\/hackathons/i)).toBeInTheDocument();
  });

  it('validates URL and warns if invalid URL is entered', async () => {
    const { container } = render(<AutoListModal isOpen={true} onClose={() => {}} />);
    const input = screen.getByPlaceholderText(/https:\/\/devfolio.co\/hackathons/i);
    const form = container.querySelector('form');

    fireEvent.change(input, { target: { value: 'not-a-valid-url' } });
    fireEvent.submit(form);

    expect(await screen.findByRole('status')).toHaveTextContent(/Please enter a valid URL/i);
  });

  it('submits valid URL to auto-list endpoint and displays success message', async () => {
    const handleSuccess = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ message: 'Hackathon submitted and queued for verification.' }),
      })
    );

    const { container } = render(<AutoListModal isOpen={true} onClose={() => {}} onSuccess={handleSuccess} />);
    const input = screen.getByPlaceholderText(/https:\/\/devfolio.co\/hackathons/i);
    const form = container.querySelector('form');

    fireEvent.change(input, { target: { value: 'https://devfolio.co/hackathons/example' } });
    fireEvent.submit(form);

    expect(
      await screen.findByText('Hackathon submitted and queued for verification.')
    ).toBeInTheDocument();
    expect(handleSuccess).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Cancel button is clicked', () => {
    const handleClose = vi.fn();
    render(<AutoListModal isOpen={true} onClose={handleClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
