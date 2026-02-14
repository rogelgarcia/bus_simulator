# DONE

# Problem

Some failures only show up in a real browser environment (module import issues, asset loading, scene boot regressions, UI wiring, debugger screens). We need automated browser integration tests that run outside of the game (dev tooling), can drive the deterministic harness programmatically, and can fail reliably on console errors/unhandled rejections.

# Request

Add headless browser integration tests (outside of the game) using a Node runner + real browser (Playwright or Puppeteer), driven by the deterministic test harness.

Tasks:
- Add a Node-based headless browser test runner (Playwright preferred, or Puppeteer) that can launch Chromium and load the test harness entry point.
- Ensure tests fail on console errors, unhandled promise rejections, and missing/failed module imports.
- Add a small set of high-value browser integration tests (ex: harness boots, a few scenarios load deterministically, a few debugger screens can mount without crashing).
- Ensure the runner can serve the repo as static files locally for tests (no requirement to change the game runtime).
- Provide a simple command to run these browser tests outside of the game, locally and in CI.
- Place headless browser integration specs under `tests/headless/e2e/` and write them to target the harness at `tests/headless/harness/` (store generated artifacts like traces/screenshots under `tests/artifacts/headless/e2e/`).
- Add `tests/artifacts/` to `.gitignore` so traces/screenshots/logs produced by headless runs are never committed.
- Update `TESTING_RULES.md` with any new testing conventions introduced by this phase (runner commands, artifact capture policy, CI notes).

Nice to have:
- Capture failure artifacts (screenshot, console logs, trace) to make regressions easy to debug.
- Support running tests in headed mode for debugging.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_167_TOOLS_testing_phase3_headless_browser_integration_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added Playwright-based headless browser test runner + config under `tests/headless/e2e/` with a small static server to serve repo files.
- Added smoke E2E specs that boot the harness and mount a couple debugger screens, failing on console errors/unhandled rejections/module load failures.
- Routed all headless artifacts (screenshots/videos/traces) to `tests/artifacts/headless/e2e/` and documented runner commands in `TESTING_RULES.md`.
