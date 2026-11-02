"""Scan tracked working files with pinned OSS Gitleaks; never archive ignored user data."""
import argparse
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[1]
IMAGE = 'zricethezav/gitleaks:v8.24.3@sha256:e1b35e12a8c6fa8901f060459cfb6b2fc4c484d3afbe3b029733a3bbfab07055'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    docker = os.getenv('DOCKER_BIN', 'docker')
    names = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    data = io.BytesIO()
    with tarfile.open(fileobj=data, mode='w') as archive:
        for name in filter(None, names):
            path = ROOT / name
            if path.is_file(): archive.add(path, arcname=name, recursive=False)
    container = 'phase7-secrets-' + uuid.uuid4().hex
    try:
        result = subprocess.run([docker, 'run', '--name', container, '-i', '--entrypoint', 'sh', IMAGE,
            '-c', 'mkdir /scan && tar xf - -C /scan && gitleaks dir /scan --redact=100 --no-banner --report-format=json --report-path=/tmp/findings.json'],
            input=data.getvalue(), capture_output=True)
        with tempfile.TemporaryDirectory(prefix='phase7-redacted-') as temp:
            path = Path(temp) / 'findings.json'
            subprocess.run([docker, 'cp', container + ':/tmp/findings.json', str(path)], check=True, capture_output=True)
            raw = json.loads(path.read_text())
            findings = [{key: item[key] for key in ['RuleID', 'File', 'StartLine']} for item in raw]
        report = {'passed': result.returncode == 0 and not findings,
                  'tool': IMAGE, 'scope': 'tracked working files; no git history or ignored/private files',
                  'findings': findings}
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps(report))
        raise SystemExit(0 if report['passed'] else 1)
    finally:
        subprocess.run([docker, 'rm', '-f', container], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


if __name__ == '__main__': main()
