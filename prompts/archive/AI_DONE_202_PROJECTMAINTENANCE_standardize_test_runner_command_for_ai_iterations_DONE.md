# DONE - Problem

When iterating on tests, the AI often proposes running ad-hoc “random” shell commands (long inline `node`/`playwright` invocations, custom `rg | sed | ...` pipelines, etc.). In this environment, command approvals are easier when we have a small, stable set of standardized test runner commands that can be approved once and reused repeatedly. Without this, test/debug loops are slow because each new command shape may require separate authorization.

# Request

Add a standardized “run selected test” command and update project rules so test execution during AI/dev iteration uses a stable, reusable command instead of ad-hoc inline shell commands.

Tasks:
- Add a single, stable command under `tools/` to run tests that can be reused across iterations:
  - Example goal: `tools/run_selected_test` (constant command) reads a “selected test target” file (ex: `tests/.selected_test`) and runs it.
  - The AI/dev workflow becomes: edit test file → update `tests/.selected_test` → run the same command again.
- Support selecting/running at least these test types (as applicable to the repo):
  - Browser console tests (ex: `tests/core.test.js`) with a consistent invocation.
  - Node unit tests (ex: under `tests/node/unit/`) and sim tests (ex: under `tests/node/sim/`) with a consistent invocation.
  - Headless/browser integration tests (ex: under `tests/headless/e2e/`) with a consistent invocation.
- Make the runner safe and deterministic:
  - Write artifacts only under `tests/artifacts/`.
  - Print a clear pass/fail summary and exit non-zero on failure.
  - Validate the selected test target file input (reject path traversal, unknown test type, missing file).
- Documentation and rules:
  - Update `PROJECT_RULES.md` (and `TESTING_RULES.md` if relevant) to recommend using the standardized command for test runs during AI/dev iteration.
  - Add guidance: avoid proposing/using long inline shell commands for tests; prefer the standardized runner.
  - Document how to choose a test file/target, how to re-run quickly, and where artifacts/logs go.
- Register the new tool in `PROJECT_TOOLS.md` and include a `README.md` in the tool folder per project rules.

Nice to have:
- Add `tools/run_selected_test --set <target>` that updates the selection file (still keeping a stable “run” command).
- Add a `tools/run_selected_test --last` mode to re-run the last selected target without changing anything.
- Add a small “smoke” target that runs the fastest meaningful subset for quick checks.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_202_PROJECTMAINTENANCE_standardize_test_runner_command_for_ai_iterations_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

# Summary

- Added `tools/run_selected_test/` to run a selected test target from a stable command.
- Added `tests/.selected_test` workflow (gitignored) so reruns reuse the same command shape.
- Updated core browser console tests to expose a completion flag for deterministic headless runs.
- Updated testing docs/rules and registered the tool in `PROJECT_TOOLS.md`.
