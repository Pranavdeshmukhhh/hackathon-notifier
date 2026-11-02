from datetime import datetime,timedelta,timezone
import mongomock
from fastapi.testclient import TestClient
import api


def test_cache_exact_expiry_dates_formats_pagination_and_suppressed_details(monkeypatch):
    db=mongomock.MongoClient().phase1
    now=datetime.now(timezone.utc)
    ids=[]
    for i in range(31):
        ids.append(db.hackathons.insert_one({'title':f'Fixture {i}','link':f'https://example.com/{i}',
            'mode':'Remote' if i==0 else 'On-site' if i==1 else 'Hybrid','status':'Open',
            'deadline_kind':'registration','registration_deadline':{'at':(now+timedelta(minutes=1)).isoformat()},
            'deadline_iso':now.date().isoformat(),'event_start':(now+timedelta(days=1)).isoformat(),
            'lat':0,'lng':0}).inserted_id)
    hidden=db.hackathons.insert_one({'title':'Hidden','publication_state':'suppressed'}).inserted_id
    monkeypatch.setattr(api,'get_collection',lambda:db.hackathons)
    api._cache.clear();api.limiter.reset()
    with TestClient(api.app) as client:
        first=client.get('/api/hackathons?limit=12').json()
        assert first['upcoming_total']==31
        assert client.get('/api/hackathons?limit=12&page=3').json()['count']==7
        assert client.get('/api/hackathons?format=Online').json()['upcoming_total']==1
        assert client.get('/api/hackathons?format=Offline').json()['upcoming_total']==1
        saved=client.get(f'/api/hackathons?ids={ids[-1]}&tab=all').json()
        assert saved['all_total']==1
        assert client.get(f'/api/hackathons/{hidden}').status_code==404
        detail=client.get(f'/api/hackathons/{ids[0]}').json()['data']
        assert detail['event_start']
        assert client.get('/api/hackathons?lat=0&lng=0&sort=distance').json()['data'][0]['distance_km']==0
        class Later(datetime):
            @classmethod
            def now(cls,tz=None):return (now+timedelta(minutes=2)).astimezone(tz or timezone.utc)
        monkeypatch.setattr(api,'datetime',Later)
        expired=client.get('/api/hackathons').json()
        assert expired['upcoming_total']==0
        assert expired['stats']['active_count']==0
    api._cache.clear()


def test_event_end_expires_without_becoming_registration_deadline(monkeypatch):
    db=mongomock.MongoClient().phase1
    db.hackathons.insert_one({'title':'Ended fixture','event_end':'2000-01-01','deadline_kind':'unknown'})
    monkeypatch.setattr(api,'get_collection',lambda:db.hackathons)
    api._cache.clear();api.limiter.reset()
    with TestClient(api.app) as client:
        response=client.get('/api/hackathons?tab=missed').json()
        assert response['missed_total']==1
        assert response['data'][0]['deadline_iso'] is None
    api._cache.clear()


def test_legacy_registration_facts_remain_explicit_and_public():
    from public_events import public_event
    for deadline in ('2099-11-10',{'date':'2099-11-10'}):
        result=public_event({'_id':'fixture','title':'Fixture','registration_deadline':deadline})
        assert result['deadline_iso']=='2099-11-10'
        assert result['deadline_kind']=='registration'
    assert api._registration_status({'registration_opens_at':'2099-11-10T00:00:00Z'})=='upcoming'
