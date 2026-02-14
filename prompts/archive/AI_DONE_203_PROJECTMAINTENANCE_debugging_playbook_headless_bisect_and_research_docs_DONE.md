# DONE - Problem

Some visual regressions (ex: road markings not being visible after several updates) are very hard to debug by guessing or toggling random settings. We need a standardized debugging playbook for these situations that is deterministic, test-driven, and produces durable documentation of what was tried and what the root cause was.

# Request

Update `PROJECT_RULES.md` / `TESTING_RULES.md` with a debugging workflow for “hard to reproduce / hard to isolate” rendering regressions, centered on creating a headless reproduction and then systematically bisecting features with retests after each change. Prefer creating a dedicated debug tool that is test-driven.

Tasks:
- Add a “Regression Debugging Playbook” section to `PROJECT_RULES.md` and/or `TESTING_RULES.md` describing the required approach:
  1) **Create a deterministic headless reproduction** (minimal harness scenario) that clearly shows the problem.
  2) **Create a debug tool** (preferred) that can be driven by the headless test to reproduce and inspect the issue quickly.
  3) **Isolate by systematic feature toggling** (binary search / stepwise disable):
     - Disable one feature at a time (or one subsystem at a time), re-run the headless test after each change.
     - If disabling all suspected features does not remove the issue, add features back in a controlled order (most straightforward/basic → most advanced/complex), re-running the test each time until the root cause is identified.
  4) **Do not delete code while isolating**:
     - Use a reversible strategy (feature flags / global debug vars / config gates) so changes are easy to revert and can be left as optional debug switches if useful.
  5) **Document every step**:
     - Create a Markdown “research log” that includes the test plan, each toggle change, the test result, screenshots/artifacts references, and the final root cause + fix.
     - Store the log under `docs/` (or under a debug tool folder if a debug tool is created), and link to it from the relevant AI prompt or tool README.
- Provide a template for the research log (short checklist + table of steps) so future investigations are consistent.
- Ensure the workflow explicitly calls for:
  - Running the same headless test repeatedly (no ad-hoc manual-only verification).
  - Keeping artifacts in `tests/artifacts/` and committed baselines/specs separate per `TESTING_RULES.md`.

Nice to have:
- Add guidance for ordering “add back” steps (ex: base rendering → materials → decals/markings → post-processing → variations/noise → debug overlays).
- Add a short example section referencing a “markings not visible” style issue to illustrate the process.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_203_PROJECTMAINTENANCE_debugging_playbook_headless_bisect_and_research_docs_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

# Summary

- Added a “Regression Debugging Playbook (headless + bisect)” section to `TESTING_RULES.md`.
- Linked the playbook from `PROJECT_RULES.md` so it’s discoverable during iteration.
- Added a reusable Markdown research log template at `debug_tools/regression_debugging/RESEARCH_LOG_TEMPLATE.md`.
