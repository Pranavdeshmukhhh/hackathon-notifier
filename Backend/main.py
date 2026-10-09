"""Compatibility CLI for the canonical scan coordinator."""
import argparse
import sys


def run_pipeline(dry_run=False):
    from run_scan import execute_scan
    summary = execute_scan(dry_run=dry_run)
    if not summary.get('success'):
        raise RuntimeError('Scan failed')
    return int(summary.get('notified', 0))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    try:
        run_pipeline(args.dry_run)
        return 0
    except Exception:
        return 1


if __name__ == '__main__':
    sys.exit(main())
