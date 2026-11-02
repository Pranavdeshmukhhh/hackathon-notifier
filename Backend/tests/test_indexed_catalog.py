"""Canonical query parity using task-owned local MongoDB only; never a configured URI."""
from datetime import datetime,timedelta,timezone
from pathlib import Path
import json,os,uuid
from urllib.parse import urlsplit
import pytest
from bson import ObjectId
from pymongo import MongoClient
from starlette.requests import Request
import api,catalog_query
from identity_backfill import backfill

@pytest.fixture(scope='module')
def mongo():
    uri=os.getenv('PHASE4_TEST_MONGO')
    if not uri:pytest.skip('Local Mongo replica set not selected')
    assert urlsplit(uri).hostname=='127.0.0.1' and urlsplit(uri).port==27028
    client=MongoClient(uri,serverSelectionTimeoutMS=3000)
    db=client['benchmark_phase4_test_'+uuid.uuid4().hex]
    yield db
    client.drop_database(db.name);client.close()


def rows():
    today=datetime.now(timezone.utc).date()
    modes=['Virtual','In-person','Hybrid','Unknown','in_person','Online']
    result=[]
    for i in range(18):
        day=(today+timedelta(days=i-3)).isoformat()
        result.append({'_id':ObjectId(f'{i+1:024x}'),'title':f'Synthetic Case {i}',
            'organizer':f'Fixture Org{i}','source':'Devpost' if i%2 else 'Unstop',
            'source_event_id':str(i),'link':f'https://example.com/{i}','mode':modes[i%len(modes)],
            'status':'Closed' if i==9 else 'Open','deadline_kind':'registration',
            'registration_deadline':{'date':day} if i!=10 else None,'deadline_iso':day if i!=10 else None,
            'event_start':'2099-01-01','scraped_at':f'2026-10-{i+1:02d}T00:00:00Z',
            'is_top_college':i%2==0,'is_internship':i%3==0,'college_type':'IIT',
            'opportunity_type':'Hackathon','tags':['AI','Web'],'location':'Pune' if i%2 else 'IIIT Hyderabad',
            'lat':float(i) if i%4 else None,'lng':0.0,'prize':'INR 100','total_registrations':10})
    result.append({**result[6],'_id':ObjectId('f'*24),'source':'Devfolio','link':'https://mirror.example/6','prize':'INR 900'})
    result.append({**result[0],'_id':ObjectId('e'*24),'publication_state':'suppressed','link':'https://example.com/suppressed'})
    return result

@pytest.fixture(scope='module')
def published(mongo):
    col=mongo.events;col.insert_many(rows());catalog_query.publish(col)
    return col


def call(col,options,monkeypatch):
    monkeypatch.setattr(api,'get_collection',lambda:col)
    req=Request({'type':'http','headers':[]})
    return api.get_hackathons.__wrapped__(request=req,**options)


def normalized(response):
    assert response.status_code==200,response.body
    data=json.loads(response.body)
    data['stats'].pop('calculated_at');data['stats'].pop('p50_latency_ms')
    data['stats']['sources']=sorted(data['stats']['sources'])
    return data

OPTIONS=[{},*({'format':x} for x in ['All','Online','Offline','Hybrid','Unknown']),
    *({'status':x} for x in ['all','open','open_all','closing','upcoming','closed','unknown']),
    *({'category':x} for x in ['All','Top College','Internship','Hackathon','Online','Offline','Unique Sources',
        'Devfolio','Unstop','Devpost','HackerEarth','Devnovate','AI','virtual','no-match']),
    *({'source':x} for x in ['All','Devpost','Unstop','devfolio','missing']),
    *({'tab':x} for x in ['all','upcoming','missed','lost','lost_opportunities']),
    *({'sort':x} for x in ['deadline','distance','name','newest','unknown']),
    *({'sort':x,'lat':0.0,'lng':0.0,'tab':'all'} for x in ['deadline','distance','name','newest','unknown']),
    *({'deadline_days':x} for x in [1,7,30]),
    *({'search':x,'tab':'all'} for x in ['AI','iiit hydrerabad','Pune','Synthetic Case 1','no-match','!!!','दिल्ली']),
    {'category':'Top College','format':'Online','source':'Devpost','tab':'all'},
    {'ids':'f'*24,'tab':'all'}, {'ids':'0'*23+'1'+',missing','tab':'all'},
    {'page':2,'limit':2},{'page':1000,'limit':100,'tab':'all'},
    {'search':'AI','sort':'distance','lat':0.0,'lng':0.0,'page':2,'limit':2,'tab':'all'}]

@pytest.mark.parametrize('options',OPTIONS)
def test_indexed_and_legacy_payloads_are_identical(published,monkeypatch,options):
    api._cache.clear()
    indexed=call(published,options,monkeypatch)
    assert not api._cache, 'Indexed query loaded a Python catalog cache'
    monkeypatch.setattr(catalog_query,'read_indexed',lambda *a:None)
    legacy=call(published,options,monkeypatch)
    assert normalized(indexed)==normalized(legacy)
    api._cache.clear()


def test_raw_edit_invalidates_snapshot_and_legacy_cache_without_manual_clear(mongo,monkeypatch):
    col=mongo.mutations;col.insert_many(rows()[:2]);catalog_query.publish(col)
    first=call(col,{'tab':'all'},monkeypatch);assert first.status_code==200
    col.update_one({'title':'Synthetic Case 0'},{'$set':{'prize':'INR 900'}})
    changed=call(col,{'tab':'all'},monkeypatch)
    assert changed.status_code==200 and b'INR 900' in changed.body
    col.update_one({'title':'Synthetic Case 0'},{'$set':{'prize':'INR 800'}})
    again=call(col,{'tab':'all'},monkeypatch)
    assert again.status_code==200 and b'INR 800' in again.body
    assert changed.headers['etag']!=again.headers['etag']


def test_large_unprepared_or_stale_catalog_fails_without_truncation(mongo,monkeypatch):
    col=mongo.large;col.insert_many(rows()[:2]);monkeypatch.setattr(catalog_query,'LEGACY_LIMIT',1)
    assert call(col,{},monkeypatch).status_code==503
    catalog_query.publish(col)
    assert call(col,{},monkeypatch).status_code==200
    col.update_one({}, {'$set':{'prize':'INR 500'}})
    assert call(col,{},monkeypatch).status_code==503


def test_time_boundary_expires_indexed_view(mongo,monkeypatch):
    col=mongo.expiry;col.insert_many(rows()[:2]);catalog_query.publish(col)
    col.database[catalog_query.META].update_one({'_id':catalog_query.manifest_id(col)},
        {'$set':{'valid_until':datetime.now(timezone.utc)-timedelta(seconds=1)}})
    monkeypatch.setattr(catalog_query,'LEGACY_LIMIT',1)
    assert call(col,{},monkeypatch).status_code==503


def test_backfill_is_optional_metadata_only_and_removes_cold_legacy_scan(mongo):
    from event_repository import EventRepository
    col=mongo.backfill;original=rows()[0];original.update(notified=True,notified_at='preserved')
    col.insert_one(original)
    assert backfill(col)['planned']==1 and col.find_one()==original
    assert backfill(col,apply=True)['modified']==1
    updated=col.find_one();assert updated.pop('_identity_v1')['version']==2 and updated==original
    repo=EventRepository(col)
    stored,created,_=repo.ingest({**original,'link':original['link']+'?utm_source=fixture'})
    assert not created and stored['_id']==original['_id'] and stored['notified']
    assert not repo._legacy_index.profiles


def test_failed_publication_keeps_active_generation(mongo,monkeypatch):
    col=mongo.publish_failure;col.insert_many(rows()[:2]);catalog_query.publish(col)
    before=col.database[catalog_query.META].find_one({'_id':catalog_query.manifest_id(col)})
    monkeypatch.setattr(catalog_query,'row_for',lambda *a:(_ for _ in ()).throw(RuntimeError('fixture failure')))
    with pytest.raises(RuntimeError):catalog_query.publish(col)
    after=col.database[catalog_query.META].find_one({'_id':catalog_query.manifest_id(col)})
    assert before==after


def test_backfill_cas_skips_concurrent_fact_edits(mongo,monkeypatch):
    col=mongo.raced_backfill;col.insert_one(rows()[0]);bulk=col.bulk_write
    def race(operations,**kwargs):
        col.update_one({}, {'$set':{'title':'Changed during backfill'}})
        return bulk(operations,**kwargs)
    monkeypatch.setattr(col,'bulk_write',race)
    result=backfill(col,apply=True)
    assert result['modified']==0 and result['raced']==1 and '_identity_v1' not in col.find_one()


def test_token_cache_stays_bounded_on_invalid_generations(monkeypatch):
    from types import SimpleNamespace
    catalog_query._tokens.clear()
    def changed(*a):raise catalog_query.SourceChanged('fixture changed')
    monkeypatch.setattr(catalog_query,'checkpoint',changed)
    for number in range(20):
        manifest={'generation':str(number),'source_token':{},'valid_until':datetime.now(timezone.utc)+timedelta(days=1)}
        with pytest.raises(catalog_query.CatalogUnavailable):catalog_query._valid(SimpleNamespace(full_name='fixture.events'),manifest)
    assert len(catalog_query._tokens)<=8
    catalog_query._tokens.clear()


def test_checkpoint_requires_actual_majority_watermarks():
    from unittest.mock import Mock
    source=Mock();source.database.client.admin.command.return_value={}
    with pytest.raises(catalog_query.CatalogUnavailable):catalog_query.checkpoint(source)
    source.watch.assert_not_called()


def test_future_fact_boundaries_invalidate_materialized_metadata(mongo):
    col=mongo.future_evidence;row=rows()[0]
    instant=datetime.now(timezone.utc)+timedelta(minutes=10)
    row['last_successful_verification_at']=instant.isoformat()
    col.insert_one(row);catalog_query.publish(col)
    manifest=col.database[catalog_query.META].find_one({'_id':catalog_query.manifest_id(col)})
    # BSON dates retain milliseconds; never extend the known validity window.
    assert abs((manifest['valid_until'].replace(tzinfo=timezone.utc)-instant).total_seconds())<.001


def test_extreme_future_source_clock_does_not_overflow_expiry():
    now=datetime.now(timezone.utc)
    expiry=catalog_query.catalog_expiry([{'canonical':{'freshness':{'last_seen_at':'9999-12-31T00:00:00+00:00'}}}],now)
    assert expiry>now and expiry-now<=timedelta(days=1)


def test_geographic_dateline_poles_and_antipodes_match_python(mongo,monkeypatch):
    col=mongo.geo_edges
    points=[(0.,0.),(0.,180.),(90.,0.),(-90.,180.),(18.52,73.85),(-18.52,-106.15)]
    for number,(lat,lng) in enumerate(points):
        col.insert_one({'title':f'Geo {number}','organizer':f'Geo Org{number}','source':'Fixture',
            'link':f'https://example.com/geo/{number}','mode':'Online','status':'Open',
            'registration_deadline':{'date':'2099-01-01'},'deadline_kind':'registration','lat':lat,'lng':lng})
    catalog_query.publish(col);reader=catalog_query.read_indexed
    for lat,lng in points:
        options={'lat':lat,'lng':lng,'sort':'distance','tab':'all'}
        api._cache.clear();monkeypatch.setattr(catalog_query,'read_indexed',reader)
        indexed=call(col,options,monkeypatch)
        monkeypatch.setattr(catalog_query,'read_indexed',lambda *a:None)
        legacy=call(col,options,monkeypatch)
        assert normalized(indexed)==normalized(legacy)
