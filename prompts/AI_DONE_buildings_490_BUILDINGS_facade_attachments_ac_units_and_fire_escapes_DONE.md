# DONE

## Summary of changes
- `FacadeAttachmentsModel.js` (new): ONE attachments feature with types as modes (`ac_unit`, `fire_escape`), shared normalizer + deterministic FNV-based scatter hash (`shouldPlaceAcUnit`), three-free for solver/GUI/node reuse.
- Generator: `ac_unit` scatter in the engine-2 instance pass — box+grille geometry at the opening bottom with slight downward tilt, seeded per building seed + stable instance key (same city always renders identically), per-layer/asset/min-floor eligibility, merged into one mesh per item.
- Generator: `fire_escape` runs — railed landings per floor (grid bars + posts + top rail via a shared railing-run helper in the AI 489 balcony kit language), alternating angled stair flights (stringers + treads + handrails), drop ladder below the lowest landing (auto-skipped when the landing is grade-adjacent); one merged dark-metal mesh per run, shadows verified in renders.
- Attachments plumbed end-to-end: generator param, CityMap records/overrides, City build, BF2 scene + thumbnail renderer, config export/import, showcase scenario override keys.
- BF2 GUI: building-level Attachments section (add/remove items; AC probability/seed/layer/min-floor; fire escape layer/face/bay pickers, floors range, platform depth).
- Showcases: AC scatter on `storefront_row_2` upper brick floors (ref 13/15), fire escape + light AC scatter on `mainstreet_block` (ref 2/3 Bradbury style).
- Tests: 6 node unit tests (round-trip, determinism, hash distribution), 3 browser generator tests (deterministic scatter incl. identical geometry across rebuilds, landings/flights/ladder counts per floors range, eligibility rules).
- Skipped per prompt's "if cheap" clause: the drip-streak materialVariation tie-in (would couple the scatter to the wall shader pass).

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
