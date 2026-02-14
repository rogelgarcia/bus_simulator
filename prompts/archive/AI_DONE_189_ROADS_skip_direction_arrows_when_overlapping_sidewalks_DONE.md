DONE
#Problem

Directional arrows painted on the asphalt sometimes render on top of sidewalks/curbs. This breaks realism and readability, and can happen when an arrow placement would overlap the sidewalk geometry/area. In these cases, it’s better to skip rendering the arrow than to paint it onto the sidewalk.

# Request

When generating/rendering directional arrows on roads, ensure arrows never appear on sidewalks. If an arrow would overlap a sidewalk, skip that arrow.

Tasks:
- Identify where direction arrows are generated/rendered (decals/meshes/marking geometry) and where sidewalk/curb regions are represented.
- Add an overlap check before emitting an arrow:
  - Compute an arrow footprint (bounding box/quad/polygon in world or road-local space).
  - Determine the sidewalk/curb footprint near the arrow placement (sidewalk polygons, curb offsets, or a conservative “no-mark” zone outside the asphalt area).
  - If the arrow footprint intersects/overlaps the sidewalk/curb area, do not render that arrow (skip emitting geometry/decal).
- Ensure the rule is deterministic (same input city/spec → same set of arrows skipped).
- Prefer a conservative check that avoids false negatives (it’s acceptable to skip an arrow rather than risk painting onto sidewalks).
- Validate with a few representative intersections/turn lanes where arrows currently collide with sidewalks and confirm arrows are either fully on asphalt or skipped.

Nice to have:
- Add a debug visualization toggle to show arrow footprints and sidewalk “no-mark” zones to quickly diagnose why an arrow was skipped.
- Add a small metric/log counter for “arrows skipped due to sidewalk overlap” to make regressions easy to spot.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_189_ROADS_skip_direction_arrows_when_overlapping_sidewalks_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added a conservative asphalt “no-mark zone” derived from asphalt boundary loops (inset) and skip arrow emission when any arrow triangle point falls outside it.
- Plumbed the no-mark zones into arrow generation and exposed a `arrowsSkippedNoMarkZone` counter on markings output for quick diagnostics.
- Added a unit test validating arrows are kept/skipped based on the asphalt footprint.
