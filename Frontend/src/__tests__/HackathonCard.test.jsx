import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

    const registerBtn = screen.getByRole('link', { name: /register now/i });
    expect(registerBtn).toHaveAttribute('href', 'https://hacknitr.devfolio.co');
    expect(registerBtn).toHaveAttribute('target', '_blank');
    expect(registerBtn).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('sanitizes unsafe javascript: links to #', () => {
    const maliciousHackathon = {
      ...mockHackathon,
      link: 'javascript:alert(1)',
    };
    render(<HackathonCard hackathon={maliciousHackathon} />);

    const registerBtn = screen.getByRole('link', { name: /register now/i });
    expect(registerBtn).toHaveAttribute('href', '#');
  });

  it('triggers onShare callback when copying link', () => {
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

    expect(onShare).toHaveBeenCalledWith('HackNITR 6.0');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://hacknitr.devfolio.co');
  });
});
