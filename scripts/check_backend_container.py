"""Dynamic-port, non-root, 512MiB smoke test against an owned disposable Mongo container."""
import argparse
import json
import os
import subprocess
import time
import uuid
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image', required=True)
    parser.add_argument('--mongo-container', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if not args.mongo_container.startswith(('hackathon-phase7-', 'release-ci-')):
        raise ValueError('Only an explicitly owned release test Mongo container is allowed')
    docker = os.getenv('DOCKER_BIN', 'docker')
    name = 'release-ci-api-' + uuid.uuid4().hex
    def run(*values):
        return subprocess.run([docker, *values], check=True, capture_output=True, text=True)
    try:
        run('run', '-d', '--rm', '--name', name, '--network', 'container:' + args.mongo_container,
            '--memory=512m', '--cpus=1', '-e', 'PORT=10001', '-e', 'ENVIRONMENT=production',
            '-e', 'MONGO_URI=mongodb://127.0.0.1:27017/?directConnection=true&replicaSet=phase4',
            '-e', 'ENABLE_BACKGROUND_SCANNER=false', '-e', 'TRACK_VISITORS=false', args.image)
        probe = "import requests; s=requests.Session(); s.trust_env=False; s.get('http://127.0.0.1:10001/health',timeout=2).raise_for_status()"
        for attempt in range(30):
            try: run('exec', name, 'python', '-c', probe); break
            except subprocess.CalledProcessError: time.sleep(1)
        else: raise RuntimeError('Test API did not become healthy')
        info = json.loads(run('inspect', name).stdout)[0]
        health = info['Config']['Healthcheck']['Test']
        assert health[0] == 'CMD-SHELL'
        run('exec', name, 'sh', '-c', health[1])
        checks = """import os,requests
session=requests.Session(); session.trust_env=False
assert os.getuid()!=0
root='http://127.0.0.1:10001'
assert session.get(root+'/docs',timeout=2).status_code==404
assert session.post(root+'/api/refresh',timeout=2).status_code==403
response=session.get(root+'/api/hackathons?limit=1',timeout=2)
assert response.status_code==200 and response.json()['success'] is True
assert os.getenv('TELEGRAM_BOT_TOKEN','')==''
"""
        run('exec', name, 'python', '-c', checks)
        report = {'passed': True, 'dynamic_port': 10001, 'memory_limit_bytes': info['HostConfig']['Memory'],
                  'nonroot': True, 'production_docs_disabled': True, 'missing_admin_secret_denied': True,
                  'scope': 'Empty synthetic test database; not cloud capacity or availability evidence'}
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps(report))
    finally:
        subprocess.run([docker, 'rm', '-f', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


if __name__ == '__main__': main()
