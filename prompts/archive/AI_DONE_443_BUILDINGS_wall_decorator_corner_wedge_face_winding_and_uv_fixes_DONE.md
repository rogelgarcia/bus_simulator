# DONE

## Completed Summary
- Updated `simple_skirt` corner generation to keep full exterior 90-degree reach and use internal 45-degree miter wedges instead of a dedicated corner-joint filler mesh.
- Kept edge-brick-chain corner continuity on full outer reach and strengthened regression coverage for corner-edge reach + miter behavior.
- Updated `curved_ring` and `angled_support_profile` corner span generation to preserve full exterior corner reach while applying internal 45-degree miter cuts.
- Fixed visible face inversion on curved ring and angled support by correcting post-transform triangle winding.
- Kept curved ring wall-facing cap triangles removed and expanded tests to verify cap removal and outward-facing normals.
- Updated wall-decoration spec language to reflect unified corner wedge strategy and outward-face orientation expectations.

# Problem

Wall decorator corner geometry is inconsistent with the required corner strategy used by the wall.  
Current issues:
- `simple_skirt` corner connection is incorrect.
- `edge_brick_chain` corner behavior is incorrect.
- `curved_ring` corner behavior is incorrect and has inverted visible faces (reported as inverted UV) plus unnecessary wall-facing mesh.
- `angled_support_profile` corner behavior is incorrect and has inverted visible faces (reported as inverted UV).

# Request

Fix wall decorator corner continuity and face orientation so all affected decorators follow the same geometric rule and render correctly.

Tasks:
- Apply one consistent corner rule for all affected decorators (`simple_skirt`, `edge_brick_chain`, `curved_ring`, `angled_support_profile`):
  - keep `90°` exterior edges
  - connect segments with an internal `45°` wedge from outer corner to offset intersection (same strategy as wall corner logic)
- Fix face orientation/winding for `curved_ring` and `angled_support_profile` so outward-facing surfaces render correctly and no faces appear inverted.
- Ensure UV layout remains correct after winding fixes (no mirrored/inverted appearance from incorrect orientation handling).
- Remove unnecessary wall-facing/coplanar back mesh on `curved_ring` while preserving intended visible shape and corner continuity.
- Add or update regression tests for:
  - corner wedge strategy consistency across the affected decorators
  - correct face orientation on curved ring and angled support
  - absence of wall-facing cap mesh where not needed
- Update relevant specs under `specs/buildings/` to document the unified corner rule and orientation expectations.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_443_BUILDINGS_wall_decorator_corner_wedge_face_winding_and_uv_fixes_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_443_BUILDINGS_wall_decorator_corner_wedge_face_winding_and_uv_fixes_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change
