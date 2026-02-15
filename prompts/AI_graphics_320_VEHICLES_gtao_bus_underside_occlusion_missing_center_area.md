#Problem

With GTAO enabled, bus grounding appears mostly around the bus perimeter while the center underside lacks expected occlusion, especially at low camera angles.

# Request

Improve bus underside occlusion under GTAO so grounding looks coherent across the full underside contact region, not just edge borders.

Tasks:
- Reproduce and characterize the missing-center underside occlusion behavior across relevant bus variants.
- Ensure underside AO appears plausible under the bus body center and transitions naturally to wheel/chassis contact areas.
- Maintain stable behavior under low-angle and side-view camera movement.
- Avoid excessive darkening or visual artifacts while restoring expected grounding.
- Validate the final behavior in normal gameplay scenes, not only in isolated tests.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line.
- Rename the file in `prompts/` to `prompts/AI_DONE_graphics_320_VEHICLES_gtao_bus_underside_occlusion_missing_center_area_DONE.md`.
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change).
