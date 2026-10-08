import { useEffect, useRef, useState } from 'react';

/** Clipboard feedback must follow the actual write and stop after unmount. */
export default function useCopyLink(link, onCopied, failureMessage = 'Could not copy. Use the registration link.') {
  const [status, setStatus] = useState('');
  const [isCopying, setIsCopying] = useState(false);
  const mounted = useRef(true);
  const timer = useRef(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; clearTimeout(timer.current); };
  }, []);
  const copy = async () => {
    if (!link || isCopying) return;
    setIsCopying(true);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(link);
      if (!mounted.current) return;
      setStatus('Link copied');
      onCopied?.();
    } catch {
      if (!mounted.current) return;
      setStatus(failureMessage);
    }
    if (!mounted.current) return;
    setIsCopying(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(''), 4000);
  };
  return { status, isCopying, copy };
}
