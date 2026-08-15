#Problem

Two issues observed in gameplay on the storefront building (mainstreet_block-style, tan banded stone with recessed entrance):

1. REGRESSION — corner band decoration rotated wrong: at the building corner, flat band decoration segments (the head band above the storefront glazing and the base/plinth band at the bottom) render rotated ~90° out of plane — thin panels sticking out perpendicular from the wall like fins instead of lying flat against/wrapping the corner. This worked before and looks like a regression; prime suspects are the recent building geometry merge work (`BuildingGeometryMerger`, commit `1ee534d`, prompt AI_graphics_483 era) or a transform/basis change in the decoration emission path. Verify against an older commit to confirm when it broke.

2. MISSING FEATURE — recessed walls don't inherit band decorations: the recessed entrance bay's walls (the recessed plane and its returns) correctly inherit the wall texture from the originating face, but the base/plinth band decoration stops at the recess instead of continuing across it. `specs/buildings/BUILDING_2_FLOORPLAN_TOPOLOGY_SPEC.md` §5.2 already mandates that derived surfaces (returns on inset bays) "SHOULD inherit materials/depth defaults from their originating face/bay" — decorations should follow the same rule.

Reference screenshots (unannotated — locations described here):
- `downloads/bug_refs/494_corner_band_rotated.png`: two mis-rotated segments at the building corner — top-left: the head band above the storefront ends in a segment floating away from the wall near the corner; bottom-center: a base-band panel stands perpendicular to the facade, sticking out toward the sidewalk like a fin, instead of lying flat and wrapping the corner.
- `downloads/bug_refs/494_recess_base_band_missing.png`: the base/plinth band runs along the bottom of the corner pier and stops dead at the recess edge; the recessed wall plane beside the entrance door (left of the pier) has no band even though it inherited the wall texture.

# Request

Fix the corner rotation regression first, then extend derived-surface inheritance to band decorations.

Tasks:
- Regression: reproduce the mis-rotated corner band segments (storefront head band + base band at a building corner), identify the offending change (check decoration segment basis/orientation through the geometry merge path; compare against a pre-merge commit), and fix so bands lie flat and wrap corners correctly again. Add a regression test that asserts band segment orientation (normal alignment with the wall plane) at a corner.
- Inheritance: when a bay recession creates derived surfaces (recessed plane + returns), band decorations that intersect the bay's vertical range must continue onto those surfaces — following the recess in/out (band wraps: front face → return → recessed plane → return → front face) so the band reads continuous.
- Make it controllable per decoration: `inheritOnDerivedSurfaces: true | false` (default `true`, matching the spec's SHOULD). Belt/band schema addition, normalized with round-trip.
- Handle the corner-of-recess joints without z-fighting; merged geometry as always (`BuildingGeometryMerger`); correct shadows.
- Update `BuildingFabrication2` GUI to expose the flag; thumbnails must show the band continuing through a recessed bay.
- Validate on the showcase scenario (`tests/headless/harness/scenarios/scenario_building_showcase.js`) with a recessed-entrance config.
- Tests: orientation regression test (above); generator-level test asserting band geometry is emitted on recessed plane + returns when the flag is on, and stops cleanly at the recess edge when off.

## Delivery requirements
- Engine 2 only: target the facade/bay building engine (facades/bays + window definitions). Do not extend engine 1 (the fixed-spacing `layer.windows`/`spaceColumns` path or the old `BuildingGenerator.js`); it is deprecated and frozen.
- Finish with a screenshot showing the feature in a rendered building — a before/after pair when the change improves something that already renders — and additionally a close-up version of the feature.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
