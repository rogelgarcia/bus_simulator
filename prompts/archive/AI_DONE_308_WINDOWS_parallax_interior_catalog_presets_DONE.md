# DONE

## Summary
- Added `ParallaxInteriorPresetCatalog` (preset ids + resolver) and exported via window mesh domain index.
- Added `interior.parallaxInteriorPresetId` to window mesh settings; presets override atlas/depth/zoom during sanitization.
- Updated the Window Mesh Debugger / BF2 window authoring UI to use a preset picker with advanced/manual controls collapsed.
- Added a node unit test covering preset override behavior.

#Problem

The current window/parallax interior system exposes many configuration options directly in the window builder UI. This makes authoring slow and error-prone, and it spreads ownership of “correct” parallax interior tuning across UI code rather than the asset/preset itself.

We want parallax interiors to be **owned by a catalog** (presets), where each preset is linked to the correct parameters for the atlas/material so it “just works” when selected. The UI should reduce to selecting a parallax interior preset (by id), and the system should apply the correct config automatically.

# Request

Create a new **Parallax Interiors Catalog** and refactor the window/parallax interior selection flow to use it.

Tasks:
- Add a parallax interiors catalog:
  - Create a new catalog module (location consistent with other catalogs) that exports:
    - A list of parallax interior preset options (id + label + optional preview).
    - A resolver that returns a fully-specified config object for a given preset id.
  - The catalog is the owner of the parallax tuning parameters (preset-defined), not the window builder UI.
- Default preset configuration (provided values):
  - For the initial preset(s), set:
    - `parallaxDepth = 20m`
    - `interiorZoom = 1.6`
  - All other parameters should use the same defaults already used by the existing windows builder (do not change behavior beyond these two values).
- Integrate with the window/parallax interior system:
  - Update the window builder logic so a plane/window can select `parallaxInteriorId` (preset id) instead of manually specifying many parallax parameters.
  - Ensure selecting a preset results in the correct material/shader parameters being applied.
  - Ensure the selection is persisted in the relevant building/window spec so it survives rebuilds/reloads.
- UI/UX:
  - Replace or de-emphasize the many per-parameter controls in the window builder UI with a single preset picker.
  - Optional: allow an “Advanced” section for overrides later, but the default workflow should be “pick preset and done”.
- Backward compatibility:
  - If existing saved buildings/windows store raw parallax parameters, provide a safe migration path:
    - either map them to a preset when they match defaults,
    - or keep legacy configs working while new ones use preset ids.
- Validation:
  - Ensure the catalog resolver always returns valid values (no NaNs, clamped ranges) and fails loudly for unknown preset ids (or falls back deterministically with a warning).

## Proposal (optional implementation ideas)
- Store only `parallaxInteriorId` in window specs, and keep a separate optional override object for future “advanced” tweaks.
- Implement `getParallaxInteriorOptions()` + `getParallaxInteriorById(id)` similar to existing PBR material catalogs.

## Quick verification
- Window builder shows a Parallax Interior preset picker.
- Selecting a preset applies parallax interior with `parallaxDepth=20m` and `interiorZoom=1.6` using existing defaults for everything else.
- The chosen preset persists after rebuild/reload.
- Old saved configs still render correctly.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_308_WINDOWS_parallax_interior_catalog_presets_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
