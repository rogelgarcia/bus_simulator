#Problem (DONE)

In the Window Mesh Debugger, window shades are not visible. Enabling/adjusting shade settings produces no observable shade layer in the window stack.

# Request

Fix the window shade layer in the Window Mesh Debugger so shades render correctly and respond to shade controls.

Tasks:
- Reproduce and diagnose why shades are not visible (layer not created, Z-ordering, materials, opacity, depth/sorting, or disabled by default).
- Ensure the shade layer renders behind the glass as intended and is visible under typical lighting.
- Ensure all existing shade controls (coverage, color, texture/scale/intensity, Z offset) affect the shade result live.
- Ensure shade visibility works across window types (rect + arch) and with/without muntins.
- Ensure no regressions to other layers (frame/glass/interior).


## Quick verification
- In the Window Mesh Debugger, set shade coverage to 50% and 100%:
  - Shade becomes clearly visible and matches coverage direction.
- Toggle shade layer visibility:
  - Only the shade changes; other layers stay intact.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_230_WINDOWS_window_debugger_fix_shade_visibility_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary of Changes
- Fixed shade visibility by forcing `shade` to render after `interior` (render order) so it can’t be hidden by opaque sorting.
