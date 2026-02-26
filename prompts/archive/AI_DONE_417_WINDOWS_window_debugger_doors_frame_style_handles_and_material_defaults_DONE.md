# DONE

Door behavior in Window Debugger needs a focused style-system update across frame generation, handle placement/material, double-door layout, frame width controls, and default material/z settings.

# Request

Implement the requested door-focused style changes in Window Debugger, including bottom-frame controls, single/double frame style behavior, updated handle behavior/material options, separated horizontal/vertical frame widths with link option, and updated defaults for glass and muntins.

Tasks:
- In the Frame tab, add a top-level group named `Style` and place door handle options there.
- Add bottom-frame generation for doors, with a toggle to disable rendering.
- Add bottom-frame generation mode option including `Match` (matches frame configuration).
- Update handle connector geometry (the part that connects to the door) to be `50%` thinner.
- Update handle placement to use fixed border offset of `0.15m` from door edge (not relative to door size).
- In Frame Style, add `Single | Double` for doors.
- `Double` behavior must create two door leaves (left/right), each taking half width of the original door span.
- For `Double`, keep total door size stable by introducing `1cm` center gap using `0.5cm` trim per leaf.
- For `Double`, add center-side frame toggle/mode on each door leaf with options: `Match` (match vertical frame config) and `None`.
- Replace old door muntin split behavior (2/3/4 panels algorithm): muntins must behave like window muntins and apply per door leaf face.
- Place handles on each door leaf in `Double` mode.
- For doors and windows, add separate horizontal and vertical frame-width controls plus a link option to lock them together.
- Add handle material mode option: `Match` (frame material) or `Metal`.
- Define `Metal` handle material as light gray, low roughness, high metalness, with elevated env-map intensity.
- Force handle normal strength default/value to `0`.
- Set glass default Z to `-0.04` and clamp/display to 2 decimal places.
- Set muntin defaults to inherit color and inherit material.
- Preserve existing window and door behavior not explicitly changed by this request.
- Update relevant specs under `specs/windows/` and/or `specs/buildings/` for the new door style controls, double-door logic, and defaults.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_417_WINDOWS_window_debugger_doors_frame_style_handles_and_material_defaults_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_417_WINDOWS_window_debugger_doors_frame_style_handles_and_material_defaults_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed Summary
- Added Frame-tab `Style` controls for door frame style, bottom/center frame modes, handle toggle, and handle material mode.
- Implemented separate frame vertical/horizontal width settings with a link option in the Window Debugger UI.
- Extended settings sanitization/defaults for door style metadata, door bottom/center frame config, and handle material mode.
- Implemented double-door geometry with fixed `1cm` center gap while preserving overall opening width.
- Reworked door muntins to generate per door leaf in double-door mode (window-like per-leaf grid behavior).
- Updated handle placement to fixed `0.15m` edge offset and made connector cylinders `50%` thinner.
- Added dedicated handle material routing with `Match | Metal`, with `Metal` tuned to light-gray/high-metal/low-roughness/high-envmap.
- Set glass Z default to `-0.04` with 2-decimal sanitize/UI precision.
- Set muntin defaults to inherit color and inherit frame material.
- Updated window specs to document new door style controls, frame width axis controls, and updated defaults.
