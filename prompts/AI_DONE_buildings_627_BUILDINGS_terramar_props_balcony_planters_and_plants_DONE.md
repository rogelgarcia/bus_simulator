DONE

# Problem

Terra & Mar (props): In `b8.png`, nearly every balcony carries potted plants: one or two round white or grey pots per bay, with small olive-like trees, leafy shrubs and some trailing plants. The front centre loggias also hold bistro chairs and a small table on some floors. The extracted model has none.

# Request

Dress the balconies with potted plants, and the few table sets the reference shows.

Tasks:
- Match the reference's density and kinds of plant per bay. Vary position, species, scale and rotation by seed, so no two balconies are identical. Keep the plants on the platforms and inside the guards.
- Plant sources, in order of preference: the game's own tree and plant assets where they fit; CC0 models (for example Poly Haven) installed with a `source.json` per the provenance rule; or low-poly models with cut-out leaf textures. Use instances or linked duplicates to keep the poly count reasonable.
- Add small bistro sets (a table and two chairs) on the front centre balconies where `b8.png` shows them.
- Collection: `TM_EDIT_PROPS/BALCONY_PLANTS`.
- Evidence: the AI 639 comparison poses tagged with this item. Render them from the edit copy with `render_poses.py -- items=627` (the baseline "before" set already exists in `poses/baseline/`), then compose them with `compose_pose_sheets.py --items 627`; `b8_target` is judged first, beside `b8.png`. If a pose that this item needs is missing, add it to `poses.json` and render it for the baseline too. Copy the final sheets into the evidence directory, and run the audit after geometry changes.

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
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/edit/627_props_balcony_planters_and_plants/`. It holds the [reference | before | after] composites and the audit report.

## Retargeted to the rebuild (2026-10-12, AI 642)
The user restarted Terra & Mar as a from-scratch, layered Blender model (AI 642). This item stays valid but now targets
the rebuild, not the game-extracted edit copy; where this section and the text above disagree, this section wins:
- Work file: `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild.blend` (created by AI 643), with one
  idempotent script under `src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/` building its own
  collection. Nothing goes to `TM_REPLACED`: there is no game geometry to replace.
- Outlines, runs and levels come from `rebuild/terramar_plan.json` (approved plan option E, 27.0 x 24.5 m): runs A front,
  B/H front chamfers, C/G sides, D/F rear chamfers, E a short rear face; its levels replace the level tops above.
- Wait for the layers this item stands on: AI 645 (balconies) for the reserved planter positions.
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/rebuild/627_props_balcony_planters_and_plants/`.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_627_BUILDINGS_terramar_props_balcony_planters_and_plants_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change, with the piece script, the collections it builds, what went to `TM_REPLACED`, the evidence paths and the audit result

## Summary (2026-10-13)
- **References read (b8, gridded crops):**
  - front centre loggia: white pots with leafy shrubs before the wood panels on floors 2-4; a lounge set and one small plant on floor 5; a bistro set on floor 3;
  - chamfer and side bays: a plant at nearly every bay end, olive-like trees and shrubs over the rail.
- **Layout** (`rebuild/props_layout.py`, written to `plan["props"]["balcony_plants"]` by `make_plan.py`):
  - 94 seeded pots on floors 2-5, from AI 645's planter slots moved 0.12 m in from the guard: 47 shrubs, 42 olives, 5 spilling plants; white, light grey or charcoal pots;
  - other bays: both ends 75%, one end 25%;
  - sets: the floor 3 bistro and the floor 5 lounge;
  - floor 1 (the podium terrace) is left to AI 628.
- **Plant sources:** the game's own vegetation (`assets/public/vegetation_lod0`): the arrowwood viburnum as shrubs and spilling plants, and the silver linden as olive standards, each olive with a second linden form to fill the crown.
  - New `rebuild/decode_vegetation_glb.mjs` transcodes the published GLBs' KTX2 maps to PNG (Blender's importer refuses `KHR_texture_basisu`), with the libktx 4.4.2 the vegetation bake pins.
  - Its output goes to `tests/artifacts/blender/terramar_recessed/rebuild/vegetation/` (sha256-checked against the index); nothing under `assets/` is written.
- **Layer** (`rebuild/layer_balcony_plants.py`, registered in `build.py` before the materials pass) builds `RB_PROPS/RB_BALCONY_PLANTS`:
  - `rb_balcony_pots`: 94 pots in one object, with soil;
  - 136 collection instances of the prototypes, which live in `RB_PROP_PROTOTYPES`, outside the rebuild root and excluded from the view layer; each instance is fitted to the plan's height and crown radius and seeded turn; spilling plants lean over the rim;
  - `rb_set_f3_bistro` and `rb_set_f5_lounge` (prisms);
  - a small leaf tone (`LEAF_TONE`): the olive greyer but fresh green, the viburnum a touch lighter.
  - Nothing went to `TM_REPLACED`: the rebuild has no game geometry to replace.
- **Clearance check:** 0 plants past the guard glass, 0 into the window frames (closest crown 2.5 cm inside the glass).
- **Checks:** audit 84 objects, 0 z-fights, 0 penetrations (pots and sets sit on the paving); hidden parts visible from b8: 0 px; a fresh headless build gives the same counts.
- **Poses:** new `chamfer_balcony_plants_closeup` and `loggia_bistro_closeup`; 627 added to `b8_calibrated` and `full_front_left`.
- **Evidence** in `tests/artifacts/screens/buildings/terramar_recessed/rebuild/627_props_balcony_planters_and_plants/`:
  - `poses/rebuild_pre627_vs_rebuild/` (9 sheets: [b8 | before | after] for `b8_calibrated` and `b8_target`);
  - `check_sheet.png`, `checks.json`, `terramar_rebuild.audit.json`.
  - The "before" file: `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild_pre627.blend`.
