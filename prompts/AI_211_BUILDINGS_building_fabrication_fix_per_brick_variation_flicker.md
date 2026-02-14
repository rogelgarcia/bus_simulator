#Problem

In Building Fabrication, the wall material’s per-brick variation effect is flickering/shimmering. This makes walls look unstable during camera motion and hurts overall visual quality.

# Request

Fix the per-brick variation so it is stable and deterministic in Building Fabrication walls (and any generated buildings that use the same wall material), while preserving the intended variation look.

Tasks:
- Identify the cause of per-brick variation flickering (e.g., unstable noise sampling, time-based terms, derivative artifacts, precision issues, or incorrect UV/world-space mapping).
- Make per-brick variation stable:
  - No visible flicker/shimmer during camera movement or as time advances.
  - Deterministic results for the same building/config (reload produces the same look).
  - Variation should remain “per brick” (not swimming across the surface).
- Ensure the fix works across wall orientations and building scales (different sizes, floor counts, and face directions).
- Performance and quality:
  - Avoid expensive per-pixel operations that significantly degrade performance.
  - Avoid introducing aliasing/banding; keep the result visually clean under typical post-processing.
- Persistence/export:
  - If the effect has tunable parameters, ensure their behavior remains consistent and exported building configs preserve the intended look.

Nice to have:
- Add a debug toggle/overlay in the relevant wall/material debugger (or Fabrication UI) to visualize the per-brick variation term to make future tuning easier.

## Quick verification
- In Building Fabrication, orbit the camera slowly and quickly around a building with brick variation enabled:
  - Variation remains stable (no shimmer) at multiple distances.
- Export a building config and reload it:
  - The per-brick variation should match before/after export.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_211_BUILDINGS_building_fabrication_fix_per_brick_variation_flicker_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
