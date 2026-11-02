"""A malformed optional legacy field cannot break discovery or mutate storage."""
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock

import api
import mongomock
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def feed(monkeypatch):
    collection = mongomock.MongoClient().recovery.hackathons
    monkeypatch.setattr(api, 'get_collection', lambda: collection)
    api._cache.clear()
    with TestClient(api.app) as client:
        yield client, collection
    api._cache.clear()


@pytest.mark.parametrize('field,value', [
    ('tags', None), ('tags', ['Web', {'name': 'bad'}, None, 'Web']),
    ('source', {'bad': 'shape'}), ('mode', ['Virtual']), ('prize', {'bad': 'shape'}),
    ('scraped_at', None), ('scraped_at', datetime(2026, 10, 9, 8)),
    ('registrations', '5,000'), ('total_registrations', '10k+'),
    ('lat', float('nan')), ('registration_deadline', ['bad']),
])
def test_legacy_optional_data_does_not_break_list_or_detail(feed, field, value):
    client, collection = feed
    event_id = collection.insert_one({'title': 'Sample event', 'source': 'Sample platform',
        'link': 'https://example.com/register', 'tags': ['Web'], field: value}).inserted_id
    before = list(collection.find())
    for path in ('/api/hackathons', '/api/v1/hackathons', f'/api/hackathons/{event_id}'):
        response = client.get(path)
        assert response.status_code == 200
        assert response.json()['success'] is True
        assert 'Sample event' in response.text
    # NaN is not equal to itself; compare the stored document's representation.
    assert repr(list(collection.find())) == repr(before)


def test_counts_are_exact_and_unknown_fields_remain_unknown(feed):
    client, collection = feed
    collection.insert_many([
        {'title': 'Exact count', 'registrations': '5,000', 'eligibility': '<p>University students</p>'},
        {'title': 'Approximate count', 'total_registrations': '10k+', 'tags': None},
        {'title': 'Unknown', 'total_registrations': 'N/A', 'link': 'http://127.0.0.1/private'},
    ])
    result = client.get('/api/hackathons').json()
    assert result['stats']['total_registrations'] == 5000
    assert result['stats']['p50_latency_ms'] is None or result['stats']['p50_latency_ms'] >= 0
    assert result['stats']['recalculated_cadence'] is None
    assert result['data'][0]['eligibility'] == 'University students'
    assert result['data'][1]['total_registrations'] == '10k+'
    assert 'link' not in result['data'][2]


def test_failed_feed_is_retryable_503_and_never_cacheable(feed, monkeypatch):
    monkeypatch.setattr(api, 'get_collection', Mock(side_effect=RuntimeError('private connection string')))
    response = feed[0].get('/api/hackathons')
    assert response.status_code == 503
    assert response.json()['success'] is False
    assert response.json()['error'] == 'Listings temporarily unavailable'
    assert response.headers['cache-control'] == 'no-store'
    assert 'private' not in response.text


def test_exact_deadline_and_suppressed_rows_are_honored_without_migration(feed):
    client, collection = feed
    now = datetime.now(timezone.utc)
    collection.insert_many([
        {'title': 'Closed earlier today', 'deadline_kind': 'registration',
         'deadline_iso': now.date().isoformat(), 'registration_deadline': {'at': (now - timedelta(minutes=1)).isoformat()}},
        {'title': 'Suppressed', 'publication_state': 'suppressed'},
        {'title': 'Event date is not a registration deadline', 'deadline_kind': 'event', 'deadline': '2020-01-01', 'deadline_iso': '2020-01-01'},
    ])
    response = client.get('/api/hackathons', params={'tab': 'all'}).json()
    assert response['upcoming_total'] == 1
    assert response['missed_total'] == 1
    assert len(response['data']) == 2
    assert response['data'][0]['deadline_iso'] is None


def test_closed_rows_with_missing_dates_do_not_break_mixed_deadline_sorting(feed):
    client, collection = feed
    collection.insert_many([
        {'title': 'Closed without a date', 'status': 'Ended', 'deadline_iso': None},
        {'title': 'Closed with a date', 'deadline_iso': '2020-01-01'},
        {'title': 'Upcoming', 'deadline_iso': '2099-01-01'},
    ])
    response = client.get('/api/hackathons', params={'tab': 'all'})
    assert response.status_code == 200
    assert [row['title'] for row in response.json()['data']] == ['Upcoming', 'Closed with a date', 'Closed without a date']
