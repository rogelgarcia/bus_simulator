DONE

# Problem

Building Fabrication 2 (BF2) does not yet treat the first floor (street floor) as a special carved interior volume tied to window/door openings.

# Request

Make the street floor a special interior pass that runs as a post-processing step after standard Building Fabrication 2 (BF2) generation, cutting exterior walls at window/door positions and generating a single-room interior shell with fixed material assignments and correct opening-depth carving behavior.

Tasks:
- Implement this feature as a post-processing step on top of existing Building Fabrication 2 (BF2) output (do not rework core/base generation logic).
- Treat the first floor (street floor) as a special case in Building Fabrication 2 (BF2).
- Cut street-floor exterior walls at all street-floor window and door positions.
- Generate one interior room volume for the street floor (single room), including interior wall meshes, floor mesh, and ceiling mesh.
- Apply materials as:
  - interior walls: `Plastered wall 02`
  - interior floor: `Plastered wall 004`
  - interior ceiling: `Concrete layers 2`
- Carve interior depth so interior walls start from the innermost window/door depth plane.
- For openings that are not innermost, generate proper side-wall returns from their opening depth to the interior room wall plane.
- Ensure interior vertical span runs from street-floor base elevation up to `floorHeight - 0.10m` (10 cm below floor top).
- Ensure resulting geometry remains manifold/clean around openings (no holes, overlaps, or z-fighting seams in the carve transitions).
- Preserve existing non-street-floor and non-postprocess behavior unless explicitly required by this feature.
- Update relevant specs under `specs/buildings/` to document street-floor carving, interior-shell generation, and material assignment rules.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_414_BUILDINGS_building_fabrication2_street_floor_window_door_cuts_and_single_room_interior_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_414_BUILDINGS_building_fabrication2_street_floor_window_door_cuts_and_single_room_interior_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed Change Summary
- Added a street-floor post-process carve pass that cuts facade walls at street-floor window/door placements and aligns reveal depths to an interior target plane.
- Added a single-room street-floor interior shell (walls, floor, ceiling) with fixed material assignments and `floorHeight - 0.10m` vertical span.
- Added/updated BF2 tests and building specs to cover street-floor carve activation, interior shell rules, and fixed material mapping.
