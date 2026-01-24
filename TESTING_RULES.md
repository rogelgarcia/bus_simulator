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
  - Shared fixtures/helpers: `tests/shared/`

## Artifacts and baselines

- Generated outputs (screenshots, traces, logs, reports) go under `tests/artifacts/` and must be gitignored.
- Baselines/fixtures/budgets/specs are committed under their respective `tests/**` folders (never under `tests/artifacts/`).
- Baseline updates must be explicit (command/flag), never automatic.

## “Tests are explicit”

- Don’t run tests automatically on normal game boot.
- Test entry points should be explicit (ex: the deterministic harness page or dedicated runner commands).

## Deterministic harness

- Entry point: `tests/headless/harness/index.html`
- Automation API: `window.__testHooks` (scenario load/step/render + assertions + metrics)

## Node tests

- Runner: Node built-in test runner (`node --test`) via `package.json` scripts.
- Boundaries: Node tests must only import “pure JS” modules (no `three`, no DOM, no WebGL, no CDN-only deps).
- Artifacts: generated outputs belong under `tests/artifacts/node/` (committed baselines remain under `tests/**`).

Commands:
- `node --test tests/node/**/*.test.js`
- `npm run test:node` (optional)

## Headless browser E2E

- Runner: Playwright (`@playwright/test`) driving real Chromium against the static server.
- Specs: `tests/headless/e2e/*.pwtest.js` (focus on “does it boot” + “does it crash”).
- Artifacts: `tests/artifacts/headless/e2e/` (screenshots/videos/traces retained on failure).

Commands:
- `npm run test:headless`
- `npm run test:headless:headed` (debug)

## Visual regression (screenshots)

- Runner: Playwright screenshot comparisons (`toHaveScreenshot`) with deterministic harness scenes.
- Specs: `tests/headless/visual/specs/*.pwtest.js`
- Baselines (committed): `tests/headless/visual/baselines/`
- Artifacts (gitignored): `tests/artifacts/headless/visual/` (diff/actual + trace/video on failure)

Commands:
- `npm run test:visual`
- `npm run test:visual:headed`
- `npm run test:visual:update` (explicit baseline updates)

## Performance budgets

- Runner: Playwright calling `window.__testHooks.measurePerformance(...)` in the deterministic harness.
- Specs: `tests/headless/perf/specs/*.pwtest.js`
- Budgets (committed): `tests/headless/perf/budgets/`
- Artifacts (gitignored): `tests/artifacts/headless/perf/` (JSON reports + trace/video on failure)
- Baseline updates must be explicit (`UPDATE_PERF_BASELINES=1`), never automatic.

Commands:
- `npm run test:perf`
- `npm run test:perf:headed`
- `npm run test:perf:update` (explicit baseline updates)

## Asset / pipeline validation

- Runner: Node built-in test runner under `tests/node/assets/`.
- Checks: `tests/node/assets/checks/` (GLB headers, texture limits, MTL references, large files).
- Artifacts (gitignored): `tests/artifacts/node/assets/report.json`

Commands:
- `npm run test:assets`

## When adding or changing tests

- Prefer small, high-signal suites (fast smoke tests) plus heavier suites (visual/perf) for less frequent runs.
- Make failures actionable: write clear assertions and emit artifacts on failure (diff images, screenshots, traces, logs).
