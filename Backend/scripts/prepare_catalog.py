"""Operator-only catalog preparation. Default is a read-only identity migration plan.

No production scan, scraper or notifier is imported. Source data is never deleted.
--apply-identity writes derived metadata only; --publish creates a canonical read view.
"""
import argparse,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--uri',required=True)
    parser.add_argument('--database',required=True)
    parser.add_argument('--collection',default='hackathons')
    parser.add_argument('--apply-identity',action='store_true')
    parser.add_argument('--publish',action='store_true')
    args=parser.parse_args()
    from pymongo import MongoClient
    from identity_backfill import backfill
    from catalog_query import publish
    with MongoClient(args.uri,serverSelectionTimeoutMS=5000,socketTimeoutMS=10000) as client:
        source=client[args.database][args.collection]
        report=backfill(source,apply=args.apply_identity)
        if args.publish:report['catalog']=publish(source)
        print(json.dumps(report))
if __name__=='__main__':main()
