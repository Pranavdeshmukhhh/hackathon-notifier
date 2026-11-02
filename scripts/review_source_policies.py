"""Read fixed public policy URLs only; no event scraping, login or source jobs."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import requests

URLS = [f'https://{host}/robots.txt' for host in ['devfolio.co', 'api.devfolio.co', 'unstop.com',
    'devpost.com', 'hackerearth.com', 'devnovate.co', 'www.instagram.com', 'www.google.com',
    'www.eventbrite.com', 'mlh.io', 'konfhub.com']]
URLS.append('https://operations.osmfoundation.org/policies/nominatim/')


def inspect(url):
    record = {'url': url, 'operator_permission': 'not_established'}
    try:
        with requests.get(url, headers={'User-Agent': 'HackathonNotifierReleaseReview/0.7 (policy review only)'},
                          timeout=8, allow_redirects=False, stream=True) as response:
            chunks = bytearray()
            for chunk in response.iter_content(4096):
                chunks.extend(chunk)
                if len(chunks) >= 16384: break
            data = bytes(chunks[:16384])
            record.update(status=response.status_code, inspected_bytes=len(data),
                          sha256=sha256(data).hexdigest(), truncated=len(chunks) >= 16384)
            if url.endswith('/robots.txt') and response.status_code == 200:
                record['directives'] = [line.strip() for line in data.decode('utf-8', errors='replace').splitlines()
                    if line.lower().startswith(('user-agent:', 'disallow:', 'crawl-delay:'))][:40]
    except requests.RequestException as error:
        record['error_class'] = type(error).__name__
    return record


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    with ThreadPoolExecutor(max_workers=2) as pool:
        records = list(pool.map(inspect, URLS))
    report = {'reviewed_at': datetime.now(timezone.utc).isoformat(), 'policy_fetch_only': True,
              'permission_not_inferred_from_robots': True, 'sources': records}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps([{'url': r['url'], 'status': r.get('status'), 'error': r.get('error_class')} for r in records]))
