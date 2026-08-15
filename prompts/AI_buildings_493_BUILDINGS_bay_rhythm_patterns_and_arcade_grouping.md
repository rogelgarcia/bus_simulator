#Problem

Reference facades rarely place identical windows at even spacing. They use rhythms: paired windows separated by wide piers (A-B-A-B), alternating wide/narrow assets, and — on classical buildings — arched windows grouped into arcades that share a springing line and column rhythm. It is unclear how much of this `FacadeLayoutFillSolver` / `FacadeBaysSolver` already support (e.g. `columnsEvery`, `columnWidthMeters`); the rest is missing.

Reference images: `downloads/buildings_references/` — 7 (paired windows between piers), 8 (uniform pairs in stone frames), 15 (wide/narrow mix per floor), m4 (paired-window rhythm in clay), 2 top floor and 6 (arched arcade rhythm).

# Request

First audit, then extend the bay layout system with pattern support. Design principle (applies project-wide): ONE layout feature — a pattern is a sequence plus spacing rules — not special-cased "paired window" assets.

Tasks:
- Audit: document what the current solvers can already express (window repeats, spacing, `columnsEvery`, fill behavior, linking/mirroring) in a short note inside this prompt when working it; do not rebuild what exists.
- Pattern schema: a repeating sequence of catalog assets per facade band (e.g. `[pair, single]` or `[wide, narrow, narrow]`), with two spacing scopes: in-group spacing (tight, between members of a group) and between-group spacing (the pier width). "Pair" should be expressible as a group of two singles rather than requiring a dedicated pre-authored paired asset.
- Vertical stacking lock: columns align across floors by default (refs stack windows exactly); patterns on different layers of the same building share column positions unless explicitly offset.
- Arcade grouping option for arch-enabled assets: adjacent arched windows share a springing height and the space columns between them read as arcade columns (ref 2 top floor, ref 6). Keep it an option of the pattern system, not a separate feature.
- Corner interaction: patterns must resolve cleanly at facade ends and respect the existing corner resolution strategies (no half-group jammed against a corner).
- Update the `BuildingFabrication2` GUI: pattern editor (sequence + spacing scopes) with live preview.
- Showcase: one config with an A-B paired rhythm (ref 7 style) and one with an arcade top floor (ref 2 style); validate in `tests/headless/harness/scenarios/scenario_building_showcase.js`.
- Tests: solver unit tests for sequence expansion, group spacing math, stacking lock across layers, and end-of-facade resolution.

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
