"""Offline fault-isolation benchmark; no source HTTP, MongoDB or Telegram calls."""
import argparse
import json
import multiprocessing
from pathlib import Path
import platform
import sys
import time
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from source_ingestion import CallableSourceAdapter, SourcePolicy, run_sources

ROW = {'title': 'Synthetic release source', 'source': 'Fixture', 'link': 'https://example.com/release'}


def healthy(): return [ROW]
def empty(): return []
def malformed(): return '<not a feed>'
def failed(): raise RuntimeError('Synthetic failure')
def timeout(): time.sleep(20); return []


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    outcomes = []
    for repeat in range(3):
        sources = [CallableSourceAdapter(key, key, fetch) for key, fetch in
                   [('healthy', healthy), ('empty', empty), ('malformed', malformed), ('failed', failed), ('timeout', timeout)]]
        policy = SourcePolicy(workers=2, timeout=1.5, budget=8, attempts=1, backoff=0, jitter=0)
        start = time.perf_counter()
        rows, reports = run_sources(sources, policy, context=multiprocessing.get_context('spawn'))
        elapsed = time.perf_counter() - start
        expected = {'healthy': 'ok', 'empty': 'zero_results', 'malformed': 'error', 'failed': 'error', 'timeout': 'timeout'}
        assert {key: value['status'] for key, value in reports.items()} == expected
        assert len(rows) == 1
        outcomes.append({'elapsed_seconds': elapsed, 'healthy_rows': len(rows), 'sources': reports})
    report = {'python': platform.python_version(), 'method': 'Three offline fixture runs; two spawned workers, 1.5s source timeout, 8s run budget. Not live-source availability.', 'runs': outcomes}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'runs': 3, 'all_expected_outcomes': True, 'elapsed_seconds': [r['elapsed_seconds'] for r in outcomes]}))


if __name__ == '__main__': main()
