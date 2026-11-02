"""Offline synthetic evaluation. No database, credentials, network or production scan.

Usage: python Backend/scripts/benchmark_entity_resolution.py --sizes 200 1000 --repeats 3
Memory is tracemalloc's Python allocation peak, not whole-process RSS/native memory.
The two baselines and resolver share normalization for a controlled comparison.
"""
import argparse
from collections import Counter
from datetime import date, timedelta
import gc
from hashlib import sha256
import json
from pathlib import Path
import platform
from statistics import median
import sys
from time import perf_counter
import tracemalloc

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import rapidfuzz
from entity_resolution import CandidateIndex, compare, identity, resolve
from event_contract import duplicate_key

FIXTURES=Path(__file__).resolve().parents[1]/'tests/fixtures/entity_resolution.json'


def baseline_match(left, right, legacy=False):
    exact=bool(left.urls & right.urls or left.source_ids & right.source_ids)
    if legacy:
        # The previous repository guarded distant annual dates only when source
        # IDs differed. Same-ID annual reuse and title-only years escaped it.
        if left.day and right.day and left.day[:4]!=right.day[:4] and abs((date.fromisoformat(left.day)-date.fromisoformat(right.day)).days)>180 and not left.source_ids & right.source_ids:
            return False
    return exact


def metrics(labels, predictions):
    tp=sum(truth and pred for truth,pred in zip(labels,predictions))
    fp=sum(not truth and pred for truth,pred in zip(labels,predictions))
    fn=sum(truth and not pred for truth,pred in zip(labels,predictions))
    negatives=sum(not label for label in labels)
    precision=tp/(tp+fp) if tp+fp else 0
    recall=tp/(tp+fn) if tp+fn else 0
    return {'precision':precision,'recall':recall,'f1':2*precision*recall/(precision+recall) if precision+recall else 0,
            'false_merge_rate':fp/negatives if negatives else 0,'tp':tp,'fp':fp,'fn':fn,'negative_pairs':negatives}


def evaluate(cases, algorithm):
    predictions=[];outcomes=Counter();cross_year_false_merges=0;blocked=0
    for case in cases:
        left,right=identity({**case['left'],'_id':'left'}),identity(case['right'])
        if algorithm=='resolver_v1':
            index=CandidateIndex([{**case['left'],'_id':'left'}])
            candidates,overflow=index.candidates(right)
            _,decision=resolve(right,candidates,overflow=overflow)
            matched=decision.outcome=='MATCH';outcomes[decision.outcome]+=1
            blocked+=bool(candidates)
        else:
            legacy=algorithm=='legacy_exact_edition'
            matched=baseline_match(left,right,legacy)
            if legacy and not matched and duplicate_key(case['left']) and duplicate_key(case['left'])==duplicate_key(case['right']):
                matched=True
            outcomes['MATCH' if matched else 'DISTINCT']+=1
        predictions.append(matched)
        if matched and not case['same_entity'] and left.years and right.years and left.years.isdisjoint(right.years):
            cross_year_false_merges+=1
    return {**metrics([case['same_entity'] for case in cases],predictions),
            'outcomes':dict(outcomes),'cross_year_false_merges':cross_year_false_merges,
            'candidate_pairs':blocked if algorithm=='resolver_v1' else None}


class ExactIndex:
    def __init__(self, rows, legacy=False):
        self.legacy=legacy;self.urls={};self.sources={};self.editions={}
        for row in rows:
            profile=identity(row)
            for url in profile.urls:self.urls[url]=profile
            for key in profile.source_ids:self.sources[key]=profile
            if legacy and (key:=duplicate_key(row)):self.editions[key]=profile

    def lookup(self, raw):
        profile=identity(raw)
        candidates={candidate.id:candidate for url in profile.urls if (candidate:=self.urls.get(url))}
        candidates.update({candidate.id:candidate for key in profile.source_ids if (candidate:=self.sources.get(key))})
        for key in sorted(candidates):
            if baseline_match(profile,candidates[key],self.legacy):return key,1
        if self.legacy and (key:=duplicate_key(raw)) and key in self.editions:
            return self.editions[key].id,1
        return None,0


def workload(size):
    """Independent synthetic entities with known one-to-one query variants."""
    rows=[];queries=[]
    for i in range(size):
        start=(date(2027,1,1)+timedelta(days=i%180)).isoformat()
        row={'_id':str(i),'title':f'Synthetic Signal{i} Constellation 2027',
             'organizer':f'Synthetic Laboratory{i}', 'source':'Fixture A', 'source_event_id':str(i),
             'event_start':start,'mode':'Online','link':f'https://example.com/event/{i}'}
        rows.append(row)
        queries.append({**row,'title':row['title'].replace('Signal','Signla'),
                        'source':'Fixture B','source_event_id':f'mirror-{i}',
                        'link':f'https://mirror.example/event/{i}'})
    return rows,queries


def measure(rows, queries, algorithm, repeats):
    measurements=[];correct=compared=0
    for _ in range(repeats):
        gc.collect();tracemalloc.start();start=perf_counter()
        index=CandidateIndex(rows) if algorithm=='resolver_v1' else ExactIndex(rows,legacy=algorithm=='legacy_exact_edition')
        built=perf_counter();correct=compared=0
        for expected,query in enumerate(queries):
            if algorithm=='resolver_v1':
                profile=identity(query);candidates,overflow=index.candidates(profile)
                target,decision=resolve(profile,candidates,overflow=overflow)
                matched=target if decision.outcome=='MATCH' else None
                compared+=len(candidates)
            else:
                matched,count=index.lookup(query);compared+=count
            correct+=matched==str(expected)
        elapsed=perf_counter()-start;_,peak=tracemalloc.get_traced_memory();tracemalloc.stop()
        measurements.append((built-start,elapsed,peak));del index
    return {'build_seconds_median':median(x[0] for x in measurements),
            'total_seconds_median':median(x[1] for x in measurements),
            'python_peak_bytes_median':median(x[2] for x in measurements),
            'correct_matches':correct,'queries':len(queries),'candidate_comparisons':compared,
            'runs':[{'build_seconds':x[0],'total_seconds':x[1],'python_peak_bytes':x[2]} for x in measurements]}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sizes',type=int,nargs='+',default=[200,1000])
    parser.add_argument('--repeats',type=int,default=3)
    parser.add_argument('--output',type=Path)
    args=parser.parse_args()
    if not 1<=args.repeats<=10 or any(not 1<=size<=20000 for size in args.sizes):parser.error('sizes must be 1..20000; repeats 1..10')
    payload=FIXTURES.read_bytes();cases=json.loads(payload)['cases']
    algorithms=['exact_ids','legacy_exact_edition','resolver_v1']
    report={'python':platform.python_version(),'platform':platform.platform(),'rapidfuzz':rapidfuzz.__version__,
            'resolver_sha256':sha256((Path(__file__).resolve().parents[1]/'entity_resolution.py').read_bytes()).hexdigest(),
            'fixture_sha256':sha256(payload).hexdigest(),'fixture_pairs':len(cases),'repeats':args.repeats,
            'method':'Synthetic labels only. REVIEW counts as a non-match. False-merge rate=FP/negative pairs. Memory=tracemalloc Python peak; timings include shared normalization, index build and query work, with tracing enabled. No MongoDB, network or production traffic measured.',
            'quality':{algorithm:evaluate(cases,algorithm) for algorithm in algorithms},'workloads':{}}
    for size in args.sizes:
        rows,queries=workload(size)
        report['workloads'][str(size)]={algorithm:measure(rows,queries,algorithm,args.repeats) for algorithm in algorithms}
    output=json.dumps(report,indent=2)+'\n'
    if args.output:args.output.write_text(output)
    print(output)

if __name__=='__main__':main()
