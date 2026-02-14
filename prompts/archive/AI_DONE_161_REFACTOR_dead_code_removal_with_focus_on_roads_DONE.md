#Problem (DONE)

The codebase likely contains significant dead/unused code, especially around road generation (multiple approaches, legacy code paths, old helpers, unused UI/debug utilities). Dead code increases maintenance burden, makes refactors riskier, and slows development. Some code may appear “used” only by tests; that should not be considered valid usage if it is not referenced by runtime paths.

# Request

Identify and remove dead code across the repo (with special focus on road generation), iterating until no additional unused files can be deleted. Treat “used only by tests” as dead unless it is also used by runtime code.

Tasks:
- Define “dead code” for this cleanup as:
  - Files/modules that are not imported/referenced by any runtime entry points (browser-loaded modules) and not required by build/runtime configuration.
  - Code paths that are unreachable or permanently disabled (legacy branches that can no longer trigger).
  - “Used only by tests” counts as dead if the module is otherwise unused by runtime.
- Perform a repository-wide reachability analysis starting from runtime entry points:
  - Identify the true runtime roots (e.g., `src/main.js` and any dynamically imported modules it can load via scenes/states).
  - Build an import/reference graph and list unreferenced files.
  - Pay special attention to road generation: legacy road generators, unused helpers, abandoned pipelines, old debug overlays, etc.
- Remove dead files and dead code paths safely:
  - Delete files that are confirmed unreachable.
  - Remove unused exports/functions within still-used modules where appropriate.
  - Update imports and references accordingly.
  - Avoid deleting assets or licensed resources unless explicitly confirmed safe.
- Iterate in multiple rounds:
  - After each deletion pass, re-run the reachability scan to find newly-unreferenced files.
  - Continue until the scan produces no additional deletions.
- Validation:
  - Ensure the app still loads and runs (at minimum, does not throw on module load).
  - Ensure key scenes/states still import correctly (welcome/setup/gameplay/road debugger/building fabrication/inspector room).
  - If tests exist, do not treat test-only imports as “keeping code alive”; tests can be adjusted/removed if they exist solely to reference dead modules.
- Reporting:
  - Produce a concise summary of what was removed and why (grouped by subsystem, especially roads).
  - Provide a list of deleted files and any major removed code paths.
  - Call out any ambiguous cases that require user confirmation (e.g., “might be used by future planned feature”).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_161_REFACTOR_dead_code_removal_with_focus_on_roads_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Removed legacy road generator pipeline code (unused by runtime).
- Deleted test-only/back-compat wrapper modules (road debugger pipeline, sign module re-exports, traffic-light re-exports).
- Updated `tests/core.test.js` to import road engine compute directly and use current traffic light module paths.
- Removed obsolete road connection debugger tests and config file.
- Removed unused `resolveSignAssetModulePath()` from `src/graphics/assets3d/textures/signs/SignAssets.js`.
