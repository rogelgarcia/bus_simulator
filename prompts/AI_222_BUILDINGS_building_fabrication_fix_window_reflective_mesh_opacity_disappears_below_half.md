#Problem

In Building Fabrication, the window reflective mesh opacity setting behaves incorrectly: when opacity drops below ~0.5, the reflective mesh disappears instead of smoothly becoming more transparent.

This makes it impossible to art-direct semi-transparent reflective glass and suggests there may be a threshold/alpha-test, blending mode, depth sorting, or material parameter bug in the reflective glass pipeline.

# Request

Fix the window reflective mesh opacity behavior so it fades smoothly across the full [0..1] range and never “pops out” or disappears at ~0.5 unless explicitly intended by a separate cutoff setting.

Tasks:
- Reproduce the issue reliably in Building Fabrication:
  - Identify which window types/materials show the disappearance.
  - Confirm whether the disappearance correlates with a specific render state (transparent/alphaTest, depthWrite, renderOrder, side, premultipliedAlpha, etc.).
- Identify the root cause:
  - Check for alphaTest or discard thresholds (e.g., `alphaTest = 0.5`, shader discard, or a “cutout” mode) being used accidentally for the reflective mesh.
  - Check for incorrect blending/depth settings causing the mesh to be culled/sorted away when alpha changes.
  - Check whether opacity is being mapped/clamped incorrectly (e.g., treated as boolean, multiplied into another factor, or compared against 0.5).
  - Check whether the reflective mesh is being hidden when opacity is “low” due to optimization logic.
- Implement a correct opacity model:
  - Opacity should be continuous and predictable across the full range.
  - Ensure it behaves consistently across window styles and floors.
  - Ensure reflections remain visible (appropriately attenuated) at lower opacities without going fully invisible unexpectedly.
- Rendering correctness:
  - Ensure correct transparency rendering order (no major popping, z-fighting, or “sorting behind” issues).
  - Ensure frames/muntins are unaffected (fix applies only to reflective glass mesh/layer).
- Persistence/export:
  - Ensure the corrected opacity behavior applies to both live Building Fabrication state and exported building configs.

Nice to have:
- Add a debug toggle/overlay to display the reflective mesh render state (transparent, alphaTest, depthWrite, renderOrder) to simplify future diagnosis.
- Add a small automated/regression test (if there is an existing render/material test harness) to catch “opacity disables mesh” regressions.

## Quick verification
- In Building Fabrication, vary opacity from 1.0 → 0.0:
  - The reflective mesh remains present and fades smoothly (no disappearance at ~0.5).
- Test with multiple window types and floors:
  - Behavior is consistent and stable during camera motion.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_222_BUILDINGS_building_fabrication_fix_window_reflective_mesh_opacity_disappears_below_half_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
