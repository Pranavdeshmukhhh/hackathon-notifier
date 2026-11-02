"""Reproduce the 10k-row, loopback-only identity-backfill explain experiment.

Owns and drops a random synthetic database; never reads MONGO_URI or user records.
Run from the repository root against the same local replica set as the API benchmark.
"""
import sys,json,time,hashlib,uuid
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scripts.benchmark_indexed_api import connect,synthetic
from identity_backfill import backfill
from entity_resolution import PROJECTION
from bson import json_util


def main():
    client=connect('mongodb://127.0.0.1:27028/?directConnection=true&replicaSet=phase4')
    db=client['benchmark_phase4_backfill_'+uuid.uuid4().hex];col=db.events
    try:
     batch=[]
     for row in synthetic(10000):
      batch.append(row)
      if len(batch)==200:col.insert_many(batch);batch=[]
     def digest():
      h=hashlib.sha256()
      for row in col.find({}, {'_identity_v1':0}).sort('_id',1).batch_size(200):h.update(json_util.dumps(row,sort_keys=True).encode())
      return h.hexdigest()
     before_hash=digest()
     command={'find':col.name,'filter':{'_identity_v1.version':{'$ne':2}},'projection':PROJECTION}
     before=db.command('explain',command,verbosity='executionStats')
     start=time.perf_counter();applied=backfill(col,apply=True);elapsed=time.perf_counter()-start
     after=db.command('explain',command,verbosity='executionStats')
     plans={'legacy_probe_before':before,'legacy_probe_after':after}
     for key,predicate in [('urls',{'_identity_v1.urls':'https://example.com/event/1'}),('source_ids',{'_identity_v1.source_ids':__import__('entity_resolution').digest('devpost|1')})]:
      plans[key]=db.command('explain',{'find':col.name,'filter':predicate,'limit':1},verbosity='executionStats')
     report={'records':10000,'result':applied,'apply_seconds':elapsed,'source_facts_unchanged':before_hash==digest(),'plans':plans}
     open('benchmarks/identity-backfill-plan.json','w').write(json_util.dumps(report,indent=2)+'\n')
     print(applied,elapsed,report['source_facts_unchanged'])
     for key,plan in plans.items():print(key,plan['executionStats']['totalDocsExamined'],plan['executionStats']['totalKeysExamined'])
    finally:client.drop_database(db.name);client.close()

if __name__=="__main__":main()
