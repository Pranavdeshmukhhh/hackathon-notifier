"""Read-only inventory for operators before adoption. Never backfills, merges or deletes rows."""
import argparse
import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from event_contract import canonical_event,duplicate_key,safe_url


def audit(collection):
    urls={};editions={};duplicates=[];total=unknown_dates=unverified=0
    for row in collection.find({}):
        event=canonical_event(row)
        total+=1;unknown_dates+=event['registration_closes']['precision']=='unknown'
        unverified+=event['verification']['status']=='unverified'
        for groups,key in ((urls,safe_url(row.get('link'))),(editions,duplicate_key(row))):
            if key:
                if key in groups:duplicates.append({'kept_id':groups[key],'related_id':str(row['_id'])})
                else:groups[key]=str(row['_id'])
    return {'records':total,'unknown_registration_dates':unknown_dates,'unverified':unverified,'duplicate_candidates':duplicates,
            'writes':0,'policy':'Read adapters preserve IDs and history. Review candidate duplicates before manual reconciliation.'}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    import os
    from pymongo import MongoClient
    uri=os.getenv('MONGO_URI')
    if not uri:raise SystemExit('MONGO_URI is required; no database was contacted')
    client=MongoClient(uri,serverSelectionTimeoutMS=5000)
    col=client['hackathon_tracker']['hackathons']
    print(json.dumps(audit(col),indent=2))
