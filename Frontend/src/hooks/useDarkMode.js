import { useState, useEffect } from 'react';

export function useDarkMode(defaultDark = true) {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return defaultDark;
    const saved = window.localStorage.getItem('hn-theme');
    if (saved === 'dark' || saved === 'light') return saved === 'dark';
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
      // Ignore storage quota errors
    }
  }, [isDark]);

  const toggleDarkMode = () => setIsDark((prev) => !prev);

  return [isDark, toggleDarkMode, setIsDark];
}

export default useDarkMode;
