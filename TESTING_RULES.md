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

## Standardized runner (AI/dev iteration)

Prefer the stable runner command instead of ad-hoc inline test commands:

- Run: `node tools/run_selected_test/run.mjs`
- Select: edit `tests/.selected_test` (gitignored) and re-run the same command.

Common targets:

- `smoke` (fastest meaningful subset)
- `core` (runs `tests/core.test.js` headlessly and fails on console test failures)
- `node`, `node:unit`, `node:sim`, `assets`
- `tests/headless/e2e/<spec>.pwtest.js`
- `tests/headless/visual/specs/<spec>.pwtest.js`
- `tests/headless/perf/specs/<spec>.pwtest.js`

## Artifacts and baselines

- Generated outputs (screenshots, traces, logs, reports) go under `tests/artifacts/` and must be gitignored.
- Baselines/fixtures/budgets/specs are committed under their respective `tests/**` folders (never under `tests/artifacts/`).
- Baseline updates must be explicit (command/flag), never automatic.

## Regression Debugging Playbook (headless + bisect)

When a rendering regression is hard to reproduce or isolate, use this deterministic workflow (no guessy/manual-only debugging).

1) Create a **deterministic headless reproduction**
   - Prefer the harness: add a minimal scenario under `tests/headless/harness/scenarios/` and register it.
   - Add a headless test that clearly fails (E2E/visual/perf, depending on the signal you need).
   - Re-run the *same* target repeatedly (recommended: `node tools/run_selected_test/run.mjs` with `tests/.selected_test` pointing at the failing spec).

2) Create a **debug tool** (preferred)
   - Add a dedicated debug scene/UI that exposes the suspected subsystem(s) and can be driven by the headless test.
   - Keep it minimal and deterministic (fixed seeds, fixed camera, fixed resolution when applicable).

3) Isolate by **systematic feature toggling** (binary search / stepwise disable)
   - Disable one feature/subsystem at a time, then re-run the same headless test after each change.
   - If disabling *all* suspects doesn’t fix it, add features back in a controlled order and re-run each time until the root cause is identified.
   - Suggested “add back” order: base rendering → materials → decals/markings → post-processing → variations/noise → debug overlays.

4) Do **not delete code** while isolating
   - Use reversible gates (feature flags, query params, debug settings) so changes are easy to undo or keep as optional debug switches.

5) Document every step (durable “research log”)
   - Create a Markdown research log with the test plan, each toggle change, and the pass/fail result.
   - Reference artifacts by path under `tests/artifacts/` (don’t commit artifacts; keep committed baselines/specs separate as described above).
   - Template: `debug_tools/regression_debugging/RESEARCH_LOG_TEMPLATE.md`

Example (style):
- “Markings not visible” regression: start from an existing failing spec (e.g. `tests/headless/e2e/road_markings_visible.pwtest.js` or a new minimal visual spec), then bisect road material/markings/post-processing toggles while re-running the same headless target and logging results.

## “Tests are explicit”

- Core tests run on local/dev hosts by default (ex: `localhost`, `127.0.0.1`, `::1`, private LAN IPs).
- Disable with `?coreTests=0`, or force enable with `?coreTests=1`.

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
