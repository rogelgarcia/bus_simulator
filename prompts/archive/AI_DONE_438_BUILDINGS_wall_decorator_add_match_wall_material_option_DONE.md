# DONE

# Problem

Wall decorators need a material mode that can inherit the wall material directly, instead of requiring an explicit standalone decorator material.

# Request

Add a `Match wall` material selection option for wall decorators so decorator surfaces can follow the wall material automatically.

Tasks:
- Add `Match wall` as a material selection option in the wall decorator material controls.
- When `Match wall` is selected, resolve decorator material from the current wall material source instead of a separate decorator material assignment.
- Keep behavior consistent across wall decorator preview/debugger and runtime application paths.
- Ensure switching between explicit material and `Match wall` is stable and updates render output immediately.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_438_BUILDINGS_wall_decorator_add_match_wall_material_option_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_438_BUILDINGS_wall_decorator_add_match_wall_material_option_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed Summary
- Added `match_wall` as a supported wall-decorator material kind in the shared wall-decorator state model/sanitizer.
- Added `Match wall` option to wall-decoration material controls and UI behavior that disables explicit decorator material selection when active.
- Implemented decorator material resolution from the active wall material source in the wall-decoration debugger view, including immediate reapplication when wall material changes.
- Ensured stable mode switching between explicit material modes and `Match wall` with immediate visual updates.
- Updated specifications and test coverage for catalog sanitization, UI control behavior, and render/material matching behavior.
