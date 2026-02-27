# DONE

# Problem

The wall decoration system needs another decorator style representing a continuous angled support profile around the wall/facade. This shape is not a block and should be defined as a profile that is swept continuously by the placement engine.

# Request

Add a new wall decoration decorator style for a continuous angled support profile, with geometry rules and parameters aligned to the current wall decoration architecture.

Tasks:
- Add a new decorator style to the wall decoration catalog/debugger for a continuous angled support profile.
- Define the profile as a 3-line side shape:
  - line 1 anchored on the wall surface,
  - line 2 offset outward from the wall with signed vertical shift,
  - line 3 returning straight up/down in wall orientation to close the profile.
- Keep placement ownership in the engine (do not add position controls owned by this decorator style).
- Keep the style continuous around the facade path (not isolated blocks/segments by default).
- Use a 45-degree miter rule at corners, consistent with the other corner-capable decorators.
- Support one direction only (no mirrored direction mode for now).
- Style parameters should include only:
  - `offset`
  - `shift` (signed)
  - `returnHeight`
- Do not introduce a separate `thickness` parameter for this style.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_437_BUILDINGS_wall_decoration_add_continuous_angled_support_profile_decorator_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_437_BUILDINGS_wall_decoration_add_continuous_angled_support_profile_decorator_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed Summary
- Added new `Angled Support Profile` wall decorator type (`angled_support_profile`) to the catalog with debugger integration and defaults aligned to existing placement/material flows.
- Implemented a continuous swept 3-line profile geometry contract with only `offset`, signed `shift`, and `returnHeight` configuration parameters (no thickness parameter).
- Added corner-mode 45-degree miter behavior for front/right support sweeps using explicit segment miter flags.
- Extended wall-decoration view mesh generation to build and render the angled support profile geometry and apply start/end 45-degree miter clipping.
- Updated specs and tests to validate catalog metadata, geometry behavior, miter rules, and UI configuration controls for the new decorator type.
