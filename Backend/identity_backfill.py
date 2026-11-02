"""Explicit bounded metadata backfill. Never merge/rekey/delete source rows."""
from pymongo import UpdateOne
from entity_resolution import metadata, PROJECTION, VERSION


def backfill(source, *, apply=False, batch_size=200):
    if not 1<=batch_size<=500:raise ValueError('batch_size must be 1..500')
    report={'scanned':0,'planned':0,'modified':0,'raced':0,'apply':apply}
    operations=[]
    def flush():
        if operations:
            result=source.bulk_write(operations,ordered=False)
            report['modified']+=result.modified_count
            report['raced']+=len(operations)-result.matched_count
            operations.clear()
    for row in source.find({'_identity_v1.version':{'$ne':VERSION}},PROJECTION).batch_size(batch_size):
        report['scanned']+=1;report['planned']+=1
        if not apply:continue
        # Compare every input to the metadata computation, including missing fields.
        # A concurrent writer makes this row a no-op, never a stale overwrite.
        query={'_id':{'$eq':row['_id']},'_identity_v1.version':{'$ne':VERSION}}
        for key in PROJECTION:
            if key in {'_id','_identity_v1'}:continue
            value=row;present=True
            for part in key.split('.'):
                if not isinstance(value,dict) or part not in value:
                    present=False;break
                value=value[part]
            query[key]={'$eq':value} if present else {'$exists':False}
        operations.append(UpdateOne(query,{'$set':{'_identity_v1':metadata(row)}}))
        if len(operations)>=batch_size:flush()
    flush()
    if apply:
        for key,name in [('_identity_v1.version','identity_version_v1'),('_identity_v1.urls','identity_urls_v2'),
                         ('_identity_v1.source_ids','identity_sources_v2'),('_identity_v1.blocks','identity_blocks_v1')]:
            if not any(spec.get('key')==[(key,1)] for spec in source.index_information().values()):
                source.create_index(key,name=name)
    return report
