#Problem

After feature implementation, grass quality and performance can drift without explicit budgets and regression checks. The system needs predictable quality presets and repeatable validation.

# Request

Add grass quality preset tuning and validation so low-cut grass stays within performance targets while preserving expected visual behavior.

Tasks:
- Define and tune grass quality presets with clear tradeoffs in density, LOD ranges, and far cutoff behavior.
- Validate that default preset meets target lightweight runtime constraints for bus gameplay.
- Add repeatable tests/checks for LOD transition stability (no obvious popping or flicker under camera motion).
- Add regression coverage for key visual contracts: near-detail readability, top-down visibility behavior, and fade-to-texture continuity.
- Ensure profiler/debug outputs can be used to compare builds and catch budget regressions quickly.
- Document acceptance criteria and expected baseline metrics for ongoing iteration.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_grass_331_TESTS_grass_quality_presets_performance_budget_and_regressions_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
