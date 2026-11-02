# Contributing

Read [AGENTS.md](AGENTS.md), [setup](docs/SETUP.md) and the relevant phase report.
Keep changes on a branch and preserve existing API schemas, IDs, provenance,
notification receipts and URL/administrator restrictions. Use original code and
retain third-party license notices. Do not include real credentials or user exports.

1. Install the locked Python/Node dependencies and use isolated fixture data.
2. Reproduce a substantive defect and add a focused regression before repairing it.
3. Run backend tests/coverage and frontend lint, coverage and build. Mongo integration
   checks require the explicit disposable test URI; skipped checks are not passes.
4. Run browser checks for UI changes; follow `Frontend/DESIGN_SYSTEM.md`.
5. For a new source, implement/register its adapter in `Backend/run_scan.py`, preserve
   the stable source ID and add offline HTML/JSON fixtures. Establish source permission
   and request budgets first; never bypass denied access or rate limits.
6. Refresh shipped JS license notices with `python scripts/generate_notices.py`
   whenever a bundled dependency changes. Keep test fixtures out of production imports.
7. Describe the problem, behavior change, commands/results and remaining limits in
   the PR. Publishing/deployment requires maintainer approval and the release checklist.

Current review commands are in [README](README.md) and CI. Benchmark instructions
state their synthetic scope; never extrapolate local timings into cloud guarantees.
Report vulnerabilities privately through [SECURITY.md](SECURITY.md).
