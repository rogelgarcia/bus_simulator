# DONE

#Problem

The `gov_center` building config currently uses a cement wall material selection. We want to update this building to use the “plaster brick pattern” PBR material for its wall surfaces, to achieve the desired appearance and align with the newer material pipeline.

# Request

Update the Gov Center building config so its wall material uses the plaster brick pattern PBR material, while keeping the building’s overall design, layer structure, and window layout the same.

Tasks:
- Identify the `gov_center` building config and where wall materials are specified (including any per-layer materials).
- Switch the wall material to the plaster brick pattern PBR material:
  - Ensure the correct PBR maps are used (baseColor/albedo, normal, roughness/metalness/AO or ORM as available).
  - Ensure correct color space handling and consistent tiling/scale so the plaster/brick pattern scale looks correct on the building.
  - If multiple layers use the wall material, update them appropriately without changing unrelated materials (e.g., roof materials) unless needed for consistency.
- Preserve current building behavior:
  - Keep the layer structure, floors/floorHeight, plan offsets, and window configuration equivalent to the current design.
  - Avoid changing unrelated building configs or global defaults.
- Ensure the material renders both in-game and in any preview/inspector tooling where this building can be viewed.

Verification:
- Gov Center renders with the plaster brick pattern PBR wall material (no missing textures).
- No console errors during load/render.
- Browser tests still pass (`tests/core.test.js`).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_127_BUILDINGS_switch_gov_center_wall_to_plaster_brick_pattern_pbr_material`
- Provide a summary of the changes made in the AI document (very high level, one liner)

# Summary
Switched Gov Center wall materials to `pbr.plaster_brick_pattern` and added test assertions.
