"""Start/stop the labeled disposable loopback Mongo fixture. Never reuse an existing container."""
import argparse
import json
import os
import subprocess
import time
from pymongo import MongoClient

NAME = 'release-ci-mongo'
IMAGE = 'mongo:8.0@sha256:b9924c330a8bbc5800fe9c69f04a84e221eca7b28fd049a0354147d9908fa142'
URI = 'mongodb://127.0.0.1:27028/?directConnection=true&replicaSet=phase4'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stop', action='store_true')
    args = parser.parse_args()
    docker = os.getenv('DOCKER_BIN', 'docker')
    if args.stop:
        result = subprocess.run([docker, 'inspect', NAME], capture_output=True, text=True)
        if result.returncode:
            raise SystemExit('No owned test fixture is running')
        info = json.loads(result.stdout)[0]
        if (info['Config'].get('Labels') or {}).get('hackathon.release-fixture') != 'true':
            raise SystemExit('Refusing to stop an unlabeled container')
        subprocess.run([docker, 'stop', NAME], check=True, capture_output=True)
        for attempt in range(30):
            if subprocess.run([docker, 'inspect', NAME], capture_output=True).returncode:
                break
            time.sleep(.1)
        else: raise SystemExit('Stopped fixture has not been removed yet')
        return
    subprocess.run([docker, 'run', '-d', '--rm', '--name', NAME,
        '--label', 'hackathon.release-fixture=true', '-p', '127.0.0.1:27028:27017', IMAGE,
        '--replSet', 'phase4', '--bind_ip_all', '--quiet'], check=True, capture_output=True)
    with MongoClient(URI.replace('&replicaSet=phase4', ''), serverSelectionTimeoutMS=1000) as client:
        for attempt in range(30):
            try:
                client.admin.command('ping')
                try: client.admin.command('replSetInitiate', {'_id': 'phase4', 'members': [{'_id': 0, 'host': '127.0.0.1:27017'}]})
                except Exception as error:
                    if getattr(error, 'code', None) != 23: raise
                break
            except Exception: time.sleep(1)
        else: raise SystemExit('Test Mongo initialization failed; stop the owned fixture')
        for attempt in range(30):
            if client.admin.command('hello').get('isWritablePrimary'): break
            time.sleep(1)
        else: raise SystemExit('Test Mongo primary did not become ready')
    print(URI)


if __name__ == '__main__': main()
