import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import Dialog from '../components/Dialog';
import Toast from '../components/Toast';
import useDarkMode from '../hooks/useDarkMode';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  document.documentElement.removeAttribute('data-theme');
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  document.documentElement.removeAttribute('data-theme');
});

describe('Theme preference (useDarkMode)', () => {
  it('restores saved theme preference from hn-theme', () => {
    localStorage.setItem('hn-theme', 'dark');
    const { result } = renderHook(() => useDarkMode(false));
    expect(result.current[0]).toBe(true);
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    act(() => result.current[1]()); // toggleDarkMode
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem('hn-theme')).toBe('light');
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('toggles dark mode state smoothly when called', () => {
    const { result } = renderHook(() => useDarkMode(false));
    expect(result.current[0]).toBe(false);

    act(() => result.current[1]()); // toggleDarkMode
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem('hn-theme')).toBe('dark');
  });
});

describe('Shared feedback and dialog behavior', () => {
  it('Toast renders accessible polite status message when visible', () => {
    render(<Toast message="Link copied to clipboard" visible={true} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Link copied to clipboard');
  });

  it('Toast does not render when visible is false', () => {
    render(<Toast message="Link copied" visible={false} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('Dialog renders with dialog role, closes on Escape, and calls onClose', () => {
    const handleClose = vi.fn();
    render(
      <Dialog isOpen={true} onClose={handleClose} title="Test Modal" subtitle="Subtitle">
        <div>Modal Content</div>
      </Dialog>
    );

    expect(screen.getByRole('dialog', { name: 'Test Modal' })).toBeInTheDocument();
    expect(screen.getByText('Modal Content')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
