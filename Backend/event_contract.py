"""Canonical public contract and conservative source adapters. No network or writes."""
from datetime import datetime, timezone, timedelta
from hashlib import sha256
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from typing import Literal
import math
import re
from pydantic import BaseModel, Field
from event_normalization import plain_text, parse_date, canonical_url
from safe_http import validate_public_url

VERSION = 2


class EventDate(BaseModel):
    at: str | None = None
    date: str | None = None
    precision: Literal['timestamp', 'date', 'local_datetime', 'unknown'] = 'unknown'
    timezone: str | None = None
    local_value: str | None = None


class Coordinates(BaseModel):
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    verified: bool = False
    precision: Literal['venue','city','unknown'] = 'unknown'


class EventLocation(BaseModel):
    text: str | None = None
    venue: str | None = None
    city: str | None = None
    country: str | None = None
    coordinates: Coordinates = Field(default_factory=Coordinates)


class PrizePool(BaseModel):
    original: str | None = None
    currency: str | None = Field(default=None, pattern=r'^[A-Z]{3}$')
    amount: str | None = Field(default=None, pattern=r'^\d+(?:\.\d{1,2})?$')


class TeamSize(BaseModel):
    minimum: int | None = Field(default=None, ge=1)
    maximum: int | None = Field(default=None, ge=1)


class Provenance(BaseModel):
    platform: str | None = None
    url: str | None = None
    external_id: str | None = None
    observed_at: str | None = None
    source_updated_at: str | None = None


class Verification(BaseModel):
    status: Literal['verified','unverified'] = 'unverified'
    confidence: float | None = Field(default=None, ge=0, le=1)
    last_success_at: str | None = None
    method: Literal['administrator_evidence'] | None = None


class Freshness(BaseModel):
    last_seen_at: str | None = None
    last_updated_at: str | None = None
    state: Literal['unknown','fresh','stale'] = 'unknown'


class CanonicalEvent(BaseModel):
    schema_version: int = VERSION
    id: str
    title: str | None
    registration_url: str | None = None
    registration_url_status: Literal['source_reported', 'unknown'] = 'unknown'
    aliases: list[str] = Field(default_factory=list)
    conflicting_fields: list[str] = Field(default_factory=list)
    source: str | None = None
    organizer: str | None = None
    format: Literal['online', 'offline', 'hybrid', 'unknown'] = 'unknown'
    registration_opens: EventDate = Field(default_factory=EventDate)
    registration_closes: EventDate = Field(default_factory=EventDate)
    submission_closes: EventDate = Field(default_factory=EventDate)
    event_starts: EventDate = Field(default_factory=EventDate)
    event_ends: EventDate = Field(default_factory=EventDate)
    location: EventLocation = Field(default_factory=EventLocation)
    prize: PrizePool = Field(default_factory=PrizePool)
    team: TeamSize = Field(default_factory=TeamSize)
    eligibility: str | None = None
    event_status_source: str | None = None
    event_status: Literal['scheduled','live','ended','cancelled','unknown'] = 'unknown'
    registration_state: Literal['open', 'closing', 'upcoming', 'closed', 'cancelled', 'unknown'] = 'unknown'
    publication_state: Literal['published', 'archived', 'suppressed', 'pending'] = 'published'
    provenance: list[Provenance] = Field(default_factory=list)
    verification: Verification = Field(default_factory=Verification)
    freshness: Freshness = Field(default_factory=Freshness)


def stamp(value):
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat() if value.tzinfo else None
    try:
        dt = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        return dt.astimezone(timezone.utc).isoformat() if dt.tzinfo else None
    except (ValueError, TypeError):
        return None


def zone_info(value):
    zone=plain_text(value,80)
    if not zone:return None,None
    try:return zone,ZoneInfo(zone)
    except (ZoneInfoNotFoundError,ValueError):
        match=re.fullmatch(r'([+-])(\d{2}):?(\d{2})',zone)
        if match and int(match[2])<=14 and int(match[3])<60:
            minutes=(int(match[2])*60+int(match[3]))*(1 if match[1]=='+' else -1)
            return zone,timezone(timedelta(minutes=minutes))
    return None,None


def temporal(value, zone=None):
    if isinstance(value,dict):
        zone=value.get('timezone') or zone
        value=value.get('at') or value.get('local_value') or value.get('date')
    zone,zone_object=zone_info(zone)
    text=value.isoformat() if isinstance(value,datetime) else plain_text(value,200)
    if not text:return EventDate()
    try:
        dt=datetime.fromisoformat(text.replace('Z','+00:00'))
        if 'T' in text or ' ' in text and ':' in text:
            if dt.tzinfo:
                local=dt.astimezone(zone_object) if zone_object else dt
                return EventDate(at=dt.astimezone(timezone.utc).isoformat(),date=local.date().isoformat(),precision='timestamp',timezone=zone or dt.strftime('%z'))
            if zone_object:
                first=dt.replace(tzinfo=zone_object,fold=0)
                second=dt.replace(tzinfo=zone_object,fold=1)
                if first.utcoffset()==second.utcoffset() and first.astimezone(timezone.utc).astimezone(zone_object).replace(tzinfo=None)==dt:
                    return EventDate(at=first.astimezone(timezone.utc).isoformat(),date=dt.date().isoformat(),precision='timestamp',timezone=zone)
            return EventDate(date=dt.date().isoformat(),local_value=text,precision='local_datetime',timezone=zone)
    except (ValueError,TypeError):pass
    day=parse_date(text)
    return EventDate(date=day,precision='date',timezone=zone) if day else EventDate()


def event_format(value):
    text = value.lower() if isinstance(value,str) else ''
    if re.search(r'\bhybrid\b', text): return 'hybrid'
    if re.search(r'\b(?:online|virtual|remote)\b', text): return 'online'
    if re.search(r'\b(?:offline|in[ _-]person|on[ -]?site)\b', text): return 'offline'
    return 'unknown'


def safe_url(value):
    try:
        validate_public_url(value)
        return canonical_url(value)
    except (ValueError, TypeError):
        return None


def integer(value):
    if isinstance(value, bool): return None
    try:
        n = float(value)
        return int(n) if math.isfinite(n) and 0 < n <= 100_000_000 and n.is_integer() else None
    except (ValueError, TypeError, OverflowError):
        return None


def prize_value(raw):
    text = plain_text(raw.get('prize'), 1000)
    explicit = plain_text(raw.get('prize_currency'), 20)
    currency = explicit.upper() if explicit and re.fullmatch('[A-Za-z]{3}', explicit) else None
    if text and not currency:
        for pattern, code in [(r'₹|\bINR\b','INR'), (r'US\$|\bUSD\b','USD'), (r'€|\bEUR\b','EUR'), (r'£|\bGBP\b','GBP')]:
            if re.search(pattern, text, re.I): currency = code; break
    # "$" alone does not identify which dollar currency, and packages are not cash.
    amount = None
    if text and currency:
        cleaned = re.sub(r'₹|US\$|€|£|\b(?:INR|USD|EUR|GBP)\b', '', text, flags=re.I).strip().replace(',', '')
        if re.fullmatch(r'\d+(?:\.\d{1,2})?', cleaned): amount = cleaned
    return {'original': text, 'currency': currency, 'amount': amount}


def before(date_value, now):
    if date_value.at:
        return datetime.fromisoformat(date_value.at) <= now
    if date_value.date and date_value.precision == 'date':
        _,zone=zone_info(date_value.timezone)
        day = now.astimezone(zone).date() if zone else now.date()
        return date_value.date < day.isoformat()
    return False


def classify(raw, opens, closes, ends, submission, now):
    status = str(raw.get('status') or '').strip().lower()
    if status in {'cancelled', 'canceled'}: return 'cancelled'
    if status in {'closed', 'ended', 'completed', 'finished'} or any(before(item, now) for item in (closes, ends, submission)):
        return 'closed'
    _,opening_zone=zone_info(opens.timezone)
    opening_day=now.astimezone(opening_zone).date() if opening_zone else now.date()
    if opens.at and datetime.fromisoformat(opens.at) > now or opens.precision == 'date' and opens.date > opening_day.isoformat():
        return 'upcoming'
    if closes.at or closes.precision == 'date':
        due = datetime.fromisoformat(closes.at).date() if closes.at else datetime.fromisoformat(closes.date).date()
        return 'closing' if (due-now.date()).days <= 5 else 'open'
    return 'open' if status in {'open', 'live', 'active', 'registration open'} else 'upcoming' if status == 'upcoming' else 'unknown'



def classify_event(starts,ends,source_status,now):
    status=str(source_status or '').lower()
    if status in {'cancelled','canceled'}:return 'cancelled'
    if before(ends,now) or status in {'ended','completed','finished'}:return 'ended'
    if starts.at and datetime.fromisoformat(starts.at)>now or starts.precision=='date' and starts.date>now.date().isoformat():return 'scheduled'
    if starts.at and ends.at and datetime.fromisoformat(starts.at)<=now<=datetime.fromisoformat(ends.at):return 'live'
    return 'scheduled' if status=='upcoming' else 'live' if status=='ongoing' else 'unknown'

def canonical_event(raw, *, now=None):
    """Read adapter: stable legacy IDs; explicit nulls; no inferred verification."""
    now = now or datetime.now(timezone.utc)
    url = safe_url(raw.get('link'))
    event_id = str(raw.get('_id') or sha256((url or str(raw.get('title'))).encode()).hexdigest()[:24])
    zone = raw.get('timezone')
    closes = temporal(raw.get('registration_deadline'), zone)
    # Legacy labelled flat dates retain their established registration meaning.
    if closes.precision == 'unknown' and (raw.get('deadline_kind')=='registration' or raw.get('deadline_kind') is None and str(raw.get('source') or '').lower() not in {'devpost','hackerearth','devfolio','unstop','devnovate'}):
        closes = temporal(raw.get('deadline_iso') or raw.get('deadline'), zone)
    opens = temporal(raw.get('registration_opens_at'), zone)
    starts, ends = temporal(raw.get('event_start'), zone), temporal(raw.get('event_end'), zone)
    submission = temporal(raw.get('submission_deadline'), zone)
    state = classify(raw, opens, closes, ends, submission, now)
    event_status=classify_event(starts,ends,raw.get('source_event_status') or ('cancelled' if str(raw.get('status') or '').lower() in {'cancelled','canceled'} else None),now)
    publication = str(raw.get('publication_state') or '')
    if publication not in {'suppressed', 'pending'}:
        publication = 'archived' if state in {'closed','cancelled'} or raw.get('archive_reason') else 'published'
    seen = stamp(raw.get('last_seen_at') or raw.get('scraped_at'))
    if isinstance(raw.get('scraped_at'), datetime) and not raw['scraped_at'].tzinfo:
        seen = raw['scraped_at'].replace(tzinfo=timezone.utc).isoformat()  # BSON UTC.
    age = (now-datetime.fromisoformat(seen)).total_seconds() if seen else None
    if age is not None and age < 0: age=None
    if age is not None and age>14*86400 and closes.precision=='unknown' and state in {'open','upcoming'}:state='unknown'
    checked = stamp(raw.get('last_successful_verification_at'))
    method = raw.get('verification_method')
    evidence_known = method == 'administrator_evidence' and checked is not None and datetime.fromisoformat(checked)<=now and bool(plain_text(raw.get('verification_evidence'), 2000))
    verified = evidence_known and not raw.get('verification_stale')
    confidence = raw.get('verification_confidence')
    confidence = confidence if verified and isinstance(confidence,(int,float)) and not isinstance(confidence,bool) and math.isfinite(confidence) and 0<=confidence<=1 else None
    lat, lng = raw.get('lat'), raw.get('lng')
    valid_coords = all(isinstance(n,(int,float)) and not isinstance(n,bool) and math.isfinite(n) for n in (lat,lng)) and abs(lat)<=90 and abs(lng)<=180
    coords_verified = valid_coords and raw.get('coordinates_verified') is True and bool(stamp(raw.get('coordinates_verified_at'))) and datetime.fromisoformat(stamp(raw.get('coordinates_verified_at')))<=now and bool(plain_text(raw.get('coordinate_evidence'),500))
    minimum, maximum = integer(raw.get('min_team_size')), integer(raw.get('max_team_size'))
    if minimum and maximum and minimum > maximum: minimum = maximum = None
    provenance = []
    items = raw.get('source_records') if isinstance(raw.get('source_records'),list) else []
    for item in items:
        if isinstance(item,dict):
            provenance.append({'platform':plain_text(item.get('platform'),150),'url':safe_url(item.get('url')),
                'external_id':plain_text(item.get('external_id'),150),'observed_at':stamp(item.get('observed_at')),'source_updated_at':stamp(item.get('source_updated_at'))})
    if not provenance:
        provenance = [{'platform':plain_text(raw.get('source'),150),'url':url,'external_id':plain_text(str(raw['source_event_id']),150) if raw.get('source_event_id') is not None else None,'observed_at':seen,'source_updated_at':stamp(raw.get('source_updated_at'))}]
    return CanonicalEvent(id=event_id, title=plain_text(raw.get('title'),500), registration_url=url,
        registration_url_status='source_reported' if url else 'unknown', source=plain_text(raw.get('source'),150),
        conflicting_fields=[field for field in (raw.get("conflicting_fields") if isinstance(raw.get("conflicting_fields"),list) else []) if field in {"title","organizer","mode","registration_deadline","event_start","event_end","prize","eligibility","min_team_size","max_team_size","desc","tags","edition_identity"}],
        organizer=plain_text(raw.get('organizer') or raw.get('organization'),500), format=event_format(raw.get('mode')),
        registration_opens=opens, registration_closes=closes, submission_closes=submission, event_starts=starts,event_ends=ends,
        registration_state=state,publication_state=publication,event_status=event_status,event_status_source=plain_text(raw.get('source_event_status'),100) or ('cancelled' if state=='cancelled' else None),
        location={'text':plain_text(raw.get('location'),500),'venue':plain_text(raw.get('venue'),500),'city':plain_text(raw.get('city'),150),
            'country':plain_text(raw.get('country'),150),'coordinates':{'latitude':lat if valid_coords else None,'longitude':lng if valid_coords else None,
                'verified':bool(coords_verified),'precision':raw.get('coordinate_precision') if raw.get('coordinate_precision') in {'venue','city'} else 'unknown'}},
        prize=prize_value(raw),team={'minimum':minimum,'maximum':maximum},eligibility=plain_text(raw.get('eligibility'),4000),
        provenance=provenance,verification={'status':'verified' if verified else 'unverified','confidence':confidence,
            'last_success_at':checked if evidence_known else None,'method':method if evidence_known else None},
        freshness={'last_seen_at':seen,'last_updated_at':stamp(raw.get('updated_at')),'state':'unknown' if age is None else 'stale' if age>14*86400 else 'fresh'}).model_dump()


def adapt_observation(raw, *, now=None):
    """Normalize scraper outputs. Scrapers must label the dates they actually observed."""
    if not isinstance(raw,dict): raise ValueError('Expected event object')
    now = now or datetime.now(timezone.utc)
    title = plain_text(raw.get('title'),500)
    url = safe_url(raw.get('link'))
    if not title or not url: raise ValueError('Event title and public source URL required')
    # Preserve only known public/source facts; private scraper payloads are never persisted here.
    from event_normalization import TEXT_FIELDS
    doc = {key:value for key,limit in TEXT_FIELDS.items() if (value:=plain_text(raw.get(key),limit))}
    doc.update(title=title,link=url,mode={'online':'Online','offline':'Offline','hybrid':'Hybrid','unknown':'Unknown'}[event_format(raw.get('mode'))],
        conflicting_fields=[field for field in (raw.get("conflicting_fields") if isinstance(raw.get("conflicting_fields"),list) else []) if field in {"title","organizer","mode","registration_deadline","event_start","event_end","prize","eligibility","min_team_size","max_team_size","desc","tags","edition_identity"}],
        organizer=plain_text(raw.get('organizer') or raw.get('organization'),500),source=plain_text(raw.get('source'),150) or 'Unknown',
        status=plain_text(raw.get('status'),100) or 'Unknown',scraped_at=now.isoformat(),last_seen_at=now.isoformat(),schema_version=VERSION,
        deadline_kind=raw.get('deadline_kind') if raw.get('deadline_kind') in {'registration','event','submission'} else 'unknown', verified=False)
    for key in ('event_start','event_end','registration_opens_at','submission_deadline','timezone','prize_currency','source_event_id','source_updated_at','source_event_status'):
        if isinstance(raw.get(key),(str,int)) and not isinstance(raw.get(key),bool): doc[key]=raw[key]
    for key in ('min_team_size','max_team_size','total_registrations','registrations'):
        if (value:=integer(raw.get(key))) is not None: doc[key]=value
    doc['tags'] = list(dict.fromkeys(value for item in (raw.get('tags') if isinstance(raw.get('tags'),list) else [])[:40] if (value:=plain_text(item,80))))
    for key in ('is_top_college','is_internship'):
        if isinstance(raw.get(key),bool):doc[key]=raw[key]
    for key in ('lat','lng'):
        if isinstance(raw.get(key),(int,float)) and not isinstance(raw.get(key),bool) and math.isfinite(raw[key]):doc[key]=raw[key]
    if raw.get('registration_deadline'):
        reg=temporal(raw['registration_deadline'],raw.get('timezone'))
    elif doc['deadline_kind']=='registration':
        reg=temporal(raw.get('deadline_iso') or raw.get('deadline'),raw.get('timezone'))
    else:reg=EventDate()
    doc['registration_deadline']=reg.model_dump()
    doc['deadline_iso']=reg.at[:10] if reg.at else reg.date if reg.precision=='date' else None
    doc['deadline']=doc['deadline_iso'] or 'TBA'
    if reg.precision!='unknown':doc['deadline_kind']='registration'
    if raw.get('deadline_kind') in {'event','submission'}:
        key='event_end' if raw['deadline_kind']=='event' else 'submission_deadline'
        doc.setdefault(key,raw.get('deadline_iso'))
    doc['canonical']=canonical_event(doc,now=now)
    doc['registration_state']=doc['canonical']['registration_state']
    doc['publication_state']=doc['canonical']['publication_state']
    doc['archived']=doc['publication_state']=='archived';doc['is_past']=doc['archived']
    return doc


def duplicate_key(doc):
    """Conservative cross-platform edition match, never title alone."""
    event=canonical_event(doc)
    organizer=event['organizer']; day=event['event_starts']['date']
    location=event['location']['city'] or event['location']['text']
    if not organizer or not day or event['format']=='unknown' or event['format']!='online' and not location: return None
    tokens=[event['title'],organizer,day,event['format'],location if event['format']!='online' else 'online']
    text='|'.join(re.sub(r'[^\w]+',' ',str(x).casefold()).strip() for x in tokens)
    return sha256(text.encode()).hexdigest()


def refresh_canonical(event, now=None):
    """Refresh only time-dependent facts; do not turn collection into verification."""
    from copy import deepcopy
    now=now or datetime.now(timezone.utc)
    current=deepcopy(event)
    current['event_status']=classify_event(EventDate(**current['event_starts']),EventDate(**current['event_ends']),current.get('event_status_source'),now)
    current['registration_state']=classify({'status':current.get('_source_status')},
        EventDate(**current['registration_opens']),EventDate(**current['registration_closes']),
        EventDate(**current['event_ends']),EventDate(**current['submission_closes']),now)
    if current['registration_state'] in {'closed','cancelled'} and current['publication_state'] not in {'pending','suppressed'}:
        current['publication_state']='archived'
    seen=current['freshness']['last_seen_at']
    if seen:current['freshness']['state']='stale' if (now-datetime.fromisoformat(seen)).total_seconds()>14*86400 else 'fresh'
    if current['freshness']['state']=='stale' and current['registration_closes']['precision']=='unknown' and current['registration_state'] in {'open','upcoming'}:current['registration_state']='unknown'
    return current


def coalesce_catalog(rows):
    """Read-only duplicate view. All historical IDs remain addressable and usable as bookmarks."""
    from copy import deepcopy
    from entity_resolution import CandidateIndex, identity, resolve
    index=CandidateIndex();primaries={};output=[]
    for row in sorted(rows,key=lambda item:str(item.get('_id'))):
        profile=identity(row)
        candidates,overflow=index.candidates(profile)
        target,decision=resolve(profile,candidates,overflow=overflow)
        if target is not None and decision.outcome=='MATCH':
            primary=primaries[target]
            primary['canonical']['aliases']=sorted(set(primary['canonical'].get('aliases',[])) | {str(row['_id'])} | set(row['canonical'].get('aliases',[])))
            seen={(x.get('platform'),x.get('url'),x.get('external_id')) for x in primary['canonical']['provenance']}
            for source in row['canonical']['provenance']:
                key=(source.get('platform'),source.get('url'),source.get('external_id'))
                if key not in seen:
                    primary['canonical']['provenance'].append(deepcopy(source));seen.add(key)
        else:
            primary=deepcopy(row);primary['canonical'].setdefault('aliases',[])
            primaries[str(row['_id'])]=primary;output.append(primary)
        index.add(identity({**primary,'source_records':primary['canonical']['provenance']}))
    return output
