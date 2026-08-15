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

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
