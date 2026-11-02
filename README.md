# Hackathon Notifier

A React directory and FastAPI backend for discovering hackathons, comparing
registration deadlines, saving opportunities and receiving opt-in Telegram alerts.
Source facts, unknown values and provenance are preserved; heuristic scores are
not proof of verification. No listing volume, uptime or cloud scalability is promised.

**Release candidate: v0.7.0-rc.1. Production rollout is blocked pending the manual
checks in the [release checklist](docs/releases/v0.7.0-rc.1.md).** Nothing was pushed
or deployed by this review.

## Start locally

Requires Python 3.12 and Node.js 22.12+ (or a supported newer Node release).

```sh
python -m venv .venv
# Activate .venv: see the Windows/Linux commands in docs/SETUP.md.
python -m pip install -r Backend/requirements.lock
python scripts/preview_api.py
```

In another terminal:

```sh
cd Frontend
npm ci
npm run dev
```

This preview uses **labeled synthetic records in memory**, no credentials and no
scans/notifications. Production does not import the preview fixtures. For a real,
initially empty local MongoDB, follow [setup](docs/SETUP.md).

## Checks

```sh
python -m pytest Backend/tests -q --cov --cov-report=json:coverage.json
python scripts/check_coverage.py coverage.json
cd Frontend
npm ci
npm run lint
npm run test:coverage
npm run build
```

Mongo integration tests require the explicitly selected disposable loopback replica
set described in setup; without it they skip. CI provisions it and enforces coverage,
dependency audits, secret/context checks, migration recovery and browser checks.

## Project guide

- [Setup and deployment limits](docs/SETUP.md)
- [Architecture](docs/ARCHITECTURE.md) · [decisions](docs/ADRS.md)
- [API contract](docs/EVENT_API_CONTRACT.md)
- [Benchmark commands and scope](docs/BENCHMARKS.md)
- [Source policies and privacy](docs/SOURCE_POLICY.md) · [security](SECURITY.md)
- [Contributing](CONTRIBUTING.md) · [third-party attribution](THIRD_PARTY.md)
- [Versioned release gate and evidence](docs/releases/v0.7.0-rc.1.md)

The local pipeline uses MongoDB, bounded Python workers and one-shot notification
workers. No Redis, paid API, GPU, Kubernetes or mandatory always-on worker is required.
Hosted free tiers have quotas, sleep and policy restrictions; verify current terms.

MIT, copyright 2026 Pranav Deshmukh. See [LICENSE](LICENSE).
