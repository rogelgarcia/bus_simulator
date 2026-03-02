# DONE

# Problem

In gameplay, `beige1` building rendering is using exact BF2 sizing without city-context boundary constraints. Building placement should be bounded by city tile allocation (after road/sidewalk deductions), but current flow appears center-driven instead of boundary-driven.

# Request

Review and fix gameplay/BF2 integration so city organizer provides build boundaries (not only center), and BF2 generation respects those bounds including bay extrusion extents.

Tasks:
- Review current city-to-building fabrication integration logic for gameplay placement of BF2-generated buildings (including `beige1` path).
- Change placement contract so city organizer provides the allowed build area/boundaries to building fabrication (not only center position).
- Ensure city build area is derived from full tile area reduced by road/sidewalk constraints.
- Update BF2 generation fit logic to consider maximum occupied extents (width/length), including bays extruded outward/inward, so final geometry stays inside provided area.
- Ensure footprint solving and extrusion-aware bounds checks prevent overflow outside city-assigned build area.
- Keep behavior deterministic and compatible with existing city generation workflow.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_478_BUILDINGS_gameplay_bf2_boundary_driven_footprint_and_extrusion_fit_from_city_organizer_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_478_BUILDINGS_gameplay_bf2_boundary_driven_footprint_and_extrusion_fit_from_city_organizer_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed changes
- Updated gameplay city-to-BF2 integration to pass a per-building `buildAreaLoops` boundary derived from tile allocation via `computeBuildingLoopsFromTiles`, instead of relying on centroid placement only.
- Added explicit-footprint boundary fitting in BF2 generation (`buildAreaLoops` contract) with deterministic center+scale fit and final clamp to stay within city-assigned area bounds.
- Added extrusion-aware reserve fitting by estimating outward envelope from floor plan expansion, belt extrusion, and facade bay depth so final occupied geometry remains inside the build area.
- Added regression coverage in `tests/core.test.js` for runtime `beige_1` build-area contract usage and an explicit overflow case validating footprint fit against city boundaries under outward bay depth.
