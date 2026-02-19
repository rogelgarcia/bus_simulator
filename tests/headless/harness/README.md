# Deterministic Harness

Entry point: `tests/headless/harness/index.html`

This page exposes a small automation API at `window.__testHooks` intended for later Playwright/visual/perf runners.

## Quick start

Open the harness page and run in DevTools:

```js
await __testHooks.loadScenario('city_crossing', { seed: 'demo' })
__testHooks.step(60, { render: true })
__testHooks.getMetrics()
```

## Adding scenarios

1. Add a new file under `tests/headless/harness/scenarios/` exporting `{ id, create(...) }`.
2. Register it in `tests/headless/harness/scenarios/index.js`.
3. Keep scenarios deterministic: avoid non-seeded randomness and avoid time-based animation unless stepped via `__testHooks.step(...)`.

## Material QA capture scenario

- Scenario id: `material_calibration_capture`
- Purpose: deterministic texture QA captures (fixed camera/light recipes) for the texture-correction pipeline tooling.
