#Problem

The reference buildings with vertical expression read as a pier/spandrel grid: proud piers running up the facade, recessed window strips with spandrel panels between the windows of consecutive floors, and — on the grander ones — capitals terminating the pier runs. Most of this is already expressible with existing features and needs a verified recipe rather than new geometry; what is genuinely missing is the pier terminations and confidence in the recipe's seams.

Engine scope: this feature targets engine 2 only (facades/bays + window definitions). Engine 1 — the fixed-spacing window path (`layer.windows`, `spaceColumns`) — is deprecated and must not be extended (an earlier draft of this prompt asking to "add projection depth to space columns" was stale; that engine-1 feature already extrudes and is frozen).

Existing engine-2 capability (verify and use, do not rebuild):
- Proud piers: narrow wall bays with an outward depth offset; pier widths are parameterizable as fixed or flexible via the bay size solver (`size: { mode: 'range', minMeters/maxMeters }` with expand preferences).
- Recessed spandrel strips: window bays with an inward depth offset and their OWN per-bay material give pier plane > spandrel plane > glass plane, and the silhouette system emits correct return walls at the steps; windows inset further via face-relative inset / frame depth.
- Cross-layer pier alignment: global facades apply the same bay layout to every layer, so pier bays line up vertically.

Reference images: `downloads/buildings_references/` — 7 (gray brick piers + recessed stone spandrels), 6 (giant-order pilaster grid with deep reveals), m1 (pier/spandrel geometry in clay), 2 (pilasters with capitals grouping the middle floors).

# Request

Make the pier/spandrel grid a first-class, verified outcome of the bay system, and add the missing pier terminations. Design principle (applies project-wide): extend existing features with options — do not add a parallel "pilaster" feature.

Tasks:
- Recipe first: build a ref-7 style showcase config purely from nested insets (proud pier bays, recessed window bays with their own material, windows inset further). Fix whatever breaks — this validates depths, per-bay materials, return edges, and shadows before any new schema is invented. Only add schema for gaps the recipe actually hits.
- Capital/base blocks — the genuinely new geometry: optional profiled blocks (`flat`, `stepped`) at the top and/or bottom of a wall bay's vertical strip, sized from bay width, giving the pilaster look of refs 2/6; material follows trim conventions (`match_wall`, explicit; slots from AI 491 if landed); merged via `BuildingGeometryMerger`, correct shadows.
- Continuity seams: verify pier bays run visually unbroken across stacked floor layers under global facades (belts/cornices between layers are the intended interruptions); fix alignment bugs if any; respect `planOffset` boundaries.
- Interaction with window surrounds (AI 482): surrounds on recessed windows sit on the bay plane; clamp or warn deterministically when surround depth exceeds the bay recession.
- No engine-1 work: `layer.windows`/`spaceColumns` stay frozen (deprecation comments in `BuildingFabricationTypes.js` / `BuildingFabricationGenerator.js` mark them); everything here lands in the facade/bay system.
- Update the `BuildingFabrication2` GUI for the capital/base options with correct thumbnails.
- Showcase: one config in the ref 7 style (brick piers, stone spandrels) built from the recipe + capitals; validate in `tests/headless/harness/scenarios/scenario_building_showcase.js`.
- Tests: schema normalization round-trip for capital/base options; generator-level test asserting capital blocks are emitted at the top of a pier bay; a cross-layer alignment check for pier bays under a global facade.

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
