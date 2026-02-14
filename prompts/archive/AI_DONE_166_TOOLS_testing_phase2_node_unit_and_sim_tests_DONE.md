# DONE

# Problem

We need more automated testing coverage than a single browser-run test file can provide. Many core systems (math, geometry, road rules, procedural generation rules, state machines, serialization) can be tested quickly without WebGL, but the repo currently lacks a Node-based test runner setup and patterns for writing fast unit tests and deterministic simulation tests. The goal is to run these tests outside of the game (as dev tooling), without making the shipped game depend on Node.

# Request

Add a Node-based unit testing layer (and deterministic simulation tests where feasible) that runs outside of the game runtime, while keeping the shipped game as static browser files.

Tasks:
- Introduce a Node dev/test runner setup (ex: Vitest or Jest) that can execute “pure JS” unit tests quickly and consistently.
- Define clear boundaries/patterns so core logic can be tested in Node without requiring WebGL or DOM (and keep rendering/browser-only code out of this layer).
- Add initial unit tests for high-value systems (math/geometry helpers, road/intersection rules, seeded procedural generation invariants, serialization/deserialization, state machine logic).
- Add deterministic “simulation stepping” tests where feasible (fixed timestep, step N ticks, assert invariants/positions with tolerances) without requiring the full game boot.
- Keep CDN usage acceptable for the game runtime; Node tooling is for tests only and should not affect how the game is launched/played.
- Organize tests by environment: place Node unit tests under `tests/node/unit/` and deterministic simulation stepping tests under `tests/node/sim/` (shared fixtures/helpers can live under `tests/shared/`).
- Write any generated reports/outputs under `tests/artifacts/node/` and ensure `tests/artifacts/` is gitignored (tests/fixtures and any committed baselines must remain tracked).
- Update `TESTING_RULES.md` with any new testing conventions introduced by this phase (runner commands, Node/browser boundaries, artifacts/baselines).

Nice to have:
- Add a fast “smoke test” suite that runs in seconds and is suitable for running frequently (pre-commit / PR checks).
- Add lightweight docs for how to run tests and how to write new ones.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_166_TOOLS_testing_phase2_node_unit_and_sim_tests_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added Node test runner setup using Node’s built-in `node --test` (ESM via `package.json`).
- Added initial Node unit tests under `tests/node/unit/` (StateMachine, CityRNG, RoadEngineMeshData, CityMap spec stability).
- Added deterministic stepping simulation tests under `tests/node/sim/` (GameLoop fixed-step invariants).
- Added shared Node test helpers under `tests/shared/` and documented conventions/commands in `TESTING_RULES.md` and `tests/node/README.md`.
