#Problem (DONE)

In the Window Mesh Debugger, the interior parallax layer is not visible. Enabling/adjusting interior settings produces no observable “fake interior” effect behind the glass.

# Request

Fix the interior parallax layer in the Window Mesh Debugger so the interior is visible and responds to controls (atlas selection, depth, randomization/variation).

Tasks:
- Reproduce and diagnose why the interior is not visible (missing atlas, UVs, shader hookup, depth settings, Z-ordering, opacity, or disabled flags).
- Ensure the interior layer renders behind the glass (and behind shades if present, depending on intended stacking).
- Ensure interior controls work live:
  - Atlas path + grid layout (rows/cols)
  - Depth parameter
  - Random cell selection and horizontal flip
  - Tint variation ranges
- Ensure deterministic variation when a seed is provided.

Nice to have:
- Add a debug “interior only” view and an overlay showing which atlas cell is selected per window.

## Quick verification
- Enable interior and set depth to a clearly visible value:
  - Parallax is visible during camera motion.
- Set a fixed seed and reload:
  - The same interior selection pattern is reproduced.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_231_WINDOWS_window_debugger_fix_interior_parallax_visibility_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary of Changes
- Fixed window interior shader compilation by replacing the `mapTexelToLinear` call with a local sRGB→linear conversion helper.
- Made `interior.enabled` actually hide/show the interior layer in the window mesh generator.
- Added debugger conveniences: layer preset (Interior Only) + an optional per-window interior cell overlay readout.
