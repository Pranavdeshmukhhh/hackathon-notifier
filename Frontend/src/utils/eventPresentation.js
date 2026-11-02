const PLATFORM_NAMES = {
  devfolio: 'Devfolio',
  unstop: 'Unstop',
  devpost: 'Devpost',
  hackerearth: 'HackerEarth',
  devnovate: 'Devnovate',
  instagram: 'Instagram',
  web_discovery: 'Web',
};

const FORMAT_NAMES = {
  offline: 'In-person',
  onsite: 'In-person',
  'on-site': 'In-person',
  'in person': 'In-person',
  in_person: 'In-person',
  'in-person': 'In-person',
  online: 'Online',
  remote: 'Online',
  virtual: 'Online',
  hybrid: 'Hybrid',
};

function cleanString(val) {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (!str || ['null', 'undefined', 'none', 'n/a', 'tba', 'unknown'].includes(str.toLowerCase())) {
    return null;
  }
  return str;
}

export function parseValidDate(input) {
  if (!input) return null;
  if (typeof input === 'object' && !(input instanceof Date)) input = input.at || input.date;
  if (!input) return null;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatEventDate(dateInput, includeYear = true) {
  const parsed = parseValidDate(dateInput);
  if (!parsed) {
    return cleanString(dateInput);
  }
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
  }).format(parsed);
}

export function computeDaysUntil(dateInput) {
  const target = parseValidDate(dateInput);
  if (!target) return null;
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Derives accurate registration status from verified timestamps and backend lifecycle state.
 * Statuses: 'open' | 'closing' | 'upcoming' | 'closed'
 */
export function deriveEventStatus(raw = {}) {
  if (raw.canonical?.registration_state === 'unknown') return {key:'unknown',label:'Check registration',deadlineSummary:null,daysRemaining:null};
  if (raw.canonical?.registration_state === 'cancelled') return {key:'closed',label:'Cancelled',deadlineSummary:'Event cancelled',daysRemaining:null};
  const rawLifecycle = cleanString(raw.lifecycle_state || raw.status)?.toLowerCase() || '';
  const deadlineDate = parseValidDate(raw.registration_deadline) || parseValidDate(raw.deadline_iso || raw.deadline);
  const startDate = parseValidDate(raw.start_date || raw.event_start);
  const exactDeadline = typeof raw.registration_deadline === 'object' ? raw.registration_deadline?.at : typeof raw.registration_deadline === 'string' && raw.registration_deadline.includes('T') ? raw.registration_deadline : null;
  const daysUntilDeadline = deadlineDate && !exactDeadline ? Math.round((Date.parse(deadlineDate.toISOString().slice(0,10)) - Date.parse(new Date().toISOString().slice(0,10)))/86400000) : computeDaysUntil(deadlineDate);
  const daysUntilStart = computeDaysUntil(startDate);

  if (
    raw.is_past === true || raw.registration_state === 'closed' || rawLifecycle.includes('close') ||
    rawLifecycle.includes('end') ||
    rawLifecycle.includes('past') ||
    rawLifecycle.includes('expire') ||
    (deadlineDate && (exactDeadline
      ? deadlineDate.getTime() < Date.now()
      : deadlineDate.toISOString().slice(0, 10) < new Date().toISOString().slice(0, 10)))
  ) {
    return {
      key: 'closed',
      label: 'Closed',
      deadlineSummary: deadlineDate ? `Closed ${formatEventDate(deadlineDate, false)}` : 'Registration closed',
      daysRemaining: daysUntilDeadline,
    };
  }

  const opens = parseValidDate(raw.registration_opens_at);
  if (opens && opens.getTime() > Date.now()) return {key:'upcoming',label:'Upcoming',deadlineSummary:`Registration opens ${formatEventDate(opens)}`,daysRemaining:computeDaysUntil(opens)};

  if (
    rawLifecycle.includes('soon') ||
    (daysUntilDeadline !== null && daysUntilDeadline >= 0 && daysUntilDeadline <= 5)
  ) {
    const relative =
      daysUntilDeadline === 0
        ? 'Closes today'
        : daysUntilDeadline === 1
          ? 'Closes tomorrow'
          : daysUntilDeadline !== null ? `Closes in ${daysUntilDeadline} days` : 'Registration closing soon';
    return {
      key: 'closing',
      label: 'Closing soon',
      deadlineSummary: deadlineDate
        ? `${relative} (${formatEventDate(deadlineDate, false)})`
        : relative,
      daysRemaining: daysUntilDeadline,
    };
  }

  if (rawLifecycle.includes('upcom') || (daysUntilDeadline === null && daysUntilStart !== null && daysUntilStart > 14)) {
    return {
      key: 'upcoming',
      label: 'Upcoming',
      deadlineSummary: startDate ? `Starts ${formatEventDate(startDate)}` : 'Upcoming',
      daysRemaining: daysUntilStart,
    };
  }

  return {
    key: deadlineDate || /^(open|live|active|registration open)$/.test(rawLifecycle) ? 'open' : 'unknown',
    label: deadlineDate || /^(open|live|active|registration open)$/.test(rawLifecycle) ? 'Open' : 'Check registration',
    deadlineSummary: deadlineDate
      ? `Registration closes ${formatEventDate(deadlineDate, false)}`
      : null,
    daysRemaining: daysUntilDeadline,
  };
}

/**
 * Normalizes an event object without fabricating missing fields.
 * Missing optional fields are set to null so UI components can omit them cleanly.
 */
export function normalizeEventPresentation(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return {
      id: 'unknown',
      title: 'Untitled hackathon',
      organizer: null,
      sourceKey: 'web_discovery',
      sourceLabel: 'Listed',
      formatKey: null,
      formatLabel: null,
      lifecycleKey: 'open',
      lifecycleLabel: 'Open',
      statusKey: 'open',
      statusLabel: 'Open',
      locationLabel: null,
      deadlineLabel: null,
      dateRangeLabel: null,
      prizeLabel: null,
      eligibilityLabel: null,
      summary: null,
      description: null,
      url: null,
      tags: [],
      distanceKm: null,
      raw: {},
    };
  }

  const id = String(
    raw.id || raw._id || raw.slug || raw.event_id || raw.url || raw.link || `event-${raw.title || raw.name || 'unknown'}`
  );
  const title = cleanString(raw.title || raw.name) || 'Untitled hackathon';

  const rawSource = cleanString(raw.source || raw.platform)?.toLowerCase() || 'web_discovery';
  const sourceLabel = PLATFORM_NAMES[rawSource] || cleanString(raw.source || raw.platform) || 'Directory';

  const organizer = cleanString(raw.organizer || raw.host || raw.college || raw.institution || raw.college_name);

  const rawFormat = cleanString(raw.format || raw.mode || raw.event_type)?.toLowerCase() || null;
  const formatKey = rawFormat
    ? ['offline', 'in_person', 'in-person', 'in person', 'onsite', 'on-site'].includes(rawFormat)
      ? 'offline'
      : rawFormat === 'hybrid'
        ? 'hybrid'
        : ['online', 'remote', 'virtual'].includes(rawFormat)
          ? 'online'
          : null
    : null;
  const formatLabel = rawFormat ? FORMAT_NAMES[rawFormat] || cleanString(raw.format || raw.mode) : null;

  const statusInfo = deriveEventStatus(raw);

  // Location: only use real venue/city/location fields
  const locationParts = [raw.venue, raw.city, raw.state, raw.location, raw.country]
    .map(cleanString)
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i);

  const locationLabel =
    locationParts.length > 0
      ? locationParts.join(', ')
      : formatKey === 'online'
        ? 'Online'
        : null;

  // Dates & Deadlines: only when real dates exist
  const rawDeadline = parseValidDate(raw.registration_deadline) || raw.deadline_iso || raw.deadline;
  const exact = typeof raw.registration_deadline === 'object' ? raw.registration_deadline?.at : null;
  const deadlineFormatted = exact && parseValidDate(exact)
    ? new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(parseValidDate(exact))
    : formatEventDate(rawDeadline);
  const deadlineLabel = statusInfo.deadlineSummary || (deadlineFormatted ? `Closes ${deadlineFormatted}` : null);

  const startFormatted = formatEventDate(raw.start_date || raw.event_start);
  const endFormatted = formatEventDate(raw.end_date || raw.event_end);
  let dateRangeLabel = null;
  if (startFormatted && endFormatted && startFormatted !== endFormatted) {
    dateRangeLabel = `${startFormatted} – ${endFormatted}`;
  } else if (startFormatted) {
    dateRangeLabel = startFormatted;
  } else if (endFormatted && !rawDeadline) {
    dateRangeLabel = endFormatted;
  }

  // Prize & Eligibility: strictly null when absent
  const prizeLabel = cleanString(raw.prize_pool || raw.prizes || raw.bounty || raw.prize);
  const eligibilityLabel = cleanString(
    raw.eligibility || raw.target_audience || raw.participant_type || raw.team_size
  );

  const minTeam = Number(raw.min_team_size), maxTeam = Number(raw.max_team_size);
  const hasMin = Number.isInteger(minTeam) && minTeam > 0;
  const hasMax = Number.isInteger(maxTeam) && maxTeam > 0;
  const teamLabel = hasMin && hasMax && minTeam <= maxTeam ? (minTeam === maxTeam ? `${minTeam} members` : `${minTeam}–${maxTeam} members`) : hasMax ? `Up to ${maxTeam} members` : hasMin ? `${minTeam}+ members` : null;

  const summary = cleanString(raw.short_description || raw.summary || raw.tagline || raw.description || raw.desc);
  const description = cleanString(raw.description || raw.short_description || raw.summary || raw.desc);
  let url = cleanString(raw.registration_url || raw.url || raw.link);
  try { if (url && !['https:', 'http:'].includes(new URL(url).protocol)) url = null; } catch { url = null; }

  const tags = Array.isArray(raw.tags || raw.themes || raw.keywords)
    ? (raw.tags || raw.themes || raw.keywords)
        .map(cleanString)
        .filter(Boolean)
        .slice(0, 6)
    : [];

  return {
    id,
    title,
    organizer,
    sourceKey: rawSource,
    sourceLabel,
    formatKey,
    formatLabel,
    lifecycleKey: statusInfo.key,
    lifecycleLabel: statusInfo.label,
    statusKey: statusInfo.key,
    statusLabel: statusInfo.label,
    daysRemaining: statusInfo.daysRemaining,
    locationLabel,
    deadlineLabel,
    deadlineDateFormatted: deadlineFormatted,
    dateRangeLabel,
    prizeLabel,
    eligibilityLabel,
    teamLabel,
    summary,
    description,
    url,
    tags,
    distanceKm: typeof raw.distance_km === 'number' ? Math.round(raw.distance_km) : null,
    raw,
  };
}

export const presentEvent = normalizeEventPresentation;
export default normalizeEventPresentation;
