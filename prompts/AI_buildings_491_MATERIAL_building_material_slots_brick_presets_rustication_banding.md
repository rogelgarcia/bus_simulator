#Problem

The reference set is dominated by brick in many colorways and formats plus a shared cast-stone trim per building — but today every feature picks its material independently (trim colors drift apart), brick variety means hunting for textures, and two wall patterns from the refs are unreachable: rusticated stone bases and alternating horizontal material banding. Adding a new PBR set per building does not scale.

Reference images: `downloads/buildings_references/` — brick colorways across 2/9/11/12/13/14/15 (orange/red, brown, tan/buff, gray), 1/11/13 (rusticated stone bases), 16 (mid-block building with alternating brick/stone horizontal bands), 4 (modern panel cladding — out of scope here, note only), consistent light stone trim on nearly every masonry ref.

# Request

Material infrastructure for building fabrication, three parts. Design principle (applies project-wide): shared named slots and presets over per-feature ad-hoc choices.

Tasks:
- Building-level material slots:
  - Add named slots at the building config level: `wallPrimary`, `wallAccent`, `trim`, `base` (extensible list).
  - Features that pick materials (window surrounds AI 482, cornices AI 485, quoins AI 486, piers/spandrels AI 487, storefront AI 488, balcony AI 489, belts) accept `slot:<name>` in addition to their existing modes; resolution order: explicit material > slot reference > legacy `match_*` modes.
  - One slot change then recolors every trim feature on the building consistently.
- Brick preset library:
  - Curated presets over the existing per-brick procedural controls (`bricksPerTileX/Y`, mortar width/color, tint, macro variation) rather than new textures: colorways red/orange, brown, tan/buff, gray, painted; formats standard and roman (long) via bricksPerTile ratios.
  - Per-building tint jitter option (seeded) so one preset yields block-scale variety.
  - Only add new base PBR sets where procedural cannot stretch: rusticated ashlar (for `base` slot, ground floors), smooth limestone/cast stone (for `trim`), brownstone. Calibrate via the existing material calibration workflow (AI 312 panel) before committing values.
- Facade banding:
  - A wall pattern option on a floor layer: alternate two materials in horizontal bands (band heights in courses or meters, offset), producing the ref-16 striped look without stacking many thin layers.
  - Implementer chooses shader-based vs geometry-strip approach, but it must survive geometry merge (`BuildingGeometryMerger`) and remain compatible with `materialVariation` (wear/streaks apply across both bands).
- Update the `BuildingFabrication2` GUI: building-level slot editor, brick preset picker, banding controls.
- Showcase: one config using slots end-to-end (trim slot driving surrounds + cornice + quoins), one banded facade; validate in `tests/headless/harness/scenarios/scenario_building_showcase.js`.
- Tests: slot resolution order unit tests; preset normalization round-trip; banding schema round-trip and a generator/material test asserting two-band alternation.

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
