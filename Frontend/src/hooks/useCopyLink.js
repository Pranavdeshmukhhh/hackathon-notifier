import { useState, useCallback, useRef, useEffect } from 'react';
import { buildEventShareUrl } from '../utils/eventRoute';

export function useCopyLink(resetMs = 2000) {
  const [copiedId, setCopiedId] = useState(null);
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);
  const copyLink = useCallback(async (eventOrId) => {
    const id = typeof eventOrId === 'object' ? eventOrId?.id : eventOrId;
    let success = false;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(buildEventShareUrl(id));
      success = true;
      setCopiedId(id || 'copied');
    } catch { setCopiedId('copy-error'); }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopiedId(null), resetMs);
    return success;
  }, [resetMs]);
  return { copiedId, copyLink };
}
export default useCopyLink;
