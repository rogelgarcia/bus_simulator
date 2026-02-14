# DONE

# Problem

Rendering and procedural content changes are hard to validate with logic-only tests. Screenshot comparison can catch regressions in roads/intersections, building generation outputs, material parameter changes, transparency sorting issues, and LOD/culling problems. However, screenshot tests can be noisy unless determinism is enforced (seeded RNG, fixed camera pose, fixed resolution, warm-up frames, and reduced non-deterministic effects).

# Request

Add a small, deterministic visual regression testing layer that renders specific “golden scenarios” in a headless browser and compares screenshots against baselines.

Tasks:
- Add a workflow to render a deterministic golden frame for named scenarios via the test harness (fixed seed, camera, resolution, and a warm-up period).
- Add screenshot baseline storage in-repo and an image diff step (ex: pixelmatch or equivalent) with reasonable tolerance thresholds.
- Ensure failures produce actionable artifacts (diff image + actual screenshot) so regressions are easy to inspect.
- Run visual regression tests using the headless browser runner from the previous phase, reusing the same test harness entry point.
- Keep CDN usage acceptable; visual tests run outside of the game as tooling.
- Organize visual tests under `tests/headless/visual/`: keep committed baseline images in `tests/headless/visual/baselines/`, keep any visual test spec definitions in `tests/headless/visual/specs/`, and write generated outputs (actual/diff) to `tests/artifacts/headless/visual/`.
- Ensure only baselines are committed; generated outputs under `tests/artifacts/` must be gitignored.
- Update `TESTING_RULES.md` with any new testing conventions introduced by this phase (baseline update workflow, tolerances, artifact locations).

Nice to have:
- Provide a clear “update baselines” workflow for intentional changes (explicit command / flag, never automatic).
- Use stable headless rendering settings to reduce machine-to-machine variance (while still keeping tolerance thresholds).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_168_TOOLS_testing_phase4_visual_regression_screenshots_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added a deterministic visual regression suite under `tests/headless/visual/` driven by the headless harness and Playwright screenshot comparisons.
- Added a baseline/update workflow with explicit snapshot updates and failure artifacts written under `tests/artifacts/headless/visual/`.
- Documented the visual testing conventions, folders, and commands in `TESTING_RULES.md` and `tests/headless/visual/README.md`.
