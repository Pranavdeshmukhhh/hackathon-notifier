"""Offline process and parser fixtures; no real HTTP, database or Telegram calls."""
from datetime import datetime,timedelta,timezone
import json
import logging
import multiprocessing
from pathlib import Path
import runpy
import threading
import time
from unittest.mock import Mock
import pytest
import requests
from source_ingestion import CallableSourceAdapter,SourcePolicy,run_sources,source_freshness

FIXTURES=Path(__file__).parent/'fixtures/sources'
ROW={'title':'Synthetic fixture','link':'https://example.com/source-fixture','source':'Fixture','source_event_id':'stable-1'}

def healthy():return [ROW]
def empty():return []
def hang():time.sleep(20);return []
def malformed():return 'not a list'
def failed():raise RuntimeError('fixture secret never exposed')
def mixed():return [ROW,None]
def swallowed():
    logging.getLogger('scrapers.fixture').warning('HTTP 429 fetch failed https://example.com/?secret=fixture')
    return []

def partial():
    logging.getLogger('scrapers.fixture').warning('Page 2 failed')
    return [ROW]

class RateLimited:
    def __init__(self):self.calls=0
    def __call__(self):
        self.calls+=1
        if self.calls==1:
            error=requests.HTTPError('429');error.response=Mock(status_code=429);raise error
        return [ROW]


def policy(**kw):return SourcePolicy(timeout=3,budget=10,attempts=1,backoff=0,jitter=0,**kw)

@pytest.mark.parametrize('fetch,status,count',[(healthy,'ok',1),(empty,'zero_results',0),(malformed,'error',0),
    (failed,'error',0),(mixed,'partial',1),(swallowed,'error',0),(partial,'partial',1)])
def test_spawn_source_outcomes(fetch,status,count):
    rows,outcomes=run_sources([CallableSourceAdapter('fixture','Fixture',fetch)],policy())
    assert len(rows)==count and outcomes['Fixture']['status']==status
    assert outcomes['Fixture']['source_id']=='fixture'
    assert 'secret' not in str(outcomes)
    if rows:assert rows[0]['source_event_id']=='stable-1'


def test_http_429_retry_and_attempt_budget():
    rows,outcomes=run_sources([CallableSourceAdapter('fixture','Fixture',RateLimited())],
        SourcePolicy(timeout=3,budget=10,attempts=2,backoff=.01,jitter=.01))
    assert rows and outcomes['Fixture']['attempts']==2 and outcomes['Fixture']['status']=='ok'


def test_timeout_does_not_block_healthy_source_or_leave_children():
    before={p.pid for p in multiprocessing.active_children()};start=time.monotonic()
    rows,outcomes=run_sources([CallableSourceAdapter('slow','Slow',hang),CallableSourceAdapter('healthy','Healthy',healthy)],
        SourcePolicy(workers=2,timeout=1,budget=5,attempts=1))
    assert rows and outcomes['Slow']['status']=='timeout' and outcomes['Healthy']['status']=='ok'
    assert time.monotonic()-start<4
    assert {p.pid for p in multiprocessing.active_children()}<=before


def test_cancellation_including_queued_sources():
    cancel=threading.Event();timer=threading.Timer(.25,cancel.set);timer.start()
    try:
        rows,outcomes=run_sources([CallableSourceAdapter('a','A',hang),CallableSourceAdapter('b','B',hang)],policy(workers=1),cancel=cancel)
    finally:timer.cancel()
    assert rows==[] and all(item['status']=='cancelled' for item in outcomes.values())


def test_global_budget_bounds_queued_jobs():
    rows,outcomes=run_sources([CallableSourceAdapter('a','A',hang),CallableSourceAdapter('b','B',hang)],
        SourcePolicy(workers=1,timeout=3,budget=.3,attempts=1))
    assert not rows and all(item['status']=='timeout' for item in outcomes.values())


def test_repeated_runs_keep_source_identity_and_normalization():
    adapter=CallableSourceAdapter('fixture','Fixture',healthy)
    first,_=run_sources([adapter],policy());second,_=run_sources([adapter],policy())
    assert first[0]['source_event_id']==second[0]['source_event_id']=='stable-1'
    from event_repository import EventRepository
    import mongomock
    col=mongomock.MongoClient().fixtures.events;repo=EventRepository(col)
    original,_,_=repo.ingest(first[0]);repeated,created,_=repo.ingest(second[0])
    assert not created and repeated['_id']==original['_id'] and col.count_documents({})==1


def test_freshness_empty_is_success_and_failure_can_be_stale():
    now=datetime(2026,11,2,tzinfo=timezone.utc)
    history=[{'run_at':(now-timedelta(days=2)).isoformat(),'sources':{'Bad':{'status':'ok'}}}]
    outcomes={'Empty':{'status':'zero_results'},'Bad':{'status':'error'},'Unknown':{'status':'error'}}
    source_freshness(outcomes,history,now=now)
    assert outcomes['Empty']['stale'] is False and outcomes['Empty']['last_success_at']==now.isoformat()
    assert outcomes['Bad']['stale'] is True and outcomes['Unknown']['stale'] is None


def test_offline_html_parsing_and_schema_failure_health(monkeypatch):
    from scrapers import devfolio_scraper as source
    monkeypatch.setattr(source,'_fetch_detail',lambda *a:{'location':'','desc':'','tagline':'','prize':''})
    for name,status in [('devfolio.html','ok'),('empty.html','zero_results'),('malformed.html','error')]:
        monkeypatch.setattr(source,'_fetch_page',lambda *a:(FIXTURES/name).read_text())
        adapter=CallableSourceAdapter('devfolio','Devfolio',source.scrape_devfolio)
        rows=adapter.parse(adapter.fetch())
        actual='partial' if rows and adapter.health().issues else 'error' if adapter.health().issues else 'ok' if rows else 'zero_results'
        assert actual==status


def test_offline_json_parser_preserves_source_id():
    from scrapers.devnovate_scraper import _normalise
    rows=json.loads((FIXTURES/'devnovate.json').read_text())
    parsed=_normalise(rows[0])
    assert parsed and parsed['source_event_id']=='fixture-json-1'

@pytest.mark.parametrize('success,code',[(True,0),(False,1)])
def test_scheduled_entrypoint_propagates_failure(monkeypatch,success,code):
    import run_scan
    monkeypatch.setattr(run_scan,'execute_scan',lambda **kw:{'success':success})
    monkeypatch.setattr('sys.argv',['scrape_job.py','--dry-run'])
    with pytest.raises(SystemExit) as raised:runpy.run_path(str(Path(__file__).parents[1]/'scrape_job.py'),run_name='__main__')
    assert raised.value.code==code


def test_valid_empty_feeds_do_not_trigger_failure_warnings(monkeypatch):
    import run_scan,mongomock
    db=mongomock.MongoClient().history
    for i in range(2):db.runs.insert_one({'run_at':str(i),'timestamp':i,'sources':{'Fixture':{'status':'zero_results','found':0}}})
    warning=Mock();monkeypatch.setattr(run_scan,'send_warning_alert',warning)
    run_scan.check_consecutive_failures(db.runs,{'Fixture':{'status':'zero_results','found':0}})
    warning.assert_not_called()


def timed():
    start=time.monotonic();time.sleep(.2)
    return [{**ROW,'desc':json.dumps({'start':start,'end':time.monotonic()})}]


def test_worker_cap_serializes_jobs_when_configured_one():
    rows,_=run_sources([CallableSourceAdapter('first','First',timed),CallableSourceAdapter('second','Second',timed)],policy(workers=1))
    first,second=[json.loads(row['desc']) for row in rows]
    assert second['start']>=first['end']


def test_partial_scan_keeps_healthy_rows_but_exits_failed(monkeypatch,notification_db):
    import run_scan
    db=notification_db
    monkeypatch.setattr(run_scan,'get_collection',lambda name='hackathons':db[name])
    monkeypatch.setattr(run_scan,'run_all_scrapers',lambda:([ROW],{'Healthy':{'status':'ok','found':1},'Failed':{'status':'timeout','found':0}}))
    monkeypatch.setattr(run_scan,'run_lifecycle_sweep',lambda *a,**kw:{'archived':0})
    summary=run_scan.execute_scan()
    assert summary['success'] is False and db.hackathons.count_documents({})==1

@pytest.mark.parametrize('kw',[{'workers':1.5},{'workers':9},{'attempts':0},{'timeout':float('nan')},{'budget':0},{'jitter':20}])
def test_invalid_policies_fail_before_fetch(kw):
    with pytest.raises(ValueError):SourcePolicy(**kw)

@pytest.mark.parametrize('module,function',[('devpost_scraper','_fetch_page'),('unstop_scraper','_fetch_query'),('hackerearth_scraper','_fetch_events')])
def test_unrecognized_json_envelope_is_not_a_valid_empty_feed(module,function):
    import importlib
    source=importlib.import_module('scrapers.'+module)
    fetch=getattr(source,function);fetch=getattr(fetch,'__wrapped__',fetch)
    response=Mock(status_code=200);response.json.return_value={}
    session=Mock();session.get.return_value=response
    args=(session,{}) if module=='devpost_scraper' else (session,'https://example.com/') if module=='unstop_scraper' else (session,)
    with pytest.raises(ValueError):fetch(*args)


def test_payload_limits_fail_visibly():
    _,outcomes=run_sources([CallableSourceAdapter('fixture','Fixture',mixed)],SourcePolicy(timeout=3,budget=10,attempts=1,max_rows=1))
    assert outcomes['Fixture']['status']=='error' and outcomes['Fixture']['found']==0
