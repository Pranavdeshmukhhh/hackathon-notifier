"""Prove Docker ignores synthetic secret files; never read an actual .env file.

Requires local Docker. Creates, exports and removes only its own scratch image and
never executes a container. Override DOCKER_BIN with a CLI wrapper if needed.
"""
from pathlib import Path
import argparse
import io
import json
import os
import subprocess
import tarfile
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[1]
SECRET_FIXTURES = ['.env', '.env.production', 'Backend/.env', 'Backend/.env.production',
                   'Backend/private/service.key', 'Backend/private/service.pem']
SAFE_FIXTURES = ['safe.txt', '.env.example', 'Backend/.env.example']


def check():
    # The managed environment can provide a local-socket wrapper; CI uses docker.
    docker = os.getenv('DOCKER_BIN', 'docker')
    tag = 'hackathon-context-check:' + uuid.uuid4().hex
    container = None
    def run(*args, **kwargs):
        return subprocess.run([docker, *args], check=True, capture_output=True, **kwargs)
    try:
        with tempfile.TemporaryDirectory(prefix='phase7-context-') as temp:
            root = Path(temp)
            (root / '.dockerignore').write_bytes((ROOT / '.dockerignore').read_bytes())
            (root / 'Dockerfile').write_text('FROM scratch\nCOPY . /snapshot/\nCMD ["/never-executed"]\n')
            for name in SECRET_FIXTURES + SAFE_FIXTURES:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('SYNTHETIC_RELEASE_FIXTURE\n')
            run('build', '--quiet', '-t', tag, str(root))
            container = run('create', tag).stdout.decode().strip()
            exported = run('export', container).stdout
            with tarfile.open(fileobj=io.BytesIO(exported)) as archive:
                names = {entry.name.removeprefix('./') for entry in archive.getmembers()}
            leaked = [name for name in SECRET_FIXTURES if 'snapshot/' + name in names]
            missing = [name for name in SAFE_FIXTURES if 'snapshot/' + name not in names]
            result = {'passed': not leaked and not missing, 'leaked_synthetic_paths': leaked,
                      'missing_examples': missing, 'private_files_read': False}
            return result
    finally:
        if container:
            subprocess.run([docker, 'rm', container], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run([docker, 'image', 'rm', '-f', tag], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    result = check()
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))
    raise SystemExit(0 if result['passed'] else 1)


if __name__ == '__main__':
    main()
