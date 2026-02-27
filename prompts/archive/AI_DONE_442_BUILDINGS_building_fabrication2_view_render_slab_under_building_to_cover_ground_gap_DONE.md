# DONE

## Completed Summary
- Added a new `Render slab` view toggle to Building Fabrication 2 and wired it through UI -> view -> scene callbacks.
- Implemented support slab rendering in BF2 scene with stable create/update/dispose behavior across toggles and in-session rebuilds.
- Sized the slab as a rectangle with `1m` overhang per side around the building footprint, anchored its top at the building base plane, and extended thickness downward.
- Applied `Painted plaster wall` (`pbr.plastered_wall_02`) to the slab material.
- Added core test coverage for the new UI toggle callback and scene slab geometry/toggle lifecycle.

# Problem

Building Fabrication 2 can show a visible gap between the grass ground and the building base. A visual support slab is needed to cover this gap cleanly.

# Request

Add a Building Fabrication 2 view option to render a support slab under the building footprint so the ground/building transition is visually closed.

Tasks:
- Add a View option named `Render slab` in Building Fabrication 2.
- When enabled, render a rectangular slab under the building.
- Slab footprint should be larger than the building silhouette by `1m` on each side.
- Slab top should start at the floor/ground plane of the building base.
- Slab should have configurable/defined thickness that extends downward from that top plane (not upward).
- Use `Painted plaster wall` as the slab material.
- Ensure slab behavior is stable when toggling the view option on/off during the same session.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_442_BUILDINGS_building_fabrication2_view_render_slab_under_building_to_cover_ground_gap_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_442_BUILDINGS_building_fabrication2_view_render_slab_under_building_to_cover_ground_gap_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change
