# DONE

#Problem

The current debugger directly drives terrain material and variation behavior with legacy controls, so a standalone terrain engine cannot be reused outside the debugger and controls are hard to keep consistent.

# Request

Refactor the terrain debugger to consume the new standalone terrain engine and use it as the single source of truth for biome and patch behavior.

Tasks:
- Replace legacy terrain-debugger-only ground handling with calls into the standalone terrain engine.
- Ensure the engine instance is created, updated, and disposed by the terrain debugger lifecycle without changing renderer ownership.
- Preserve terrain rebuild behavior when geometry/layout/slope/cloud settings change.
- Remove or deprecate legacy terrain controls that are no longer authoritative (material picker, uv scale controls, uv distance controls, terrain variation layers) and route equivalent behavior through terrain engine config/state.
- Introduce a terrain engine debug payload in debugger state so changes to biome type, humidity fields, patch scale, and transition settings are persisted and restored.
- Keep grass integration behavior working with the new terrain system and maintain current exclusion behavior around roads/sidewalks.
- Add/update a focused spec for debugger-engine contract and migration notes so the coupling is explicit.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_grass_333_TOOLS_wire_terrain_debugger_to_standalone_terrain_engine_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (implemented)

- Added explicit Terrain Debugger ↔ Terrain Engine contract spec (`specs/grass/TERRAIN_DEBUGGER_ENGINE_CONTRACT_SPEC.md`) and updated engine spec/migration notes.
- Refactored Terrain Debugger UI to configure `terrain.engine` (seed/patch/biomes/humidity/transition) and removed legacy ground material/UV/variation controls.
- Wired `TerrainDebuggerView` to own the `TerrainEngine` lifecycle and keep engine bounds in sync with terrain rebuilds.
