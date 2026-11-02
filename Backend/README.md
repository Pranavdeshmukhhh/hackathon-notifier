# Backend

Python 3.12. Install the tested versions from `requirements.lock`; `requirements.txt`
records compatible direct requirements. `requirements-quality.txt` contains CI tools.

From the repository root, with the virtual environment active:

```sh
python -m pip install -r Backend/requirements.lock
python -m pip check
python -m uvicorn api:app --app-dir Backend --host 127.0.0.1 --port 8000 --no-proxy-headers
```

Copy `Backend/.env.example` to `Backend/.env` only for normal local development.
Configure your own local Mongo first. Blank admin credentials disable admin routes;
blank Telegram credentials disable sends. `/health` reports Mongo readiness.
Production disables `/docs` and `/redoc`.

`python scripts/preview_api.py` is the isolated fixture alternative. Do not use it
as a production entry point. A dry-run scanner still makes source requests: it is
not an offline test. Unit fixtures/benchmarks are the offline test path.

Authorized operations are separate: `run_scan.py`, `run_scan.py --notifications-only`
and `scripts/prepare_catalog.py`. They can write or send; review source permissions,
backups, staging and settings before running them. No recurring scan is enabled by default.

[Setup](../docs/SETUP.md) · [API](../docs/EVENT_API_CONTRACT.md) ·
[Migration/read model](../docs/INDEXED_API_PERFORMANCE.md) ·
[Outbox](../docs/NOTIFICATION_OUTBOX.md) · [Benchmarks](../docs/BENCHMARKS.md).
