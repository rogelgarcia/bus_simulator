# DONE

The coloring widgets used in Building Fabrication 2 and the wall decorator flow are not behaving correctly. A dedicated debug scene is needed to isolate and validate coloring tool behavior.

# Request

Create a new `Coloring Debugger` scene focused on validating color/material adjustment tools used by BF2 and decorator workflows.

Tasks:
- Add a new debug scene named `Coloring Debugger`.
- Scene setup:
  - create a `3x3` land/ground area,
  - add a wall test object sized `12m` wide, `6m` deep, `6m` tall,
  - add sky rendering in this scene.
- Add a right-side options panel for the scene.
- In options, add a wall material picker:
  - allows selecting any material (no category filtering).
- Add color picker adjustment controls for the wall material in this scene.
- Add a separate section for `normal` and `roughness` adjustments.
- Keep this scene intended for debugging/validation of coloring widgets used by BF2 and decorator tooling.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_460_TOOLS_coloring_debugger_scene_for_bf2_and_decorator_color_widget_validation_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_460_TOOLS_coloring_debugger_scene_for_bf2_and_decorator_color_widget_validation_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed change summary
- Added a new standalone `Coloring Debugger` tool screen with a dedicated scene (3x3 land tiles, 12m x 6m x 6m wall test object, and sky rendering).
- Added a right-side options panel with a wall material picker that can select from all PBR materials (no building/category filtering).
- Added wall color adjustment via the shared HSVB tint picker plus a separate Normal + Roughness section with live slider/input controls.
- Registered the new debugger in `DebugToolRegistry` and added a node unit test to guard registration/key/html wiring.
