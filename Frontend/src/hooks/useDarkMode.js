import { useEffect, useRef, useState } from 'react';

function savedTheme() {
  try {
    const value = localStorage.getItem('hackathon_theme');
    return value === 'light' || value === 'dark' ? value : null;
  } catch { return null; }
}

/** Follow the OS until a student explicitly chooses a theme. */
export default function useDarkMode() {
  const manual = useRef(savedTheme() !== null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = savedTheme();
    return saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  useEffect(() => {
    const matcher = window.matchMedia('(prefers-color-scheme: dark)');
    const changed = event => { if (!manual.current) setIsDarkMode(event.matches); };
    matcher.addEventListener('change', changed);
    return () => matcher.removeEventListener('change', changed);
  }, []);
  useEffect(() => { document.documentElement.classList.toggle('dark', isDarkMode); }, [isDarkMode]);

  const toggleDarkMode = () => {
    manual.current = true;
    const next = !isDarkMode;
    setIsDarkMode(next);
    try { localStorage.setItem('hackathon_theme', next ? 'dark' : 'light'); } catch { /* Theme works without storage. */ }
  };
  return { isDarkMode, toggleDarkMode };
}
