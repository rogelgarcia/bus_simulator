# Testing Rules

This doc is the expanded testing policy and conventions for this repo. `PROJECT_RULES.md` links here.

## Goals

- Keep tests deterministic where possible (seeded RNG, fixed timestep/camera/resolution for render checks).
- Keep the shipped game as static browser files; Node tooling is for dev/tests only.
- Keep generated outputs out of git; only committed baselines/fixtures should be tracked.

## Structure

- Browser-run console tests: `tests/core.test.js`
- Deterministic harness + scenarios: `tests/headless/harness/` and `tests/headless/harness/scenarios/`
- Headless browser E2E: `tests/headless/e2e/`
- Visual regression: `tests/headless/visual/`
  - Baselines (committed): `tests/headless/visual/baselines/`
  - Specs (committed): `tests/headless/visual/specs/`
- Performance budgets: `tests/headless/perf/`
  - Budgets/specs (committed): `tests/headless/perf/budgets/`, `tests/headless/perf/specs/`
- Node unit tests: `tests/node/unit/`
- Node simulation tests: `tests/node/sim/`
- Node asset/pipeline validation: `tests/node/assets/`

## Artifacts and baselines

- Generated outputs (screenshots, traces, logs, reports) go under `tests/artifacts/` and must be gitignored.
- Baselines/fixtures/budgets/specs are committed under their respective `tests/**` folders (never under `tests/artifacts/`).
- Baseline updates must be explicit (command/flag), never automatic.

## “Tests are explicit”

- Don’t run tests automatically on normal game boot.
- Test entry points should be explicit (ex: the deterministic harness page or dedicated runner commands).

## When adding or changing tests

- Prefer small, high-signal suites (fast smoke tests) plus heavier suites (visual/perf) for less frequent runs.
- Make failures actionable: write clear assertions and emit artifacts on failure (diff images, screenshots, traces, logs).
