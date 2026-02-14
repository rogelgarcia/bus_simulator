# DONE

# Problem

Performance regressions and asset/pipeline issues are high-impact in 3D projects, and they’re easy to introduce accidentally (too many draw calls, triangle explosions, oversized textures, missing textures, broken glTFs, large files committed by mistake). We need automated “outside of the game” checks that can run as tooling to catch these regressions early.

# Request

Add performance-budget tests and asset/pipeline validation tooling that runs outside of the game, integrated with the headless browser runner and/or Node scripts as appropriate.

Tasks:
- Add a small set of deterministic performance scenarios that can be run via the test harness and measured consistently (warm-up, then measure over a fixed window).
- Record useful metrics and enforce budgets with tolerances (ex: build times, draw calls, triangle counts, renderer stats; treat FPS/frame time as a budget/trend signal with noise tolerance).
- Add asset validation checks (ex: detect missing textures, texture dimension limits, triangle/material count limits per asset, oversized files) and fail with clear, actionable messages.
- Ensure these checks can be run outside of the game with simple commands and do not change the shipping runtime (CDN-based game still fine).
- Organize performance tests under `tests/headless/perf/` (scenario specs in `tests/headless/perf/specs/`, budgets in `tests/headless/perf/budgets/`, generated results in `tests/artifacts/headless/perf/`) and asset/pipeline validation under `tests/node/assets/` (checks in `tests/node/assets/checks/`, fixtures in `tests/node/assets/fixtures/`, generated reports in `tests/artifacts/node/assets/`).
- Add `tests/artifacts/` to `.gitignore` so perf outputs and generated reports don’t get committed; keep budgets/specs/baselines committed.
- Update `TESTING_RULES.md` with any new testing conventions introduced by this phase (perf budget rules, asset validation rules, artifact locations).

Nice to have:
- Provide a “nightly” profile where heavier perf/visual checks run less frequently, while keeping a fast subset for PRs.
- Emit machine-readable reports (JSON) for CI dashboards.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_169_TOOLS_testing_phase5_perf_and_asset_pipeline_budgets_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added deterministic perf budget runner under `tests/headless/perf/` using Playwright + `window.__testHooks.measurePerformance(...)`, with committed budget file and explicit baseline update workflow.
- Added Node asset/pipeline validation suite under `tests/node/assets/` (GLB header validation, MTL texture references, texture size/dimension limits, large-file detection) with JSON report output under `tests/artifacts/node/assets/`.
- Documented perf + asset validation conventions and commands in `TESTING_RULES.md`.
