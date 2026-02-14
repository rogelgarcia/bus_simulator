DONE

#Problem

In Building Fabrication, belts, columns, and roofs do not have a consistent PBR material selection workflow like walls, and the UV mapping controls are incomplete/inconsistent. This makes it hard to art-direct these elements and keep material behavior consistent across the whole building.

# Request

Add PBR material selection for belts, columns, and roofs, and standardize the material + UV mapping controls so walls, belts, roofs, and columns share the same inputs and UI patterns (including stretch/scale, position, and rotation controls).

Tasks:
- Add PBR material selection for:
  - Belts
  - Columns
  - Roofs
- Standardize controls across walls, belts, roofs, and columns:
  - Use the same control set and same behavior for each surface type.
  - Keep labels/ranges consistent to reduce confusion.
- Expand UV mapping controls to support:
  - Independent stretching/scaling along U and V axes.
  - UV offset/position controls.
  - UV rotation controls.
  - Ensure the mapping controls are applied consistently and predictably across all supported surfaces.
- Persistence/export:
  - Ensure chosen materials and UV settings are stored in the fabrication config and exported building configs.
  - Maintain backward compatibility with older configs (new fields optional, sensible defaults).
- UX:
  - Keep the UI organized so each surface type has a clear “Material / PBR” section.
  - Avoid duplicating logic: prefer shared components/data structures where appropriate so behavior stays consistent.

Nice to have:
- Add a few “UV presets” (e.g., Default, Tile Small, Tile Large, Rotate 90°) to speed up look-dev.
- Add a small material preview thumbnail in the picker (if not already present).

## Quick verification
- In Building Fabrication:
  - Assign a PBR material to belts, columns, and roofs and confirm it renders correctly.
  - Adjust U/V stretch, offset, and rotation and confirm the mapping updates live as expected.
- Export and re-import (or reload) the building:
  - Materials + UV settings persist exactly.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_213_BUILDINGS_building_fabrication_pbr_material_selection_for_belts_roofs_columns_and_shared_uv_controls_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (done)
- Enabled PBR material selection for belts, roof ring, columns, and roof surfaces in Building Fabrication (with consistent picker thumbnails/labels).
- Expanded UV mapping controls to support independent U/V tile meters + existing offset/rotation, and wired them up for walls, belts, roofs, ring, and columns.
- Updated layer schema normalization/cloning + added tests for PBR ids, per-axis tiling normalization, and deep-clone behavior.
