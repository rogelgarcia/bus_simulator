DONE

# Problem

Terra & Mar (props): `b8.png` shows small trees (olive, pine and palm-like) and shrubs standing behind the roof's glass guard, against the sky, all around the visible roof edge. The supplementary aerial shows how they run: perimeter planters, plus planter islands between seating areas. The extracted roof is an empty deck.

# Request

Plant the roof edge so the silhouettes from the `ref_front_b8` view read like `b8.png`; lay out the rest after the aerial.

Tasks:
- Lay out the perimeter planters inside the AI 620 guard, and the islands where the aerial puts them, around the penthouse and the AI 630 seating.
- Plant small palms or olive-like trees and shrubs, varied by seed. The silhouettes seen from `ref_front_b8` should read like the reference's.
- Collection: `TM_EDIT_PROPS/ROOF_PLANTERS`.
- Evidence: the AI 639 comparison poses tagged with this item. Render them from the edit copy with `render_poses.py -- items=629` (the baseline "before" set already exists in `poses/baseline/`), then compose them with `compose_pose_sheets.py --items 629`; `b8_target` is judged first, beside `b8.png`. If a pose that this item needs is missing, add it to `poses.json` and render it for the baseline too. Copy the final sheets into the evidence directory, and run the audit after geometry changes.

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
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/edit/629_props_roof_terrace_planters_and_trees/`. It holds the [reference | before | after] composites and the audit report.

## Retargeted to the rebuild (2026-10-12, AI 642)
The user restarted Terra & Mar as a from-scratch, layered Blender model (AI 642). This item stays valid but now targets
the rebuild, not the game-extracted edit copy; where this section and the text above disagree, this section wins:
- Work file: `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild.blend` (created by AI 643), with one
  idempotent script under `src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/` building its own
  collection. Nothing goes to `TM_REPLACED`: there is no game geometry to replace.
- Outlines, runs and levels come from `rebuild/terramar_plan.json` (approved plan option E, 27.0 x 24.5 m): runs A front,
  B/H front chamfers, C/G sides, D/F rear chamfers, E a short rear face; its levels replace the level tops above.
- Wait for the layers this item stands on: AI 647 (roof) for the terrace zones.
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/rebuild/629_props_roof_terrace_planters_and_trees/`.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_629_BUILDINGS_terramar_props_roof_terrace_planters_and_trees_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change, with the piece script, the collections it builds, what went to `TM_REPLACED`, the evidence paths and the audit result

## Summary (2026-10-13)
- **References read:**
  - b8 roofline: bushy spiky palms / cycads about 2 m tall clustered at the front corners and along the chamfers, low planting along the front;
  - aerial (CAM_AERIAL frame): a dense band all round, islands at the penthouse's front-left corner, a row of planters before the penthouse, planters by the right lounge.
- **Layout** (`rebuild/props_layout.py` `roof_planters()`, written to `plan["props"]["roof_planters"]` by `make_plan.py`, seed 629):
  - 42 perimeter modules in AI 647's 0.7 m band (low limestone troughs, one curved module per corner arc);
  - 376 viburnum in two rows;
  - 53 feature plants: 24 cycads, 8 palms, 9 spiky rosettes, 12 olives, as clusters at the corners and run midpoints plus fill plants every 2.6 m, with the front's middle kept low;
  - 6 islands clear of AI 630's seating zones and the penthouse openings.
- **New `rebuild/proc_plants.py`:** procedural spiky rosettes, palms and cycads (deterministic geometry prototypes in `RB_PROP_PROTOTYPES`), for what the game's vegetation lacks; reusable by AI 633's palms.
- **Layer** (`rebuild/layer_roof_planters.py`, registered in `build.py` after `podium_planters`) builds `RB_PROPS/RB_ROOF_PLANTERS`:
  - `rb_roof_planter_boxes` (ring modules as body, rim walls and end caps; islands);
  - 441 collection instances.
  - Nothing went to `TM_REPLACED`.
- **Clearance check:** every perimeter plant's foliage stays inside the guard shoe's inner line (0 outside, closest 3.2 cm).
- **Iteration:** the first pass's tall-trunk palms read as lollipops and its 0.45 m dark troughs as a dark band through the glass; fixed with cycads, shorter palms, low limestone troughs, fill plants and an inner row.
- **Checks:** audit 87 objects, 0 z-fights, 0 penetrations; hidden parts visible from b8: 0 px; a fresh headless build gives the same counts.
- **Poses:**
  - new `aerial_calibrated` (`CAM_AERIAL` with the aerial beside it; `compose_pose_sheets.py` learned `"reference": "aerial"`);
  - 629 added to `b8_calibrated`, `full_front_left` and `rebuild_top`.
- **Evidence** in `tests/artifacts/screens/buildings/terramar_recessed/rebuild/629_props_roof_terrace_planters_and_trees/`:
  - `poses/rebuild_pre629_vs_rebuild/` (8 sheets);
  - `check_sheet.png`, `checks.json`, `terramar_rebuild.audit.json`.
  - The "before" file: `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild_pre629.blend`.
