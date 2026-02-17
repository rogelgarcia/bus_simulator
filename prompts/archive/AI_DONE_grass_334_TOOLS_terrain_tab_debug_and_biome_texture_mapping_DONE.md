# DONE

#Problem

Terrain debugging still displays general ground texture controls instead of actionable terrain-engine diagnostics, and there is no explicit workflow for mapping existing PBR assets to biome + humidity outputs.

# Request

Update terrain debugger UI to show terrain engine diagnostics and bind biome channels to the available ground/grassy ground-cover PBR assets.

Tasks:
- Add terrain-tab debug modes for:
  - biome id map (patch type)
  - patch boundaries/IDs
  - humidity map
  - blended transition band visualization
- Read current available PBR textures and define the material binding policy so the final biome palette uses:
  - gray = stone regions
  - green = grass regions
  - orange = land regions
  - dry humidity variants using yellow-tinted textures
  - humid variants using darker green-tinted textures
- Ensure the terrain debugger can switch between standard render mode and map/patch debug views without affecting normal rendering state.
- Clean up obsolete terrain controls in the UI and keep only controls that configure engine state and outputs.
- Add short usage notes in the terrain debugger about what each debug mode shows and how to validate that full-map patch coverage has no gaps.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_grass_334_TOOLS_terrain_tab_debug_and_biome_texture_mapping_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (implemented)

- Added Terrain tab debug view modes (standard, biome id, patch IDs, humidity, transition band) with short validation notes.
- Implemented packed-mask texture + dedicated debug material/texture pipeline so switching debug views doesn’t mutate the standard terrain material.
- Bound biome palette to PBR baseColor maps (`pbr.rocky_terrain_02`, `pbr.grass_005`, `pbr.ground_037`) and applied humidity tinting (dry yellow tint, humid dark-green tint) in the terrain biome blend shader.
