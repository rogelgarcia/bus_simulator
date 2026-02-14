# DONE

#Problem

Building windows currently do not have a convincing reflective glass look, and there is no dedicated, persisted option to control window reflection behavior. We want to add reflective window support, but first we need a clean settings and plumbing layer so the feature can be enabled/disabled consistently and applied across all building generation entry points (city generation and building fabrication).

# Request

Phase 1: Add the persisted Options settings and code plumbing needed for reflective building windows (and related window-visual settings), without yet focusing on the final window material/visual implementation details.

Tasks:
- Add a new persisted “Reflective building windows” setting in the Options menu (key `0`) and ensure it is **enabled by default**.
- Define a small “building window visuals” settings shape (persisted) that can be extended in later phases (ex: reflective glass parameters, interior emissive), with all newly introduced toggles defaulting to **enabled** unless explicitly stated otherwise.
- Thread the setting(s) into all building generation entry points so building window visuals are consistent:
  - City generation path(s) that create buildings for gameplay.
  - Building fabrication / inspector paths that create building previews.
- Ensure the setting(s) have a single source of truth and are applied deterministically on creation/rebuild (avoid hidden globals and scattered reads).
- Decide and document the “apply time” behavior:
  - If Options are “Save & Restart”, ensure the setting applies after restart.
  - If live toggle is supported, ensure rebuilds are safe and do not leak materials/textures.
- Ensure the renderer’s environment/reflection setup is compatible with reflective windows:
  - Prefer reusing the existing IBL/environment system (scene environment) rather than introducing a second HDR loader path.

Nice to have:
- Add a short developer note describing where the setting is stored and how to access it from building generation code.
- Add a small “smoke” indicator (log or UI readout) so it’s easy to confirm whether reflective building windows are enabled in the current run.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_173_BUILDINGS_reflective_windows_step1_options_and_plumbing_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added persisted building window visuals settings (reflective windows enabled by default) and exposed a toggle in Options → Gameplay (key `0`).
- Threaded `buildingWindowVisuals` into city building generation and building fabrication previews via a single `windowVisuals` plumbing parameter.
- Documented apply-time behavior (applies on build/rebuild; no new HDR loader path) and added a small core test for default enablement.
