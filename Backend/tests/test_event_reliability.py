"""Phase 2 end-to-end contracts. All payloads are representative fixtures, never production data."""
from datetime import datetime,timedelta,timezone
from copy import deepcopy
import json
import pytest
from fastapi.testclient import TestClient
from event_contract import canonical_event,adapt_observation,temporal,duplicate_key
from event_normalization import canonical_url
from event_repository import EventRepository
from public_events import public_event
import api

NOW=datetime(2026,10,30,12,tzinfo=timezone.utc)


def fixture(**extra):
    return {'title':'Fixture Campus Hackathon 2027','link':'https://example.com/event','source':'Fixture',
        'mode':'Online','organizer':'Fixture University','event_start':'2027-01-05T12:00:00Z',
        'deadline_kind':'registration','registration_deadline':{'at':'2027-01-01T18:00:00+05:30'},
        'desc':'Representative fixture with source-provided dates and an organizer.',**extra}


@pytest.fixture
def db(notification_db):
    return notification_db


def test_contract_explicit_unknowns_original_currency_timezone_and_verification():
    event=canonical_event({'_id':'a'*24,'title':'Fixture','verified':True,'verification_confidence':.99,'prize':'$5000'},now=NOW)
    assert event['format']=='unknown'
    assert event['registration_closes']['precision']=='unknown'
    assert event['registration_url'] is None
    assert event['prize']=={'original':'$5000','amount':None,'currency':None}
    assert event['verification']=={'status':'unverified','confidence':None,'last_success_at':None,'method':None}
    known=canonical_event(fixture(prize='₹1,00,000'),now=NOW)
    assert known['prize']=={'original':'₹1,00,000','amount':'100000','currency':'INR'}
    assert known['registration_closes']['at']=='2027-01-01T12:30:00+00:00'
    assert known['registration_closes']['timezone']=='+0530'
    assert temporal('2027-01-01T18:00:00').precision=='local_datetime'
    assert temporal('2027-01-01T18:00:00').at is None


@pytest.mark.parametrize('url',['http://127.0.0.1/a','https://user:pass@example.com/a','javascript:alert(1)','https://example.com:9000/a'])
def test_canonical_url_does_not_bypass_public_safety(url):
    with pytest.raises(ValueError):canonical_url(url)


def test_tracking_query_identity_and_spa_fragments():
    assert canonical_url('https://EXAMPLE.com:443/event?b=2&utm_campaign=x&a=1')=='https://example.com/event?a=1&b=2'
    assert canonical_url('https://example.com/#/event/1')!='https://example.com/#/event/2'


def test_actual_source_adapters_separate_deadline_meanings(monkeypatch):
    from scrapers.devpost_scraper import _parse_hackathon
    from scrapers.hackerearth_scraper import _parse_event
    from scrapers.devnovate_scraper import _normalise
    from scrapers.unstop_scraper import _parse_api_items
    from scrapers.devfolio_scraper import _parse_next_data
    monkeypatch.setattr('scrapers.devpost_scraper.geocode',lambda *args:(None,None))
    monkeypatch.setattr('scrapers.unstop_scraper.geocode',lambda *args:(None,None))
    rows=[_parse_hackathon({'title':'Fixture Hackathon','url':'https://example.com/post','submission_period_dates':'Dec 01, 2099','displayed_location':{'location':'Online'},'themes':[]}),
          _parse_event({'title':'Fixture Hackathon','url':'https://example.com/earth','end_date':'Dec 02, 2099','status':'ONGOING'}),
          _normalise({'name':'Fixture Hackathon','eventName':'fixture','endDate':'2099-12-03','organizationName':'Fixture org'}),
          _parse_api_items([{'title':'Fixture Hackathon','seo_url':'https://example.com/unstop','end_date':'2099-12-04','region':'online','regnRequirements':{}}])[0]]
    for row in rows:
        normalized=adapt_observation(row,now=NOW)
        assert normalized['canonical']['registration_closes']['precision']=='unknown'
    assert adapt_observation(rows[0],now=NOW)['canonical']['submission_closes']['date']=='2099-12-01'
    assert adapt_observation(rows[1],now=NOW)['canonical']['event_ends']['date']=='2099-12-02'
    payload={'props':{'pageProps':{'dehydratedState':{'queries':[{'state':{'data':{'open_hackathons':[{'name':'Fixture Hackathon','slug':'fixture','ends_at':'2099-12-05','is_online':True,'settings':{}}]}}}]}}}}
    parsed=_parse_next_data('<script id="__NEXT_DATA__" type="application/json">'+json.dumps(payload)+'</script>')
    assert parsed and adapt_observation(parsed[0],now=NOW)['canonical']['registration_closes']['precision']=='unknown'


def test_source_batch_isolation_and_precise_registration_offsets(monkeypatch):
    from scrapers.unstop_scraper import _parse_api_items
    monkeypatch.setattr('scrapers.unstop_scraper.geocode',lambda *args:(None,None))
    rows=_parse_api_items([None,{'title':[]},{'title':'Fixture Hackathon','seo_url':'https://example.com/unstop','region':'online',
        'organisation':{'name':'Fixture org'},'regnRequirements':{'end_regn_dt':'2027-01-01T18:00:00+05:30'}}])
    assert len(rows)==1
    assert adapt_observation(rows[0],now=NOW)['canonical']['registration_closes']['at']=='2027-01-01T12:30:00+00:00'


def test_ingestion_cross_platform_identity_history_updates_and_no_erase(db):
    repo=EventRepository(db.events,db.observations)
    first,created,_=repo.ingest(fixture(),now=NOW)
    assert created
    db.events.update_one({'_id':first['_id']},{'$set':{'notified':True}})
    second,created,_=repo.ingest(fixture(source='Another platform',link='https://other.example/fixture',prize='USD 5000'),now=NOW+timedelta(minutes=1))
    assert not created and second['_id']==first['_id'] and second['notified']
    assert len(second['source_records'])==2 and db.events.count_documents({})==1
    assert db.observations.count_documents({})==2
    third,_,_=repo.ingest(fixture(source='Another platform',registration_deadline=None,deadline_iso=None,desc='',mode='Unknown'),now=NOW+timedelta(minutes=2))
    assert third['canonical']['registration_closes']['precision']=='timestamp'
    assert third['desc'] and third['mode']=='Online'
    assert db.observations.find_one({'changes.prize':{'$exists':True}})
    assert duplicate_key(fixture(event_start='2028-01-05'))!=duplicate_key(fixture())
    assert duplicate_key(fixture(organizer=None)) is None


def test_out_of_order_updates_and_suppression_are_not_overwritten(db):
    repo=EventRepository(db.events,db.observations)
    first,_,_=repo.ingest(fixture(),now=NOW)
    db.events.update_one({'_id':first['_id']},{'$set':{'publication_state':'suppressed'}})
    updated,_,_=repo.ingest(fixture(prize='EUR 100'),now=NOW+timedelta(minutes=1))
    assert updated['publication_state']=='suppressed'
    older,_,_=repo.ingest(fixture(title='Old title'),now=NOW)
    assert older['title']==first['title']


def test_lifecycle_retains_historical_records_and_unknown_probe_strikes(db,monkeypatch):
    import lifecycle
    row=db.events.insert_one(fixture(deadline_iso='2000-01-01',registration_deadline=None)).inserted_id
    db.events.update_one({'_id':row},{'$set':{'dead_strikes':2}})
    lifecycle.archive_expired(db.events)
    lifecycle.purge_expired(db.events,retention=0)
    assert db.events.count_documents({})==1
    assert db.events.find_one()['archived']
    active=db.events.insert_one(fixture(link='https://example.com/dead')).inserted_id
    monkeypatch.setattr(lifecycle,'check_links',lambda *args,**kwargs:{'https://example.com/dead':lifecycle.LinkStatus.DEAD})
    for _ in range(3):lifecycle.revalidate_links(db.events)
    assert db.events.find_one({'_id':active})['archive_reason']=='dead_link'
    assert db.events.count_documents({})==2


def test_read_adapter_preserves_stored_id_honesty_and_dates(db):
    row={**fixture(), 'verified':True,'verification_confidence':.98,'scraped_at':NOW.isoformat()}
    row['_id']=db.events.insert_one(row).inserted_id
    before=deepcopy(db.events.find_one())
    out=public_event(before)
    assert out['canonical']['id']==str(row['_id']) and out['verified'] is False
    assert out['canonical']['freshness']['last_seen_at']==NOW.isoformat()
    assert db.events.find_one()==before
    legacy=public_event({'_id':'a'*24,'title':'Fixture','source':'Devpost','deadline_iso':'2099-12-12'})
    assert legacy['canonical']['registration_closes']['precision']=='unknown' and legacy['deadline_iso'] is None


@pytest.fixture
def client(db,monkeypatch):
    monkeypatch.setattr(api,'get_collection',lambda name='hackathons':db[name])
    monkeypatch.setenv('ADMIN_SECRET','fixture-admin-secret')
    monkeypatch.setattr(api,'public_request',lambda *args,**kwargs:pytest.fail('No moderation network allowed'))
    api._cache.clear();api.limiter.reset()
    with TestClient(api.app) as session:yield session
    api._cache.clear()


def test_api_duplicates_counts_source_filters_saved_aliases_and_search_index(client,db,monkeypatch):
    for source,url in [('Devfolio','https://example.com/one'),('Unstop','https://example.com/two')]:
        db.hackathons.insert_one(fixture(source=source,link=url))
    ids=[str(row['_id']) for row in db.hackathons.find()]
    first=client.get('/api/hackathons').json()
    assert first['all_total']==1
    assert first['data'][0]['canonical']['aliases']==[ids[1]]
    assert client.get('/api/hackathons?source=unstop').json()['all_total']==1
    assert client.get('/api/hackathons?ids='+ids[1]).json()['all_total']==1
    monkeypatch.setattr(api,'_build_document_search_corpus',lambda *args:pytest.fail('Warm search index rebuilt'))
    assert client.get('/api/hackathons?search=Fixture%20University').json()['upcoming_total']==1
    assert client.get('/api/hackathons/'+ids[1]).status_code==200


def test_moderation_requires_admin_and_public_input_cannot_publish(client,db):
    url='https://example.com/community?utm_source=fixture'
    result=client.post('/api/submissions',json={'url':url,'state':'approved','verified':True})
    assert result.status_code==202 and db.hackathons.count_documents({})==0
    submission=db.community_submissions.find_one();sid=submission['_id']
    route=f'/api/admin/submissions/{sid}/review'
    assert client.get('/api/admin/submissions').status_code==401
    assert client.post(route,json={'decision':'approve','event':fixture()}).status_code==401
    headers={'X-Admin-Secret':'fixture-admin-secret'}
    assert client.get('/api/admin/submissions',headers=headers).json()['total']==1
    assert client.post(route,headers=headers,json={'decision':'approve','event':{}}).status_code==422
    approved=client.post(route,headers=headers,json={'decision':'approve','event':fixture(verified=True,link='http://127.0.0.1/private')})
    assert approved.status_code==200 and approved.json()['state']=='approved'
    stored=db.hackathons.find_one()
    assert stored['link']=='https://example.com/community' and stored['verified'] is False
    assert client.post(route,headers=headers,json={'decision':'approve','event':fixture()}).json()['event_id']==str(stored['_id'])
    assert db.hackathons.count_documents({})==1
    assert client.post(route,headers=headers,json={'decision':'reject'}).status_code==409


def test_rejected_submission_stays_unpublished_and_no_secret_in_canonical(client,db):
    client.post('/api/submissions',json={'url':'https://example.com/rejected'})
    sid=db.community_submissions.find_one()['_id']
    result=client.post(f'/api/v1/admin/submissions/{sid}/review',headers={'X-Admin-Secret':'fixture-admin-secret'},json={'decision':'reject','note':'Insufficient source facts'})
    assert result.json()['state']=='rejected' and db.hackathons.count_documents({})==0
    public=canonical_event(fixture(admin_secret='private',verification_evidence='private'))
    assert 'private' not in json.dumps(public)


def test_execute_scan_uses_canonical_store_and_preserves_notification_idempotency(db,monkeypatch):
    import run_scan,lifecycle
    from unittest.mock import Mock
    raw=[fixture(title='IIT Delhi Fixture Hackathon'),fixture(title='IIT Delhi Fixture Hackathon',link='https://other.example/event'),None,
         fixture(title='Old Fixture',link='https://example.com/old',registration_deadline={'date':'2000-01-01'})]
    monkeypatch.setattr(run_scan,'get_collection',lambda name='hackathons':db[name])
    monkeypatch.setattr(run_scan,'run_all_scrapers',lambda:(deepcopy(raw),{'Fixture':{'found':3,'status':'ok'}}))
    monkeypatch.setattr(lifecycle,'check_links',lambda *args,**kwargs:{})
    from notifier import telegram_bot as bot
    from notifier.outbox import DeliveryResult
    monkeypatch.setattr(bot,'TELEGRAM_BOT_TOKEN','test-token')
    monkeypatch.setattr(bot,'TELEGRAM_CHAT_ID','admin')
    sent=Mock(return_value=DeliveryResult(delivered=True));monkeypatch.setattr(bot,'_telegram_attempt',sent)
    first=run_scan.execute_scan()
    assert first['success'] and db.hackathons.count_documents({})==2
    assert db.hackathons.find_one({'title':'Old Fixture'})['archived']
    assert db.hackathons.find_one({'title':'IIT Delhi Fixture Hackathon'})['notified']
    assert sent.call_count==1
    run_scan.execute_scan()
    assert sent.call_count==1 and db.hackathons.count_documents({})==2
    assert db.event_observations.count_documents({})>=6


def test_uncertain_timezone_malformed_optional_fields_and_unicode_search(client,db):
    assert temporal('2027-01-01T18:00:00','Asia/Kolkata').at=='2027-01-01T12:30:00+00:00'
    assert temporal('2026-11-01T01:30:00','America/New_York').precision=='local_datetime'
    malformed=canonical_event(fixture(mode=['Online'],min_team_size=5,max_team_size=2,lat=float('nan'),lng=0),now=NOW)
    assert malformed['format']=='unknown' and malformed['team']=={'minimum':None,'maximum':None}
    assert malformed['location']['coordinates']['latitude'] is None
    db.hackathons.insert_one(fixture(title='दिल्ली Fixture'))
    assert client.get('/api/hackathons?search=दिल्ली').json()['all_total']==1
    assert client.get('/api/hackathons?search=मुंबई').json()['all_total']==0


def test_suppression_moderation_failure_and_expired_review_lease(client,db,monkeypatch):
    client.post('/api/submissions',json={'url':'https://example.com/lease'})
    sid=db.community_submissions.find_one()['_id']
    db.community_submissions.update_one({'_id':sid},{'$set':{'state':'reviewing','review_started_at':'2000-01-01T00:00:00Z'}})
    response=client.post(f'/api/admin/submissions/{sid}/review',headers={'X-Admin-Secret':'fixture-admin-secret'},json={'decision':'reject'})
    assert response.status_code==200 and response.json()['state']=='rejected'
    db.hackathons.insert_one(fixture(publication_state='pending'))
    assert client.get('/api/hackathons').json()['all_total']==0


def test_manual_evidence_only_and_future_verification_is_not_success():
    confirmed=canonical_event(fixture(verification_method='administrator_evidence',verification_evidence='Reviewed official organizer schedule',
        last_successful_verification_at=NOW.isoformat(),verification_confidence=.9),now=NOW)
    assert confirmed['verification']['status']=='verified' and confirmed['verification']['confidence']==.9
    assert confirmed['verification']['last_success_at']==NOW.isoformat()
    future=canonical_event(fixture(verification_method='administrator_evidence',verification_evidence='Fixture',last_successful_verification_at='2099-01-01T00:00:00Z'),now=NOW)
    assert future['verification']['status']=='unverified'


def test_repeated_normalization_preserves_date_precision_original_timezone_and_local_day():
    raw=fixture(registration_deadline={'at':'2027-01-01T00:30:00+05:30'})
    first=adapt_observation(raw,now=NOW)
    second=adapt_observation(first,now=NOW)
    assert first['canonical']['registration_closes']==second['canonical']['registration_closes']
    assert first['canonical']['registration_closes']['date']=='2027-01-01'
    assert first['canonical']['registration_closes']['timezone']=='+0530'
    local=adapt_observation(fixture(registration_deadline={'at':'2027-01-01T00:30:00'}),now=NOW)
    assert adapt_observation(local,now=NOW)['canonical']['registration_closes']['precision']=='local_datetime'
    assert adapt_observation(local,now=NOW)['deadline_iso'] is None


def test_same_day_deadline_sort_uses_instants_and_unknowns_last(client,db):
    for title,at in [('Later','2099-01-01T18:00:00Z'),('Earlier','2099-01-01T09:00:00Z')]:
        db.hackathons.insert_one(fixture(title=title,link='https://example.com/'+title,registration_deadline={'at':at},deadline_iso='2099-01-01'))
    db.hackathons.insert_one(fixture(title='Unknown time',link='https://example.com/unknown',registration_deadline=None,deadline_iso=None,deadline_kind='unknown'))
    payload=client.get('/api/hackathons?sort=deadline').json()
    assert [row['title'] for row in payload['data']]==['Earlier','Later','Unknown time']


def test_secondary_source_conflicts_are_auditable_and_administrator_can_resolve(db):
    repo=EventRepository(db.events,db.observations)
    original,_,_=repo.ingest(fixture(prize='USD 100'),now=NOW)
    mirrored,_,_=repo.ingest(fixture(prize='USD 999',source='Mirror',link='https://mirror.example/event'),now=NOW+timedelta(minutes=1))
    assert mirrored['prize']=='USD 100' and 'prize' in mirrored['canonical']['conflicting_fields']
    assert db.observations.find_one({'source.platform':'Mirror'})['facts']['prize']=='USD 999'
    resolved,_,_=repo.ingest(fixture(prize='USD 200'),now=NOW+timedelta(minutes=2),authority=3)
    assert resolved['prize']=='USD 200' and 'prize' not in resolved['canonical']['conflicting_fields']
    blocked,_,_=repo.ingest(fixture(prize='USD 300'),now=NOW+timedelta(minutes=3))
    assert blocked['prize']=='USD 200' and 'prize' in blocked['canonical']['conflicting_fields']


def test_failed_audit_write_does_not_overwrite_known_facts(db,monkeypatch):
    repo=EventRepository(db.events,db.observations)
    first,_,_=repo.ingest(fixture(prize='INR 100'),now=NOW)
    monkeypatch.setattr(db.observations,'insert_one',lambda *args:(_ for _ in ()).throw(RuntimeError('Fixture storage failure')))
    with pytest.raises(RuntimeError):repo.ingest(fixture(prize='INR 200'),now=NOW+timedelta(minutes=1))
    assert db.events.find_one({'_id':first['_id']})['prize']=='INR 100'


def test_contract_audit_is_read_only_and_invalid_currency_and_future_coords_stay_unknown(db):
    from scripts.audit_event_contract import audit
    row=fixture(prize='5000',prize_currency='INVALID',coordinates_verified=True,coordinates_verified_at='2099-01-01T00:00:00Z',coordinate_evidence='Fixture',lat=0,lng=0)
    db.events.insert_one(row)
    before=list(db.events.find())
    report=audit(db.events)
    assert report['writes']==0 and list(db.events.find())==before
    event=canonical_event(row,now=NOW)
    assert event['prize']['currency'] is None
    assert event['location']['coordinates']['verified'] is False


def test_moderation_storage_failure_restores_queue_and_never_claims_publication(client,db,monkeypatch):
    client.post('/api/submissions',json={'url':'https://example.com/fail-review'})
    sid=db.community_submissions.find_one()['_id']
    monkeypatch.setattr(db.event_observations,'insert_one',lambda *args:(_ for _ in ()).throw(RuntimeError('Fixture unavailable')))
    response=client.post(f'/api/admin/submissions/{sid}/review',headers={'X-Admin-Secret':'fixture-admin-secret'},json={'decision':'approve','event':fixture()})
    assert response.status_code==503 and response.json()['success'] is False
    assert db.community_submissions.find_one()['state']=='pending'
    assert db.hackathons.count_documents({})==0


def test_source_ids_keep_event_id_stable_when_name_url_and_dates_change(db):
    repo=EventRepository(db.events,db.observations)
    initial,_,_=repo.ingest(fixture(source_event_id='provider-123'),now=NOW)
    changed,created,_=repo.ingest(fixture(title='Renamed Fixture',source_event_id='provider-123',link='https://example.com/renamed',event_start='2027-02-01'),now=NOW+timedelta(minutes=1))
    assert not created and changed['_id']==initial['_id']
    assert changed['title']=='Renamed Fixture' and changed['link']=='https://example.com/renamed'
    assert 'https://example.com/event' in changed['url_aliases']


def test_provider_version_regressions_are_logged_without_replacing_current_facts(db):
    repo=EventRepository(db.events,db.observations)
    first,_,_=repo.ingest(fixture(source_event_id='a',source_updated_at='2026-10-30T11:00:00Z',prize='EUR 200'),now=NOW)
    older,_,_=repo.ingest(fixture(source_event_id='a',source_updated_at='2026-10-29T11:00:00Z',prize='EUR 100'),now=NOW+timedelta(minutes=1))
    assert older['prize']=='EUR 200'
    assert db.observations.find_one({'ignored_reason':'older_source_version'})
    assert db.events.find_one()['last_seen_at']==NOW.isoformat()


def test_reused_annual_url_is_held_for_review_instead_of_overwriting_history(db):
    repo=EventRepository(db.events,db.observations)
    old,_,_=repo.ingest(fixture(source_event_id='edition-2027'),now=NOW)
    candidate,created,_=repo.ingest(fixture(source_event_id='edition-2028',event_start='2028-01-05'),now=NOW+timedelta(minutes=1))
    assert not created and candidate['_id']==old['_id']
    assert db.events.find_one()['event_start']=='2027-01-05T12:00:00Z'
    assert db.observations.find_one({'ignored_reason':'possible_new_edition'})


def test_total_source_failure_does_not_report_success_or_refresh_last_seen(db,monkeypatch):
    import run_scan
    db.hackathons.insert_one(fixture(last_seen_at=NOW.isoformat()))
    monkeypatch.setattr(run_scan,'get_collection',lambda name='hackathons':db[name])
    monkeypatch.setattr(run_scan,'run_all_scrapers',lambda:([],{'Fixture':{'found':0,'status':'error'}}))
    monkeypatch.setattr(run_scan,'send_batch',lambda *args:pytest.fail('Source failure cannot send event notifications'))
    result=run_scan.execute_scan()
    assert result['success'] is False and db.hackathons.find_one()['last_seen_at']==NOW.isoformat()


def test_date_only_registration_opening_uses_its_stated_timezone():
    now=datetime(2026,10,31,20,tzinfo=timezone.utc)
    raw=fixture(status='Open',registration_opens_at={'date':'2026-11-01','timezone':'Asia/Kolkata'},registration_deadline={'date':'2026-11-10','timezone':'Asia/Kolkata'})
    assert canonical_event(raw,now=now)['registration_state']=='open'


def test_placeholder_registration_object_is_not_evidence_for_legacy_submission_date():
    row=public_event({'_id':'a'*24,'title':'Fixture','source':'Devpost','deadline_iso':'2099-01-01','status':'Open',
                      'registration_deadline':{'at':None,'date':None,'precision':'unknown'}})
    assert row['deadline_iso'] is None
    assert row['canonical']['registration_state']=='unknown'
    assert row['canonical']['registration_closes']['precision']=='unknown'


def test_unstop_epoch_and_local_clock_precision_are_not_lost(monkeypatch):
    from scrapers.unstop_scraper import _parse_api_items
    monkeypatch.setattr('scrapers.unstop_scraper.geocode',lambda *args:(None,None))
    for value in (1800000000,1800000000000,'2027-01-15 23:59:59'):
        row=_parse_api_items([{'title':'Fixture','seo_url':'https://example.com/time','region':'online','regnRequirements':{'end_regn_dt':value}}])[0]
        event=adapt_observation(row,now=NOW)['canonical']
        assert event['registration_closes']['precision']==('local_datetime' if isinstance(value,str) else 'timestamp')


def test_legacy_provider_id_rename_preserves_primary_id_and_original_url(db):
    legacy=fixture(source_event_id='legacy-provider-id')
    stored_id=db.events.insert_one(legacy).inserted_id
    repo=EventRepository(db.events,db.observations)
    changed,created,_=repo.ingest(fixture(source_event_id='legacy-provider-id',link='https://example.com/new-legacy',title='Renamed legacy'),now=NOW)
    assert not created and changed['_id']==stored_id
    assert 'https://example.com/event' in changed['url_aliases']


def test_admin_source_endpoints_use_canonical_repository_without_losing_flags(client,db,monkeypatch):
    monkeypatch.setattr('scrapers.instagram_scraper.scrape_instagram_hackathons',lambda **kwargs:[fixture(source='Instagram'),None])
    monkeypatch.setattr('scrapers.web_discovery_scraper.run_web_discovery',lambda **kwargs:[fixture(source='Web',link='https://other.example/web')])
    headers={'X-Admin-Secret':'fixture-admin-secret'}
    response=client.post('/api/scanner/instagram',headers=headers,json={})
    assert response.status_code==200 and response.json()['new_indexed']==1
    stored=db.hackathons.find_one();db.hackathons.update_one({'_id':stored['_id']},{'$set':{'notified':True}})
    mirrored=client.post('/api/scanner/web-discovery',headers=headers,json={})
    assert mirrored.status_code==200 and mirrored.json()['new_indexed']==0
    assert db.hackathons.count_documents({})==1 and db.hackathons.find_one()['notified'] is True
    assert db.hackathons.find_one()['canonical']['schema_version']==2


def test_authorized_auto_list_does_not_invent_format_or_registration(client):
    response=client.post('/api/hackathons/auto-list',headers={'X-Admin-Secret':'fixture-admin-secret'},json={
        'link':'https://example.com/curated','title':'Fixture curated','desc':'Provided facts only','fetch_metadata':False})
    assert response.status_code==200
    event=response.json()['data']['canonical']
    assert event['format']=='unknown' and event['registration_state']=='unknown'
    assert event['verification']['status']=='unverified'


def test_operator_tools_share_the_canonical_store(db,monkeypatch,tmp_path):
    from scripts import auto_discover_hackathons,import_unique_sources
    monkeypatch.setattr(auto_discover_hackathons,'extract_metadata',lambda url:{'title':'Fixture discovery','mode':'Online'})
    monkeypatch.setattr(auto_discover_hackathons,'get_collection',lambda name='hackathons':db[name])
    auto_discover_hackathons.auto_list_one('https://example.com/operator')
    assert db.hackathons.find_one()['canonical']['registration_state']=='unknown'
    path=tmp_path/'curated.json';path.write_text(json.dumps([fixture(link='https://example.com/import',mode='Online',title='Fixture import')]))
    monkeypatch.setattr(import_unique_sources,'DATA_FILE',path)
    monkeypatch.setattr(import_unique_sources,'get_collection',lambda name='hackathons':db[name])
    import_unique_sources.run()
    assert db.hackathons.count_documents({})==2
    assert all(row['canonical']['schema_version']==2 for row in db.hackathons.find())


def test_spa_registration_destinations_remain_distinct_through_moderation(client,db):
    for index in (1,2):
        result=client.post('/api/submissions',json={'url':f'https://example.com/#/event/{index}'})
        assert result.status_code==202
    assert db.community_submissions.count_documents({})==2
    submitted=db.community_submissions.find_one({'url':'https://example.com/#/event/1'})
    response=client.post(f"/api/admin/submissions/{submitted['_id']}/review",headers={'X-Admin-Secret':'fixture-admin-secret'},json={'decision':'approve','event':fixture()})
    assert response.status_code==200
    assert db.hackathons.find_one()['canonical']['registration_url']=='https://example.com/#/event/1'
