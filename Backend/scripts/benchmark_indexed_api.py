"""Local synthetic API-handler benchmark. Never accepts a non-loopback Mongo URI.

Requires a local replica set for change streams. Owns only a random benchmark database.
Each algorithm runs in a fresh Python process. Sequential throughput, not a load test.
"""
import argparse,importlib.util,json,os,platform,statistics,subprocess,sys,time,uuid
try:import resource
except ImportError:resource=None
from pathlib import Path
from urllib.parse import urlsplit
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from pymongo import MongoClient
from bson import ObjectId

CASES=[{}, {'format':'Online','source':'Devpost'},
       {'search':'synthetic','tab':'all'}, {'sort':'distance','lat':0.,'lng':0.}]
BASE='f93b226'


def connect(uri):
    parsed=urlsplit(uri)
    if parsed.hostname!='127.0.0.1' or parsed.port!=27028 or parsed.username:
        raise ValueError('Benchmark requires the task-owned loopback MongoDB port 27028')
    return MongoClient(uri,serverSelectionTimeoutMS=5000,socketTimeoutMS=120000)


def synthetic(size):
    for i in range(size):
        day=f'2099-01-{i%28+1:02d}'
        yield {'_id':ObjectId(f'{i+1:024x}'),'title':f'Synthetic Event {i:07d}',
            'organizer':f'Synthetic Laboratory{i}','source':'Devpost' if i%2 else 'Unstop',
            'source_event_id':str(i),'link':f'https://example.com/event/{i}',
            'mode':['Online','Offline','Hybrid'][i%3],'status':'Closed' if i%10==0 else 'Open',
            'deadline_kind':'registration','registration_deadline':{'date':day},'deadline_iso':day,
            'event_start':'2099-02-01','scraped_at':'2026-11-01T00:00:00Z',
            'is_top_college':i%3==0,'is_internship':i%5==0,'opportunity_type':'Hackathon',
            'tags':['Web','AI'],'location':'Pune','desc':'Synthetic benchmark opportunity only.',
            'lat':float(i%80),'lng':float(i%160),'prize':'INR 100','total_registrations':10}


def worker(args):
    import tracemalloc
    os.environ.update(MONGO_URI='',TELEGRAM_BOT_TOKEN='',TELEGRAM_CHAT_ID='',TRACK_VISITORS='false')
    client=connect(args.uri);assert args.database.startswith('benchmark_phase4_api_')
    col=client[args.database].events
    import api,catalog_query
    if args.worker=='build':
        print(json.dumps(catalog_query.publish(col)));return
    module=api
    if args.worker=='before':
        spec=importlib.util.spec_from_file_location('phase4_before',args.baseline_file)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    module.get_collection=lambda:col
    from starlette.requests import Request
    request=Request({'type':'http','headers':[]})
    def call(options):
        response=module.get_hackathons.__wrapped__(request=request,**options)
        if response.status_code!=200:raise RuntimeError(f'Handler failed: {response.status_code}')
        return json.loads(response.body)
    start=time.perf_counter();call({});cold=time.perf_counter()-start
    samples=[];checks=[]
    for repeat in range(args.repeats):
        for options in CASES:
            start=time.perf_counter();payload=call(options);elapsed=time.perf_counter()-start
            samples.append(elapsed)
            checks.append({'ids':[r['_id'] for r in payload['data']],
                'totals':[payload[k] for k in ['all_total','upcoming_total','missed_total']],
                'sources':payload['stats']['source_counts'],'prize':payload['stats']['total_prize_pool_inr']})
    tracemalloc.start();call({});_,peak=tracemalloc.get_traced_memory();tracemalloc.stop()
    ordered=sorted(samples)
    result={'samples_seconds':samples,'p50_ms':statistics.median(samples)*1000,
        'p95_ms':ordered[max(0,__import__('math').ceil(.95*len(ordered))-1)]*1000,
        'requests_per_second':len(samples)/sum(samples),'cold_seconds':cold,
        'request_python_peak_bytes':peak,'process_peak_rss_bytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024 if resource and sys.platform.startswith("linux") else None,
        'checks':checks}
    Path(args.worker_output).write_text(json.dumps(result))
    client.close()


def plans(col):
    import catalog_query
    manifest=col.database[catalog_query.META].find_one({'_id':catalog_query.manifest_id(col)})
    view=col.database[manifest['view']]
    cases={'deadline':{},'format_deadline':{'format':'Online'},'source_deadline':{'source':'Devpost'},
        'name':{'sort':'name'},'newest':{'sort':'newest'},'saved_ids':{'ids':str(ObjectId(f'{1:024x}'))}}
    report={}
    before=col.database.command('explain',{'find':col.name,'filter':{'publication_state':{'$nin':['suppressed','pending']}}},verbosity='executionStats')
    report['before_catalog_find']=before
    for name,options in cases.items():
        command={'find':view.name,'filter':catalog_query.predicate(options),'sort':dict(catalog_query.sort_spec(options)),'limit':12}
        report[name]=col.database.command('explain',command,verbosity='executionStats')
    return report


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--uri',default='mongodb://127.0.0.1:27028/?directConnection=true&replicaSet=phase4')
    parser.add_argument('--sizes',nargs='+',type=int,default=[1000,10000,100000])
    parser.add_argument('--repeats',type=int,default=3,help='Repeats of four sequential query modes')
    parser.add_argument('--output',type=Path,default=Path('benchmarks/indexed-api.json'))
    parser.add_argument('--baseline-file',type=Path)
    parser.add_argument('--worker',choices=['build','before','after'])
    parser.add_argument('--database');parser.add_argument('--worker-output')
    args=parser.parse_args()
    if args.worker:return worker(args)
    if any(n<1 or n>100000 for n in args.sizes) or not 1<=args.repeats<=10:parser.error('Invalid size/repeats')
    import tempfile
    with tempfile.TemporaryDirectory(prefix='phase4-benchmark-') as temp:
        baseline=args.baseline_file or Path(temp)/'baseline.py'
        if not args.baseline_file:
            baseline.write_bytes(subprocess.check_output(['git','show',BASE+':Backend/api.py']))
        client=connect(args.uri)
        report={'python':platform.python_version(),'platform':platform.platform(),'mongo_version':client.server_info()['version'],
            'baseline_commit':BASE,'repeats':args.repeats,'requests_per_sample_set':4*args.repeats,
            'method':'Sequential API handler calls incl Mongo roundtrips/serialization, excluding ASGI/HTTP transport. Fresh process per algorithm. Warm p50/p95 nearest rank, four query modes (default, source+format, fuzzy text, distance). Python tracemalloc peak for one warm default request, separate process peak RSS. RSS reported on Linux. No production or cloud load measured.', 'results':{}}
        try:
            for size in args.sizes:
                database='benchmark_phase4_api_'+uuid.uuid4().hex;col=client[database].events
                try:
                    batch=[]
                    for row in synthetic(size):
                        batch.append(row)
                        if len(batch)==500:col.insert_many(batch);batch=[]
                    if batch:col.insert_many(batch)
                    base=[sys.executable,str(Path(__file__).resolve()),'--uri',args.uri,'--database',database,'--baseline-file',str(baseline),'--repeats',str(args.repeats)]
                    subprocess.run([*base,'--worker','build'],stdout=subprocess.DEVNULL,check=True)
                    measured={}
                    for algorithm in ['before','after']:
                        output=Path(temp)/(algorithm+'.json')
                        subprocess.run([*base,'--worker',algorithm,'--worker-output',str(output)],stdout=subprocess.DEVNULL,check=True)
                        measured[algorithm]=json.loads(output.read_text())
                    assert measured['before'].pop('checks')==measured['after'].pop('checks'),'Handler semantic mismatch'
                    measured['plans']=plans(col)
                    report['results'][str(size)]=measured
                    args.output.parent.mkdir(exist_ok=True)
                    from bson import json_util
                    args.output.write_text(json_util.dumps(report,indent=2))
                    print(size,{a:{k:round(m[k],3) for k in ['p50_ms','p95_ms','requests_per_second']} for a,m in measured.items() if a!='plans'},flush=True)
                finally:client.drop_database(database)
        finally:client.close()
if __name__=='__main__':main()
