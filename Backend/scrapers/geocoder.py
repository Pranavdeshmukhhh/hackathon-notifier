"""Optional persistent geocoding, serialized across workers; never called by GET."""
from datetime import datetime, timedelta, timezone
import hashlib
import os
import time
import requests
from db.job_leases import JobLease, LeaseBusy, LeaseLost


def geocode(location):
    if os.getenv('ENABLE_GEOCODING', 'false').lower() != 'true':
        return None, None
    if not isinstance(location, str) or not location.strip() or location.lower().strip() in {'online', 'virtual', 'remote', 'tba', 'unknown'}:
        return None, None
    from db.mongo_client import get_collection
    cache = get_collection('geocode_cache')
    if cache is None:
        return None, None
    key = hashlib.sha256(location.strip().casefold().encode()).hexdigest()
    now = datetime.now(timezone.utc)
    try:
        with JobLease(cache.database.job_leases, name='nominatim', ttl=30) as lease:
            cached = cache.find_one({'_id': key, 'expires_at': {'$gt': now}})
            if cached:
                return cached.get('lat'), cached.get('lng')
            state = cache.find_one({'_id': 'provider-clock'}) or {}
            previous = state.get('at')
            if previous:
                previous = previous.replace(tzinfo=timezone.utc) if previous.tzinfo is None else previous
                delay = 1.1 - (now - previous).total_seconds()
                if delay > 0:
                    time.sleep(delay)
            cache.update_one({'_id': 'provider-clock'}, {'$set': {'at': datetime.now(timezone.utc)}}, upsert=True)
            response = requests.get('https://nominatim.openstreetmap.org/search', params={'q': location.strip(), 'format': 'json', 'limit': 1, 'addressdetails': 1},
                                    headers={'User-Agent': os.getenv('GEOCODER_USER_AGENT', 'HackathonNotifier/1.0'), 'Accept-Language': 'en'}, timeout=8)
            lat = lng = None
            if response.status_code == 200:
                results = response.json()
                if results:
                    lat, lng = float(results[0]['lat']), float(results[0]['lon'])
                    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
                        lat = lng = None
            lease.assert_owned()
            cache.update_one({'_id': key}, {'$set': {'lat': lat, 'lng': lng, 'precision': 'unknown', 'expires_at': datetime.now(timezone.utc) + (timedelta(days=30) if lat is not None else timedelta(minutes=15))}}, upsert=True)
            return lat, lng
    except (LeaseBusy, LeaseLost, requests.RequestException, ValueError, KeyError, TypeError):
        return None, None
