export function listingsApiUrl(configured, production = false) {
  const url = new URL(configured || (production
    ? 'https://hackathon-notifier.onrender.com'
    : 'http://localhost:8000'));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('VITE_API_URL must be an HTTP(S) API address without credentials, query, or fragment.');
  }
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = /\/api(?:\/v1)?\/hackathons$/.test(path) ? path
    : /\/api(?:\/v1)?$/.test(path) ? `${path}/hackathons` : `${path}/api/hackathons`;
  return url.href;
}

// Allow the free Render instance to wake up, while bounding requests and JSON decoding.
export async function requestApi(url, { signal, headers, timeout = 75_000 } = {}) {
  const controller = new AbortController();
  let timer, cancel;
  const stopped = new Promise((_, reject) => {
    cancel = () => {
      controller.abort();
      reject(new DOMException('Request canceled', 'AbortError'));
    };
    timer = setTimeout(() => {
      reject(new DOMException('The listings service took too long to respond.', 'TimeoutError'));
      controller.abort();
    }, timeout);
    if (signal?.aborted) cancel();
    else signal?.addEventListener('abort', cancel, { once: true });
  });
  try {
    return await Promise.race([stopped, (async () => {
      const response = await fetch(url, { signal: controller.signal, headers });
      const payload = response.ok && response.status !== 304 ? await response.json() : null;
      return { response, payload };
    })()]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

export function listingsPayload(value) {
  if (!value || value.success !== true || !Array.isArray(value.data) || value.data.some(event => !event || typeof event !== 'object' || Array.isArray(event))) {
    throw new Error('Invalid listings response');
  }
  const count = field => {
    const number = value[field] ?? 0;
    if (!Number.isSafeInteger(number) || number < 0) throw new Error('Invalid listings count');
    return number;
  };
  const stats = value.stats && typeof value.stats === 'object' && !Array.isArray(value.stats) ? value.stats : {};
  return { ...value, upcoming_total: count('upcoming_total'), missed_total: count('missed_total'),
    all_total: value.all_total == null ? count('upcoming_total') + count('missed_total') : count('all_total'),
    stats: { ...stats, sources: Array.isArray(stats.sources) ? stats.sources.filter(source => typeof source === 'string' && source.trim()) : [] } };
}
