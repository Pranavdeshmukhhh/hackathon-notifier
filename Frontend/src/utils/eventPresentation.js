const SOURCE_META = {
  devfolio: { label: 'DEVFOLIO', color: 'var(--src-devfolio)', code: 'DF' },
  unstop: { label: 'UNSTOP', color: 'var(--src-unstop)', code: 'UN' },
  devpost: { label: 'DEVPOST', color: 'var(--src-devpost)', code: 'DP' },
  hackerearth: { label: 'HACKEREARTH', color: 'var(--src-hackerearth)', code: 'HE' },
  devnovate: { label: 'DEVNOVATE', color: 'var(--src-devnovate)', code: 'DN' },
  instagram: { label: 'INSTA FEED', color: 'var(--accent-signal)', code: 'IG' },
  web_discovery: { label: 'WEB INDEX', color: 'var(--text-secondary)', code: 'WB' },
};

const FORMAT_LABELS = {
  offline: 'IN-PERSON',
  in_person: 'IN-PERSON',
  'in-person': 'IN-PERSON',
  online: 'REMOTE',
  remote: 'REMOTE',
  virtual: 'REMOTE',
  hybrid: 'HYBRID',
};

export function formatEventDate(dateInput) {
  if (!dateInput) return 'TBA';
  const str = String(dateInput).trim();
  if (!str || str === 'null' || str === 'undefined') return 'TBA';
  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) return str;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

export function computeDaysRemaining(deadlineInput) {
  if (!deadlineInput) return null;
  const parsed = new Date(deadlineInput);
  if (Number.isNaN(parsed.getTime())) return null;
  const diffMs = parsed.getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function buildGoogleCalendarUrl(spec) {
  const title = encodeURIComponent(`[Hackathon] ${spec.title}`);
  const details = encodeURIComponent(`${spec.summary}\n\nRegistration: ${spec.url || 'N/A'}`);
  const location = encodeURIComponent(spec.locationLabel || 'Online');
  const rawDate = spec.raw?.registration_deadline || spec.raw?.start_date;
  const parsed = rawDate ? new Date(rawDate) : new Date(Date.now() + 7 * 86400000);
  const validDate = Number.isNaN(parsed.getTime()) ? new Date(Date.now() + 7 * 86400000) : parsed;
  const ymd = validDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&location=${location}&dates=${ymd}/${ymd}`;
}

export function normalizeEventPresentation(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return {
      id: 'unknown',
      title: 'Untitled Hackathon',
      sourceKey: 'web_discovery',
      sourceLabel: 'INDEXED',
      sourceCode: 'WB',
      sourceColor: 'var(--text-secondary)',
      formatKey: 'online',
      formatLabel: 'REMOTE',
      lifecycleKey: 'open',
      lifecycleLabel: 'OPEN',
      urgencyPct: 35,
      daysLeft: null,
      locationLabel: 'Remote / Global',
      deadlineLabel: 'TBA',
      dateRangeLabel: 'TBA',
      prizeLabel: 'Open Track',
      teamSizeLabel: '1–4 Members',
      summary: 'Verified engineering competition indexed by Hackathon Notifier.',
      description: 'Verified engineering competition indexed by Hackathon Notifier.',
      url: '',
      organizer: 'Verified Host',
      tags: [],
      verified: true,
      distanceKm: null,
      raw: {},
    };
  }

  const id = String(
    raw.id || raw._id || raw.slug || raw.event_id || raw.url || Math.random().toString(36).slice(2)
  );
  const title = String(raw.title || raw.name || 'Untitled Hackathon').trim();

  const rawSource = String(raw.source || raw.platform || 'web_discovery').toLowerCase().trim();
  const srcMeta = SOURCE_META[rawSource] || {
    label: rawSource.toUpperCase() || 'INDEXED',
    color: 'var(--text-secondary)',
    code: (rawSource.slice(0, 2) || 'IX').toUpperCase(),
  };

  const rawFormat = String(raw.format || raw.mode || raw.event_type || 'online').toLowerCase().trim();
  const formatKey = ['offline', 'in_person', 'in-person'].includes(rawFormat)
    ? 'offline'
    : rawFormat === 'hybrid'
      ? 'hybrid'
      : 'online';
  const formatLabel = FORMAT_LABELS[rawFormat] || 'REMOTE';

  const daysLeft = computeDaysRemaining(raw.registration_deadline || raw.deadline || raw.end_date);
  const rawLifecycle = String(raw.lifecycle_state || raw.status || '').toLowerCase();

  let lifecycleKey = 'open';
  let lifecycleLabel = 'OPEN';
  let urgencyPct = 40;

  if (
    rawLifecycle.includes('end') ||
    rawLifecycle.includes('close') ||
    rawLifecycle.includes('past') ||
    (daysLeft !== null && daysLeft < 0)
  ) {
    lifecycleKey = 'closed';
    lifecycleLabel = 'ENDED';
    urgencyPct = 100;
  } else if (rawLifecycle.includes('soon') || (daysLeft !== null && daysLeft >= 0 && daysLeft <= 5)) {
    lifecycleKey = 'closing';
    lifecycleLabel = daysLeft === 0 ? 'CLOSES TODAY' : `${daysLeft}D LEFT`;
    urgencyPct = Math.max(75, 100 - daysLeft * 5);
  } else if (daysLeft !== null && daysLeft > 5) {
    lifecycleLabel = `${daysLeft}D LEFT`;
    urgencyPct = Math.max(18, Math.min(72, Math.round(100 - (daysLeft / 30) * 80)));
  }

  const cityOrVenue = [raw.venue, raw.city, raw.state, raw.location]
    .filter((v) => typeof v === 'string' && v.trim() && !['none', 'null', 'tba'].includes(v.trim().toLowerCase()))
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .join(', ');

  const locationLabel = cityOrVenue || (formatKey === 'online' ? 'Remote / Global' : 'Venue TBA');

  const deadlineRaw = raw.registration_deadline || raw.deadline || raw.end_date || raw.start_date;
  const deadlineLabel = formatEventDate(deadlineRaw);

  const startStr = formatEventDate(raw.start_date);
  const endStr = formatEventDate(raw.end_date);
  const dateRangeLabel =
    startStr !== 'TBA' && endStr !== 'TBA' && startStr !== endStr
      ? `${startStr} — ${endStr}`
      : startStr !== 'TBA'
        ? startStr
        : deadlineLabel;

  const prizeLabel =
    raw.prize_pool || raw.prizes || raw.bounty
      ? String(raw.prize_pool || raw.prizes || raw.bounty).trim()
      : 'Open Bounty';

  const teamSizeLabel = String(raw.team_size || raw.team_limit || '1–4 Builders').trim();

  const summary = String(
    raw.short_description ||
      raw.summary ||
      raw.description ||
      raw.tagline ||
      `Verified ${formatLabel.toLowerCase()} engineering competition indexed via ${srcMeta.label}.`
  ).trim();

  const tags = Array.isArray(raw.tags || raw.themes || raw.keywords)
    ? (raw.tags || raw.themes || raw.keywords).map((t) => String(t).trim()).filter(Boolean).slice(0, 6)
    : [];

  return {
    id,
    title,
    sourceKey: rawSource,
    sourceLabel: srcMeta.label,
    sourceCode: srcMeta.code,
    sourceColor: srcMeta.color,
    formatKey,
    formatLabel,
    lifecycleKey,
    lifecycleLabel,
    urgencyPct,
    daysLeft,
    locationLabel,
    deadlineLabel,
    dateRangeLabel,
    prizeLabel,
    teamSizeLabel,
    summary,
    description: String(raw.description || summary).trim(),
    url: String(raw.url || raw.registration_url || raw.link || '').trim(),
    organizer: String(raw.organizer || raw.host || raw.college || srcMeta.label).trim(),
    tags,
    verified: Boolean(raw.verified ?? true),
    distanceKm: typeof raw.distance_km === 'number' ? raw.distance_km : null,
    raw,
  };
}

export const presentEvent = normalizeEventPresentation;
export default normalizeEventPresentation;
