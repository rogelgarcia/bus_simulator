# Performance budgets

This suite measures deterministic performance metrics in a headless browser using the harness (`window.__testHooks.measurePerformance`) and enforces budgets.

## Layout

- Specs: `tests/headless/perf/specs/`
- Budgets (committed): `tests/headless/perf/budgets/`
- Results/artifacts (gitignored): `tests/artifacts/headless/perf/`

## Running

Prereqs:
- `npm i`
- `npx playwright install --with-deps chromium`

Commands:
- `npm run test:perf`
- Update baselines (explicit): `npm run test:perf:update`

Profiles:
- Quick (default): short measure window
- Nightly: `PERF_PROFILE=nightly npm run test:perf`

