"""The detail endpoint reads public stored facts without external side effects."""
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock

from bson import ObjectId
from fastapi.testclient import TestClient
import mongomock
import pytest
import api


@pytest.fixture
def detail(monkeypatch):
    collection = mongomock.MongoClient().event_detail.hackathons
    event_id = ObjectId('0123456789abcdef01234567')
    collection.insert_one({
        '_id': event_id, 'title': 'Sample event', 'source': 'Sample platform',
        'link': 'https://example.com/event', 'tags': ['Web'], 'status': 'Open',
        'deadline_iso': (datetime.now(timezone.utc).date() + timedelta(days=1)).isoformat(),
        'organizer': 'Sample organizers', 'eligibility': 'University students',
        'desc': '<p>Build a <strong>working prototype</strong>.</p><p>Present your project.</p><script>alert(1)</script>',
        'admin_secret': 'private', 'raw_response': {'token': 'private'},
        'scraper_debug': 'private',
    })
    monkeypatch.setattr(api, 'get_collection', lambda: collection)
    external = Mock(side_effect=AssertionError('No external request permitted'))
    monkeypatch.setattr(api, 'public_request', external)
    scanner = Mock(side_effect=AssertionError('No scan permitted'))
    monkeypatch.setattr(api, 'run_internet_scan', scanner)
    with TestClient(api.app) as client:
        yield client, collection, str(event_id), external, scanner
    external.assert_not_called()
    scanner.assert_not_called()


@pytest.mark.parametrize('base', ['/api/hackathons/', '/api/v1/hackathons/'])
def test_detail_is_read_only_and_exposes_only_public_facts(detail, base):
    client, collection, event_id, _, _ = detail
    before = collection.find_one({'_id': ObjectId(event_id)})
    response = client.get(base + event_id)
    assert response.status_code == 200
    data = response.json()['data']
    assert data['_id'] == event_id
    assert data['organizer'] == 'Sample organizers'
    assert data['eligibility'] == 'University students'
    assert data['desc'] == 'Build a working prototype.\n\nPresent your project.'
    for field in ('admin_secret', 'raw_response', 'scraper_debug'):
        assert field not in data
    assert collection.find_one({'_id': ObjectId(event_id)}) == before


def test_missing_record_is_404_and_does_not_return_a_stale_listing(detail):
    client, collection, event_id, _, _ = detail
    client.get('/api/hackathons/' + event_id)
    collection.delete_one({'_id': ObjectId(event_id)})
    response = client.get('/api/hackathons/' + event_id)
    assert response.status_code == 404
    assert response.json() == {'success': False, 'error': 'Event not found'}
    assert response.headers['cache-control'] == 'no-store'


@pytest.mark.parametrize('event_id', ['not-an-id', 'a' * 25, '%7B%22%24ne%22%3Anull%7D'])
def test_invalid_identifiers_never_reach_the_database(detail, monkeypatch, event_id):
    database = Mock(side_effect=AssertionError('Invalid ID must not query MongoDB'))
    monkeypatch.setattr(api, 'get_collection', database)
    assert detail[0].get('/api/hackathons/' + event_id).status_code == 422
    database.assert_not_called()


def test_etag_tracks_edits_and_supports_conditional_reads(detail):
    client, collection, event_id, _, _ = detail
    before = client.get('/api/hackathons/' + event_id)
    assert client.get('/api/hackathons/' + event_id, headers={'If-None-Match': before.headers['etag']}).status_code == 304
    collection.update_one({'_id': ObjectId(event_id)}, {'$set': {'prize': 'Source-listed prize'}})
    updated = client.get('/api/hackathons/' + event_id, headers={'If-None-Match': before.headers['etag']})
    assert updated.status_code == 200
    assert updated.json()['data']['prize'] == 'Source-listed prize'
    assert updated.headers['etag'] != before.headers['etag']


def test_database_failure_is_503_without_leaking_the_exception(detail, monkeypatch):
    monkeypatch.setattr(api, 'get_collection', Mock(side_effect=RuntimeError('secret database connection string')))
    response = detail[0].get('/api/hackathons/' + detail[2])
    assert response.status_code == 503
    assert response.json()['error'] == 'Event details unavailable'
    assert 'secret' not in response.text
    assert response.headers['cache-control'] == 'no-store'


def test_unknown_fields_are_not_given_invented_defaults_and_closed_status_is_current(detail):
    client, collection, event_id, _, _ = detail
    collection.update_one({'_id': ObjectId(event_id)}, {'$set': {'status': 'Closed', 'organizer': {'unexpected': 'object'}, 'eligibility': None}})
    data = client.get('/api/hackathons/' + event_id.upper()).json()['data']
    assert data['is_past'] is True
    assert 'mode' not in data
    assert 'organizer' not in data
    assert 'eligibility' not in data
