# DONE

# Problem

The project currently relies on a single browser-run test file and does not have a dedicated “outside of the game” test harness that can be driven deterministically. This makes it hard to scale automated testing (especially rendering scenarios, regression checks, and headless runs) without booting the full game flow. We also need a consistent way to make scenarios deterministic (seeded RNG, fixed timestep, fixed camera) and to expose a small API that automated runners can use.

# Request

Create a deterministic, automation-friendly test harness entry point that runs outside of the normal game UX (while still using the same CDN-based browser runtime).

Tasks:
- Add a dedicated test harness entry point that does not start the normal gameplay UI flow, and can be loaded directly in a browser.
- Provide a deterministic foundation for tests: seeded randomness and fixed-timestep stepping for simulation scenarios that need it.
- Add a small, stable `window.__testHooks` API for automation (ex: load a named scenario with options, step N ticks, render a frame, query simple metrics/state).
- Create a minimal scenario registry so tests can request reproducible scenes (ex: a few road/crossing/junction setups) without manual UI interaction.
- Ensure the harness can run with the current CDN import map setup (no requirement to bundle the game or remove CDN usage).
- Ensure the harness produces clear pass/fail output in the console and/or DOM so headless runners can reliably detect failures.
- Put the harness entry point under `tests/headless/harness/` and keep scenario definitions under `tests/headless/harness/scenarios/` so later Playwright E2E/visual/perf phases can reuse the same scenario names.
- Ensure any generated outputs from running the harness (logs/screenshots/temp files) go under `tests/artifacts/` and that `tests/artifacts/` is gitignored (baselines/fixtures remain committed).
- Update `TESTING_RULES.md` with any new testing conventions introduced by this phase (folders, determinism rules, artifacts/baselines).

Nice to have:
- Add a “no tests on normal boot” policy so tests don’t run by default when launching the game (keep testing entry points explicit).
- Provide a short developer doc describing how to add new scenarios and how to use `window.__testHooks`.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_165_TOOLS_testing_phase1_deterministic_harness_and_test_hooks_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added a deterministic harness entry point under `tests/headless/harness/` with a stable `window.__testHooks` API (load scenario, fixed-step, render, metrics, assertions).
- Added a minimal scenario registry under `tests/headless/harness/scenarios/` with a few reproducible road/junction setups.
- Ensured generated outputs live under `tests/artifacts/` and are gitignored.
- Made browser tests explicit by gating `tests/core.test.js` behind `?coreTests=1` on `index.html`.
