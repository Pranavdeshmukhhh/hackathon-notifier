import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EventDetail from '../components/EventDetail';

const sampleEvent = {
  id: 'ev-detailed',
  title: 'MIT Global Hackathon',
  sourceLabel: 'Devfolio',
  organizer: 'MIT Hack Club',
  formatLabel: 'Online',
  locationLabel: 'Worldwide',
  deadlineDateFormatted: 'Dec 15, 2026',
  dateRangeLabel: 'Dec 18 – Dec 20, 2026',
  prizeLabel: '$50,000 in Prizes',
  eligibilityLabel: 'Undergraduates & High Schoolers',
  description: 'A 48-hour global sprint building next-gen developer tools.',
  tags: ['AI', 'Systems', 'Open Source'],
  url: 'https://devfolio.co/hackathons/mit-global',
  lifecycleLabel: 'Open',
};

describe('EventDetail Modal Component', () => {
  it('renders complete event specifications when open', () => {
    render(<EventDetail event={sampleEvent} isOpen={true} onClose={() => {}} />);

    expect(screen.getByRole('dialog', { name: 'MIT Global Hackathon' })).toBeInTheDocument();
    expect(screen.getByText('Devfolio · MIT Hack Club')).toBeInTheDocument();
    expect(screen.getByText('$50,000 in Prizes')).toBeInTheDocument();
    expect(screen.getByText('Undergraduates & High Schoolers')).toBeInTheDocument();
    expect(screen.getByText('Dec 15, 2026')).toBeInTheDocument();
    expect(screen.getByText(/A 48-hour global sprint/i)).toBeInTheDocument();
    expect(screen.getByText('AI')).toBeInTheDocument();
    expect(screen.getByText('Systems')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(<EventDetail event={sampleEvent} isOpen={false} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('triggers onToggleSave when Save button is clicked', () => {
    const handleSave = vi.fn();
    render(
      <EventDetail
        event={sampleEvent}
        isOpen={true}
        isSaved={false}
        onToggleSave={handleSave}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Save for later/i }));
    expect(handleSave).toHaveBeenCalledWith('ev-detailed');
  });

  it('triggers onCopyLink when Share link button is clicked', () => {
    const handleCopy = vi.fn();
    render(
      <EventDetail
        event={sampleEvent}
        isOpen={true}
        onCopyLink={handleCopy}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Share link/i }));
    expect(handleCopy).toHaveBeenCalledWith(expect.objectContaining({ id: 'ev-detailed' }));
  });

  it('renders registration link pointing to official external URL', () => {
    render(<EventDetail event={sampleEvent} isOpen={true} />);

    const regLink = screen.getByRole('link', { name: /Register on Devfolio/i });
    expect(regLink).toHaveAttribute('href', 'https://devfolio.co/hackathons/mit-global');
    expect(regLink).toHaveAttribute('target', '_blank');
    expect(regLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('omits optional metadata fields when they are null (strict non-fabrication)', () => {
    const sparseEvent = {
      id: 'ev-sparse',
      title: 'Minimal Event',
      sourceLabel: 'Web',
      lifecycleLabel: 'Open',
      // No prizeLabel, no eligibilityLabel, no locationLabel
    };

    render(<EventDetail event={sparseEvent} isOpen={true} />);
    expect(screen.getByRole('dialog', { name: 'Minimal Event' })).toBeInTheDocument();
    expect(screen.queryByText(/Prize pool/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Eligibility/i)).not.toBeInTheDocument();
  });
});
