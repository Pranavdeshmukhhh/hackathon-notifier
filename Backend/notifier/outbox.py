"""Mongo-only, leased, at-least-once notification delivery.

An immutable intent freezes a recipient roster before fan-out. Interrupted fan-out
is repaired before claims. Receipts and ownership tokens prevent acknowledged
recipients being retried; Telegram itself has no idempotent sendMessage key.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
import time
import uuid

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from pymongo.write_concern import WriteConcern

OUTBOX = 'notification_outbox'
INTENTS = 'notification_intents'
CONTROL = 'notification_control'
FIELDS = ('title', 'deadline', 'deadline_iso', 'deadline_kind', 'registration_deadline', 'mode', 'tags', 'link',
          'source', 'location', 'is_top_college', 'college_name', 'college_type',
          'is_internship', 'opportunity_type', 'total_registrations',
          'registrations', 'min_team_size', 'max_team_size', 'prize', 'lat', 'lng')


def utcnow():
    return datetime.now(timezone.utc)


def digest(value):
    def stable(item):
        if isinstance(item, datetime):
            # Mongo stores UTC milliseconds and may decode them without tzinfo.
            item = item.replace(tzinfo=timezone.utc) if item.tzinfo is None else item.astimezone(timezone.utc)
            return item.isoformat(timespec='milliseconds')
        return str(item)
    return sha256(json.dumps(value, sort_keys=True, separators=(',', ':'),
                             ensure_ascii=False, default=stable).encode()).hexdigest()


def snapshot(event):
    return {key: event[key] for key in FIELDS if key in event}


def version(event, kind='new', context=None):
    return digest(['telegram-message-v1', kind, snapshot(event), context or {}])


def matches(preference, event):
    return (preference == 'all' or preference == 'top_college' and event.get('is_top_college')
            or preference == 'internships' and event.get('is_internship'))


@dataclass(frozen=True)
class DeliveryResult:
    delivered: bool = False
    retryable: bool = False
    code: str = 'unknown'
    retry_after: float | None = None
    message_id: int | None = None


class Outbox:
    def __init__(self, db, *, admin_chat='', event_collection='hackathons',
                 clock=utcnow, lease_seconds=60, max_attempts=5):
        if not 20 <= lease_seconds <= 3600 or not 1 <= max_attempts <= 20:
            raise ValueError('Invalid outbox lease or attempt budget')
        self.clock, self.lease_seconds, self.max_attempts = clock, lease_seconds, max_attempts
        self.admin_chat = str(admin_chat).strip()
        # Acknowledged delivery state must survive a primary failover.
        def collection(name):
            return db.get_collection(name, write_concern=WriteConcern(w='majority'))
        self.jobs, self.intents, self.control = map(collection, (OUTBOX, INTENTS, CONTROL))
        self.events, self.subscribers = collection(event_collection), collection('subscribers')
        self.jobs.create_index([('event_id', 1), ('event_version', 1), ('channel', 1),
                                ('recipient', 1)], unique=True, name='unique_delivery')
        self.jobs.create_index([('state', 1), ('next_attempt_at', 1)], name='due_delivery')
        self.jobs.create_index([('state', 1), ('lease_until', 1)], name='expired_delivery')
        self.jobs.create_index('intent_id', name='intent_deliveries')
        self.intents.create_index([('state', 1), ('created_at', 1)], name='unfinished_intents')
        self.intents.create_index([('state', 1), ('checked_at', 1), ('created_at', 1)], name='reconcile_intents')

    def recipients(self, event):
        """An explicit default admin opt-out overrides environment configuration."""
        recipients = {str(s['chat_id']) for s in self.subscribers.find({'is_active': True},
                      {'chat_id': 1, 'preference': 1})
                      if s.get('chat_id') and matches(s.get('preference', 'all'), event)}
        if self.admin_chat and self.subscribers.find_one({'chat_id': self.admin_chat}) is None:
            recipients.add(self.admin_chat)
        return sorted(recipients)

    def enqueue(self, event, recipients, *, kind='new', context=None):
        if kind not in {'new', 'deadline'}:
            raise ValueError('Unsupported notification kind')
        event_id = str(event.get('_id') or '')
        if not event_id:
            from event_contract import safe_url
            url = safe_url(event.get('link'))
            if not url:
                raise ValueError('Notification requires a stable event ID or safe legacy URL')
            event_id = 'legacy-url:' + digest(url)
        event_version = version(event, kind, context)
        intent_id = digest([event_id, event_version, 'telegram'])
        roster = sorted({str(cid).strip() for cid in recipients if str(cid).strip()})
        if not roster:
            return None
        record = {'_id': intent_id, 'event_id': event_id, 'event_key': event.get('_id'),
                  'event_version': event_version, 'channel': 'telegram', 'kind': kind,
                  'context': context or {}, 'event': snapshot(event), 'recipients': roster,
                  'state': 'planning', 'created_at': self.clock(), 'checked_at': self.clock()}
        try:
            self.intents.update_one({'_id': intent_id}, {'$setOnInsert': record}, upsert=True)
        except DuplicateKeyError:
            # Concurrent identical upserts may race; only reuse the winning roster.
            if self.intents.find_one({'_id': intent_id}) is None:
                raise
        self._fanout(self.intents.find_one({'_id': intent_id}))
        return intent_id

    def _fanout(self, intent):
        if intent['state'] not in {'planning', 'ready'} or intent.get('fanout_ready'):
            return
        for recipient in intent['recipients']:
            key = digest([intent['_id'], recipient])
            job = {'_id': key, 'intent_id': intent['_id'], 'event_id': intent['event_id'],
                   'event_version': intent['event_version'], 'channel': 'telegram',
                   'recipient': recipient, 'state': 'pending', 'attempts': 0,
                   'next_attempt_at': intent['created_at'], 'created_at': intent['created_at']}
            try:
                self.jobs.update_one({'_id': key}, {'$setOnInsert': job}, upsert=True)
            except DuplicateKeyError:
                if self.jobs.find_one({'_id': key}) is None:
                    raise
        self.intents.update_one({'_id': intent['_id'], 'state': 'planning'},
                                {'$set': {'state': 'ready'}})
        self.jobs.update_many({'intent_id': intent['_id'], 'ready': {'$ne': True}}, {'$set': {'ready': True}})
        self.intents.update_one({'_id': intent['_id']}, {'$set': {'fanout_ready': True}})

    def claim(self):
        now = self.clock()
        cooldown = self.control.find_one({'_id': 'telegram', 'blocked_until': {'$gt': now}})
        if cooldown:
            return None
        self.jobs.update_many({'state': {'$in': ['pending', 'retryable']},
                               'attempts': {'$gte': self.max_attempts}},
                              {'$set': {'state': 'failed', 'error_code': 'attempt_budget_exhausted', 'finished_at': now}})
        self.jobs.update_many({'state': 'processing', 'lease_until': {'$lte': now},
                               'attempts': {'$gte': self.max_attempts}},
                              {'$set': {'state': 'failed', 'error_code': 'lease_budget_exhausted',
                                        'finished_at': now}, '$unset': {'lease_token': '', 'lease_until': ''}})
        # A ready intent is required: partially planned fan-out must never be sent.
        # Each row receives ready=True only after the roster has been fully persisted.
        return self.jobs.find_one_and_update(
            {'ready': True, 'attempts': {'$lt': self.max_attempts}, '$or': [
                {'state': {'$in': ['pending', 'retryable']}, 'next_attempt_at': {'$lte': now}},
                {'state': 'processing', 'lease_until': {'$lte': now}}]},
            {'$set': {'state': 'processing', 'lease_token': uuid.uuid4().hex,
                      'lease_until': now + timedelta(seconds=self.lease_seconds)}, '$inc': {'attempts': 1}},
            sort=[('next_attempt_at', 1), ('_id', 1)], return_document=ReturnDocument.AFTER)

    def finish(self, job, result):
        now = self.clock()
        data = {'updated_at': now, 'error_code': result.code}
        if result.delivered:
            data.update(state='delivered', delivered_at=now, message_id=result.message_id, error_code=None)
        elif result.retryable and job['attempts'] < self.max_attempts:
            delay = max(min(3600, 2 ** job['attempts']), result.retry_after or 0)
            data.update(state='retryable', next_attempt_at=now + timedelta(seconds=delay))
        else:
            data.update(state='failed', finished_at=now)
        result_write = self.jobs.update_one(
            {'_id': job['_id'], 'state': 'processing', 'lease_token': job['lease_token']},
            {'$set': data, '$unset': {'lease_token': '', 'lease_until': ''}})
        if result_write.matched_count and result.code == 'rate_limited':
            self.control.update_one({'_id': 'telegram'},
                {'$max': {'blocked_until': now + timedelta(seconds=max(1, result.retry_after or 5))}}, upsert=True)
        return bool(result_write.matched_count)

    def reconcile(self, limit=100, intent_ids=()):
        query = {'state': 'ready'}
        # Check this worker's receipts immediately; rotate older unfinished groups
        # so future-due retries cannot starve recovery of a committed receipt.
        selected = list(self.intents.find({**query, '_id': {'$in': list(intent_ids)}}))
        selected.extend(self.intents.find({**query, '_id': {'$nin': list(intent_ids)}})
                        .sort([('checked_at', 1), ('created_at', 1)]).limit(limit))
        for intent in selected:
            query = {'intent_id': intent['_id']}
            total = self.jobs.count_documents(query)
            if not total or total != len(intent['recipients']):
                raise RuntimeError('Incomplete notification roster')
            if self.jobs.count_documents({**query, 'state': 'delivered'}) == total:
                if intent['kind'] == 'new' and intent['event_key'] is not None:
                    current = self.events.find_one({'_id': intent['event_key']})
                    if (current and current.get('publication_state', 'published') == 'published'
                            and version(current) == intent['event_version']):
                        revision = ({'$eq': current['_ingest_revision']} if '_ingest_revision' in current
                                    else {'$exists': False})
                        written = self.events.update_one({'_id': current['_id'], '_ingest_revision': revision,
                            'publication_state': current.get('publication_state', {'$exists': False}), 'archived': {'$ne': True}},
                            {'$set': {'notified': True, 'notified_at': self.clock().isoformat(),
                                      'notified_version': intent['event_version']}})
                        if not written.matched_count:
                            continue  # Retry reconciliation after a concurrent event update.
                self.intents.update_one({'_id': intent['_id'], 'state': 'ready'},
                                         {'$set': {'state': 'delivered', 'finished_at': self.clock()}})
            elif not self.jobs.count_documents({**query, 'state': {'$in': ['pending', 'retryable', 'processing']}}):
                self.intents.update_one({'_id': intent['_id'], 'state': 'ready'},
                                         {'$set': {'state': 'failed', 'finished_at': self.clock()}})
            else:
                self.intents.update_one({'_id': intent['_id']}, {'$set': {'checked_at': self.clock()}})

    def drain(self, sender, *, max_jobs=100, time_budget=60, delay=1.5, sleep=time.sleep):
        if not 1 <= max_jobs <= 1000 or not 0 < time_budget <= 600:
            raise ValueError('Invalid worker budget')
        started = time.monotonic()
        touched, delivered, attempts, errors = set(), set(), 0, 0
        for intent in self.intents.find({'state': {'$in': ['planning', 'ready']}, 'fanout_ready': {'$ne': True}}).sort('created_at', 1).limit(max_jobs):
            self._fanout(intent)
        while attempts < max_jobs and time.monotonic() - started < time_budget:
            job = self.claim()
            if job is None:
                break
            if attempts and delay:
                sleep(delay)
            touched.add(job['intent_id']); attempts += 1
            intent = self.intents.find_one({'_id': job['intent_id']})
            subscriber = self.subscribers.find_one({'chat_id': job['recipient']}, {'is_active': 1, 'preference': 1})
            allowed = (subscriber is not None and subscriber.get('is_active') is True
                       and matches(subscriber.get('preference', 'all'), intent['event']))
            allowed = allowed or subscriber is None and job['recipient'] == self.admin_chat
            current = self.events.find_one({'_id': intent['event_key']}) if intent['event_key'] is not None else None
            unavailable = intent['event_key'] is not None and (not current or
                          current.get('publication_state', 'published') != 'published' or current.get('archived') is True)
            superseded = bool(current and (version(current) != intent['event_version'] if intent['kind'] == 'new'
                else any(current.get(key) != intent['event'].get(key) for key in
                         ['registration_deadline', 'deadline_iso', 'deadline'])))
            if not allowed or unavailable or superseded:
                result = DeliveryResult(code='event_unavailable' if unavailable else
                                        'superseded_version' if superseded else 'recipient_opted_out')
            else:
                result = sender(intent, job['recipient'])
                if not isinstance(result, DeliveryResult):
                    raise TypeError('Sender must return DeliveryResult')
            committed = self.finish(job, result)
            if committed and result.delivered:
                delivered.add(job['intent_id'])
            else:
                errors += 1
            if result.code == 'rate_limited':
                break
        self.reconcile(limit=max_jobs, intent_ids=touched)
        return {'intents': touched, 'delivered': delivered, 'attempts': attempts, 'errors': errors,
                'pending': max(self.jobs.count_documents({'state': {'$in': ['pending', 'retryable', 'processing']}}),
                               self.intents.count_documents({'state': {'$in': ['planning', 'ready']}}))}
