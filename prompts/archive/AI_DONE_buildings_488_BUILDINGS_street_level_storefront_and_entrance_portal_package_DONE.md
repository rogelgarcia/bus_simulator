# DONE

#Problem

Ground floors are currently hand-composed from garage/door/window assets plus the awning decorator (see `MainStreetBlock`). The references show a consistent storefront anatomy the composition approach can't reach cleanly: a solid bulkhead base under large display glazing, a transom band above (often backlit white), and a sign fascia — repeated per shop between piers. Entrances are also underpowered: refs have multi-floor door surrounds, arched ornamental portals, steps, and recessed lobbies.

Reference images: `downloads/buildings_references/` — 1/2/3 (storefronts + white transom band between piers), 12/13/16/17 (bulkhead + display glazing + awnings + sign band, outdoor seating scale), 2/8/10 (entrance portals: arched ornament, steps, tall recessed entries).

# Request

Add a first-class storefront asset and an entrance portal composition. Design principle (applies project-wide): ONE storefront feature with per-zone options (bulkhead / glazing / transom / fascia), not separate sibling features per zone.

Tasks:
- Add a `storefront` catalog asset type to the window/door fabrication catalog (`WindowFabricationCatalog`) composed of stacked zones:
  - Bulkhead: height, projection, material.
  - Display glazing: mullion grid (reuse muntin machinery), glass settings, interior parallax enabled by default (shop atlases exist).
  - Transom band: mode `glazed | backlit | none`; `backlit` uses an emissive white panel that participates in the night-lighting look of windows.
  - Sign fascia: reserved flat zone with height + material (a real signage system can target it later).
- Storefronts place like other openings (bays, repeats, linking/mirroring) and work with the existing awning decorator on top.
- Entrance portal: a door-asset composition that can span taller than one floor — surround modes reusing AI 482 machinery at larger scale (`arched_portal`, `flat_band`), plus a steps block (depth/count) and a recessed entry depth.
- Both must respect wall cuts, merge via `BuildingGeometryMerger`, and cast/receive correct shadows.
- Update the `BuildingFabrication2` GUI: storefront zone editor and portal options, correct thumbnails.
- Showcase: rebuild one facade of `mainstreet_block` (or a new config) using real storefront assets + a portal entrance; validate in `tests/headless/harness/scenarios/scenario_building_showcase.js`.
- Tests: catalog normalization round-trip for the new asset type; generator-level test asserting zone geometry (bulkhead, glazing, transom, fascia) is emitted with correct stacking heights.

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

## Summary of changes
- Added `storefront` asset type to `WindowFabricationCatalog` with stacked zones (bulkhead / display glazing / transom `glazed|backlit|none` / sign fascia) and two curated entries; ONE feature with per-zone options.
- Generator decomposes storefront placements: glazed zones ride the normal window-instance path (mullions, glass, wall cuts, parallax), bulkhead/fascia are solid slabs over the wall, backlit transom adds an emissive panel; fascia carries a `storefront_fascia` role for a future signage system.
- Registered the 8 shop/business parallax atlases (wide 6x4, square 4x4, cinematic 8x4) in the runtime atlas catalogs, added the `parallax_interior.shop` preset with storefront-tuned parallax, and a `shop` interior mode across generator + BF2 GUI; storefront glazing defaults to it.
- Entrance portal on door assets: `portal` block with recessed entry (rides the frame-inset wall reveal) and entry steps that raise the threshold and climb from grade; surround reuses AI 482 machinery (`arched_band`/`flat_band` + jambs) with a new per-decoration `heightMeters` override for portal scale.
- Fixed `FacadeBaysSolver` opening normalization to accept the storefront asset type (it silently fell back to `window`), allow storefront repeats, force the secondary `top` opening off, and pass bay-level `portal` through.
- Storefront/portal/steps materials accept slots via the config pre-pass; portal steps and storefront projections feed the outward footprint reserve; merger now keys on `emissiveIntensity` so the backlit panel never merges with non-emissive materials.
- BF2 GUI: Storefront asset type in the opening picker, storefront zone editor (bulkhead/transom mode+height/fascia, definition-level), portal rows (Off/On, recess, steps, rise, bay-level override), Shop interior preset button; def-library rebuilds no longer strip decoration/storefront/portal.
- New engine-2 showcase `storefront_row_2` (shop row between rusticated piers + arched portal + awnings on the side windows) registered in the catalog; browser tests for catalog round-trip, zone stacking, solver survival, generator zone emission and portal steps; node test cross-checking shop atlas registration.
