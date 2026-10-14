import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HackathonCard from '../components/HackathonCard';

describe('HackathonCard Component', () => {
  const sampleEvent = {
    id: 'h-101',
    title: 'HackNITR 6.0',
    organizer: 'NIT Rourkela',
    sourceLabel: 'Devfolio',
    formatLabel: 'In-person',
    locationLabel: 'NIT Rourkela, Odisha',
    deadlineLabel: 'Closes in 3 days',
    prizeLabel: '₹5,00,000',
    lifecycleKey: 'open',
    lifecycleLabel: 'Open',
    url: 'https://hacknitr.devfolio.co',
    summary: 'Eastern India largest annual student hackathon.',
  };

  it('renders hackathon title, platform badge, and verified metadata', () => {
    render(<HackathonCard event={sampleEvent} />);

    expect(screen.getByText('HackNITR 6.0')).toBeInTheDocument();
    expect(screen.getByText('Devfolio')).toBeInTheDocument();
    expect(screen.getByText('NIT Rourkela')).toBeInTheDocument();
    expect(screen.getByText('₹5,00,000')).toBeInTheDocument();
    expect(screen.getByText('In-person')).toBeInTheDocument();
  });

  it('does not render missing metadata fields (strict non-fabrication)', () => {
    const minimalEvent = {
      id: 'h-102',
      title: 'Minimal Hackathon',
      sourceLabel: 'Unstop',
      lifecycleKey: 'open',
      lifecycleLabel: 'Open',
      // No prizeLabel, no locationLabel, no formatLabel
    };
    render(<HackathonCard event={minimalEvent} />);

    expect(screen.getByText('Minimal Hackathon')).toBeInTheDocument();
    expect(screen.queryByText(/Prizes/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Location/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Open Bounty/i)).not.toBeInTheDocument();
  });

  it('triggers onSelect when Details button or card is clicked', () => {
    const handleSelect = vi.fn();
    render(<HackathonCard event={sampleEvent} onSelect={handleSelect} />);

    fireEvent.click(screen.getByRole('button', { name: /Details/i }));
    expect(handleSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'h-101' }));
  });

  it('triggers onToggleSave when Save button is clicked', () => {
    const handleSave = vi.fn();
    render(<HackathonCard event={sampleEvent} isSaved={false} onToggleSave={handleSave} />);

    const saveBtn = screen.getByRole('button', { name: /Save for later/i });
    fireEvent.click(saveBtn);
    expect(handleSave).toHaveBeenCalledWith('h-101');
  });

  it('displays Saved state when isSaved is true', () => {
    render(<HackathonCard event={sampleEvent} isSaved={true} onToggleSave={() => {}} />);
    expect(screen.getByRole('button', { name: /Remove from saved/i })).toBeInTheDocument();
  });

  it('triggers onCopyLink when copy button is clicked', () => {
    const handleCopy = vi.fn();
    render(<HackathonCard event={sampleEvent} onCopyLink={handleCopy} />);

    fireEvent.click(screen.getByRole('button', { name: /Copy link to hackathon/i }));
    expect(handleCopy).toHaveBeenCalledWith(expect.objectContaining({ id: 'h-101' }));
  });

  it('renders register link with safe attributes', () => {
    render(<HackathonCard event={sampleEvent} />);

    const registerLink = screen.getByRole('link', { name: /Register/i });
    expect(registerLink).toHaveAttribute('href', 'https://hacknitr.devfolio.co');
    expect(registerLink).toHaveAttribute('target', '_blank');
    expect(registerLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('applies row layout class when layoutMode is rows', () => {
    const { container } = render(<HackathonCard event={sampleEvent} layoutMode="rows" />);
    expect(container.querySelector('.hn-card-row-mode')).toBeInTheDocument();
  });
});
