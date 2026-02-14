# DONE

#Problem

The `stone_lowrise` building config currently uses the stone texture/material selection. We want to update this building to use the “painted plaster wall” PBR material instead, to match the newer material pipeline and achieve the desired appearance.

# Request

Update the Stone Lowrise building config so it uses the painted plaster wall PBR material for its walls (and any other relevant surfaces where the wall style/material is applied), while keeping the building’s overall proportions and window layout the same.

Tasks:
- Identify the `stone_lowrise` building config and where its wall material/style is selected.
- Switch the wall material to the painted plaster wall PBR material:
  - Ensure the correct PBR maps are used (baseColor/albedo, normal, roughness/metalness/AO or ORM as available).
  - Ensure correct color space handling and consistent tiling/scale so the plaster pattern scale looks correct on the building.
- Preserve current building behavior:
  - Keep floors/floorHeight and window sizes/spacing the same as before.
  - Avoid changing unrelated building configs or global defaults.
- Ensure the material renders both in-game and in any preview/inspector tooling where this building can be viewed.

Verification:
- The Stone Lowrise building renders with the painted plaster wall PBR material (no missing textures).
- No console errors during load/render.
- Browser tests still pass (`tests/core.test.js`).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_125_BUILDINGS_switch_stone_lowrise_to_painted_plaster_wall_pbr_material`
- Provide a summary of the changes made in the AI document (very high level, one liner)

# Summary
Switched Stone Lowrise wall material to `pbr.painted_plaster_wall` while preserving legacy building style fields and added a small test assertion.
