"""Explainable, bounded entity resolution. Pure matching; no network or database writes.

RapidFuzz supplies string similarity (MIT); blocking, evidence rules and decisions
are project implementations. Scores are evidence weights, never probabilities.
"""
from collections import defaultdict
from dataclasses import dataclass, asdict
from datetime import date
from hashlib import sha256
from itertools import combinations
import re
from threading import RLock
from unicodedata import normalize

from rapidfuzz.fuzz import token_sort_ratio
from event_contract import temporal, event_format, safe_url
from event_normalization import plain_text

VERSION = 2
MAX_CANDIDATES = 100
PROJECTION = {key: 1 for key in (
    '_id', 'title', 'organizer', 'organization', 'link', 'url_aliases', 'source',
    'source_event_id', 'source_records', 'source_keys', 'edition_key', 'event_start', 'registration_deadline',
    'mode', 'city', 'location', '_identity_v1', 'canonical.provenance')}
STOP = {'the', 'of', 'and', 'by', 'at', 'edition', 'annual', 'hackathon', 'hack',
        'challenge', 'online', 'university', 'college', 'institute', 'technology'}


def normalized(value, *, organizer=False):
    text = normalize('NFKC', plain_text(value, 500) or '').casefold()
    words = re.findall(r'[^\W_]+', text, re.UNICODE)
    if organizer:
        words = [{'univ': 'university', 'inst': 'institute', 'tech': 'technology'}.get(w, w) for w in words]
    return ' '.join(words)


def tokens(text):
    return tuple(sorted({w for w in text.split() if w not in STOP and not w.isdigit()}))[:12]


def digest(value):
    return sha256(value.encode()).hexdigest()


@dataclass(frozen=True)
class Identity:
    id: str
    title: str
    organizer: str
    title_tokens: tuple
    organizer_tokens: tuple
    day: str | None
    registration_day: str | None
    years: frozenset
    internally_conflicted: bool
    numbers: frozenset
    location: str
    format: str
    urls: frozenset
    source_ids: frozenset


def identity(raw):
    title = normalized(raw.get('title'))
    organizer = normalized(raw.get('organizer') or raw.get('organization'), organizer=True)
    day = temporal(raw.get('event_start')).date
    registration = temporal(raw.get('registration_deadline')).date
    title_years = frozenset(re.findall(r'\b(?:19|20|21)\d{2}\b', title))
    years = title_years or (frozenset([day[:4]]) if day else frozenset())
    records = raw.get('source_records') or (raw.get('canonical') or {}).get('provenance') or []
    urls = {url for value in [raw.get('link'), *(raw.get('url_aliases') or [])]
            if (url := safe_url(value))}
    source_ids = set()
    source = normalized(raw.get('source'))
    external = raw.get('source_event_id')
    if source and external is not None and isinstance(external, (str, int)) and not isinstance(external, bool):
        source_ids.add((source, str(external)))
    for record in records if isinstance(records, list) else []:
        if not isinstance(record, dict):
            continue
        if (url := safe_url(record.get('url'))):
            urls.add(url)
        platform, external = normalized(record.get('platform')), record.get('external_id')
        if platform and external is not None and isinstance(external, (str, int)) and not isinstance(external, bool):
            source_ids.add((platform, str(external)))
    return Identity(str(raw.get('_id') or ''), title, organizer, tokens(title), tokens(organizer),
                    day, registration, years, bool(len(title_years) > 1 or title_years and day and day[:4] not in title_years),
                    frozenset(re.findall(r'\d+', title)) - title_years,
                    normalized(raw.get('city') or raw.get('location')), event_format(raw.get('mode')),
                    frozenset(urls), frozenset(source_ids))


def blocks(profile):
    """Organizer/title intersections plus 14-day windows. No title-only all-pairs scan."""
    result = set()
    title = profile.title_tokens
    # Two-token title blocks tolerate organizer variation; a single distinctive
    # token is allowed for one-word names. All blocks include temporal evidence.
    title_keys = [' '.join(pair) for pair in combinations(title[:8], 2)] if len(title) > 1 else list(title)
    day = profile.day or profile.registration_day
    if day:
        bucket = date.fromisoformat(day).toordinal() // 14
        for window in range(bucket - 1, bucket + 2):
            if profile.organizer:
                result.add('o:'+digest(f'o|{profile.organizer}|{window}'))
            for key in title_keys:
                result.add('t:'+digest(f't|{key}|{window}'))
    # Missing dates can generate REVIEW candidates, never a fuzzy auto-merge.
    if profile.organizer:
        for token in title:
            result.add('ot:'+digest(f'ot|{profile.organizer}|{token}'))
    return sorted(result)


def metadata(raw):
    profile=identity(raw)
    return {'version':VERSION,'blocks':blocks(profile),'urls':sorted(profile.urls),
            'source_ids':sorted(digest(platform+'|'+external) for platform,external in profile.source_ids)}


@dataclass(frozen=True)
class Decision:
    outcome: str
    score: float
    reasons: tuple
    evidence: dict
    exact: bool = False

    def as_dict(self):
        return asdict(self)


def compare(left, right):
    """Classify a candidate pair. Conflicting editions override exact identities."""
    exact_url = bool(left.urls & right.urls)
    exact_id = bool(left.source_ids & right.source_ids)
    exact = exact_url or exact_id
    reasons = []
    title = token_sort_ratio(left.title, right.title) if left.title and right.title else 0
    organizer = token_sort_ratio(left.organizer, right.organizer) if left.organizer and right.organizer else 0
    gap = abs((date.fromisoformat(left.day) - date.fromisoformat(right.day)).days) if left.day and right.day else None
    date_score = 100 if gap == 0 else 95 if gap is not None and gap <= 3 else 85 if gap is not None and gap <= 7 else 60 if gap is not None and gap <= 14 else 30 if gap is not None and gap <= 30 else 0
    location = 100 if left.format == right.format == 'online' else token_sort_ratio(left.location, right.location) if left.location and right.location else 0
    score = round(.50 * title + .25 * organizer + .20 * date_score + .05 * location, 3)
    evidence = {'title': round(title, 3), 'organizer': round(organizer, 3), 'date': date_score,
                'event_day_gap': gap, 'location': round(location, 3),
                'exact_url': exact_url, 'exact_source_id': exact_id}
    if left.internally_conflicted or right.internally_conflicted:
        reasons.append('title_date_year_conflict')
    if left.years and right.years and left.years.isdisjoint(right.years):
        reasons.append('edition_year_conflict')
    if left.numbers and right.numbers and left.numbers != right.numbers:
        reasons.append('numbered_edition_conflict')
    if gap is not None and gap > 90:
        reasons.append('event_dates_far_apart')
    if reasons:
        return Decision('REVIEW' if exact else 'DISTINCT', score, tuple(reasons), evidence, exact)
    platforms = {p for p, _ in left.source_ids} & {p for p, _ in right.source_ids}
    id_conflict = any({i for p, i in left.source_ids if p == platform}.isdisjoint(
        {i for p, i in right.source_ids if p == platform}) for platform in platforms)
    if exact:
        if id_conflict and not exact_id:
            return Decision('REVIEW', score, ('source_id_conflict',), evidence, True)
        return Decision('MATCH', 100.0, ('canonical_url' if exact_url else 'source_id',), evidence, True)
    if id_conflict:
        reasons.append('source_id_conflict')
    if left.format != right.format and 'unknown' not in {left.format, right.format}:
        reasons.append('format_conflict')
    if left.format != 'online' or right.format != 'online':
        if not left.location or not right.location:
            reasons.append('physical_location_missing')
        elif location < 90:
            reasons.append('location_conflict')
    if not left.organizer or not right.organizer:
        reasons.append('organizer_missing')
    elif organizer < 94 or set(left.organizer_tokens) != set(right.organizer_tokens):
        reasons.append('organizer_conflict')
    if gap is None:
        reasons.append('event_dates_missing')
    elif gap > 7:
        reasons.append('event_dates_differ')
    left_only = set(left.title_tokens) - set(right.title_tokens)
    right_only = set(right.title_tokens) - set(left.title_tokens)
    if bool(left_only) != bool(right_only):
        reasons.append('title_variant_conflict')
    elif left_only and (any(max(token_sort_ratio(a, b) for b in right_only) < 85 for a in left_only) or
                        any(max(token_sort_ratio(a, b) for a in left_only) < 85 for b in right_only)):
        reasons.append('title_variant_conflict')
    if title < 90 or not set(left.title_tokens) & set(right.title_tokens):
        reasons.append('title_evidence_weak')
    if not reasons and score >= 91:
        return Decision('MATCH', score, ('weighted_evidence',), evidence)
    return Decision('REVIEW' if score >= 65 and title >= 65 else 'DISTINCT', score, tuple(reasons or ['score_below_match_threshold']), evidence)


class CandidateIndex:
    """One-pass legacy/read adapter; inverted postings avoid pairwise catalog scans."""
    def __init__(self, rows=()):
        self._lock = RLock()
        self.profiles = {}
        self.postings = defaultdict(set)
        self.keys = {}
        for row in rows:
            self.add(identity(row))

    def add(self, profile):
        with self._lock:
            self._add(profile)

    def discard(self, identifier):
        with self._lock:
            for key in self.keys.pop(identifier, ()):
                self.postings[key].discard(identifier)
            self.profiles.pop(identifier, None)

    def _add(self, profile):
        for key in self.keys.get(profile.id, ()):
            self.postings[key].discard(profile.id)
        keys = [('b', key) for key in blocks(profile)] + [('u', u) for u in profile.urls] + [('s', s) for s in profile.source_ids]
        self.profiles[profile.id] = profile
        self.keys[profile.id] = keys
        for key in keys:
            self.postings[key].add(profile.id)

    def candidates(self, profile):
        with self._lock:
            return self._candidates(profile)

    def _candidates(self, profile):
        ids = set()
        exact = set()
        for key in [('u', u) for u in profile.urls] + [('s', s) for s in profile.source_ids]:
            posting = self.postings.get(key, ())
            if len(posting) > MAX_CANDIDATES:
                return [], True
            exact.update(posting)
            if len(exact) > MAX_CANDIDATES:
                return [], True
        if exact:
            return [self.profiles[key] for key in sorted(exact)], False
        for prefix in ('o:', 't:', 'ot:'):
            ids = set()
            for key in blocks(profile):
                if not key.startswith(prefix):
                    continue
                posting = self.postings.get(('b', key), ())
                if len(posting) > MAX_CANDIDATES:
                    return [], True
                ids.update(posting)
                if len(ids) > MAX_CANDIDATES:
                    return [], True
            if ids:
                return [self.profiles[key] for key in sorted(ids)], False
        return [], False



def resolve(profile, candidates, *, overflow=False):
    if overflow:
        return None, Decision('REVIEW', 0, ('candidate_limit_exceeded',), {})
    ranked = sorted(((candidate.id, compare(profile, candidate)) for candidate in candidates),
                    key=lambda item: (-int(item[1].exact and item[1].outcome == 'MATCH'), -item[1].score, item[0]))
    matches = [item for item in ranked if item[1].outcome == 'MATCH']
    if matches:
        best = matches[0]
        competitors = [item for item in matches[1:] if item[1].exact == best[1].exact and best[1].score - item[1].score < 5]
        if competitors:
            return best[0], Decision('REVIEW', best[1].score, ('ambiguous_candidates',),
                                     {'candidate_ids': sorted([best[0], *(item[0] for item in competitors)])})
        return best
    reviews = [item for item in ranked if item[1].outcome == 'REVIEW']
    if reviews:
        return reviews[0]
    return (ranked[0][0], ranked[0][1]) if ranked else (None, Decision('DISTINCT', 0, ('no_candidates',), {}))
