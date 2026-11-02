"""Browser query contract and public submission isolation, using only mongomock."""
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock
import mongomock
import pytest
from fastapi.testclient import TestClient
import api

@pytest.fixture
def isolated(monkeypatch):
    db = mongomock.MongoClient().contract
    monkeypatch.setattr(api, 'get_collection', lambda name='hackathons': db[name])
    api._cache.clear()
    api.limiter.reset()
    with TestClient(api.app) as client:
        yield client, db
    api._cache.clear()


def test_pagination_search_and_saved_ids_cover_the_whole_feed(isolated):
    client, db = isolated
    ids = [str(db.hackathons.insert_one({'title': f'Event {i}', 'source': 'Devfolio', 'mode': 'Virtual',
        'link': f'https://example.com/event/{i}', 'status': 'Open'}).inserted_id) for i in range(26)]
    first = client.get('/api/hackathons', params={'limit': 12}).json()
    second = client.get('/api/hackathons', params={'limit': 12, 'page': 2}).json()
    assert first['upcoming_total'] == 26
    assert len(first['data']) == len(second['data']) == 12
    assert not {row['_id'] for row in first['data']} & {row['_id'] for row in second['data']}
    saved = client.get('/api/hackathons', params={'ids': ids[-1], 'tab': 'all'}).json()
    assert saved['all_total'] == 1
    assert saved['data'][0]['_id'] == ids[-1]
    assert client.get('/api/hackathons', params={'ids': 'none'}).json()['data'] == []


def test_registration_status_and_counts_are_honest(isolated):
    client, db = isolated
    today = datetime.now(timezone.utc).date()
    db.hackathons.insert_many([
        {'title': 'Unknown'}, {'title': 'Closing', 'deadline_iso': (today + timedelta(days=2)).isoformat()},
        {'title': 'Open', 'status': 'Open'}, {'title': 'Closed', 'deadline_iso': '2020-01-01'},
    ])
    result = client.get('/api/hackathons', params={'status': 'closing'}).json()
    assert [row['title'] for row in result['data']] == ['Closing']
    assert result['stats']['closing_count'] == 1
    assert result['stats']['open_count'] == 1
    assert client.get('/api/hackathons', params={'status': 'open'}).json()['upcoming_total'] == 1
    assert client.get('/api/hackathons', params={'status': 'unknown'}).json()['data'][0]['title'] == 'Unknown'


def test_public_submission_is_deduplicated_and_never_scans_or_publishes(isolated, monkeypatch):
    client, db = isolated
    network = Mock(side_effect=AssertionError('Public submission must never fetch a URL'))
    monkeypatch.setattr(api, 'public_request', network)
    url = 'https://example.com/hackathon'
    for _ in range(2):
        response = client.post('/api/submissions', json={'url': url})
        assert response.status_code == 202
    assert db.community_submissions.count_documents({}) == 1
    assert db.community_submissions.find_one()['state'] == 'pending'
    assert db.hackathons.count_documents({}) == 0
    network.assert_not_called()


@pytest.mark.parametrize('url', ['http://127.0.0.1/private', 'http://localhost/a', 'javascript:alert(1)', 'https://user:pass@example.com/a'])
def test_public_submission_rejects_non_public_urls(isolated, url):
    client, db = isolated
    assert client.post('/api/submissions', json={'url': url}).status_code == 400
    assert db.community_submissions.count_documents({}) == 0


def test_submission_database_failure_is_retryable_and_never_success(isolated, monkeypatch):
    client, _ = isolated
    monkeypatch.setattr(api, 'get_collection', lambda name='hackathons': None)
    response = client.post('/api/submissions', json={'url': 'https://example.com/hackathon'})
    assert response.status_code == 503
    assert response.json()['success'] is False
    assert response.headers['cache-control'] == 'no-store'
