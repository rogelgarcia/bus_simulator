# DONE

#Problem

The `brick_midrise` building config currently uses the legacy brick texture/material selection. We want it to use the red brick PBR material instead so the building looks more realistic and matches the newer material pipeline.

# Request

Update the Brick Midrise building config so it uses the red brick PBR material for its walls (and any other relevant surfaces where the brick style is applied), while keeping the building’s overall proportions and window layout the same.

Tasks:
- Identify the `brick_midrise` building config and where its wall material/style is selected.
- Switch the wall material to the red brick PBR material:
  - Ensure the correct PBR maps are used (baseColor/albedo, normal, roughness/metalness/AO or ORM as available).
  - Ensure correct color space handling and consistent tiling/scale so the brick size looks correct on the building.
- Preserve current building behavior:
  - Keep floors/floorHeight and window sizes/spacing the same as before.
  - Avoid changing unrelated building configs or global defaults.
- Ensure the material can render both in-game and in any preview/inspector tooling where this building can be viewed.

Verification:
- The Brick Midrise building renders with the red brick PBR material (no missing textures).
- No console errors during load/render.
- Browser tests still pass (`tests/core.test.js`).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_124_BUILDINGS_switch_brick_midrise_to_red_brick_pbr_material`
- Provide a summary of the changes made in the AI document (very high level, one liner)

# Summary
Switched Brick Midrise wall material to `pbr.red_brick` while preserving legacy building style fields and added a small test assertion.
