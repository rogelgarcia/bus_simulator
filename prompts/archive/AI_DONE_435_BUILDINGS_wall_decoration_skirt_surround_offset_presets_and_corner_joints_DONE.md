# DONE

# Problem

The wall decoration skirt behavior in the wall decoration debugger currently treats the decoration like a block overlapping or entering the wall volume. Decoration meshes should instead wrap/surround the wall with controlled outward offset and correct corner closure behavior.

# Request

Revise the wall decoration skirt generation model and configuration so skirt decorations are built as surround geometry outside the wall surface, with proper closure pieces and configurable preset sizing.

Tasks:
- Ensure decoration meshes do not overlap/enter the wall body; decorations must be generated outside the wall surface as surround geometry.
- For skirt type, generate the main offset skirt mesh plus closure meshes to seal side/open gaps; include corner-aware geometry with 45-degree corner joints.
- When skirt position is at floor/bottom, do not generate the bottom closure mesh.
- Add size presets in the Config tab:
  - `Small`: height `0.20m`, offset `0.02m`
  - `Medium`: height `0.50m`, offset `0.05m`
  - `Large`: height `1.00m`, offset `0.10m`
- Add an offset mode configuration:
  - `Normal`: uses preset offsets as defined
  - `Extra`: doubles the preset offset values
- Keep offset semantics explicit: offset/depth is measured outward starting from the wall surface (not from an internal/skirt origin inside the wall).

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_435_BUILDINGS_wall_decoration_skirt_surround_offset_presets_and_corner_joints_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_435_BUILDINGS_wall_decoration_skirt_surround_offset_presets_and_corner_joints_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed Summary
- Reworked `simple_skirt` generation to produce outward surround pieces (main + closure meshes) with no wall-body overlap and explicit outward offset semantics from wall surface.
- Added corner-mode skirt continuation with a dedicated `45°` corner joint piece and closure behavior that avoids double-capping at the corner seam.
- Added type configuration metadata for `Preset` (Small/Medium/Large) and `Offset mode` (Normal/Extra), and wired preset sizing/offset doubling into skirt generation.
- Enforced floor/bottom behavior so bottom closure meshes are omitted when placement is set to `bottom`.
- Updated debugger placement logic, specifications, and tests to validate outward placement, preset/mode behavior, and the revised configuration UI.
