"""Synthetic identity regression fixtures, no real events or external services."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import mongomock
import pytest
from entity_resolution import CandidateIndex, MAX_CANDIDATES, compare, identity, metadata, resolve
from event_contract import coalesce_catalog
from event_repository import EventRepository
from public_events import public_event

CASES=json.loads((Path(__file__).parent/'fixtures/entity_resolution.json').read_text())['cases']
NOW=datetime(2026,11,2,tzinfo=timezone.utc)

@pytest.mark.parametrize('case',CASES,ids=lambda row:row['name'])
def test_labeled_pair(case):
    decision=compare(identity(case['left']),identity(case['right']))
    assert decision.outcome==case['expected'], decision
    assert decision.reasons and 'title' in decision.evidence
    if not case['same_entity']:
        assert decision.outcome!='MATCH'

@pytest.mark.parametrize('case',[row for row in CASES if row['expected']=='MATCH'],ids=lambda row:row['name'])
def test_positive_pairs_survive_candidate_blocking(case):
    index=CandidateIndex([{**case['left'],'_id':'original'}])
    candidates,overflow=index.candidates(identity(case['right']))
    target,decision=resolve(identity(case['right']),candidates,overflow=overflow)
    assert target=='original' and decision.outcome=='MATCH'


def test_fuzzy_merge_keeps_id_flags_primary_facts_and_provenance():
    case=next(row for row in CASES if row['name']=='title_typo')
    db=mongomock.MongoClient().resolution;repo=EventRepository(db.events,db.observations)
    first,_,_=repo.ingest(case['left'],now=NOW)
    db.events.update_one({'_id':first['_id']},{'$set':{'notified':True,'notified_at':'retained'}})
    second,created,_=repo.ingest(case['right'],now=NOW+timedelta(minutes=1))
    assert not created and second['_id']==first['_id'] and second['notified']
    assert second['notified_at']=='retained' and second['title']==first['title']
    assert len(second['source_records'])==2 and 'title' in second['conflicting_fields']
    assert db.observations.find_one({'resolution.reasons':'weighted_evidence'})
    third,created,_=repo.ingest(case['right'],now=NOW+timedelta(minutes=2))
    assert not created and third['_id']==first['_id']
    assert db.events.count_documents({})==1 and len(third['source_records'])==2


def test_annual_reuse_even_same_provider_id_is_held_without_fact_merge():
    case=next(row for row in CASES if row['name']=='annual_reused_source_id')
    db=mongomock.MongoClient().resolution;repo=EventRepository(db.events,db.observations)
    first,_,_=repo.ingest(case['left'],now=NOW)
    result,created,changes=repo.ingest(case['right'],now=NOW+timedelta(minutes=1))
    assert not created and not changes and result['_id']==first['_id']
    stored=db.events.find_one()
    assert stored['event_start']==case['left']['event_start'] and len(stored['source_records'])==1
    assert db.observations.find_one({'ignored_reason':'possible_new_edition','resolution.outcome':'REVIEW'})


def test_review_without_identity_collision_stays_separate_and_explained():
    case=next(row for row in CASES if row['name']=='two_week_disagreement')
    db=mongomock.MongoClient().resolution;repo=EventRepository(db.events,db.observations)
    first,_,_=repo.ingest(case['left'],now=NOW)
    second,created,_=repo.ingest(case['right'],now=NOW)
    assert created and first['_id']!=second['_id'] and db.events.count_documents({})==2
    assert second['entity_resolution']['outcome']=='REVIEW'
    assert 'event_dates_differ' in second['entity_resolution']['reasons']


def test_legacy_adapter_does_not_bulk_write_or_rekey_and_preserves_string_ids(monkeypatch):
    case=next(row for row in CASES if row['name']=='title_typo')
    col=mongomock.MongoClient().resolution.events
    col.insert_one({**case['left'],'_id':'a'*24,'notified':True})
    before=deepcopy(col.find_one());repo=EventRepository(col)
    assert col.find_one()==before  # only indexes are additive
    result,created,_=repo.ingest(case['right'],now=NOW)
    assert not created and result['_id']=='a'*24 and result['notified']
    assert result['_identity_v1']['version']==2


def test_dense_blocks_abstain_and_exact_ids_still_resolve():
    row=CASES[0]['left'];index=CandidateIndex([{**row,'_id':str(i),'link':f'https://example.com/{i}','source_event_id':str(i)} for i in range(MAX_CANDIDATES+1)])
    query={**row,'link':'https://mirror.example/new','source_event_id':'new'}
    candidates,overflow=index.candidates(identity(query))
    assert overflow and resolve(identity(query),candidates,overflow=overflow)[1].outcome=='REVIEW'
    candidates,overflow=index.candidates(identity({**query,'source_event_id':'0'}))
    assert not overflow and resolve(identity(query | {'source_event_id':'0'}),candidates)[0]=='0'


def test_ambiguous_ties_are_deterministic_review():
    row=CASES[0]['left']
    candidates=[identity({**row,'_id':key,'link':f'https://mirror.example/{key}','source':'Other','source_event_id':key}) for key in ['b','a']]
    first=resolve(identity(row),candidates)
    assert first==resolve(identity(row),list(reversed(candidates)))
    assert first[0]=='a' and first[1].outcome=='REVIEW'
    assert 'ambiguous_candidates' in first[1].reasons


@pytest.mark.parametrize('name',['annual_reused_source_id','annual_reused_url'])
def test_read_coalescing_cannot_hide_a_cross_year_edition(name):
    case=next(row for row in CASES if row['name']==name)
    rows=[public_event({**raw,'_id':str(i)*24}) for i,raw in enumerate([case['left'],case['right']],1)]
    assert len(coalesce_catalog(rows))==2


def test_review_without_optional_observation_collection_still_retains_facts():
    case=next(row for row in CASES if row['name']=='annual_reused_url')
    db=mongomock.MongoClient().resolution;repo=EventRepository(db.events)
    first,_,_=repo.ingest(case['left'],now=NOW)
    repo.ingest(case['right'],now=NOW+timedelta(minutes=1))
    held=db.event_identity_reviews.find_one()
    assert held['event_id']==str(first['_id']) and held['facts']['event_start']=='2028-06-12'
    assert held['resolution']['outcome']=='REVIEW'


def test_projected_legacy_catalog_is_read_only_once_per_repository(monkeypatch):
    db=mongomock.MongoClient().resolution;repo=EventRepository(db.events)
    original=db.events.find;legacy_reads=[]
    def find(query=None,*args,**kwargs):
        if query=={'_identity_v1.version':{'$ne':2}}:legacy_reads.append(query)
        assert query!={}, 'Per-observation full catalog scan'
        return original(query,*args,**kwargs)
    monkeypatch.setattr(db.events,'find',find)
    for number in range(10):
        row={**CASES[0]['left'],'title':f'Synthetic Standalone{number} 2027',
             'organizer':f'Synthetic Organization{number}','link':f'https://example.com/{number}','source_event_id':str(number)}
        repo.ingest(row,now=NOW)
    assert len(legacy_reads)==1


def test_resolution_rechecks_a_candidate_changed_after_lookup(monkeypatch):
    db=mongomock.MongoClient().resolution;repo=EventRepository(db.events,db.observations)
    row=CASES[0]['left'];stored,_,_=repo.ingest(row,now=NOW)
    find=db.events.find_one;raced=False
    def changed(query,*args,**kwargs):
        nonlocal raced
        if query=={'_id':stored['_id']} and not raced:
            raced=True
            db.events.update_one(query,{'$set':{'title':row['title'].replace('2027','2028'),'event_start':'2028-06-12'},'$inc':{'_ingest_revision':1}})
        return find(query,*args,**kwargs)
    monkeypatch.setattr(db.events,'find_one',changed)
    repo.ingest(row,now=NOW+timedelta(minutes=1))
    assert db.events.find_one({'_id':stored['_id']})['event_start']=='2028-06-12'


def test_benchmark_metric_definitions_and_deterministic_fixture_evaluation():
    from scripts.benchmark_entity_resolution import evaluate, metrics
    result=metrics([True,True,False,False],[True,False,True,False])
    assert result['precision']==result['recall']==result['f1']==result['false_merge_rate']==.5
    first=evaluate(CASES,'resolver_v1')
    assert first==evaluate(CASES,'resolver_v1') and first['cross_year_false_merges']==0 and first['fp']==0


def test_review_marker_survives_idempotent_exact_replays():
    case=next(row for row in CASES if row['name']=='two_week_disagreement')
    db=mongomock.MongoClient().resolution;repo=EventRepository(db.events,db.observations)
    first,_,_=repo.ingest(case['left'],now=NOW)
    reviewed,_,_=repo.ingest(case['right'],now=NOW)
    replayed,created,_=repo.ingest(case['right'],now=NOW+timedelta(minutes=1))
    assert not created and replayed['_id']==reviewed['_id']
    assert replayed['entity_review']['candidate_id']==str(first['_id'])
    assert replayed['entity_review']['outcome']=='REVIEW'
    assert 'event_dates_differ' in replayed['entity_review']['reasons']


def test_conflicting_legacy_edition_key_is_reviewed_without_insert_retry(monkeypatch):
    row={**CASES[0]['left'],'title':'Synthetic Lantern Constellation 2028'}  # date is still 2027
    db=mongomock.MongoClient().resolution;repo=EventRepository(db.events,db.observations)
    first,_,_=repo.ingest(row,now=NOW)
    monkeypatch.setattr(db.events,'insert_one',lambda *a,**kw:pytest.fail('Conflicting unique identity must be held, not inserted'))
    held,created,_=repo.ingest({**row,'link':'https://mirror.example/conflicted','source':'Fixture B','source_event_id':'mirror'},now=NOW)
    assert not created and held['_id']==first['_id']
    assert repo.last_resolution['outcome']=='REVIEW'


def test_historical_source_key_without_current_source_record_is_reviewed(monkeypatch):
    from hashlib import sha256
    row=CASES[0]['left'];db=mongomock.MongoClient().resolution
    old_key=sha256((row['source'].casefold()+'|'+row['source_event_id']).encode()).hexdigest()
    db.events.insert_one({'_id':'legacy','title':'Different Historical Identity','link':'https://example.com/historical',
                          'source':row['source'],'source_event_id':'replacement','source_keys':[old_key]})
    repo=EventRepository(db.events)
    monkeypatch.setattr(db.events,'insert_one',lambda *a,**kw:pytest.fail('A claimed source key must not be inserted again'))
    held,created,_=repo.ingest(row,now=NOW)
    assert not created and held['_id']=='legacy' and repo.last_resolution['outcome']=='REVIEW'


def test_lookup_index_additions_preserve_existing_unique_constraints():
    col=mongomock.MongoClient().resolution.events
    col.create_index('link',unique=True)
    EventRepository(col)
    indexes=col.index_information()
    assert indexes['link_1']['unique'] is True
    for name in ['identity_blocks_v1','identity_version_v1','identity_source_v1']:
        assert not indexes[name].get('unique',False)
    assert indexes['source_keys_1']['unique'] and indexes['url_aliases_1']['unique']


def test_failed_legacy_read_does_not_publish_a_partial_identity_index(monkeypatch):
    case=next(row for row in CASES if row['name']=='title_typo')
    col=mongomock.MongoClient().resolution.events
    repo=EventRepository(col)
    col.insert_one({**case['left'],'_id':'first','title':'Synthetic Other Event','organizer':'Synthetic Other Host','link':'https://other.example/first','source_event_id':'other'})
    col.insert_one({**case['left'],'_id':'target'})
    find=col.find;failed=False
    def flaky(query=None,*args,**kwargs):
        nonlocal failed
        if query=={'_identity_v1.version':{'$ne':2}} and not failed:
            failed=True
            def interrupted():
                yield find(query,*args,**kwargs)[0]
                raise RuntimeError('fixture cursor interrupted')
            return interrupted()
        return find(query,*args,**kwargs)
    monkeypatch.setattr(col,'find',flaky)
    with pytest.raises(RuntimeError,match='cursor interrupted'):repo.ingest(case['right'],now=NOW)
    recovered,created,_=repo.ingest(case['right'],now=NOW)
    assert not created and recovered['_id']=='target'
