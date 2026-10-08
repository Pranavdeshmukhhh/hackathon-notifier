import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HackathonCard from '../components/HackathonCard';

describe('HackathonCard Component', () => {
  const mockHackathon = {
    _id: '65f0123456789abcdef01234',
    title: 'HackNITR 6.0',
    link: 'https://hacknitr.devfolio.co',
    source: 'Devfolio',
    deadline: '25 Mar 2026',
    mode: 'Hybrid',
    location: 'NIT Rourkela, Odisha',
    prize: '₹5,00,000',
    is_top_college: true,
    college_name: 'NIT Rourkela',
    college_type: 'NIT',
    is_internship: false,
    status: 'Live',
    tags: ['Web3', 'AI/ML', 'Open Innovation'],
    total_registrations: 3450,
    min_team_size: 2,
    max_team_size: 4,
  };

  it('renders hackathon title, platform badge, and prize correctly', () => {
    render(<HackathonCard hackathon={mockHackathon} />);

    expect(screen.getByText('HackNITR 6.0')).toBeInTheDocument();
    expect(screen.getByText('Devfolio')).toBeInTheDocument();
    expect(screen.getByText('₹5,00,000')).toBeInTheDocument();
  });

  it('renders premier college badge when is_top_college is true', () => {
    render(<HackathonCard hackathon={mockHackathon} />);

    expect(screen.getByTitle('NIT Rourkela')).toBeInTheDocument();
  });

  it('renders internship badge when is_internship is true', () => {
    const internshipHackathon = {
      ...mockHackathon,
      title: 'Google Summer Challenge',
      is_top_college: false,
      is_internship: true,
    };
    render(<HackathonCard hackathon={internshipHackathon} />);

    expect(screen.getByText(/Internship/)).toBeInTheDocument();
  });

  it('renders safe register link', () => {
    render(<HackathonCard hackathon={mockHackathon} />);

    const registerBtn = screen.getByRole('link', { name: /register/i });
    expect(registerBtn).toHaveAttribute('href', 'https://hacknitr.devfolio.co/');
    expect(registerBtn).toHaveAttribute('target', '_blank');
    expect(registerBtn).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('makes unsafe links unavailable without a clickable placeholder', () => {
    const maliciousHackathon = {
      ...mockHackathon,
      link: 'javascript:alert(1)',
    };
    render(<HackathonCard hackathon={maliciousHackathon} />);

    expect(screen.getByText('Registration link unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy link/i })).toBeDisabled();
  });

  it('reports copying only after the clipboard write succeeds', async () => {
    const onShare = vi.fn();
    // Mock navigator.clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(),
      },
    });

    render(<HackathonCard hackathon={mockHackathon} onShare={onShare} />);

    const copyBtn = screen.getByRole('button', { name: /copy link/i });
    fireEvent.click(copyBtn);

    await waitFor(() => expect(onShare).toHaveBeenCalledWith('HackNITR 6.0'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://hacknitr.devfolio.co/');
  });

  it('renders correctly in compact list view mode', () => {
    render(<HackathonCard hackathon={mockHackathon} viewMode="compact" />);

    expect(screen.getByText('HackNITR 6.0')).toBeInTheDocument();
    expect(screen.getByText('Devfolio')).toBeInTheDocument();
    expect(screen.getByText('₹5,00,000')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /register/i })).toBeInTheDocument();
  });

  it('clearly identifies closed registration and preserves its organizer link', () => {
    const pastHackathon = {
      ...mockHackathon,
      title: 'Old Concluded Hack',
      is_past: true,
      status: 'Ended',
    };
    render(<HackathonCard hackathon={pastHackathon} />);

    expect(screen.getAllByText('Registration closed').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /view event page/i })).toBeInTheDocument();
  });

  it('renders venue and campus correctly when venue is provided', () => {
    const venueHackathon = {
      ...mockHackathon,
      title: 'Megathon 2026',
      venue: 'IIIT Hyderabad',
      location: 'Hyderabad, Telangana',
    };
    render(<HackathonCard hackathon={venueHackathon} />);

    expect(screen.getByText(/IIIT Hyderabad/i)).toBeInTheDocument();
  });

  it('reports clipboard failure without announcing success', async () => {
    const onShare = vi.fn();
    navigator.clipboard.writeText = vi.fn().mockRejectedValue(new Error('Denied'));
    render(<HackathonCard hackathon={mockHackathon} onShare={onShare} />);
    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));
    await screen.findByText('Could not copy. Use the registration link.');
    expect(onShare).not.toHaveBeenCalled();
  });

  it('opening registration does not claim a link was copied', () => {
    const onShare = vi.fn();
    render(<HackathonCard hackathon={mockHackathon} onShare={onShare} />);
    fireEvent.click(screen.getByRole('link', { name: /register/i }));
    expect(onShare).not.toHaveBeenCalled();
  });

  it.each(['grid', 'compact'])('does not invent missing requirements in %s view', (viewMode) => {
    render(<HackathonCard hackathon={{ title: 'Unspecified event', link: 'https://example.com', prize: 'Not specified' }} viewMode={viewMode} />);
    expect(screen.getAllByText('Not listed')).toHaveLength(5);
    expect(screen.getByText('Check organizer')).toBeInTheDocument();
    expect(screen.queryByText(/free entry|open participation|swags|global access/i)).not.toBeInTheDocument();
  });
});
