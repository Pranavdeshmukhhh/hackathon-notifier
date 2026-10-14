import { useState, useEffect } from 'react';

export function useDarkMode(defaultDark = false) {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return defaultDark;
    try {
      const saved = window.localStorage.getItem('hn-theme');
      if (saved === 'dark' || saved === 'light') return saved === 'dark';
      if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return true;
    } catch {
      // ignore storage errors
    }
    return defaultDark;
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.toggle('dark', isDark);
    root.setAttribute('data-theme', isDark ? 'dark' : 'light');
    try {
      window.localStorage.setItem('hn-theme', isDark ? 'dark' : 'light');
    } catch {
      // ignore storage errors
    }
  }, [isDark]);

  const toggleDarkMode = () => setIsDark((prev) => !prev);
  return [isDark, toggleDarkMode, setIsDark];
}

export default useDarkMode;
