#Problem (DONE)

In the Window Mesh Debugger, bevel size and bevel roundness controls produce no visible change on the frame/muntins. This suggests bevel parameters are not wired correctly, are clamped unexpectedly, or the bevel implementation isn’t being applied to the material/texture path.

# Request

Fix bevel size and bevel roundness so they produce a visible, predictable effect on the frame (and muntins when applicable) in the Window Mesh Debugger.

Tasks:
- Diagnose why bevel controls have no visible effect (not applied, wrong uniform/define, wrong range mapping, missing normal/roughness response, etc.).
- Ensure bevel size and roundness produce clear, continuous visual changes across their ranges.
- Ensure bevel works for:
  - Outer frame bevel settings.
  - Muntin bevel settings (independent or inherited, per the current design).
- Ensure bevel effect remains stable under camera motion and lighting (no shimmering/banding artifacts).

Nice to have:
- Add a “bevel exaggerate” debug toggle/preset to make validation obvious.

## Quick verification
- Sweep bevel size 0 → 1 and roundness 0 → 1:
  - Frame highlights/normal response changes visibly and smoothly.
- Toggle “inherit bevel for muntins” (if supported):
  - Muntins reflect the expected bevel behavior.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_234_WINDOWS_window_debugger_fix_bevel_size_and_roundness_effect_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Fixed bevel normal map generation to correctly use `frame.bevel.size` / `muntins.bevel.*.size` so bevel size/roundness sliders visibly affect shading.
- Added a “Bevel Exaggerate” toggle in the Window Mesh Debugger UI for easier validation.
