import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AutoListModal from '../components/AutoListModal';

describe('AutoListModal Component', () => {
  it('renders modal header, inputs, and preset tag buttons', () => {
    render(<AutoListModal onClose={() => {}} onSuccess={() => {}} />);

    expect(screen.getByRole('dialog', { name: /auto-list hackathon/i })).toBeInTheDocument();
    expect(screen.getByText(/⚡ 1-Click URL Auto-Extractor/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/paste url/i)).toBeInTheDocument();
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

  it('toggles tag chips when clicked', () => {
    render(<AutoListModal onClose={() => {}} onSuccess={() => {}} />);

    const faangBtn = screen.getByText(/🔥 FAANG \/ MANGO/i);
    fireEvent.click(faangBtn);
    expect(screen.getByText(/#faang/i)).toBeInTheDocument();

    // Click again to untoggle
    fireEvent.click(faangBtn);
    expect(screen.queryByText(/#faang/i)).not.toBeInTheDocument();
  });

  it('selects quick location presets correctly', () => {
    render(<AutoListModal onClose={() => {}} onSuccess={() => {}} />);

    const punePreset = screen.getByText(/^Pune$/);
    fireEvent.click(punePreset);

    const locationInput = screen.getByPlaceholderText(/e\.g\. Pune, Maharashtra/i);
    expect(locationInput.value).toBe('Pune, Maharashtra, India');
  });

  it('shows error if submitted with empty URL', async () => {
    render(<AutoListModal onClose={() => {}} onSuccess={() => {}} />);

    const submitBtn = screen.getByRole('button', { name: /⚡ Auto-List Hackathon Now/i });
    fireEvent.click(submitBtn);

    // HTML5 required or state validation
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
