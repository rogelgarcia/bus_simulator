# DONE

#Problem

Lighting behavior is inconsistent across screens because each screen resolves lighting differently.
We need one global lighting system used by all screens that applies a shared code-layer + user-layer model, with one explicit exception for calibration.
Currently calibration needs a clean full-replacement behavior separate from normal lighting.
Even fully decoupled screens must import and use the same global lighting resolver.

# Request

Define a global lighting architecture used by every screen:
- Default behavior: one shared resolution model everywhere (code defaults + browser/user overrides).
- Calibration exception: the calibration screen exposes a preset option that replaces all lighting values when selected.

Tasks:
- Define a single global lighting resolver with one default path and one calibration override path:
  - Default path: resolve from source-layer + user-calibration layer (`L1 + L2`) and apply to every screen by default.
  - Calibration path: when a preset is explicitly selected, replace the merged default path values for calibration only.
- Store and persist data so behavior is deterministic and independent of the current screen navigation.
- Ensure all screens use the same default path and cannot accidentally drift from it.
- Ensure calibration screen has a clear preset selection state and shows that preset mode is active when a preset is in use.
- Preserve existing user-adjusted values in browser storage across sessions for default mode and keep them untouched while using a calibration preset.
- Define what happens when a selected preset is missing, invalid, or incomplete.
- Add reset behavior for both:
  - clear browser overrides in default mode
  - clear active preset and return to default merged path
- Limit the change to lighting configuration behavior; do not alter unrelated UI screens.
- Ensure every scene is using the same global lighting resolver. Create a list of screens and verify one by one.

Constraints:
- No route-based split. This is purely a global lighting-state architecture.
- Calibration preset must be a complete replacement snapshot when selected, not a shallow merge.


## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_342_UI_lighting_modes_with_calibration_presets_DONE.md` on `main`
- Do not move to `prompts/archive/` automatically.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (implemented)

- Added a single global resolver contract in `LightingSettings` with two explicit paths: default `L1 + L2` merge and calibration preset full-replacement snapshot mode.
- Added strict calibration snapshot completeness validation and explicit fallback-to-default behavior for missing/invalid/incomplete preset selections.
- Updated Material Calibration illumination presets to carry complete lighting snapshots and added a `Default (Global)` mode option.
- Updated Material Calibration UI to show explicit lighting mode state and added reset actions for clearing active preset mode and clearing saved default browser overrides.
- Updated Material Calibration view/scene/state wiring so preset mode applies only in calibration, default mode uses global merged resolver, and exiting calibration reloads shared global lighting.
- Updated calibration spec to document the global resolver architecture, fallback behavior, and persistence/reset semantics.
- Screen verification list (resolver path audit):
  - Main runtime path: `GameEngine` (covers gameplay states/screens)
  - `City`
  - `AtmosphereDebuggerView`
  - `AOFoliageDebuggerView`
  - `MarkingsAADebuggerView`
  - `SunBloomDebuggerView`
  - `LabSceneView`
  - `RoadDebuggerScene`
  - `MaterialCalibrationScene` (default path + calibration override path)
