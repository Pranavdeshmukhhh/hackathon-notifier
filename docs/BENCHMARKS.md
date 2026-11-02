# Reproduce release benchmarks

Activate the locked Python environment. Use only the disposable loopback replica set
from setup. The API benchmark's baseline commit `f93b226` must be available (`git`
full history); alternatively supply the actual baseline file via `--baseline-file`.
Never substitute a guessed baseline or a production URI.

```sh
python Backend/scripts/benchmark_entity_resolution.py --sizes 200 1000 --repeats 3 --output benchmarks/local/matching.json
python Backend/scripts/benchmark_source_failures.py --output benchmarks/local/sources.json
python Backend/scripts/benchmark_indexed_api.py --output benchmarks/local/indexed-api.json
```

Matching uses 30 labeled synthetic pairs/hard negatives and generated 200/1,000-row
workloads, comparing exact IDs, the prior edition baseline and blocked fuzzy
resolution. Precision/recall do not establish real-world ground truth. Memory is
Python tracemalloc; reported comparisons include normalization/index work.

Source measurements use five offline outcomes, two spawn workers, 1.5-second source
timeouts, an eight-second budget and three repeats. They establish fixture failure
isolation, not live source health, permissions or production scrape duration.

API sizes are 1k/10k/100k synthetic rows, prepared canonical views, one cold warm-up
and 12 sequential handler samples (four modes × three repeats). They include Mongo
round trips/serialization, exclude HTTP transport and publication, and report client
RSS separately from Mongo. Search/counts/geographic sorts can inspect many rows;
page explain plans are not whole-query cost claims. This is not a concurrent load
or cloud capacity test. The 100k baseline can use roughly 2GiB client RAM; run on a
suitable local machine, not a free web dyno.

Release evidence is under `benchmarks/release-v0.7.0-rc.1/`. Future runs should use
`benchmarks/local/` so recorded release evidence is not silently overwritten.
