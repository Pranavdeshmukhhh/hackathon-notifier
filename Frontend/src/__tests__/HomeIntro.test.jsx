import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import HomeIntro from '../components/HomeIntro';

describe('Homepage discovery entry points', () => {
  it('opens discovery and selects the requested format or college shortcut', () => {
    const browse = vi.fn();
    const shortcut = vi.fn();
    render(<HomeIntro onBrowse={browse} onShortcut={shortcut} />);
    fireEvent.click(screen.getByRole('button', { name: /browse hackathons/i }));
    expect(browse).toHaveBeenCalledOnce();
    for (const [label, value] of [['Online events', 'online'], ['In-person events', 'inperson'], ['Top college events', 'college']]) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(shortcut).toHaveBeenLastCalledWith(value);
    }
  });

  it('shows missing collection information honestly, including invalid dates', () => {
    const { rerender } = render(<HomeIntro onBrowse={() => {}} onShortcut={() => {}} />);
    expect(screen.getByText('Not reported')).toBeInTheDocument();
    rerender(<HomeIntro onBrowse={() => {}} onShortcut={() => {}} lastCollected="invalid" />);
    expect(screen.getByText('Not reported')).toBeInTheDocument();
    expect(screen.queryByText(/next sweep|32ms|HOD approved/i)).not.toBeInTheDocument();
  });

  it('distinguishes loading from an unavailable listing source', () => {
    const { rerender } = render(<HomeIntro onBrowse={() => {}} onShortcut={() => {}} loading />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    rerender(<HomeIntro onBrowse={() => {}} onShortcut={() => {}} error="offline" />);
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /telegram alerts/i })).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
