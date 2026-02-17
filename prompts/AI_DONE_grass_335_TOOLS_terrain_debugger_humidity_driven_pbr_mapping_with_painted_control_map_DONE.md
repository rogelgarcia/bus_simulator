# DONE

#Problem

Terrain Debugger currently treats humidity as a procedural noise/tint behavior, but the intended behavior is humidity-driven PBR texture selection. The current terrain view also lacks a clear biome/humidity texture legend and still shows transitions in ways that do not match the desired edge-only organic blending between final PBR assignments.

# Request

Implement a Terrain Debugger workflow where humidity is authored as control-map data and used to choose PBR textures per location, while keeping rendering lightweight and visually coherent.

Tasks:
- Replace humidity-noise-driven behavior with humidity control-map behavior in Terrain Debugger, so humidity values come from an authored map instead of procedural humidity noise controls.
- Add built-in humidity map painting in Terrain Debugger (dry/neutral/wet authoring flow) and ensure Terrain Engine consumes this humidity as source-map input for terrain sampling.
- Add biome × humidity material binding so each biome can map to dry/neutral/wet PBR texture slots, and ensure sampled terrain resolves to the correct PBR slot at each point.
- Keep terrain rendering PBR-only for this phase (no tint overlay workflow); humidity must affect which PBR texture is used, not color overlays.
- Keep memory usage controlled while supporting the biome × humidity texture matrix, and avoid loading/using unnecessary ground textures.
- Add a compact legend section that shows all active biome/humidity PBR textures in small thumbnail boxes for quick visual validation.
- Ensure transitions occur at final PBR boundaries (including humidity-driven boundaries), with curved/noisy organic edge behavior and edge-band-only blending (not broad square/block blending).
- Keep transition blending behavior aligned with current camera-zone constraints used by Terrain Debugger (near-camera blend controls still apply).
- Preserve Terrain Debugger diagnostic workflows (standard/biome/patch/humidity/transition validation) while updating transition diagnostics to reflect final PBR-boundary blending.
- Remove or de-emphasize obsolete Terrain Debugger controls that no longer match this workflow (humidity noise tuning and humidity tint-centric behavior).
- Add/extend tests to cover deterministic biome/humidity-to-PBR mapping, boundary-blend activation behavior, and Terrain Debugger UI regressions for humidity painting + legend visibility.
- Update relevant specs under `specs/grass/` to document the humidity control-map contract, biome/humidity PBR binding semantics, and transition interpretation.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_grass_335_TOOLS_terrain_debugger_humidity_driven_pbr_mapping_with_painted_control_map_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (implemented)

- Replaced humidity-noise UI flow with authored humidity control-map workflow (Shift+LMB paint + dry/neutral/wet fill + brush controls) and wired it into terrain engine source-map sampling.
- Added biome × humidity PBR binding matrix controls and updated standard terrain shading to resolve final textures from 3x3 slots with edge-band-only humidity transitions and organic edge noise.
- Added compact live legend thumbnails for active biome/humidity PBR slots and updated transition diagnostics to include humidity-boundary bands.
- Reduced unnecessary texture warmup behavior by removing eager preloading of all ground materials from startup path.
- Extended tests and specs for humidity control-map semantics, biome/humidity slot resolution behavior, and Terrain Debugger UI regression coverage for humidity painting + legend visibility.
