import {
  normalizeEventPresentation,
  parseValidDate,
} from "./eventPresentation";

const DAY_MS = 86400000;

function calendarDay(now, zone) {
  // Follow the API's date-only convention: the stated zone, otherwise UTC.
  const offset = /^([+-])(\d{2}):?(\d{2})$/.exec(zone || "");
  if (offset) {
    const minutes =
      (Number(offset[2]) * 60 + Number(offset[3])) *
      (offset[1] === "-" ? -1 : 1);
    return new Date(now.getTime() + minutes * 60000).toISOString().slice(0, 10);
  }
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    return ["year", "month", "day"]
      .map((type) => parts.find((part) => part.type === type).value)
      .join("-");
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function deadlineDays(event, now = new Date()) {
  const raw = event.raw || event;
  const canonical = raw.canonical?.registration_closes;
  const explicit = raw.registration_deadline;
  if (canonical && !["timestamp", "date"].includes(canonical.precision))
    return null;
  const value = canonical
    ? canonical.precision === "timestamp"
      ? canonical.at
      : canonical.date
    : explicit?.at ||
      explicit?.date ||
      (typeof explicit === "string" ? explicit : null) ||
      raw.deadline_iso;
  if (typeof value !== "string") return null;
  const parsed = parseValidDate(value);
  if (!parsed) return null;
  if (value.includes("T")) {
    // A clock without an offset is not a known instant.
    if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) return null;
    const remaining = parsed.getTime() - now.getTime();
    return remaining < 0 ? -1 : Math.ceil(remaining / DAY_MS);
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    return null;
  const today = calendarDay(
    now,
    canonical?.timezone || explicit?.timezone || raw.timezone,
  );
  return Math.round((Date.parse(value) - Date.parse(today)) / DAY_MS);
}

export function buildSignalField(events = [], now = new Date()) {
  const prepared = events.map((event) =>
    event.sourceLabel ? event : normalizeEventPresentation(event),
  );
  const known = [],
    unknown = [];
  for (const event of prepared) {
    const days = deadlineDays(event, now);
    if (days === null || days < 0 || event.lifecycleKey === "closed")
      unknown.push(event);
    else known.push({ ...event, signalDays: days });
  }
  const angles = { online: 0, offline: 170, hybrid: 270 };
  const groups = {};
  for (const event of known)
    (groups[event.formatKey || "unknown"] ||= []).push(event);
  const points = [];
  for (const [format, group] of Object.entries(groups)) {
    group.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    group.forEach((event, index) => {
      const angle =
        (((angles[format] ?? 90) - 38 + ((index + 0.5) * 76) / group.length) *
          Math.PI) /
        180;
      const radius = 38 + Math.sqrt(Math.min(event.signalDays, 30) / 30) * 90;
      points.push({
        ...event,
        x: 230 + Math.cos(angle) * radius,
        y: 150 + Math.sin(angle) * radius,
      });
    });
  }
  return { points, unknown };
}
