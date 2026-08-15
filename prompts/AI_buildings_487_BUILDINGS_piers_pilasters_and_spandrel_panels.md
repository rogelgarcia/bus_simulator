#Problem

The wall strips between window columns (`spaceColumns`) are flat material bands. The reference buildings with vertical expression use projecting piers that run continuously up the facade, with recessed spandrel panels between the windows of consecutive floors â€” and the grander ones cap the piers with simple capitals (pilaster look). Flat strips cannot produce the strong vertical shadow lines these facades read by.

Reference images: `downloads/buildings_references/` â€” 7 (gray brick piers + recessed stone spandrels), 6 (giant-order pilaster grid with deep reveals), m1 (pier/spandrel geometry in clay), 2 (pilasters with capitals grouping the middle floors).

# Request

Extend the existing space-columns feature into a full pier/spandrel system. Design principle (applies project-wide): extend the ONE existing feature with new modes/options â€” do not add a parallel "pilaster" feature.

Tasks:
- Add projection depth to space columns so piers sit proud of the wall plane (current flat behavior = projection 0, the backward-compatible default).
- Add spandrel panels: the wall zone between vertically adjacent windows (below a window head, above the sill of the window one floor up) gets its own material and recession depth, reading as an inset panel between piers.
- Pier continuity across layers: allow a pier run to span multiple floor layers (e.g. floors 2â€“6 of a shaft) so the vertical line is unbroken by layer seams; respect `planOffset` boundaries.
- Optional capital/base blocks at the top/bottom of a pier run: simple profiled blocks first (`flat`, `stepped`), sized from pier width; material follows trim conventions (slots from AI 491 if landed).
- Interaction with window surrounds (AI 482): surrounds and piers must not overlap/z-fight when both are enabled on narrow columns â€” clamp or warn deterministically.
- Geometry merges via `BuildingGeometryMerger`; shadows correct with the game's sun setup (piers are the main shadow-casters here).
- Update the `BuildingFabrication2` GUI for projection, spandrel, continuity, and capital options with correct thumbnails.
- Showcase: one config in the ref 7 style (brick piers, stone spandrels); validate in `tests/headless/harness/scenarios/scenario_building_showcase.js`.
- Tests: schema normalization round-trip; generator-level test asserting pier projection and spandrel recession are emitted; a continuity test across two stacked floor layers.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_##_SUBJECT_title_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_##_SUBJECT_title_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
