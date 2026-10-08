import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import Dialog from '../components/Dialog';
import Toast from '../components/Toast';
import useDarkMode from '../hooks/useDarkMode';

beforeEach(() => { localStorage.clear(); document.documentElement.classList.remove('dark'); });
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); document.documentElement.classList.remove('dark'); });

describe('Theme preference', () => {
  it('restores an explicit choice instead of the OS default', () => {
    localStorage.setItem('hackathon_theme', 'dark');
    const { result } = renderHook(useDarkMode);
    expect(result.current.isDarkMode).toBe(true);
    expect(document.documentElement).toHaveClass('dark');
    act(() => result.current.toggleDarkMode());
    expect(localStorage.getItem('hackathon_theme')).toBe('light');
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('follows OS changes until an explicit override is chosen', () => {
    let notify;
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false,
      addEventListener: (_, callback) => { notify = callback; }, removeEventListener: vi.fn() });
    const { result } = renderHook(useDarkMode);
    act(() => notify({ matches: true }));
    expect(result.current.isDarkMode).toBe(true);
    act(() => result.current.toggleDarkMode());
    act(() => notify({ matches: true }));
    expect(result.current.isDarkMode).toBe(false);
  });

  it('still toggles when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Unavailable'); });
    const { result } = renderHook(useDarkMode);
    act(() => result.current.toggleDarkMode());
    expect(result.current.isDarkMode).toBe(true);
  });
});

describe('Shared feedback and dialog behavior', () => {
  it('announces feedback without making it a blocking alert', () => {
    render(<Toast message="Link copied" visible />);
    expect(screen.getByRole('status')).toHaveTextContent('Link copied');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('contains keyboard focus, closes on Escape, and restores the opener', () => {
    // jsdom has no layout engine; expose visible controls as the browser would.
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{ width: 44, height: 44 }]);
    function Example() {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>Open dialog</button>{open &&
        <Dialog label="Example" onClose={() => setOpen(false)}><button>Last action</button></Dialog>}</>;
    }
    render(<Example />);
    const opener = screen.getByText('Open dialog');
    opener.focus(); fireEvent.click(opener);
    const close = screen.getByLabelText('Close dialog');
    const last = screen.getByText('Last action');
    expect(close).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
