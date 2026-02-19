# DONE

#Problem

The terrain debugger biome tiling workflow needs a first-pass way to validate displacement behavior near the camera before adding dynamic LOD complexity.

# Request

Add a first-pass displacement validation workflow to the Terrain Debugger `Biome Tiling` tab so displacement maps can be evaluated quickly and repeatably.

Tasks:
- Add user-facing controls to enable/disable displacement and tune displacement strength and bias for the active ground material.
- Add a displacement source selector experience that makes it clear which texture is being used and when a fallback is active.
- Add geometry density controls for the terrain surface (single global density for phase 1) with an explicit rebuild/apply action.
- Add debug visualization support to isolate displacement readability (for example, wireframe/displacement-focused inspection mode).
- Add basic live diagnostics in the UI so users can confirm the current geometry complexity and update cost after changing settings.
- Ensure settings remain stable across focus actions in the tiling tab and do not break existing terrain/biome controls.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_grass_344_TOOLS_terrain_debugger_biome_tiling_displacement_validation_phase1_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added new `Biome Tiling` UI controls for displacement enable/disable, strength, bias, source selection, and inspection mode.
- Added phase-1 geometry density controls (`segmentsPerTile`) with explicit apply/rebuild action via `applyNonce`.
- Added live diagnostics lines in the tab for resolved displacement source/fallback, geometry complexity, pending density, and last update costs.
- Wired displacement runtime in the view: source resolution, fallback handling, displacement map application, and debug visualization behavior.
- Wired geometry apply flow so density changes are staged and only rebuild terrain when the explicit apply action is triggered.
- Updated the terrain debugger contract spec to include new biome tiling displacement and geometry-density fields and behavior.
