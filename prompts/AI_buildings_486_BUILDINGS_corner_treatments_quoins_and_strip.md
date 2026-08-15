#Problem

Building corners are bare seams where two facade materials meet. The reference buildings treat corners as a feature: alternating contrasting stone blocks (quoins) or continuous contrasting corner strips. Nothing in the fabrication schema addresses corners today beyond silhouette resolution (`FacadeCornerResolutionStrategies`); the closest existing tool is the `edge_brick_chain` wall decorator, which already has reusable course/snap layout math, 45°-mitred caps and even a two-face CORNER mode — but its long/short widths are fixed ratios of brick height, both faces alternate IN PHASE (symmetric teeth, not true quoin bond where a long block on one face returns as a short header on the other), its vertical range is meters within one layer, and `stone_lowrise_2` doesn't even use the corner mode: it fakes corners with two per-face decoration-set entries. Port the geometry math; the feature-ization is the work.

Reference images: `downloads/buildings_references/` — 11/13/15 (stone quoin strips on brick towers), m2–m4 (quoin block geometry in the clay renders), 7 (continuous corner strip/pier). Refs 1 and 5 show the larger chamfered corner that hosts its own facade (corner storefront / windowed corner bay); that belongs to the facade-angle model (AI_buildings_498). The plain geometric edge cut is its own feature too (edge bevel, AI_buildings_499).

# Request

Add a corner treatment feature. Design principle (applies project-wide): ONE corner feature with modes — `quoin_blocks`, `strip` — not separate sibling features.

Tasks:
- Add a `cornerTreatment` schema block (per building with per-corner enable/override), with mode:
  - `quoin_blocks`: alternating long/short blocks up the corner, interlocked around the arris (a long block on one face pairs with a short block on the adjacent face); options for block height, the two alternating widths, projection depth, and vertical rhythm (every course vs every N floors zone).
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
