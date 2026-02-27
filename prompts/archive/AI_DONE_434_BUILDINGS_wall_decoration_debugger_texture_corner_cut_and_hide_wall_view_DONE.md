# DONE

# Problem

The wall decoration debugger needs visual and control adjustments for more accurate previewing and easier isolation while authoring decorations.

# Request

Update the wall decoration debugger behavior and view controls to improve texture orientation, corner presentation, and scene visibility toggles.

Tasks:
- For plaster wall preview, use 2m x 2m texture sizing and rotate the texture mapping by 90 degrees.
- Change the corner wall cut to a 45-degree corner so both wall faces are visible at the corner (instead of showing the side thickness of a single wall face).
- Add a View panel option to hide/show the wall mesh while keeping decoration debugging functional.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_434_BUILDINGS_wall_decoration_debugger_texture_corner_cut_and_hide_wall_view_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_434_BUILDINGS_wall_decoration_debugger_texture_corner_cut_and_hide_wall_view_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed Summary
- Updated wall preview material behavior so painted plaster uses fixed `2m x 2m` texture sizing and `90°` UV rotation in the wall-decoration debugger.
- Reworked sample corner wall geometry to a single chamfered mesh with a `45°` corner cut, removing the square side-thickness corner artifact.
- Added a left View panel `Show wall` toggle wired to runtime wall-mesh visibility, and covered the new behavior with core tests and spec updates.
