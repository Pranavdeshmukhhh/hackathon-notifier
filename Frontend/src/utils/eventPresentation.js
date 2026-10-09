const UNKNOWN = /^(?:tba|tbd|n\/?a|none|null|unknown|not (?:specified|listed|provided)|-)$/i;
export function listedText(value) {
  if (typeof value === 'number' && !Number.isFinite(value)) return '';
  const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  return text && !UNKNOWN.test(text) ? text : '';
}

export function safeRegistrationUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.replace(/\.$/, '').toLowerCase();
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    if (!host.includes('.') || /(?:^|\.)(?:localhost|local|internal)$/.test(host)) return null;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const [a, b] = host.split('.').map(Number);
      if ([0, 10, 127].includes(a) || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) || (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0)) return null;
    }
    return url.href;
  } catch { return null; }
}

export function eventFormat(value) {
  const mode = listedText(value);
  if (/\bhybrid\b/i.test(mode)) return 'Hybrid';
  if (/\b(?:online|virtual)\b/i.test(mode)) return 'Online';
  if (/\b(?:offline|in[ -]person|on[ -]?site)\b/i.test(mode)) return 'In person';
  return mode || 'Not listed';
}

export function eventLocation(event) {
  const clean = (value) => listedText(value)
    .replace(/^(?:online|offline|virtual|hybrid)(?:[,\s]+|$)/i, '')
    .replace(/(?:,\s*|\s+)(?:online|offline|virtual|hybrid)$/i, '').trim();
  const venue = clean(event.venue);
  const location = clean(event.location);
  if (venue && location && venue.toLowerCase() !== location.toLowerCase()) {
    if (location.toLowerCase().startsWith(`${venue.toLowerCase()},`)) return location;
    if (venue.toLowerCase().startsWith(`${location.toLowerCase()},`)) return venue;
    return `${venue}, ${location}`;
  }
  return venue || location || (eventFormat(event.mode) === 'Online' ? 'Online' : 'Not listed');
}

export function eventTeam(event) {
  const number = (value) => {
    if (!['string', 'number'].includes(typeof value) || String(value).trim() === '') return null;
    const n = Number(value);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  };
  const min = number(event.min_team_size), max = number(event.max_team_size);
  if (min && max && min > max) return 'Check organizer';
  if (min && max) return min === max ? (min === 1 ? 'Solo' : `${min} members`) : `${min}–${max} members`;
  if (min) return `At least ${min} members`;
  if (max) return `Up to ${max} members`;
  return 'Not listed';
}

export function eventDeadline(event, now = new Date()) {
  const exact = event.registration_deadline?.at;
  const at = typeof exact === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(exact) && !Number.isNaN(Date.parse(exact)) ? new Date(exact) : null;
  const value = at ? at.toISOString().slice(0, 10) : event.deadline_iso;
  const match = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  const explicitlyClosed = event.is_past === true || /^(?:closed|ended|completed|finished|cancelled|canceled)$/i.test(listedText(event.status));
  if (match) {
    const [, year, month, day] = match.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      const iso = date.toISOString().slice(0, 10);
      const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      const days = Math.round((date.getTime() - today) / 86400000);
      const closed = explicitlyClosed || (at ? at.getTime() < now.getTime() : days < 0);
      const note = closed ? 'Registration closed' : days === 0 ? (at ? 'Closes today' : 'Closes today · confirm time') : days === 1 ? 'Closes tomorrow' : days > 1 && days <= 7 ? `Closes in ${days} days` : '';
      const text = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
      const time = at ? at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) : '';
      return { iso, at: at?.toISOString(), closed, text: time ? `${text} · ${time} UTC` : text, note };
    }
  }
  return { iso: null, closed: explicitlyClosed, text: listedText(event.deadline) || 'Not listed', note: explicitlyClosed ? 'Registration closed' : '' };
}
