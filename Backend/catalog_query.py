"""Versioned canonical read model. Ordinary queries never build a catalog in RAM.

Publication is an explicit operator task. A source change stream validates each
request; unsupported topology, expiry or mutation fails closed to bounded legacy
compatibility. Fuzzy search streams sorted candidates with bounded client batches.
"""
from collections import OrderedDict
from datetime import datetime,timedelta,timezone
from threading import RLock
import re
import uuid

LEGACY_LIMIT=2000
META='_catalog_manifests'
PREFIX='_public_catalog_'
BATCH=32
_tokens=OrderedDict()
_lock=RLock()

class CatalogUnavailable(RuntimeError):pass
class SourceChanged(CatalogUnavailable):pass


def manifest_id(source):return 'v1:'+source.name


def checkpoint(source,token=None):
    """Return a clean majority-committed source watermark or refuse the snapshot."""
    hello=source.database.client.admin.command('hello')
    last=hello.get('lastWrite',{})
    latest=last.get('opTime',{}).get('ts');majority=last.get('majorityOpTime',{}).get('ts')
    if latest is None or majority is None or latest != majority:
        raise CatalogUnavailable('Source writes are not majority committed')
    options={'max_await_time_ms':1,'batch_size':1}
    if token:options['resume_after']=token
    with source.watch([{'$match':{'operationType':{'$in':['insert','update','replace','delete','drop','rename','invalidate']}}}],**options) as stream:
        if stream.try_next() is not None:raise SourceChanged('Source changed; rebuild required')
        if not stream.resume_token:raise CatalogUnavailable('No reliable source watermark')
        return stream.resume_token


def _valid(source,manifest):
    if datetime.now(timezone.utc)>=manifest['valid_until'].replace(tzinfo=timezone.utc):
        raise CatalogUnavailable('Read model time boundary reached')
    key=(source.full_name,manifest['generation'])
    with _lock:token=_tokens.get(key,manifest['source_token'])
    if token is False:raise CatalogUnavailable('Read model invalidated')
    try:new=checkpoint(source,token)
    except SourceChanged:
        with _lock:
            _tokens[key]=False
            while len(_tokens)>8:_tokens.popitem(last=False)
        raise
    with _lock:
        _tokens[key]=new;_tokens.move_to_end(key)
        while len(_tokens)>8:_tokens.popitem(last=False)


def catalog_expiry(docs,now):
    from event_contract import zone_info
    result=datetime.combine(now.date()+timedelta(days=1),datetime.min.time(),tzinfo=timezone.utc)
    for doc in docs:
        canonical=doc.get('canonical',{})
        for key in ['registration_opens','registration_closes','submission_closes','event_starts','event_ends']:
            value=canonical.get(key,{})
            if value.get('at'):
                instant=datetime.fromisoformat(value['at'])
                if instant>now:result=min(result,instant)
            if value.get('precision')=='date':
                _,zone=zone_info(value.get('timezone'))
                if zone:
                    local=now.astimezone(zone)
                    boundary=datetime.combine(local.date()+timedelta(days=1),datetime.min.time(),tzinfo=zone).astimezone(timezone.utc)
                    result=min(result,boundary)
        seen=canonical.get('freshness',{}).get('last_seen_at')
        if seen:
            observed=datetime.fromisoformat(seen)
            instant=observed if observed>now else observed+timedelta(days=14)
            if instant>now:result=min(result,instant)
    return result


def raw_expiry(rows,now):
    from event_contract import stamp
    result=datetime.combine(now.date()+timedelta(days=1),datetime.min.time(),tzinfo=timezone.utc)
    for row in rows:
        for key in ['scraped_at','last_seen_at','last_successful_verification_at','coordinates_verified_at']:
            value=row.get(key)
            if key in {'scraped_at','last_seen_at'} and isinstance(value,datetime) and value.tzinfo is None:
                value=value.replace(tzinfo=timezone.utc)
            if (known:=stamp(value)) and (instant:=datetime.fromisoformat(known))>now:
                result=min(result,instant)
    return result


def row_for(doc,rank):
    import api
    past,missing,deadline=api._deadline_sort_key(doc)
    corpus=api._build_document_search_corpus(doc)
    fmt=next((value for value in ['Online','Offline','Hybrid','Unknown'] if api._matches_format(doc,value)),None)
    return {'_id':str(doc['_id']),'payload':doc,'q':{
        'past':past,'missing':missing,'deadline':deadline,'rank':rank,
        'format':fmt,'status':api._registration_status(doc),
        'ids':[str(doc['_id']),*doc.get('canonical',{}).get('aliases',[])],
        'sources':sorted({str(item.get('platform') or '').lower() for item in doc.get('canonical',{}).get('provenance',[])}),
        'primary_source':str(doc.get('source') or '').lower(),'raw_mode':str(doc.get('mode') or '').lower(),
        'tags':[str(tag).lower() for tag in doc.get('tags',[])],
        'top':bool(doc.get('is_top_college')),'internship':bool(doc.get('is_internship')),
        'opportunity':doc.get('opportunity_type'),'unique':doc.get('source')=='Unique Sources',
        'name':str(doc.get('title') or '').lower(),'scraped':str(doc.get('scraped_at') or ''),
        'day':doc.get('deadline_iso'),
        'latitude':doc.get('lat'),'longitude':doc.get('lng'),
        'raw_search':corpus[0],'normal_search':corpus[1],'words':sorted(corpus[2])}}


def publish(source):
    """Explicit build, not a request handler. Source rows/IDs are never modified."""
    import api
    from event_contract import coalesce_catalog
    from public_events import public_event
    now=datetime.now(timezone.utc);token=checkpoint(source)
    manifests=source.database[META];previous=manifests.find_one({'_id':manifest_id(source)})
    generation=uuid.uuid4().hex;name=PREFIX+generation;view=source.database[name]
    activated=False
    try:
        public=[];raw_boundary=raw_expiry([],now)
        for raw in source.find({'publication_state':{'$nin':['suppressed','pending']}},api._EVENT_PROJECTION).batch_size(BATCH):
            raw_boundary=min(raw_boundary,raw_expiry([raw],now))
            public.append(public_event(raw))
        docs=api._sort_hackathons(coalesce_catalog(public))
        expiry=min(catalog_expiry(docs,now),raw_boundary)
        batch=[]
        for rank,doc in enumerate(docs):
            batch.append(row_for(doc,rank))
            if len(batch)==200:view.insert_many(batch);batch=[]
        if batch:view.insert_many(batch)
        if not docs:source.database.create_collection(name)
        ensure_indexes(view)
        token=checkpoint(source,token)
        if datetime.now(timezone.utc)>=expiry:raise CatalogUnavailable('Build crossed a time boundary')
        manifest={'_id':manifest_id(source),'generation':generation,'view':name,'source_token':token,
            'valid_until':expiry,'stats':api._catalog_stats(docs),'count':len(docs),
            'previous':([previous['view']] if previous else [])}
        if previous:
            result=manifests.replace_one({'_id':manifest_id(source),'generation':previous['generation']},manifest)
            if not result.matched_count:raise CatalogUnavailable('Concurrent publisher won')
        else:manifests.insert_one(manifest)
        activated=True
        # Retain one previous view. In-flight requests validate the generation again.
        for retired in previous.get('previous',[]) if previous else []:
            if re.fullmatch(PREFIX+r'[0-9a-f]{32}',retired):source.database.drop_collection(retired)
        return {'generation':generation,'records':len(docs),'valid_until':expiry.isoformat()}
    finally:
        if not activated:source.database.drop_collection(name)


def ensure_indexes(view):
    suffix=[('q.past',1),('q.missing',1),('q.deadline',1),('q.rank',1)]
    view.create_index(suffix,name='deadline')
    view.create_index([('q.format',1),*suffix],name='format_deadline')
    view.create_index([('q.sources',1),*suffix],name='source_deadline')
    view.create_index([('q.name',1),('q.rank',1)],name='name')
    view.create_index([('q.scraped',-1),('q.rank',1)],name='newest')
    view.create_index('q.ids',name='saved_ids')


def predicate(options):
    terms=[]
    def put(key,value):terms.append({key:value})
    if options.get('ids') is not None:put('q.ids',{'$in':options['ids'].split(',')[:200]})
    status=options.get('status','all')
    if status=='open_all':put('q.past',False)
    elif status!='all':put('q.status',status)
    source=options.get('source')
    if source and source!='All':put('q.sources',source.lower())
    category=options.get('category','All')
    if category=='Top College':put('q.top',True)
    elif category=='Internship':put('q.internship',True)
    elif category=='Hackathon':put('q.opportunity','Hackathon')
    elif category in {'Online','Offline'}:put('q.format',category)
    elif category=='Unique Sources':put('q.unique',True)
    elif category in ['Devfolio','Unstop','Devpost','HackerEarth','Devnovate']:put('q.sources',category.lower())
    elif category!='All':terms.append({'$or':[{'q.primary_source':category.lower()},{'q.raw_mode':category.lower()},{'q.tags':{'$regex':re.escape(category.lower())}}]})
    if options.get('format','All')!='All':put('q.format',options['format'])
    days=options.get('deadline_days')
    if days is not None:
        today=datetime.now(timezone.utc).date()
        put('q.past',False);put('q.day',{'$gte':today.isoformat(),'$lte':(today+timedelta(days=days)).isoformat()})
    return {'$and':terms} if terms else {}


def sort_spec(options,geo=False):
    before=[('q.past',1),('distance',1),('q.rank',1)] if geo else [('q.rank',1)]
    mode=options.get('sort','deadline')
    if mode=='deadline':return [('q.past',1),('q.missing',1),('q.deadline',1),*[(key,direction) for key,direction in before if key!='q.past']]
    if mode=='name':return [('q.name',1),*before]
    if mode=='newest':return [('q.scraped',-1),*before]
    if mode=='distance' and geo:return [('distance',1),('q.past',1),('q.rank',1)]
    return before


def geo_stages(lat,lng):
    # Match the existing 6371km Haversine and rounded 0.1km ordering exactly.
    rad=lambda expr:{'$degreesToRadians':expr}
    delta_lat=rad({'$subtract':['$q.latitude',lat]});delta_lng=rad({'$subtract':['$q.longitude',lng]})
    square=lambda expr:{'$pow':[expr,2]}
    a={'$add':[square({'$sin':{'$divide':[delta_lat,2]}}),{'$multiply':[
        {'$cos':rad(lat)},{'$cos':rad('$q.latitude')},square({'$sin':{'$divide':[delta_lng,2]}})]}]}
    return [{'$set':{'_a':{'$cond':[{'$and':[{'$isNumber':'$q.latitude'},{'$isNumber':'$q.longitude'}]},a,None]}}},
        {'$set':{'distance':{'$cond':[{'$and':[{'$ne':['$_a',None]},{'$gte':['$_a',0]},{'$lte':['$_a',1]}]},
            {'$round':[{'$multiply':[12742,{'$atan2':[{'$sqrt':'$_a'},{'$sqrt':{'$subtract':[1,'$_a']}}]}]},1]},999999]}}}]


def read_indexed(source,options):
    if source is None:raise CatalogUnavailable('Database unavailable')
    manifest=source.database[META].find_one({'_id':manifest_id(source)})
    if not isinstance(manifest,dict):return None
    if not re.fullmatch(PREFIX+r'[0-9a-f]{32}',str(manifest.get('view',''))) or manifest.get('view')!=PREFIX+str(manifest.get('generation','')):
        raise CatalogUnavailable('Invalid read model manifest')
    try:_valid(source,manifest)
    except Exception:return None
    import api
    view=source.database[manifest['view']];query=predicate(options)
    geo=options.get('lat') is not None and options.get('lng') is not None
    pipeline=[{'$match':query}]
    if geo:pipeline+=geo_stages(options['lat'],options['lng'])
    pipeline+=[{'$sort':dict(sort_spec(options,geo))}]
    search=options.get('search','');tab=options.get('tab','upcoming')
    start=(options.get('page',1)-1)*options.get('limit',12);limit=options.get('limit',12)
    page=[];upcoming=missed=position=0
    target=lambda past:True if tab=='all' else past if tab in {'missed','lost','lost_opportunities'} else not past
    if search.strip():
        # Existing substring/synonym/SequenceMatcher semantics cannot be indexed safely.
        # Sorting first allows streaming all matches/counts with only one page retained.
        for row in view.aggregate(pipeline,allowDiskUse=True,batchSize=BATCH):
            q=row['q'];doc=row['payload']
            if not api._match_hackathon_search(doc,search,(q['raw_search'],q['normal_search'],set(q['words']))):continue
            if q['past']:missed+=1
            else:upcoming+=1
            if target(q['past']):
                if start<=position<start+limit:
                    if geo and row['distance']!=999999:doc['distance_km']=row['distance']
                    page.append(doc)
                position+=1
    else:
        counts=list(view.aggregate([{'$match':query},{'$group':{'_id':'$q.past','count':{'$sum':1}}}])) if query else [
            {'_id':False,'count':manifest['stats']['active_count']},{'_id':True,'count':manifest['stats']['lost_opportunities_count']}]
        for count in counts:
            if count['_id']:missed=count['count']
            else:upcoming=count['count']
        if tab!='all':pipeline.insert(1,{'$match':{'q.past':tab in {'missed','lost','lost_opportunities'}}})
        pipeline+=[{'$skip':start},{'$limit':limit}]
        for row in view.aggregate(pipeline,allowDiskUse=True,batchSize=BATCH):
            doc=row['payload']
            if geo and row['distance']!=999999:doc['distance_km']=row['distance']
            page.append(doc)
    _valid(source,manifest)
    current=source.database[META].find_one({'_id':manifest_id(source)},{'generation':1})
    if not current or current['generation']!=manifest['generation']:raise CatalogUnavailable('Read model generation changed')
    return {'success':True,'count':len(page),'data':page,'upcoming_total':upcoming,'missed_total':missed,
        'lost_opportunities_total':missed,'all_total':upcoming+missed,'stats':manifest['stats']}
