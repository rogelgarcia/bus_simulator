# DONE

#Problem

The terrain currently uses ad-hoc controls in the terrain debugger and does not provide a reusable biome-based terrain foundation. We need a standalone system that can generate and evaluate terrain regions for the entire map.

# Request

Create a standalone terrain engine for procedural biome surfaces that supports patch-based maps and humidity-driven variation.

Tasks:
- Define a terrain data model that covers full-map ground coverage (including defaults) and represents:
  - biome type per tile/region (stone, grass, land)
  - humidity per sample
  - patch/region edges suitable for hard-type boundaries with local transition bands near the camera
- Implement a reusable engine module outside the terrain debugger that can be instantiated independently of the debugger lifecycle.
- Ensure biome regions can be generated deterministically from terrain inputs, including support for painterly or texture-driven source maps.
- Ensure biomes are patch-based (hard borders at map scale) while allowing graded transitions only in a configurable near-camera blend zone.
- Add a lightweight API for runtime sampling (position -> biome id, humidity, blend weight) and optional region mask export for debug rendering.
- Provide a migration path so future terrain variants can consume the same terrain contract.
- Document the model in a spec file before implementation finalization, including value ranges, serialization, defaults, and deterministic assumptions.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_grass_332_GRASS_standalone_terrain_engine_for_biome_patch_masks_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (implemented)

- Added standalone `TerrainEngine` (`src/app/city/terrain_engine/`) for deterministic patch-grid biomes (stone/grass/land) with humidity sampling, optional source maps, and view-dependent boundary blending near the camera.
- Documented the terrain engine contract + packed-mask export format in `specs/grass/TERRAIN_ENGINE_BIOME_PATCH_MASKS_SPEC.md`.
- Added node unit tests covering determinism, patch boundaries, and blend activation behavior (`tests/node/unit/terrain_engine_biome_patch_masks.test.js`).
