import { useState, useEffect } from 'react';

/**
 * useScrollProgress — Tracks page scroll position and progress percentage.
 *
 * @returns {{ isScrolled: boolean, scrollProgress: number }}
 */
export default function useScrollProgress() {
  const [isScrolled, setIsScrolled]       = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = totalHeight > 0 ? (window.scrollY / totalHeight) * 100 : 0;
      setScrollProgress(progress);
      setIsScrolled(window.scrollY > 15);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return { isScrolled, scrollProgress };
}
