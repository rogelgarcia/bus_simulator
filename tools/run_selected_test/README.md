# runSelectedTest

Standardized runner for AI/dev iteration. Keeps test execution to a **single stable command** by reading a local selection file (`tests/.selected_test`).

## Run

```bash
node tools/run_selected_test/run.mjs
```

## Select a target

Edit `tests/.selected_test` (gitignored) and re-run the same command.

Supported targets:

- `smoke` (fastest meaningful subset)
- `core` (browser console tests via `tests/core.test.js`)
- `node`, `node:unit`, `node:sim`, `assets`
- Headless Playwright paths:
  - `tests/headless/e2e/<spec>.pwtest.js`
  - `tests/headless/visual/specs/<spec>.pwtest.js`
  - `tests/headless/perf/specs/<spec>.pwtest.js`

Optional helper:

```bash
node tools/run_selected_test/run.mjs --set node:unit
```

## Artifacts

- Runner artifacts (if any) are written under `tests/artifacts/`.
- Playwright artifacts are written under their existing `tests/artifacts/headless/**` output dirs.

