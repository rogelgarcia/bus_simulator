DONE

# Problem

Terra & Mar (interior): In `b8.png`, the upper podium's glazing shows a dining room: tables, chairs, plants and pendant lights. The terrace over the entrance continues it outside. The extracted upper podium is a plain shell.

# Request

Furnish the upper-podium dining room as far as it shows through the glazing.

Tasks:
- Build on AI 634's base. Furnish the zones visible behind the podium glazing, varied by seed, with pendant lights and a subtle warm light.
- Collection: `TM_EDIT_INTERIOR/DINING_L1`.
- Evidence: the AI 639 comparison poses tagged with this item. Render them from the edit copy with `render_poses.py -- items=636` (the baseline "before" set already exists in `poses/baseline/`), then compose them with `compose_pose_sheets.py --items 636`; `b8_target` is judged first, beside `b8.png`. If a pose that this item needs is missing, add it to `poses.json` and render it for the baseline too. Copy the final sheets into the evidence directory, and run the audit after geometry changes.

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
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/edit/636_interior_upper_podium_dining/`. It holds the [reference | before | after] composites and the audit report.

## Retargeted to the rebuild (2026-10-12, AI 642)
The user restarted Terra & Mar as a from-scratch, layered Blender model (AI 642). This item stays valid but now targets
the rebuild, not the game-extracted edit copy; where this section and the text above disagree, this section wins:
- Work file: `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild.blend` (created by AI 643), with one
  idempotent script under `src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/` building its own
  collection. Nothing goes to `TM_REPLACED`: there is no game geometry to replace.
- Outlines, runs and levels come from `rebuild/terramar_plan.json` (approved plan option E, 27.0 x 24.5 m): runs A front,
  B/H front chamfers, C/G sides, D/F rear chamfers, E a short rear face; its levels replace the level tops above.
- Wait for the layers this item stands on: AI 646 (podium) and AI 634 (base interiors).
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/rebuild/636_interior_upper_podium_dining/`.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_636_BUILDINGS_terramar_interior_upper_podium_dining_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change, with the piece script, the collections it builds, what went to `TM_REPLACED`, the evidence paths and the audit result

## Summary (2026-10-13)
- **Layout** (`rebuild/props_layout.py` `dining_l1()`, written to `plan["interior"]["dining_l1"]` by `make_plan.py`):
  - dining bands behind every upper bay;
  - the loggia room behind the front centre's glazing;
  - banquettes on the core's sides and rear;
  - a sideboard on the core's front;
  - two tables on the entrance terrace.
  - Seed 636.
  - AI 635's room logic became a shared `_Room` helper. The ground floor's layout is unchanged; its plan only gains `fills`.
  - Plants now yield to furniture.
- **Layer** (`rebuild/layer_dining_l1.py`, registered in `build.py` after `restaurant_l0`) builds `RB_INTERIOR/RB_DINING_L1`, reusing `layer_restaurant_l0.py`'s pieces:
  - `rb_dining_furniture`: 51 tables, 124 chairs, 3 banquettes;
  - `rb_dining_sideboard`;
  - `rb_dining_pendants`: 49;
  - `rb_dining_pots` and 14 plants;
  - 18 `rb_dining_fill_<n>` (down, 20 W/m²) and 18 `rb_dining_fill_up_<n>` (ceiling wash, 12 W/m²), out of camera and reflection rays.
  - Nothing went to `TM_REPLACED`.
- **Iteration:**
  - The 2.1 m loggia row pitch overlapped 4-tops; it is now 2.35 m.
  - The first audit found three pots inside furniture (148 penetrations); fixed with the plant check.
  - From b8 the room read dark because the camera looks up at the ceiling; fixed with the ceiling wash.
- **Checks:** audit 102 objects, 0 z-fights, 0 penetrations; footprint overlaps 0; hidden parts visible from b8: 0 px; a fresh headless build gives the same counts for both floors.
- **Poses:** new `loggia_dining_closeup`; 636 added to `b8_calibrated` and `entrance_terrace_planters`.
- **Evidence** in `tests/artifacts/screens/buildings/terramar_recessed/rebuild/636_interior_upper_podium_dining/`:
  - `poses/rebuild_pre636_vs_rebuild/` (5 sheets);
  - `check_sheet.png`, `checks.json`, `terramar_rebuild.audit.json`.
  - The "before" file: `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild_pre636.blend`.
