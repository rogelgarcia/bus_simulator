#Problem

Fabricated facades read too clean. Two attachment types dominate the references' lived-in look: window AC units scattered across residential facades, and zigzag fire escapes running down street faces. Neither exists in the system.

Reference images: `downloads/buildings_references/` — 9/13/14/15/m1 (AC units in scattered windows), 2/3 (fire escapes: landings at each floor, angled stair flights between them, drop ladder at the bottom).

# Request

Add a facade attachments system. Design principle (applies project-wide): ONE attachments feature with types as modes (`ac_unit`, `fire_escape`), sharing placement/anchoring machinery — not unrelated sibling systems.

Tasks:
- `ac_unit` type — per-window scatter decoration:
  - Simple box + front grille geometry protruding from the opening (bottom-of-window placement, slight downward tilt).
  - Probability-based scatter (e.g. 0–40% of eligible windows), seeded deterministically from building id + window index so the same city always renders identically.
  - Eligibility rules per layer/asset (e.g. residential floors yes, storefronts no).
  - Optional tie-in: a subtle drip streak below the unit via the existing `materialVariation` streaks machinery if cheap to do; skip if it fights the shader.
- `fire_escape` type — per-facade vertical run:
  - Anchored to a chosen window column; components: landing platforms at each floor (reuse the balcony railing kit from AI 489 — grid infill, posts, top rail; soft dependency: if 489 has not landed, build the minimal shared parts in a way 489 can adopt), angled stair flights connecting landings, and a final drop ladder segment at the bottom floor.
  - Options: floors range, side offset, painted metal material (dark), platform depth.
- Both types merge via `BuildingGeometryMerger`. Fire escapes are thin-bar geometry: verify shadow behavior (acne/aliasing) with the game's sun setup and pick sensible shadow flags; keep triangle counts modest (bars as boxes, no cylinders needed).
- Update the `BuildingFabrication2` GUI: attachments section with per-type options and preview.
- Showcase: AC scatter on a brick tower config (ref 13/15 style) and a fire escape on a Bradbury-style facade (ref 2/3); validate in `tests/headless/harness/scenarios/scenario_building_showcase.js`.
- Tests: schema round-trip; determinism test (same seed → same AC placement set); generator-level test asserting fire escape emits landings + flights + ladder for a configured floors range.

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
