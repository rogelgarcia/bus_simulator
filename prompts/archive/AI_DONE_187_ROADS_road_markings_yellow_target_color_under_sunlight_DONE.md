DONE
#Problem

The current yellow road markings do not consistently match the desired “real-world” yellow under the project’s sun/lighting setup. We want the yellow markings to read as a specific target color when lit by sunlight, so markings look consistent and intentional across the city.

# Request

Adjust the road marking material(s) so:
- Yellow markings target `#EDAC07` when lit by the sun light.
- White markings target `#E8E4D0` when lit by the sun light.

Tasks:
- Identify where the yellow road marking color/material is defined (lane lines, edge lines, crosswalk accents, etc.) and centralize it if needed.
- Calibrate the marking material so that, under the primary sun directional light (typical midday setup), the perceived/tonemapped on-screen colors match the targets as closely as practical.
  - Consider tone mapping (ACES) + exposure + bloom/flare interactions and ensure calibration is done with those settings in mind.
  - Define a repeatable calibration scenario (fixed camera, fixed exposure, fixed sun direction/intensity) to compare before/after.
- Keep PBR correctness:
  - Use appropriate roughness/metalness for painted markings (non-metal; roughness tuned so it doesn’t look plastic or overly matte).
  - Ensure the albedo/base color does not exceed physically plausible ranges.
- Ensure the yellow still reads well across conditions:
  - In shade/overcast it should remain clearly yellow (but darker), not drift to orange/brown.
  - At distance it should not bloom into white or get lost due to mip/AA/tonemapping.
- Ensure the white still reads well across conditions:
  - In shade/overcast it should remain clearly off-white (but darker), not drift to blue/gray.
  - At distance it should not bloom into white or get lost due to mip/AA/tonemapping.
- If markings use a shared shader/variation system, add parameters so the yellow can be tuned without affecting white markings.

Nice to have:
- Add a small “road markings calibration” test view/scene with sample markings and a color picker/readout so automated headless tests can validate target colors quickly.
- Document the chosen calibration assumptions (exposure, sun intensity, time-of-day preset) so future lighting changes can be rebalanced intentionally.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_187_ROADS_road_markings_yellow_target_color_under_sunlight_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Centralized sun-target marking colors (`#EDAC07` yellow, `#E8E4D0` white) and applied them to marking mesh materials and baked marking textures.
- Tuned marking material roughness to a paint-appropriate baseline and wired per-color overrides through `road.visuals.markings`.
- Added a Road Markings calibration debug tool screen for repeatable sampling under fixed sun/exposure.
