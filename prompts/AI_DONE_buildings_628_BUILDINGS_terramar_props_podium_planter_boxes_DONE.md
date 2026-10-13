DONE

# Problem

Terra & Mar (props): `b8.png` shows three runs of planters on the podium:
1. long boxes of dense greenery behind the guard at the base of the upper-podium glazing on the chamfers, above the awnings;
2. flower planters behind the first-floor guards along the podium top edge;
3. potted plants and planters on the terrace over the entrance.

The extracted model has none.

# Request

Add the podium's planter boxes and plants where `b8.png` shows them.

Tasks:
- Model the planter boxes (stone or dark metal, matching b8) on the three runs, behind the AI 621 guards. If 621 is not done yet, place them against the current edges and note that the piece must be rerun after it.
- Plant them with mixed shrubs and flowering plants, varied by seed. Keep windows and doors clear.
- Collection: `TM_EDIT_PROPS/PODIUM_PLANTERS`.
- Evidence: the AI 639 comparison poses tagged with this item. Render them from the edit copy with `render_poses.py -- items=628` (the baseline "before" set already exists in `poses/baseline/`), then compose them with `compose_pose_sheets.py --items 628`; `b8_target` is judged first, beside `b8.png`. If a pose that this item needs is missing, add it to `poses.json` and render it for the baseline too. Copy the final sheets into the evidence directory, and run the audit after geometry changes.

## Context
- Work file: `tests/artifacts/blender/terramar_recessed/edit/terramar_recessed_edit.blend`, the editable copy of the model extracted from the game (`terramar_recessed`). The baseline `tests/artifacts/blender/terramar_recessed/before/terramar_recessed_before.blend` is never edited. The work adjusts the extracted model; it is not a rebuild.
- **The target is `b8.png`** (user, 2026-10-12), in `tests/artifacts/screens/buildings/terramar_recessed/references/`. The result is judged against it, mainly from the `ref_front_b8` camera.
- The aerial (`aerial-unannotated.png`) and the annotated aerials are supplementary. They only fill in what b8 cannot show (the roof, the rear, face letters); where they disagree with b8, b8 wins.
- The user's AI-generated 3D models are for consultation only: `REF_AI_SMART`, hidden in the edit copy, and `REF_AI_DENSE` in `tests/artifacts/blender/terramar_recessed/reference_models/terramar_ai_reference_models.blend`. They were made automatically and are not sharp. Never copy their geometry.
- Follow `src/graphics/content3d/buildings/authoring/terramar_recessed/README.md`, section "Editing: the copy, the references and the rules (AI 615+)":
  - one idempotent piece script under `pieces/`, building into its own collection;
  - game parts that get replaced go to `TM_REPLACED`, never deleted;
  - copy shared meshes before editing them;
  - new meshes get UVs, and materials use the `TM_*` families;
  - before/after evidence from the rig cameras, plus close-ups;
  - run the audit after geometry changes.
- Frame: metres, z up, front run A faces −Y, street z 0, building base z 0.201. Runs: A front, B/H front chamfers, C/G sides, D/F rear chamfers, E rear. Level tops: ground 5.412, upper podium 10.012, residential 27.862 (5 floors), penthouse 31.662.
- Blender only: no engine code, building config or catalog change. Nothing of the Bradbury's is edited. Prefer the headed Blender through MCP.
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/edit/628_props_podium_planter_boxes/`. It holds the [reference | before | after] composites and the audit report.

## Retargeted to the rebuild (2026-10-12, AI 642)
The user restarted Terra & Mar as a from-scratch, layered Blender model (AI 642). This item stays valid but now targets
the rebuild, not the game-extracted edit copy; where this section and the text above disagree, this section wins:
- Work file: `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild.blend` (created by AI 643), with one
  idempotent script under `src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/` building its own
  collection. Nothing goes to `TM_REPLACED`: there is no game geometry to replace.
- Outlines, runs and levels come from `rebuild/terramar_plan.json` (approved plan option E, 27.0 x 24.5 m): runs A front,
  B/H front chamfers, C/G sides, D/F rear chamfers, E a short rear face; its levels replace the level tops above.
- Wait for the layers this item stands on: AI 645 (balconies, the podium-edge guards) and AI 646 (podium, the chamfer guard).
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/rebuild/628_props_podium_planter_boxes/`.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_628_BUILDINGS_terramar_props_podium_planter_boxes_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change, with the piece script, the collections it builds, what went to `TM_REPLACED`, the evidence paths and the audit result

## Summary (2026-10-13)
- **References read (b8, gridded crops):**
  - floor 1: a low row of pink, white and yellow flowers behind the podium-top guard, with yellow-green potted shrubs beside the front pilasters;
  - entrance terrace: a flower row along the front guard and a large dark leafy plant at each end;
  - upper recesses: dense greenery at the glazing base on the chamfers.
- **Layout** (`rebuild/props_layout.py` `podium_planters()`, written to `plan["props"]["podium_planters"]` by `make_plan.py`, seed 628), from the strips AI 645 and AI 646 reserved:
  - upper: 26 modules, 0.64 x 0.50 m, at every upper recess;
  - edge: 15 modules, 0.42 x 0.40 m, behind the floor-1 guard on H, A and B, with the rounded corners left free and tall shrubs in the boxes beside the pilasters;
  - terrace: a 3-module front trough and two 0.55 m corner planters with tall shrubs;
  - modules are at most 2.4 m; each box lists the planes (guard glass, glazing frames) its foliage stays behind.
- **Layer** (`rebuild/layer_podium_planters.py`, registered in `build.py` after `balcony_plants`) builds `RB_PROPS/RB_PODIUM_PLANTERS`:
  - `rb_podium_planter_boxes`: dark-metal troughs with a rim and soil;
  - 352 collection instances of the game's arrowwood viburnum, sharing AI 627's prototypes and leaf tone;
  - `rb_podium_flowers`: 2746 seeded flower heads in five colours, kept within each box's rim.
  - Nothing went to `TM_REPLACED`.
- **Clearance check:** 0 shrubs past the guard glass or the glazing (closest 3.1 cm), after pulling the upper boxes' two rows in to the thirds of their depth.
- **Checks:**
  - audit 86 objects, 0 z-fights, 0 penetrations (the first run caught flower heads poking into the right pilaster and the piers; they now stay inside the rim);
  - hidden parts visible from b8: 0 px;
  - a fresh headless build gives the same counts.
- **Poses:** new `podium_edge_planters_closeup` and `entrance_terrace_planters`; 628 added to `b8_calibrated`, `full_front_left` and `stone_cladding_closeup`.
- **Evidence** in `tests/artifacts/screens/buildings/terramar_recessed/rebuild/628_props_podium_planter_boxes/`:
  - `poses/rebuild_pre628_vs_rebuild/` (8 sheets; b8 beside the b8 poses);
  - `check_sheet.png`, `checks.json`, `terramar_rebuild.audit.json`.
  - The "before" file: `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild_pre628.blend`.
