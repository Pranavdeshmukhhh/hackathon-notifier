"""Read-only compatibility boundary for public listings, including legacy rows.

Malformed optional facts must not take the entire feed down. This never repairs
stored records, performs network requests, or exposes internal scraper metadata.
"""
from datetime import datetime, timezone
import math
import re

from event_normalization import TEXT_FIELDS, plain_text, parse_date
from safe_http import validate_public_url


def _integer(value):
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return None
    if isinstance(value, str):
        value = value.strip()
        if re.fullmatch(r"\d{1,3}(?:,\d{3})+", value):
            value = value.replace(",", "")
        if not re.fullmatch(r"\d+(?:\.0+)?", value):
            return None
    try:
        number = float(value)
        return int(number) if math.isfinite(number) and number.is_integer() and 0 <= number <= 100_000_000 else None
    except (ValueError, OverflowError):
        return None


def _timestamp(value, *, collected=False):
    if collected and isinstance(value, datetime) and value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)  # MongoDB BSON dates are UTC.
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            return value.astimezone(timezone.utc).isoformat()
        if collected:
            return value.isoformat()
    return None


def public_event(raw):
    result = {key: text for key, limit in TEXT_FIELDS.items() if (text := plain_text(raw.get(key), limit))}
    # A title such as "Unknown" is a name, not an unknown optional fact.
    title = raw.get("title")
    if "title" not in result:
        result["title"] = title.strip()[:500] if isinstance(title, str) and "<" not in title else ""
    result.update(_id=str(raw["_id"]), source=result.get("source", "Unknown"))
    for field in ("mode", "status", "deadline", "deadline_kind", "publication_state"):
        if (text := plain_text(raw.get(field), 300)):
            result[field] = text
    result["tags"] = list(dict.fromkeys(
        text for item in (raw.get("tags") if isinstance(raw.get("tags"), list) else [])[:40]
        if (text := plain_text(item, 80))
    ))
    result["scraped_at"] = _timestamp(raw.get("scraped_at"), collected=True) or ""
    result["deadline_iso"] = parse_date(raw.get("deadline_iso"))
    iso = raw.get("deadline_iso")
    if result["deadline_iso"] is None and isinstance(iso, str) and "T" in iso:
        try:
            result["deadline_iso"] = datetime.fromisoformat(iso.replace("Z", "+00:00")).date().isoformat()
        except ValueError:
            pass
    for field in ("link", "instagram_post_url"):
        value = raw.get(field)
        if isinstance(value, str):
            try:
                validate_public_url(value.strip())
                result[field] = value.strip()
            except ValueError:
                pass
    for field in ("registrations", "total_registrations", "min_team_size", "max_team_size"):
        number = _integer(raw.get(field))
        if number is not None and (number > 0 or "registrations" in field):
            result[field] = number
        elif "registrations" in field and (text := plain_text(raw.get(field), 80)):
            # Preserve an explicitly approximate source count for display only.
            if re.fullmatch(r"\d+(?:\.\d+)?[km]\+?|\d+\+", text, re.I):
                result[field] = text
    if result.get("min_team_size", 0) > result.get("max_team_size", math.inf):
        result.pop("min_team_size", None)
        result.pop("max_team_size", None)
    lat, lng = raw.get("lat"), raw.get("lng")
    if all(isinstance(n, (int, float)) and not isinstance(n, bool) and math.isfinite(n) for n in (lat, lng)):
        if -90 <= lat <= 90 and -180 <= lng <= 180:
            result.update(lat=lat, lng=lng)
    for field in ("is_top_college", "is_internship", "verified"):
        if isinstance(raw.get(field), bool):
            result[field] = raw[field]
    confidence = raw.get("verification_confidence")
    if isinstance(confidence, (int, float)) and not isinstance(confidence, bool) and math.isfinite(confidence) and 0 <= confidence <= 1:
        result["verification_confidence"] = confidence
    deadline = raw.get("registration_deadline")
    if isinstance(deadline, dict):
        at = _timestamp(deadline.get("at"))
        day = at[:10] if at else parse_date(deadline.get("date"))
        result["registration_deadline"] = {"at": at, "date": day, "precision": "timestamp" if at else "date" if day else "unknown"}
        if day and result.get("deadline_kind") == "registration":
            result["deadline_iso"] = day
    return result


def exact_registration_count(event):
    for field in ("total_registrations", "registrations"):
        if (number := _integer(event.get(field))) is not None:
            return number
    return 0
