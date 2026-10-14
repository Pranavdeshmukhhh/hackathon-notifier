import { useState, useCallback } from 'react';
import { buildEventShareUrl } from '../utils/eventRoute';

export function useCopyLink(resetMs = 2000) {
  const [copiedId, setCopiedId] = useState(null);

  const copyLink = useCallback(
    async (eventOrId) => {
      const id = typeof eventOrId === 'object' ? eventOrId?.id : eventOrId;
      const urlToCopy = buildEventShareUrl(id);
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(urlToCopy);
        }
        setCopiedId(id || 'copied');
        setTimeout(() => setCopiedId(null), resetMs);
        return true;
      } catch {
        return false;
      }
    },
    [resetMs]
  );

  return { copiedId, copyLink };
}

export default useCopyLink;
