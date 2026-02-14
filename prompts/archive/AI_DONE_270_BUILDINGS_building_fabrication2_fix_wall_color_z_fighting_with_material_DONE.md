#Problem (DONE)

In Building Fabrication 2, newly created floors/walls render with a default wall color. After selecting/applying a wall material, the wall color appears to still be rendered and **z-fights** with the material surface, causing flicker/overdraw artifacts.

# Request

Fix BF2 wall rendering so applying a wall material does not z-fight with (or double-render against) the default wall color. The fix must be done via configuration/material/render-state logic; **do not** “solve” this by offsetting meshes/geometry to sit on top.

Tasks:
- Default wall color vs material:
  - Ensure the default wall color is a true fallback state only (used when no wall material is configured).
  - When a wall material is configured, the wall must render as a single coherent surface (no competing layered surfaces at the same depth).
- Configuration-based fix (no mesh offset):
  - Resolve the issue by adjusting the configuration/rendering logic (e.g., which passes/materials are enabled) rather than modifying mesh positions or adding geometry offsets.
- Scope:
  - Apply the fix to Building Fabrication 2 wall rendering (including per-face/per-bay overrides if those are already supported).
  - Ensure linked faces (master/slave) do not cause an extra material/color pass to render on the slave.
- Specs update (only if needed):
  - If the fix introduces or changes any authored model flags/behavior (e.g., “wallColor is fallback only”), update the relevant specs under `specs/buildings/`.

## Quick verification
- Create a building/floor in BF2: walls render with the default wall color.
- Apply a wall material: walls render cleanly with the selected material (no flicker/z-fighting with the default color).
- Toggle between multiple materials and back to “no material”: fallback color works and never double-renders with a material.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_270_BUILDINGS_building_fabrication2_fix_wall_color_z_fighting_with_material_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Removed wall-material overlay mesh lifts and resolved wall color/material z-fighting via polygonOffset on the base wall material when per-face/per-bay overlay planes are present.
