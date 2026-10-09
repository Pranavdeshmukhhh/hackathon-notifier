"""Pure source observation validation. Unknown facts stay unknown."""
from datetime import date, datetime, timezone
import math
import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from bs4 import BeautifulSoup

UNKNOWN = re.compile(r"^(?:tba|tbd|n/?a|none|null|unknown|not (?:listed|specified|provided)|-)$", re.I)
CLOSED = {"closed", "ended", "completed", "finished", "cancelled", "canceled"}
TEXT_FIELDS = {
    "title": 500, "source": 150, "desc": 12000, "tagline": 500,
    "organizer": 500, "eligibility": 4000, "location": 500, "venue": 500,
    "city": 150, "region": 150, "country": 150, "prize": 1000,
    "college_name": 500, "college_type": 50, "opportunity_type": 80,
    "source_account": 150, "discovery_source": 80,
}


def utc_now():
    return datetime.now(timezone.utc)


def plain_text(value, limit=12000):
    if not isinstance(value, str):
        return None
    if "<" in value:
        soup = BeautifulSoup(value, "html.parser")
        for item in soup.select("script,style,iframe,object"):
            item.decompose()
        for item in soup.find_all("br"):
            item.replace_with("\n")
        for item in soup.select("p,div,li,h1,h2,h3,h4,blockquote"):
            item.append("\n\n")
        value = soup.get_text("")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r" *\n *", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value).strip()[:limit]
    return value if value and not UNKNOWN.fullmatch(value) else None


def canonical_url(value):
    """No DNS/network access; preserve identity-bearing path, query and fragment."""
    if not isinstance(value, str) or len(value) > 2048:
        raise ValueError("Invalid event URL")
    parts = urlsplit(value.strip())
    if parts.scheme.lower() not in {"http", "https"} or not parts.hostname or parts.username or parts.password:
        raise ValueError("Invalid event URL")
    host = parts.hostname.encode("idna").decode("ascii").lower()
    if ":" in host:
        host = f"[{host}]"
    port = parts.port
    if port and not ((parts.scheme.lower() == "https" and port == 443) or (parts.scheme.lower() == "http" and port == 80)):
        host += f":{port}"
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)
             if not k.lower().startswith("utm_") and k.lower() not in {"fbclid", "gclid", "msclkid"}]
    return urlunsplit((parts.scheme.lower(), host, parts.path or "/", urlencode(query), parts.fragment))


def parse_date(value, *, day_first=None):
    """Only a single complete calendar date; never choose the end of a range."""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = plain_text(value, 200)
    if not text:
        return None
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        try:
            return date.fromisoformat(text).isoformat()
        except ValueError:
            return None
    text = re.sub(r"(\d)(?:st|nd|rd|th)\b", r"\1", text, flags=re.I)
    for fmt in ("%d %b %Y", "%d %B %Y", "%b %d, %Y", "%B %d, %Y", "%b %d %Y", "%B %d %Y"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            pass
    match = re.fullmatch(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})", text)
    if match and day_first is not None:
        a, b, year = map(int, match.groups())
        try:
            return date(year, b if day_first else a, a if day_first else b).isoformat()
        except ValueError:
            pass
    return None


def extract_registration_date(text):
    """Accept one complete date immediately after an explicit registration label."""
    labels = list(re.finditer(r"(?:registration\s+(?:deadline|closes|ends)|apply\s+by|last\s+date\s+to\s+register)\s*[:–—-]?\s*", text, re.I))
    dates = set()
    token = r"(\d{4}-\d{2}-\d{2}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4}|[A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})"
    for index, label in enumerate(labels):
        end = labels[index + 1].start() if index + 1 < len(labels) else len(text)
        candidate = re.split(r"[\n<]", text[label.end():end], maxsplit=1)[0][:100].strip()
        match = re.match(token, candidate, re.I)
        if not match:
            return None, None
        remainder = candidate[match.end():]
        if re.match(r"\s*(?:[-–—]|to\b|through\b|until\b|and\b)\s*\d", remainder, re.I):
            return None, None
        parsed = parse_date(match.group(1))
        if not parsed:
            return None, None
        dates.add(parsed)
    return (next(iter(dates)), next(iter(dates))) if len(dates) == 1 else (None, None)


def normalize_observation(raw, *, authority=1, observed_at=None):
    if not isinstance(raw, dict):
        raise ValueError("Expected an event observation")
    result = {key: text for key, limit in TEXT_FIELDS.items() if (text := plain_text(raw.get(key), limit))}
    if not result.get("title"):
        raise ValueError("Event title required")
    from safe_http import validate_public_url
    result["link"] = canonical_url(raw.get("link"))
    validate_public_url(result["link"])
    mode = str(raw.get("mode") or "").strip().lower()
    if re.search(r"\bhybrid\b", mode):
        result["mode"] = "Hybrid"
    elif re.search(r"\b(?:online|virtual|remote)\b", mode):
        result["mode"] = "Virtual"
    elif re.search(r"\b(?:offline|in[ -]person|on[ -]?site)\b", mode):
        result["mode"] = "Offline"
    tags = raw.get("tags")
    if isinstance(tags, list):
        result["tags"] = list(dict.fromkeys(t for item in tags[:40] if (t := plain_text(item, 80))))
    for key in ("min_team_size", "max_team_size", "registrations", "total_registrations"):
        value = raw.get(key)
        if isinstance(value, (int, float, str)) and not isinstance(value, bool):
            try:
                n = float(value)
                if math.isfinite(n) and n.is_integer() and 0 <= n <= 100_000_000:
                    if n > 0 or "registrations" in key:
                        result[key] = int(n)
            except ValueError:
                pass
    if result.get("min_team_size", 0) > result.get("max_team_size", float("inf")):
        result.pop("min_team_size", None)
        result.pop("max_team_size", None)
    lat, lng = raw.get("lat"), raw.get("lng")
    if result.get("mode") != "Virtual" and isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
        if not isinstance(lat, bool) and not isinstance(lng, bool) and math.isfinite(lat) and math.isfinite(lng) and -90 <= lat <= 90 and -180 <= lng <= 180:
            result.update(lat=lat, lng=lng, coordinate_precision=raw.get("coordinate_precision") if raw.get("coordinate_precision") in {"venue", "city"} else "unknown")
    for key in ("is_top_college", "is_internship", "verified"):
        if isinstance(raw.get(key), bool):
            result[key] = raw[key]
    confidence = raw.get("verification_confidence")
    if isinstance(confidence, (int, float)) and not isinstance(confidence, bool) and 0 <= confidence <= 1:
        result["verification_confidence"] = confidence
    if raw.get("instagram_post_url"):
        try:
            result["instagram_post_url"] = canonical_url(raw["instagram_post_url"])
        except ValueError:
            pass
    status = plain_text(raw.get("status"), 80)
    if status:
        result["status"] = status
    # Adapters explicitly identify the date's meaning. Legacy unlabelled input is
    # accepted only at the manual/curated boundary, not from generic scraping.
    kind = raw.get("deadline_kind") or ("registration" if authority >= 3 else "unknown")
    date_value = raw.get("registration_deadline") or raw.get("deadline_iso") or raw.get("deadline")
    if isinstance(date_value, dict):
        date_value = date_value.get("at") or date_value.get("date")
    date_iso = parse_date(date_value, day_first=raw.get("date_day_first"))
    exact = None
    if isinstance(date_value, str) and "T" in date_value:
        try:
            timestamp = datetime.fromisoformat(date_value.replace("Z", "+00:00"))
            date_iso = timestamp.date().isoformat()
            if timestamp.tzinfo:
                exact = timestamp.astimezone(timezone.utc).isoformat()
                date_iso = timestamp.astimezone(timezone.utc).date().isoformat()
        except ValueError:
            pass
    if kind == "registration":
        result["deadline"] = plain_text(raw.get("deadline"), 300) or date_iso or "TBA"
        result["deadline_iso"] = date_iso
        result["registration_deadline"] = {"date": date_iso, "at": exact, "precision": "timestamp" if exact else "date" if date_iso else "unknown", "raw": plain_text(date_value, 300)}
    else:
        result["deadline"] = "TBA"
        result["deadline_iso"] = None
        if kind == "event":
            result["event_end"] = date_iso
        elif kind == "submission":
            result["submission_deadline"] = date_iso
        result["registration_deadline"] = {"date": None, "at": None, "precision": "unknown", "raw": None}
    result["deadline_kind"] = "registration" if kind == "registration" else "unknown"
    result["schema_version"] = 5
    for key in ("event_start", "event_end"):
        if (parsed := parse_date(raw.get(key))):
            result[key] = parsed
    source_id = raw.get("source_event_id")
    result["_source_event_id"] = plain_text(str(source_id), 150) if isinstance(source_id, (str, int)) and not isinstance(source_id, bool) else None
    result["_authority"] = authority
    result["_observed_at"] = (observed_at or utc_now()).isoformat()
    return result


def lifecycle_values(event, now=None):
    now = now or utc_now()
    status = str(event.get("status") or "").lower()
    deadline = event.get("registration_deadline") or {}
    at = deadline.get("at")
    expired = False
    if at:
        try:
            parsed = datetime.fromisoformat(at.replace("Z", "+00:00"))
            expired = bool(parsed.tzinfo and parsed < now)
        except (ValueError, TypeError, AttributeError):
            pass
    elif event.get("deadline_iso"):
        iso = parse_date(event["deadline_iso"])
        expired = bool(iso and iso < now.date().isoformat())
    closed = status in CLOSED or expired
    registration = "cancelled" if status in {"cancelled", "canceled"} else "closed" if closed else "open" if status in {"open", "live", "upcoming"} else "unknown"
    publication = "suppressed" if event.get("publication_state") == "suppressed" else "archived" if closed else "published"
    return {"registration_state": registration, "publication_state": publication, "is_past": closed, "archived": publication == "archived"}
