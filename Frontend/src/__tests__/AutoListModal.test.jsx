import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AutoListModal from '../components/AutoListModal';

describe('AutoListModal Component (Autonomous Internet Scanner)', () => {
  it('renders modal header, telemetry stats, and monitored channels', () => {
    render(<AutoListModal onClose={() => {}} onSuccess={() => {}} />);

    expect(screen.getByRole('dialog', { name: /autonomous internet scanner/i })).toBeInTheDocument();
    expect(screen.getByText(/Continuous \(2h Loop\)/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /scan internet now/i })).toBeInTheDocument();
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
});
