"""Non-destructive ingestion and identity reconciliation, shared by scans and moderation."""
from datetime import datetime, timezone
from copy import deepcopy
from dataclasses import replace
from hashlib import sha256
from threading import RLock
from bson import ObjectId
from pymongo.errors import DuplicateKeyError
from event_contract import adapt_observation, canonical_event, duplicate_key, safe_url, stamp
from entity_resolution import CandidateIndex, PROJECTION, MAX_CANDIDATES, identity as event_identity, metadata as identity_metadata, blocks, resolve, normalized, digest, VERSION as IDENTITY_VERSION


class EventRepository:
    def __init__(self, collection, observations=None):
        self.collection=collection
        self.observations=observations
        ensure_identity_indexes(collection)
        self._legacy_index = None
        self._identity_lock = RLock()
        self.last_resolution = None

    def _resolve(self, incoming, queries):
        # One projected legacy read per repository, never a full scan per observation.
        with self._identity_lock:
            if self._legacy_index is None:
                legacy_index = CandidateIndex()
                legacy_ids = {}
                for row in self.collection.find({"_identity_v1.version": {"$ne": IDENTITY_VERSION}}, PROJECTION):
                    legacy_ids[str(row['_id'])] = row['_id']
                    legacy_index.add(event_identity(row))
                # Publish only a complete snapshot; failed cursors must be retried.
                self._legacy_ids = legacy_ids
                self._legacy_index = legacy_index
        profile = event_identity(incoming)
        legacy, overflow = self._legacy_index.candidates(profile)
        legacy_exact = [row for row in legacy if profile.urls & row.urls or profile.source_ids & row.source_ids]
        exact_queries = list(queries)
        if legacy_exact:
            exact_queries.append({'_id':{'$in':[self._legacy_ids[row.id] for row in legacy_exact]}})
        rows = list(self.collection.find({'$or':exact_queries}, PROJECTION).sort('_id',1).limit(MAX_CANDIDATES+1))
        storage_ids = {str(row['_id']) for row in rows}
        if rows:
            overflow = len(rows) > MAX_CANDIDATES
        else:
            incoming_blocks = blocks(profile)
            for prefix in ('o:', 't:', 'ot:'):
                keys = [key for key in incoming_blocks if key.startswith(prefix)]
                clauses = [{'_identity_v1.blocks':{'$in':keys}}]
                legacy_ids = [self._legacy_ids[row.id] for row in legacy if set(keys) & set(blocks(row))]
                if legacy_ids:
                    clauses.append({'_id':{'$in':legacy_ids}})
                if not keys and not legacy_ids:
                    continue
                rows = list(self.collection.find({'$or':clauses}, PROJECTION).sort('_id',1).limit(MAX_CANDIDATES+1))
                if rows:
                    break
            overflow = overflow or len(rows) > MAX_CANDIDATES
        candidates = [event_identity(row) for row in rows[:MAX_CANDIDATES]]
        candidate_id, decision = resolve(profile, candidates, overflow=overflow)
        self.last_resolution = {"version": 1, "candidate_id": candidate_id, **decision.as_dict()}
        selected = next((row for row in rows if str(row["_id"]) == candidate_id), None)
        return selected, decision, profile, candidates, {str(row['_id']):row['_id'] for row in rows}, storage_ids

    def ingest(self, raw, *, now=None, authority=1):
        now=now or datetime.now(timezone.utc)
        incoming=adapt_observation(raw,now=now)
        url=incoming['link']; key=duplicate_key(incoming)
        source_id=str(raw['source_event_id']) if raw.get('source_event_id') is not None else None
        identity=sha256((incoming['source'].casefold()+'|'+source_id).encode()).hexdigest() if source_id else None
        queries=[{'link':url},{'url_aliases':url},{'_identity_v1.urls':url}]
        if source_id:queries.append({'_identity_v1.source_ids':digest(normalized(incoming['source'])+'|'+source_id)})
        if key:queries.append({'edition_key':key})
        if identity:queries.append({'source_keys':identity})
        if source_id:queries.append({'source':incoming['source'],'source_event_id':raw.get('source_event_id')})
        selected, decision, profile, candidates, row_ids, storage_ids = self._resolve(incoming, queries)
        if decision.outcome != 'MATCH' and storage_ids:
            held_id = str(selected['_id']) if selected and str(selected['_id']) in storage_ids else min(storage_ids)
            selected = self.collection.find_one({'_id':row_ids[held_id]})
            decision = replace(decision, outcome='REVIEW', reasons=decision.reasons + ('stored_identity_collision',))
        resolution = {"version":1, "candidate_id":str(selected["_id"]) if selected else None, **decision.as_dict()}
        self.last_resolution = resolution
        existing = self.collection.find_one({'_id': selected['_id']}) if selected and decision.outcome == 'MATCH' else None
        if existing and event_identity(existing) != event_identity(selected):
            return self.ingest(raw,now=now,authority=authority)
        if decision.outcome == 'REVIEW':
            # A reused exact identity cannot be inserted into the existing unique
            # indexes. Hold its observation, without rewriting the historical edition.
            collisions = [row for row in candidates if profile.urls & row.urls or profile.source_ids & row.source_ids]
            if not collisions and selected and (str(selected['_id']) in storage_ids or key and duplicate_key(selected) == key):
                collisions = [event_identity(selected)]
            if collisions:
                held = self.collection.find_one({'_id': selected['_id']}) if selected else None
                if held is None:
                    held = self.collection.find_one({'_id': row_ids[collisions[0].id]})
                edition_conflict = any('year' in reason or reason == 'event_dates_far_apart' for reason in decision.reasons)
                ledger = self.observations if self.observations is not None else self.collection.database['event_identity_reviews']
                if ledger is not None:
                    ledger.insert_one({'event_id':str(held['_id']), 'observed_at':now.isoformat(),
                        'facts':incoming, 'resolution':resolution,
                        'ignored_reason':'possible_new_edition' if edition_conflict else 'entity_review'})
                if edition_conflict:
                    self.collection.update_one({'_id':held['_id']},{'$addToSet':{'conflicting_fields':'edition_identity'}})
                return held,False,{}
        if existing and stamp(existing.get('last_seen_at')) and now < datetime.fromisoformat(stamp(existing['last_seen_at'])):
            return existing,False,{}
        version=stamp(raw.get('source_updated_at'))
        if existing and version:
            prior=next((record for record in (existing.get('source_records') or []) if isinstance(record,dict) and record.get('platform')==incoming['source'] and record.get('external_id')==source_id),None)
            if prior and stamp(prior.get('source_updated_at')) and version<stamp(prior['source_updated_at']):
                if self.observations is not None:self.observations.insert_one({'event_id':str(existing['_id']),'observed_at':now.isoformat(),'facts':incoming,'ignored_reason':'older_source_version'})
                return existing,False,{}
        doc=deepcopy(existing) if existing else {'_id':ObjectId(),'created_at':now.isoformat(),'notified':False}
        changed={}
        conflicts=set(existing.get("conflicting_fields") or []) if existing else set()
        same_source_id=bool(existing and source_id and incoming['source'].casefold()==str(existing.get('source') or '').casefold() and str(existing.get('source_event_id'))==source_id)
        for field,value in incoming.items():
            if field in {'_ingest_revision','notified','notified_at','canonical','schema_version','publication_state','archived','is_past','registration_state','verified'}:continue
            if existing and (value is None or value=='' or value=='TBA' or value=='Unknown' or value==[] or field=='registration_deadline' and value.get('precision')=='unknown'):
                continue
            if existing and (field=='source' or field=='link' and not same_source_id):continue  # stable primary registration/source, aliases below.
            if existing and field=='source_event_id' and safe_url(doc.get('link'))!=url:continue
            metadata=field in {'scraped_at','last_seen_at','total_registrations','registrations'}
            primary=safe_url(doc.get('link'))==url or same_source_id
            if existing and not metadata and value!=doc.get(field) and doc.get(field) not in (None,'','TBA','Unknown',[]) and (authority<existing.get('_authority',1) or not primary and authority<3):
                conflicts.add(field);continue
            if authority>=3:conflicts.discard(field)
            if value!=doc.get(field): changed[field]=(doc.get(field),value);doc[field]=value
        aliases=set(doc.get('url_aliases') or []);aliases.add(url)
        if existing and safe_url(existing.get('link')):aliases.add(safe_url(existing['link']))
        if safe_url(doc.get('link')):aliases.add(safe_url(doc['link']))
        doc['url_aliases']=sorted(aliases)
        records=doc.get('source_records') if isinstance(doc.get('source_records'),list) else []
        record={'platform':incoming['source'],'url':url,'external_id':str(raw['source_event_id']) if raw.get('source_event_id') is not None else None,'observed_at':now.isoformat(),'source_updated_at':version}
        records=[r for r in records if isinstance(r,dict) and (r.get('platform'),r.get('url'))!=(record['platform'],url)]+[record]
        doc.update(source_records=records,last_seen_at=now.isoformat(),schema_version=2,conflicting_fields=sorted(conflicts),_authority=max(authority,doc.get('_authority',1)))
        if identity:doc['source_keys']=sorted(set(doc.get('source_keys') or []) | {identity})
        if (stored_key := duplicate_key(doc)):doc['edition_key']=stored_key
        # Explicit suppression is never undone by scraping. Missing fields never reopen archives.
        if changed:doc['updated_at']=now.isoformat()
        if existing and (conflicts or any(field not in {'scraped_at','last_seen_at','total_registrations','registrations'} for field in changed)):
            doc['verification_stale']=True
        if existing and existing.get('archive_reason') in {'stale','dead_link'}:
            doc.pop('archive_reason',None)  # a successful fresh source observation may recover visibility.
        doc['canonical']=canonical_event(doc,now=now)
        doc['registration_state']=doc['canonical']['registration_state'];doc['publication_state']=doc['canonical']['publication_state']
        doc['archived']=doc['publication_state']=='archived';doc['is_past']=doc['registration_state'] in {'closed','cancelled'}
        doc['verified']=doc['canonical']['verification']['status']=='verified'
        doc['_ingest_revision']=(existing or {}).get('_ingest_revision',0)+1
        doc['_identity_v1']=identity_metadata(doc)
        doc['entity_resolution']=resolution
        if resolution['outcome']=='REVIEW':doc.setdefault('entity_review',resolution)
        if self.observations is not None:
            self.observations.insert_one({'event_id':str(doc['_id']),'observed_at':now.isoformat(),'source':record,
                'facts':incoming,'resolution':resolution,'changes':{k:{'before':a,'after':b} for k,(a,b) in changed.items()}})
        if not existing:
            try:self.collection.insert_one(doc)
            except DuplicateKeyError:
                # A concurrent URL/edition match won; keep its ID and notification flags.
                return self.ingest(raw,now=now,authority=authority)
        else:
            # Delivery flags have independent writers and are never ingestion-owned.
            updates={k:v for k,v in doc.items() if k not in
                     {'_id','notified','notified_at','notified_version','notification_checked_at'}}
            query={'_id':existing['_id'],'_ingest_revision':existing.get('_ingest_revision',{'$exists':False})}
            if existing.get('last_seen_at'):query['last_seen_at']=existing['last_seen_at']
            mutation={'$set':updates}
            if existing.get('archive_reason') and not doc.get('archive_reason'):mutation['$unset']={'archive_reason':''}
            result=self.collection.update_one(query,mutation)
            if not result.matched_count:return self.ingest(raw,now=now,authority=authority)
        self._legacy_index.discard(str(doc['_id']))
        return doc,existing is None,changed


def ensure_identity_indexes(collection):
    """Called only by write workflows; sparse/partial unique indexes protect identity claims."""
    indexes=collection.index_information()
    # Every branch of the exact/blocking OR queries needs a lookup index.
    # Nonunique additions do not impose new identity claims on historical rows.
    lookups = {
        'identity_blocks_v1': [('_identity_v1.blocks', 1)],
        'identity_urls_v2': [('_identity_v1.urls', 1)],
        'identity_sources_v2': [('_identity_v1.source_ids', 1)],
        'identity_version_v1': [('_identity_v1.version', 1)],
        'identity_link_v1': [('link', 1)],
        'identity_source_v1': [('source', 1), ('source_event_id', 1)],
    }
    for name, keys in lookups.items():
        if not any(spec.get('key') == keys for spec in indexes.values()):
            collection.create_index(keys, name=name)
    if 'url_aliases_1' not in indexes:
        collection.create_index('url_aliases',unique=True,partialFilterExpression={'url_aliases':{'$exists':True}})
    if 'edition_key_1' not in indexes:
        collection.create_index('edition_key',unique=True,sparse=True)
    if 'source_keys_1' not in indexes:
        collection.create_index('source_keys',unique=True,partialFilterExpression={'source_keys':{'$exists':True}})
