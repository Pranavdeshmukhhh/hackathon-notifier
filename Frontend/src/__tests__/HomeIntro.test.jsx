import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import HomeIntro from '../components/HomeIntro';

describe('HomeIntro Component', () => {
  it('renders editorial title and summary counts', () => {
    render(
      <HomeIntro
        totalCount={42}
        openCount={12}
        closingCount={3}
      />
    );

    expect(screen.getByText('Find your next hackathon.')).toBeInTheDocument();
    expect(screen.getByText('12 open')).toBeInTheDocument();
    expect(screen.getByText('3 closing soon')).toBeInTheDocument();
    expect(screen.getByText('42 listed')).toBeInTheDocument();
  });

  it('triggers onFilterStatus when open or closing chips are clicked', () => {
    const handleFilterStatus = vi.fn();
    render(
      <HomeIntro
        totalCount={20}
        openCount={10}
        closingCount={2}
        onFilterStatus={handleFilterStatus}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /10 open/i }));
    expect(handleFilterStatus).toHaveBeenCalledWith('open');

    fireEvent.click(screen.getByRole('button', { name: /2 closing soon/i }));
    expect(handleFilterStatus).toHaveBeenCalledWith('closing');
  });

  it('renders submit button and triggers onOpenAutoList', () => {
    const handleOpenSubmit = vi.fn();
    render(
      <HomeIntro
        totalCount={5}
        onOpenAutoList={handleOpenSubmit}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /Submit a hackathon/i });
    expect(submitBtn).toBeInTheDocument();
    fireEvent.click(submitBtn);
    expect(handleOpenSubmit).toHaveBeenCalledTimes(1);
  });
});
