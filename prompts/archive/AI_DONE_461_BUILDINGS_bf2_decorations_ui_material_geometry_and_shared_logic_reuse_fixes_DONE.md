# DONE

# Problem

Building Fabrication 2 decoration workflow has multiple issues across UI state feedback, material behavior, slider interaction, geometry placement/rendering correctness, and architecture reuse with the wall decoration debugger.

# Request

Fix BF2 decoration mode behavior and refactor toward shared wall-decoration logic reuse instead of duplicated/diverged implementations.

Tasks:
- UI selection state:
  - Ensure preset buttons, placement buttons, and material mode buttons are visually marked as selected/active when clicked.
- Material flow:
  - Fix `Match wall` so decoration material actually matches the active wall material.
  - For texture material mode, use a texture picker flow (thumbnail/picker) instead of a combo input.
- Slider interaction:
  - Fix slider controls so values update continuously while dragging/holding; do not stop after first change.
- Geometry placement and rendering correctness:
  - Fix side caps so they touch the wall correctly (no unintended outward gap/outset).
  - Resolve duplicate/stacked decoration rendering (especially visible in wireframe); do not render multiple overlapping duplicates for the same intended element.
  - Fix curved ring type so it uses/renderers the correct curved-ring geometry (not wrong function fallback).
  - Fix angled support type so it renders its own support geometry, not skirt-equivalent output.
  - Correct cap generation so caps are rendered as face caps (not unintended volumetric 3D cap blocks), unless explicitly intended by type.
- Shared logic reuse / architecture:
  - Reorganize BF2 decoration implementation to reuse wall decoration debugger generation logic and shape pipeline.
  - Avoid copy/diverge behavior between BF2 decoration rendering and wall decoration debugger; keep a shared source of truth for decorator geometry generation.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_461_BUILDINGS_bf2_decorations_ui_material_geometry_and_shared_logic_reuse_fixes_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_461_BUILDINGS_bf2_decorations_ui_material_geometry_and_shared_logic_reuse_fixes_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed Summary
- Added a shared wall-decoration geometry factory and switched both BF2 and wall-decoration debugger mesh creation to use the same source of truth.
- Updated BF2 decoration materials so `Match wall` resolves the effective active wall material per layer/face/bay (including bay link override chains).
- Replaced decoration texture material combobox flow with shared thumbnail/popup texture picker flow in BF2 decoration material tab.
- Fixed decoration slider interaction to keep live updates during drag without forcing panel rebuild on every tick.
- Added active-state styling for decoration choice/preset/material-mode buttons so selected controls are visibly highlighted.
- Fixed flat cap and side-cap mesh generation to use flat face-cap geometry (instead of volumetric cap boxes) and keep side-cap contact at the wall.
- Added per-bay segment deduplication in BF2 decoration rebuild to prevent overlapping duplicate decoration meshes.
- Updated angled support specs to emit dedicated `angled_support_profile` geometry for the main support faces instead of skirt flat panels.
