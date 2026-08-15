DONE

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

## Summary of changes (2026-08-15)

- **Material slots**: `src/app/buildings/BuildingMaterialSlots.js` — building-level `materialSlots` config (`wallPrimary`/`wallAccent`/`trim`/`base` + custom names); a config pre-pass (`resolveBuildingConfigMaterials`, run at the top of `buildBuildingFabricationVisualParts`) rewrites `{kind:'slot'}` / `slot:<name>` references into explicit specs across layer walls, face materials, bay overrides, belts, cornices (+ornament/coping), roof ring/surface, corner treatment, wall decorations, window surround decorations and banding; resolution order is explicit > slot > legacy `match_*`.
- **Brick preset library**: `src/app/buildings/BrickPresetCatalog.js` — 10 curated presets (red/orange/brown/tan-buff/gray/painted × standard/roman) as `{kind:'preset', id}` material specs bundling base texture + multiply tint + tiling scale + per-brick/mortar grid (`materialVariation.brick`); seeded per-building tint jitter via `jitter: true` on the reference (derives from `materialVariationSeed`, so one preset varies per placement).
- **New PBR sets** (procedural, `tools/ai491_generate_stone_pbr.mjs`): `pbr.rusticated_ashlar` (base slot / ground floors), `pbr.limestone_smooth` (trim), `pbr.brownstone` — registered in the catalog index; calibration is neutral pending an AI 312 pass (noted in each config).
- **Facade banding**: floor-layer `banding` schema (`unit` meters/courses, primary/secondary heights, offset, secondary material incl. slot/preset refs, optional wallBase/tiling); geometry-strip implementation in `buildWallSidesGeometryFromLoopDetailXZ` (`yBands`) that splits base-wall cells at band boundaries, keeps bay overrides unbanded, regroups triangles to one draw range per material, shares the layer's `materialVariation` (world-space wear/streaks continuous across bands) and survives `BuildingGeometryMerger` (multi-material walls pass through unmerged, as before).
- **Window surrounds**: `WINDOW_DECORATION_MATERIAL_MODE.SLOT` (`{mode:'slot', slotId}`) on decoration parts; resolved to `pbr` by the pre-pass, falls back to `match_wall`.
- **Plumbing**: `materialSlots` flows through `CityMap.fromSpec`, `City`, BF2 scene + thumbnails, `BuildingConfigExport`, and the showcase scenario override keys (also added `cornerTreatment` there).
- **BF2 GUI**: building-level Material slots editor (assign texture/color/brick preset per slot + jitter toggle), per-layer Wall preset picker (preset/slot refs with jitter), per-layer Banding controls (unit/heights/offset/material), and `Slot: <name>` options in the cornice/quoin material selects; building-level sections now use `is-building` (not `is-floor`) so they can't shadow layer groups.
- **Showcases**: `brick_bank_2` (trim slot drives surrounds + cornice + quoins + belt + coping; wallPrimary = jittered red-brick preset; base = rusticated ashlar) and `banded_loft_2` (ref-16 brick/limestone banding), both in `BuildingConfigCatalog` and validated through the showcase scenario; close-up capture spec `tests/headless/visual/specs/ai491_showcase_closeups.pwtest.js` (scenario gained `cameraTargetYFrac` aim option).
- **Tests**: `tests/node/unit/building_material_slots.test.js` (slot resolution order, preset round-trip, jitter determinism/bounds, pre-pass coverage, input immutability); core tests for banding schema round-trip, slot/preset spec normalization, generator two-band alternation (+ bay-override exemption) and slots recoloring trim end-to-end; BF2 GUI e2e `building_fabrication2_material_slots_gui.pwtest.js`. Full core suite and node unit suite show only the pre-existing baseline failures.
