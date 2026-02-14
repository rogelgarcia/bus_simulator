# DONE

#Problem

The `stone_setback_tower` building config currently uses a stone wall material selection. We want to update this building to use the “patterned concrete” PBR material for its wall surfaces, to better match the desired look and the newer material pipeline.

# Request

Update the Stone Setback Tower building config so its wall material uses the patterned concrete PBR material, while keeping the building’s massing, setbacks, and window layout the same.

Tasks:
- Identify the `stone_setback_tower` building config and where its wall material is specified (including any per-layer materials).
- Switch the wall material to the patterned concrete PBR material:
  - Ensure the correct PBR maps are used (baseColor/albedo, normal, roughness/metalness/AO or ORM as available).
  - Ensure correct color space handling and consistent tiling/scale so the pattern scale looks correct on the building.
  - If the building has multiple wall-related materials (e.g., wall vs spacer columns), update them appropriately (only where it makes sense) while preserving the overall design.
- Preserve current building behavior:
  - Keep the layer structure, floors/floorHeight, plan offsets, and window configuration equivalent to the current design.
  - Avoid changing unrelated building configs or global defaults.
- Ensure the material renders both in-game and in any preview/inspector tooling where this building can be viewed.

Verification:
- The Stone Setback Tower building renders with the patterned concrete PBR wall material (no missing textures).
- No console errors during load/render.
- Browser tests still pass (`tests/core.test.js`).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_126_BUILDINGS_switch_stone_setback_tower_wall_to_patterned_concrete_pbr_material`
- Provide a summary of the changes made in the AI document (very high level, one liner)

# Summary
Switched Stone Setback Tower wall-related materials (walls, spacer columns, roof rings) to `pbr.patterned_concrete_wall` and added test assertions.
