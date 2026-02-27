# DONE

# Problem

The wall decoration debugger needs a new decorator style for a circular protrusion shape. The requested shape is a half-circle from side view, with the flat side attached to the wall and circular appearance from front view.

# Request

Add a new wall decoration style that generates a circular half-dome/half-cylinder-like protrusion attached to the wall, including proper corner behavior.

Tasks:
- Add a new wall decorator catalog style for this shape (for example `Half Dome`).
- Geometry behavior:
  - Side view must be a half circle profile.
  - Flat/back side must sit on the wall plane.
  - Front-facing silhouette must be circular.
- Keep the decorator circular-only for now (no oval/non-uniform scaling mode).
- In corner application mode, apply a 45-degree miter/cut at the corner so the shape resolves cleanly across corner conditions.
- Keep integration aligned with existing wall decoration debugger flows (material assignment, position controls, and loader behavior).

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_436_BUILDINGS_wall_decoration_add_half_dome_decorator_with_corner_miter_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_436_BUILDINGS_wall_decoration_add_half_dome_decorator_with_corner_miter_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed Summary
- Added new wall decorator type `Half Dome` (`half_dome`) to the catalog with integrated defaults, metadata-driven configuration, and debugger loader compatibility.
- Implemented circular half-dome shape generation with wall-attached flat back, circular front profile, and unified placement/material flow support.
- Added corner-mode behavior for Half Dome that emits front/right pieces with explicit `45°` miter metadata at the seam.
- Extended wall-decoration view mesh generation to support non-box `half_dome` geometry, including hemisphere shaping, optional 45° miter trimming, and outward wall-surface placement.
- Updated specifications and tests to cover the new Half Dome type, geometry behavior, and corner miter handling.
