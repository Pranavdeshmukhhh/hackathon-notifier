"""Enforce measured runtime coverage floors; missing files fail closed."""
import argparse
import json
from pathlib import Path

CRITICAL = ['Backend/security.py', 'Backend/safe_http.py', 'Backend/catalog_query.py',
            'Backend/source_ingestion.py', 'Backend/notifier/outbox.py']


def check(path):
    report = json.loads(Path(path).read_text())
    failures = []
    if report['totals']['percent_covered'] < 62:
        failures.append('Backend combined line/branch coverage below 62%')
    for target in CRITICAL:
        matches = [value for name, value in report['files'].items()
                   if name.replace('\\', '/') == target or name.replace('\\', '/').endswith('/' + target)]
        if len(matches) != 1 or matches[0]['summary']['percent_covered'] < 85:
            failures.append(f'{target}: missing or below 85% combined coverage')
    return failures


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('report', type=Path)
    failures = check(parser.parse_args().report)
    print('\n'.join(failures) if failures else 'Backend coverage gates passed')
    raise SystemExit(bool(failures))
