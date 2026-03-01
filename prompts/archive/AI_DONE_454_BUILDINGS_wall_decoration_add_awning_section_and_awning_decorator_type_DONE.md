DONE

# Problem

The wall decoration catalog needs an awning-style decoration commonly used in restaurant/storefront facades for shade coverage.

# Request

Add an `Awning` section and a new awning decoration type to the wall decoration system, with appropriate geometry, presets, and configurable properties.

Tasks:
- Add a new wall decorator catalog section: `Awning`.
- Add a decorator type under that section: `Awning`.
- Geometry for this type must include:
  - one slanted plane,
  - one face/front quad,
  - two side-edge support rods connecting the wall to the slanted/front geometry.
- Ensure rods act as structural supports between the wall anchor and awning surface.
- Add suitable presets for common awning sizes/proportions.
- Add suitable configuration properties for authoring awnings (for example dimensions/angle/offset/material controls consistent with existing wall decoration patterns).
- Keep integration aligned with wall decoration debugger flow and downstream building-decoration usage.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_454_BUILDINGS_wall_decoration_add_awning_section_and_awning_decorator_type_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_454_BUILDINGS_wall_decoration_add_awning_section_and_awning_decorator_type_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed Changes
- Added a new wall decorator catalog section `Awning` and registered a new `Awning` decorator type.
- Implemented awning procedural shape generation with slanted canopy panel, front valance panel, and edge support rods with corner-aware edge routing.
- Added awning presets/defaults/property configuration groups aligned with existing wall decorator authoring patterns.
- Integrated new awning geometry kinds in the wall decoration debugger renderer and documented the type in the wall decoration debugger spec.
