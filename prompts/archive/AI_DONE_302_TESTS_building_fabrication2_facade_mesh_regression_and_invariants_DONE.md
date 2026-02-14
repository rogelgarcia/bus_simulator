# DONE

#Problem

BF2 facade mesh generation bugs are easy to introduce and hard to notice until visually inspected (especially with rotated buildings and corner-coupled depth changes). Examples of regressions include:
- Degenerate/broken triangles from invalid breakpoints or near-duplicate points.
- Incorrect edges created across bay boundaries during straight → wedge transitions.
- Nondeterministic changes to the top-down outline or corner resolution decisions.

We need automated, headless coverage to validate geometry invariants and detect regressions early.

# Request

Add headless automated tests for BF2 facade mesh generation that validate key invariants and reproduce known failure cases.

Tasks:
- Test harness:
  - Add Node/headless tests (or the minimal headless approach used by this repo) that can run in CI/local without manual rendering.
  - Tests must be deterministic (fixed seeds / fixed inputs).
- Geometry invariants:
  - Validate generated geometry contains no NaN/Infinity vertices or UVs.
  - Validate triangle indices are in range and triangles have non-trivial area above an epsilon (no degenerate triangles).
  - Validate predictable behavior under rotated building orientation (same invariants hold).
- Regression cases:
  - Add a repro for straight → wedge transition that previously produced an incorrect long edge/line across bays.
  - Add a repro for mixed positive/negative depths near corners to ensure the generator remains stable and watertight.
  - Add a repro that confirms corner strategy decisions are deterministic (winner/loser outcomes do not flip across runs).
- Outputs:
  - On failure, write useful artifacts/logs (e.g., a JSON dump of breakpoints/corner decisions, or a minimal geometry summary) into the existing test artifacts folder conventions.

## Proposal (optional implementation idea)
- Compute triangle areas in the ground plane or full 3D, and fail if too many triangles are below an epsilon.

## Quick verification
- Tests run via the repo’s standard runner (`node tools/run_selected_test/run.mjs`) and fail on regressions.
- Tests catch at least one intentionally reintroduced degenerate triangle case (prove value).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_302_TESTS_building_fabrication2_facade_mesh_regression_and_invariants_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

# Summary
- Added headless tests covering rotated facade footprints and corner strategy determinism.
- Added JSON failure artifacts for BF2 facade mesh inspection.
- Exposed a minimal `__testOnly` facade geometry API for test coverage.
