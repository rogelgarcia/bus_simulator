#Problem

In Building Fabrication wall materials, the “streaks” effect is flickering, and the pattern appears incorrect on side faces (different/incorrect orientation compared to the intended look). The effect needs to align with each face’s orientation so all faces present the correct pattern.

# Request

Fix the streaks effect so it is stable (no flicker) and correctly oriented per wall face direction, producing a consistent and intentional pattern on all building faces.

Tasks:
- Diagnose why the streaks effect flickers (unstable sampling/noise, time-based terms, precision/derivative artifacts, incorrect UVs, etc.) and eliminate the flicker.
- Correct face orientation behavior:
  - Ensure the streaks pattern is oriented consistently for each wall face (front/back/left/right), matching the intended directionality.
  - Side faces should not show a mismatched pattern; the effect should behave as if it is rotated to the face’s local orientation.
  - Avoid visible seams or abrupt discontinuities at corners (keep transitions plausible).
- Ensure the fix works across:
  - Different building sizes and face aspect ratios.
  - Different UV mapping modes (if multiple exist) and any wall material variants that enable streaks.
- Keep existing streaks controls/behavior intact where possible (same ranges, same visual intent).

Nice to have:
- Add a simple “orientation debug” mode to render streak direction vectors/preview so it’s obvious the effect is face-aligned.

## Quick verification
- In Building Fabrication, enable streaks and orbit the camera:
  - No flicker/shimmer during motion.
  - Each face shows the same intended streaks orientation relative to that face.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_212_BUILDINGS_building_fabrication_fix_streaks_flicker_and_face_rotation_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
