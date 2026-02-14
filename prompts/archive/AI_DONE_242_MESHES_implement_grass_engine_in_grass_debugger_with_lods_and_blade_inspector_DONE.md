#Problem (DONE)

We have a grass engine specification (`specs/grass_engine_specification.md`) but no in-game implementation or dedicated tooling to iterate on grass generation, LOD behavior, density, and blade/tuft appearance.

# Request

Implement the grass engine described in `specs/grass_engine_specification.md` on top of the Grass Debugger scene, and expose all grass-engine options in the **Grass** tab. Implement the specified LOD system with flexible per-area LOD configuration and add an interactive blade/tuft inspector popup.

Tasks:
- Implement the grass engine per `specs/grass_engine_specification.md`:
  - Match the spec’s data model and runtime behavior (generation, instancing strategy,  shading/material approach).
  - Ensure deterministic generation given a seed/config.
  - Integrate into the Grass Debugger scene (uses the terrain created in AI_241).
- LOD system:
  - Implement all LOD levels defined in the spec.
  - Allow configuring which LOD(s) apply to each area (it can be 100% a single LOD).
  - Provide distance thresholds that map camera distance → LOD level (use fixed 4 levels if acceptable, but keep it compatible with the spec).
  - Provide tooling to inspect which LOD is active in each area and to force an LOD for debugging.
- Blade/tuft inspector popup:
  - Add a button “Inspect Grass Blade” (or similar) that opens a popup viewport.
  - Popup viewport uses ~80% of the main viewport area and uses a **separate render buffer** (its own renderer/composer target) so it doesn’t interfere with the main view.
  - Show a 3D representation of:
    - A single blade (toggle)
    - A tuft (toggle)
  - Mouse controls:
    - Rotate with mouse drag
    - Zoom with mouse wheel
  - Provide tuft density controls (number of blades per tuft, spacing) and ensure changes update live.
- Grass tab UI:
  - Expose all grass engine parameters from the spec.
  - Expose LOD distance thresholds and per-area LOD configuration in a clear section.
  - Expose debug overlays/stats helpful for tuning (instance counts, triangles, draw calls, active LOD ring visualization).
- Performance:
  - Ensure grass rendering stays performant and scales with density.
  - Avoid excessive draw calls; prefer instancing/batching as per spec.

Nice to have:
- Add an overlay to visualize per-tile/area LOD selection and density.

## Quick verification
- Grass renders in the Grass Debugger and responds to controls.
- LOD transitions behave as configured and can be forced for inspection.
- Inspector popup works:
  - Opens/closes reliably, rotates/zooms, shows single blade vs tuft, uses separate buffer.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_242_MESHES_implement_grass_engine_in_grass_debugger_with_lods_and_blade_inspector_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Implemented a chunked, deterministic GPU-instanced grass engine with 4-tier LOD (Master/Near/Mid/Far), per-area LOD allow/force, and debug overlays (rings + chunk overlay).
- Integrated the grass engine into the Grass Debugger scene and implemented a full Grass tab UI exposing engine, LOD, per-area, debug, and live stats controls.
- Added a Grass Blade/Tuft Inspector popup with its own renderer (separate render buffer) plus drag-rotate/wheel-zoom and live tuft density controls.
- Added Grass Debugger inspector CSS and a Node unit test covering grass RNG + LOD evaluator behavior.
