"""Synthetic loopback-only migration/restore drill. Own databases are always removed."""
import argparse
from hashlib import sha256
import json
import os
from pathlib import Path
import sys
import tempfile
import uuid
from urllib.parse import urlsplit

os.environ['PYTHON_DOTENV_DISABLED'] = '1'
os.environ.update(MONGO_URI='', TELEGRAM_BOT_TOKEN='', TELEGRAM_CHAT_ID='', TRACK_VISITORS='false')
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bson import ObjectId, json_util
from pymongo import MongoClient
from catalog_query import publish, read_indexed
from entity_resolution import metadata, CandidateIndex, identity
from identity_backfill import backfill
from notifier.outbox import Outbox
from scripts.backup_database import export_database, restore_database


def facts(db):
    return {name: [json_util.dumps(row, sort_keys=True) for row in db[name].find().sort('_id', 1)]
            for name in sorted(db.list_collection_names())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--uri', default='mongodb://127.0.0.1:27028/?directConnection=true&replicaSet=phase4')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    parsed = urlsplit(args.uri)
    if parsed.hostname != '127.0.0.1' or parsed.port != 27028 or parsed.username:
        raise ValueError('Only the disposable loopback MongoDB on port 27028 is allowed')
    with MongoClient(args.uri, serverSelectionTimeoutMS=5000) as client:
        source = client['benchmark_phase7_migration_' + uuid.uuid4().hex]
        restored = client['phase0_restore_release_' + uuid.uuid4().hex]
        try:
            event = {'_id': ObjectId(), 'title': 'Synthetic migration fixture 2099',
                'organizer': 'Synthetic organizer', 'source': 'Fixture', 'source_event_id': 'one',
                'link': 'https://example.com/migration', 'mode': 'Online', 'notified': True,
                'notified_at': '2026-11-02T00:00:00Z', 'publication_state': 'published',
                'registration_deadline': {'date': '2099-01-01'}, 'deadline_kind': 'registration'}
            old = metadata(event); old['version'] = 1
            old.pop('urls', None); old.pop('source_ids', None)
            event['_identity_v1'] = old
            source.hackathons.insert_one(event)
            source.subscribers.insert_one({'chat_id': 'synthetic-recipient', 'is_active': True})
            queue = Outbox(source)
            queue.enqueue(event, ['synthetic-recipient'])
            before = facts(source)
            plan = backfill(source.hackathons)
            assert facts(source) == before and plan['planned'] == 1 and plan['modified'] == 0
            applied = backfill(source.hackathons, apply=True)
            assert applied['modified'] == 1
            migrated = source.hackathons.find_one()
            assert migrated['_id'] == event['_id'] and migrated['notified_at'] == event['notified_at'] and migrated['notified']
            assert {k: v for k, v in migrated.items() if k != '_identity_v1'} == {k: v for k, v in event.items() if k != '_identity_v1'}
            assert source.notification_outbox.count_documents({'state': 'pending'}) == 1
            assert backfill(source.hackathons, apply=True)['modified'] == 0
            # Previous resolver fallback can still index a migrated record; no rekey/downgrade.
            legacy = CandidateIndex([migrated]); assert legacy.candidates(identity(event))[0]
            published = publish(source.hackathons)
            assert read_indexed(source.hackathons, {'tab': 'all'})['all_total'] == 1
            with tempfile.TemporaryDirectory(prefix='phase7-synthetic-backup-') as temp:
                backup = Path(temp) / 'backup'
                export_database(source, backup)
                snapshot = facts(source)
                restore_database(restored, backup)
                assert facts(restored) == snapshot
                refused = False
                try: restore_database(source, backup)
                except ValueError: refused = True
                assert refused and facts(source) == snapshot
                refused = False
                try: restore_database(restored, backup)
                except ValueError: refused = True
                assert refused
            report = {'passed': True, 'read_only_plan': plan, 'applied': applied,
                'idempotent': True, 'ids_flags_receipts_preserved': True,
                'restore_documents_equal': True, 'nonempty_restore_refused': True,
                'published_records': published['records'],
                'source_snapshot_sha256': sha256(json.dumps(snapshot, sort_keys=True).encode()).hexdigest(),
                'production_access': False}
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(report, indent=2) + '\n')
            print(json.dumps(report))
        finally:
            client.drop_database(source.name); client.drop_database(restored.name)


if __name__ == '__main__': main()
