#Problem

Building corners are bare seams where two facade materials meet. The reference buildings treat corners as a feature: alternating contrasting stone blocks (quoins), continuous contrasting corner strips, or a chamfered corner face that hosts its own windows or a corner storefront. Nothing in the fabrication schema addresses corners today beyond silhouette resolution (`FacadeCornerResolutionStrategies`).

Reference images: `downloads/buildings_references/` â€” 11/13/15 (stone quoin strips on brick towers), m2â€“m4 (quoin block geometry in the clay renders), 1 and 5 (chamfered corner with its own bay/storefront).

# Request

Add a corner treatment feature. Design principle (applies project-wide): ONE corner feature with modes â€” `quoin_blocks`, `strip`, `chamfer` â€” not separate sibling features.

Tasks:
- Add a `cornerTreatment` schema block (per building with per-corner enable/override), with mode:
  - `quoin_blocks`: alternating long/short blocks up the corner; options for block height, the two alternating widths, projection depth, and vertical rhythm (every course vs every N floors zone).
  - `strip`: continuous contrasting band on the corner; options for width and projection.
  - `chamfer`: cut the corner at 45Â° (configurable width), producing a real extra facade face that can host windows/bays like any other face.
- Material selection follows surround conventions (`match_wall`, explicit; building material slots from AI 491 if landed) â€” quoins are typically the shared trim stone.
- Vertical range control: apply to selected layers only (e.g. shaft floors but not the rusticated base), following layer boundaries.
- `quoin_blocks`/`strip` are overlay geometry on the existing corner â€” they must sit proud of both adjacent walls without z-fighting and merge into the building geometry (`BuildingGeometryMerger`).
- `chamfer` changes the plan silhouette: integrate with the rect facade silhouette + corner resolution pipeline so adjacent faces shorten correctly and the chamfer face participates in window layout; keep this mode scoped to simple rect footprints first.
- Update the `BuildingFabrication2` GUI (mode dropdown + per-mode options, per-corner toggles) with correct thumbnails.
- Showcase: add quoins to a brick tower config (ref 11/15 style) and a chamfered corner variant; validate in `tests/headless/harness/scenarios/scenario_building_showcase.js`.
- Tests: schema normalization round-trip; generator-level test asserting quoin block geometry is emitted with the configured alternation; silhouette test for the chamfer mode corner math.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
