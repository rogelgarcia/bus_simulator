# DONE

#Problem

The low-cut grass system needs a stronger ground substrate first. Current ground appearance is too uniform, and distant grass transitions will look artificial without natural base texture variation.

# Request

Implement a natural-looking ground substrate foundation for grass areas using multiple blended textures and variation layers.

Tasks:
- Support multiple ground texture sets for grass-capable terrain areas (albedo/normal/roughness-compatible behavior).
- Blend ground textures so transitions feel organic instead of tiled or repetitive.
- Add macro and micro variation controls so large fields do not look flat or pattern-repeated.
- Ensure the substrate remains visually coherent across camera heights used in gameplay and debugger views.
- Keep the solution lightweight enough for bus-sim rendering constraints.
- Ensure the result still looks acceptable when 3D grass is disabled or heavily reduced by distance.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_grass_325_MATERIAL_ground_substrate_multi_texture_natural_blending_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (implemented)

- Added `GroundSubstrateBlendSystem` to blend multiple ground PBR texture sets using procedural noise masks with smooth transitions (albedo/normal/roughness).
- Enhanced Grass Debugger ▸ Terrain tab with substrate blend controls (global enable/seed + two blend layers with macro/micro noise and coverage/softness controls).
- Wired Grass Debugger ground material to load blend-layer textures and drive the shader uniforms from the UI state.

