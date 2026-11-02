"""Small process-isolated source runner. No database or notification operations."""
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
import json
import logging
import multiprocessing
import os
import random
import re
import time
from typing import Callable, Protocol

from event_contract import adapt_observation


def utc():
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True)
class SourcePolicy:
    workers: int = 4
    timeout: float = 60
    budget: float = 240
    attempts: int = 2
    backoff: float = .5
    jitter: float = .25
    max_rows: int = 2000
    max_bytes: int = 8_000_000

    def __post_init__(self):
        import math
        if any(not isinstance(value,int) or isinstance(value,bool) for value in (self.workers,self.attempts,self.max_rows,self.max_bytes)):
            raise ValueError('Worker, attempt and payload limits must be integers')
        for key,value in asdict(self).items():
            if not isinstance(value,(int,float)) or not math.isfinite(value) or value < 0:
                raise ValueError(f'Invalid source policy: {key}')
        if not 1<=self.workers<=8 or not 1<=self.attempts<=4 or not 0<self.timeout<=300 or not 0<self.budget<=600:
            raise ValueError('Source worker/attempt/time limits exceeded')
        if self.backoff>5 or self.jitter>5:raise ValueError('Backoff and jitter must be <=5 seconds')
        if not 1<=self.max_rows<=5000 or not 1024<=self.max_bytes<=16_000_000:
            raise ValueError('Invalid source payload limits')

    @classmethod
    def environment(cls):
        return cls(workers=int(os.getenv('SOURCE_WORKERS','4')),
                   timeout=float(os.getenv('SOURCE_TIMEOUT_SECONDS','60')),
                   budget=float(os.getenv('SOURCE_BUDGET_SECONDS','240')),
                   attempts=int(os.getenv('SOURCE_ATTEMPTS','2')),
                   backoff=float(os.getenv('SOURCE_BACKOFF_SECONDS','.5')),
                   jitter=float(os.getenv('SOURCE_JITTER_SECONDS','.25')))


@dataclass
class SourceHealth:
    issues: list[str] = field(default_factory=list)
    rejected: int = 0


class SourceAdapter(Protocol):
    source_id: str
    name: str
    def fetch(self) -> object: ...
    def parse(self, payload: object) -> list[dict]: ...
    def health(self) -> SourceHealth: ...


class _Failures(logging.Handler):
    """Observe errors swallowed by legacy scrapers, without changing their API.

    Valid-empty warnings do not constitute failure. Never ship raw exception text
    (which can contain tokens or response bodies) in public scan telemetry.
    """
    def __init__(self, state):
        super().__init__(logging.WARNING);self.state=state
    def emit(self, record):
        if record.name.startswith('scrapers.') and (record.exc_info or
                re.search(r'fail|unexpected|error|structure may have changed|TLS block detected', record.getMessage(), re.I)):
            self.state.issues.append('http_429' if re.search(r'\b429\b',record.getMessage()) else 'legacy_source_error')


@dataclass
class CallableSourceAdapter:
    source_id: str
    name: str
    fetcher: Callable[[], object]
    _health: SourceHealth = field(default_factory=SourceHealth, init=False)

    def fetch(self):
        self._health=SourceHealth()
        handler=_Failures(self._health);root=logging.getLogger();root.addHandler(handler)
        try:return self.fetcher()
        finally:root.removeHandler(handler)

    def parse(self, payload):
        if not isinstance(payload,list):raise ValueError('Source must return a list')
        rows=[]
        for raw in payload:
            try:
                if isinstance(raw,dict) and not raw.get('source'):raw={**raw,'source':self.name}
                rows.append(adapt_observation(raw))
            except (ValueError,TypeError,AttributeError,OverflowError):self._health.rejected+=1
        if self._health.rejected:self._health.issues.append('malformed_records')
        return rows

    def health(self):return self._health


def _worker(adapter: SourceAdapter, policy: SourcePolicy, channel):
    """A whole source attempt/retry sequence runs inside one killable process."""
    result={'source_id':adapter.source_id,'found':0,'status':'error','error':None,
            'attempts':0,'rejected':0,'finished_at':None}
    best=[]
    try:
        for attempt in range(policy.attempts):
            result['attempts']=attempt+1
            try:
                payload=adapter.fetch()
                if isinstance(payload,list) and len(payload)>policy.max_rows:
                    raise ValueError('Source record limit exceeded')
                rows=adapter.parse(payload);health=adapter.health()
                if len(rows)>policy.max_rows:raise ValueError('Source record limit exceeded')
                result['rejected']=health.rejected
                if rows:best=rows
                if not health.issues:
                    result.update(status='ok' if rows else 'zero_results',error=None)
                    best=rows;break
                result['error']=','.join(sorted(set(health.issues)))
            except Exception as exc:
                # Stable safe diagnostics; HTTP status is useful without leaking URLs.
                code=getattr(getattr(exc,'response',None),'status_code',None)
                result['error']=f'http_{code}' if isinstance(code,int) else type(exc).__name__
            if attempt+1<policy.attempts:
                time.sleep(min(5,policy.backoff*2**attempt)+random.uniform(0,policy.jitter))
        else:result['status']='partial' if best else 'error'
        result.update(found=len(best),finished_at=utc())
        wire=json.dumps({'rows':best,'outcome':result},allow_nan=False).encode()
        if len(wire)>policy.max_bytes:raise ValueError('Source byte limit exceeded')
        channel.send_bytes(wire)
    except Exception:
        result.update(found=0,status='error',error='source_payload_error',finished_at=utc())
        try:channel.send_bytes(json.dumps({'rows':[],'outcome':result}).encode())
        except (OSError,EOFError):pass
    finally:channel.close()


def run_sources(adapters: list[SourceAdapter], policy=None, *, cancel=None, context=None):
    policy=policy or SourcePolicy.environment()
    if any(not re.fullmatch(r'[a-z][a-z0-9_]{0,63}',a.source_id) for a in adapters):raise ValueError('Invalid stable source ID')
    if len({a.source_id for a in adapters})!=len(adapters) or len({a.name for a in adapters})!=len(adapters):
        raise ValueError('Source IDs and names must be unique')
    context=context or multiprocessing.get_context('spawn')
    pending=list(adapters);active={};completed={};deadline=time.monotonic()+policy.budget
    def stop(process):
        if process.is_alive():process.terminate()
        process.join(timeout=.5)
        if process.is_alive():process.kill();process.join(timeout=.5)
        process.close()
    def failed(adapter,status):
        completed[adapter.source_id]={'rows':[],'outcome':{'source_id':adapter.source_id,
            'status':status,'found':0,'error':status,'attempts':None,'rejected':0,'finished_at':utc()}}
    try:
        while pending or active:
            cancelled=cancel is not None and cancel.is_set()
            expired=time.monotonic()>=deadline
            if cancelled or expired:
                for adapter in pending:failed(adapter,'cancelled' if cancelled else 'timeout')
                pending=[]
                for process,channel,adapter,started in active.values():
                    stop(process);channel.close();failed(adapter,'cancelled' if cancelled else 'timeout')
                active.clear();break
            while pending and len(active)<policy.workers:
                adapter=pending.pop(0);reader,writer=context.Pipe(duplex=False)
                process=context.Process(target=_worker,args=(adapter,policy,writer),daemon=True,name=f'source-{adapter.source_id}')
                try:process.start()
                except Exception:
                    reader.close();writer.close();failed(adapter,'error');continue
                writer.close();active[adapter.source_id]=(process,reader,adapter,time.monotonic())
            for key,(process,channel,adapter,started) in list(active.items()):
                if channel.poll():
                    try:completed[key]=json.loads(channel.recv_bytes(policy.max_bytes))
                    except (OSError,EOFError,ValueError):failed(adapter,'error')
                    stop(process);channel.close();del active[key]
                elif time.monotonic()-started>=policy.timeout:
                    stop(process);channel.close();failed(adapter,'timeout');del active[key]
                elif not process.is_alive():
                    stop(process);channel.close();failed(adapter,'error');del active[key]
            if active:time.sleep(.01)
    finally:
        for process,channel,_,_ in active.values():stop(process);channel.close()
    rows=[];outcomes={}
    for adapter in adapters: # stable ordering, independent of completion order
        item=completed[adapter.source_id];rows.extend(item['rows']);outcomes[adapter.name]=item['outcome']
    return rows,outcomes


def source_freshness(outcomes, history, *, now=None, stale_after=86400):
    """A successful empty fetch refreshes health. Missing history remains unknown."""
    from event_contract import stamp
    now=now or datetime.now(timezone.utc)
    for name,outcome in outcomes.items():
        last=now.isoformat() if outcome['status'] in {'ok','zero_results'} else None
        if last is None:
            for run in history:
                records=run.get('sources',{})
                prior=records.get(name,{})
                if outcome.get('source_id'):
                    prior=next((item for item in records.values() if item.get('source_id')==outcome['source_id']),prior)
                    if prior.get('source_id') not in {None,outcome['source_id']}:prior={}
                last=stamp(prior.get('last_success_at'))
                if not last and prior.get('status') in {'ok','zero_results'}:last=stamp(run.get('run_at'))
                if last:break
        if last and datetime.fromisoformat(last)>now:last=None
        outcome['last_success_at']=last
        outcome['stale']=None if last is None else (now-datetime.fromisoformat(last)).total_seconds()>stale_after
