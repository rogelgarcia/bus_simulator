DONE

#Problem

Building corners are bare seams where two facade materials meet. The reference buildings treat corners as a feature: alternating contrasting stone blocks (quoins) or continuous contrasting corner strips. Nothing in the fabrication schema addresses corners today beyond silhouette resolution (`FacadeCornerResolutionStrategies`); the closest existing tool is the `edge_brick_chain` wall decorator, which already has reusable course/snap layout math, 45°-mitred caps and even a two-face CORNER mode — but its long/short widths are fixed ratios of brick height, both faces alternate IN PHASE (symmetric teeth, not true quoin bond where a long block on one face returns as a short header on the other), its vertical range is meters within one layer, and `stone_lowrise_2` doesn't even use the corner mode: it fakes corners with two per-face decoration-set entries. Port the geometry math; the feature-ization is the work.

Reference images: `downloads/buildings_references/` — 11/13/15 (stone quoin strips on brick towers), m2–m4 (quoin block geometry in the clay renders), 7 (continuous corner strip/pier). Refs 1 and 5 show the larger chamfered corner that hosts its own facade (corner storefront / windowed corner bay); that belongs to the facade-angle model (AI_buildings_498). The plain geometric edge cut is its own feature too (edge bevel, AI_buildings_499).

# Request

Add a corner treatment feature. Design principle (applies project-wide): ONE corner feature with modes — `quoin_blocks`, `strip` — not separate sibling features.

Tasks:
- Add a `cornerTreatment` schema block (per building with per-corner enable/override), with mode:
  - `quoin_blocks`: alternating long/short blocks up the corner, with a bond option: `matched` (both walls show the same width at each course, alternating wide/narrow by course — the ref 11/13/15 brick-tower look, default) or `interlocked` (a long block on one face pairs with a short header on the adjacent face, flipping each course — European stone bond); options for block height, the two alternating widths, projection depth, and vertical rhythm (every course vs every N floors zone).
  - `strip`: continuous contrasting band on the corner; options for width and projection.
- Material selection follows surround conventions (`match_wall`, explicit; building material slots from AI 491 if landed) — quoins are typically the shared trim stone.
- Vertical range control: apply to selected layers only (e.g. shaft floors but not the rusticated base), following layer boundaries.
- Both modes are overlay geometry on the existing corner — they must sit proud of both adjacent walls without z-fighting and merge into the building geometry (`BuildingGeometryMerger`).
- Interaction with the edge bevel feature (AI_buildings_499): a corner whose arris has been beveled carries no quoins/strip — skip such corners automatically (adjacency-derived, no authored exception).
- Update the `BuildingFabrication2` GUI (mode dropdown + per-mode options, per-corner toggles) with correct thumbnails.
- Showcase: add quoins to a brick tower config (ref 11/15 style); validate in `tests/headless/harness/scenarios/scenario_building_showcase.js`.
- Tests: schema normalization round-trip; generator-level test asserting quoin block geometry is emitted with the configured alternation and interlocked around the corner.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary of changes
- Added a building-level `cornerTreatment` schema block with modes `quoin_blocks | strip`, a quoin `bond` option (`matched` default — same width on both walls per course as in refs 11/13/15 — or `interlocked` European stone bond), per-corner enable (AB/BC/CD/DA pairing the quad faces), free block height + two alternating widths + projection, vertical rhythm (`every_course` or `floor_zone` of N courses every M floors), layer selection (`layerIds`, following layer boundaries), and `match_wall`/color/texture material — with normalization and round-trip support (`BuildingFabricationTypes.js`).
- Generator emits per-course two-leg corner blocks (one leg wraps the arris, the header leg tucks against it), with widths driven by the bond mode; strip mode is the continuous full-height pair. Corners are resolved by snapping bounding-box corners to the nearest convex vertex of the layer's resolved silhouette loop, so facade depth offsets still get correct frames. All blocks of a layer are ONE merged BufferGeometry with per-block stone UVs; depth steps with width via `shortProjectionScale` (the wider element projects further, as in the reference towers — per course in matched bond, per leg in interlocked), producing the zig-zag joint shadow (`BuildingFabricationGenerator.js`).
- Config plumbing end to end: CityMap spec/entries, City build, BF2 scene, thumbnail renderer, and BuildingConfigExport all carry `cornerTreatment`.
- BuildingFabrication2 GUI: building-level "Corners" panel (enable, mode, per-mode options, rhythm, material, per-corner AB/BC/CD/DA toggles, per-layer range buttons) wired through a normalize-on-merge patch path; thumbnails preview via the shared generator.
- Showcases: `stone_lowrise_2` migrated from its two per-face `edge_brick_chain` decoration-set entries to the real feature (matched-bond sandstone quoins on the shaft layer); `brick_midrise_2` gained contrasting offwhite matched quoins on red brick (ref 11/15 style); the `edge_brick_chain` decorator itself remains available (still used by `gov_center_2`); validated via the building showcase scenario captures.
- Tests: cornerTreatment normalization round-trip (clamps, per-corner overrides, layerIds filtering, idempotence) and a generator-level test asserting one merged mesh, per-corner skip, course count, full-height span, and the interlock (consecutive courses swap face extents) in `tests/core.test.js`.
