DONE

# Problem

Terra & Mar (props): This item comes from the supplementary aerial only; `b8.png` cannot see the roof deck. The aerial shows the roof terrace furnished: a lounge group (sofas and a coffee table) on the east side, a long dining table with about eight chairs on the west side, further lounge chairs, and stone paving tiles. The extracted terrace is a flat, empty concrete deck (`roof__35`).

# Request

Furnish and pave the roof terrace as the aerial shows, without changing the `ref_front_b8` view (lower priority than the b8 items).

Tasks:
- Keep every piece back from the edge, so nothing new shows above the guard from `ref_front_b8`.
- Place the furniture groups at the aerial's positions. Materials: teak or warm wood, off-white cushions, charcoal metal. Vary by seed.
- Give the terrace surface the reference's paving tiles, as a material change on a copy of the deck or as a thin paving mesh.
- Collection: `TM_EDIT_PROPS/ROOF_FURNITURE`.
- Evidence: the AI 639 comparison poses tagged with this item. Render them from the edit copy with `render_poses.py -- items=630` (the baseline "before" set already exists in `poses/baseline/`), then compose them with `compose_pose_sheets.py --items 630`; `b8_target` is judged first, beside `b8.png`. If a pose that this item needs is missing, add it to `poses.json` and render it for the baseline too. Copy the final sheets into the evidence directory, and run the audit after geometry changes.

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
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/edit/630_props_roof_terrace_furniture_and_paving/`. It holds the [reference | before | after] composites and the audit report.

## Retargeted to the rebuild (2026-10-12, AI 642)
The user restarted Terra & Mar as a from-scratch, layered Blender model (AI 642). This item stays valid but now targets
the rebuild, not the game-extracted edit copy; where this section and the text above disagree, this section wins:
- Work file: `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild.blend` (created by AI 643), with one
  idempotent script under `src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/` building its own
  collection. Nothing goes to `TM_REPLACED`: there is no game geometry to replace.
- Outlines, runs and levels come from `rebuild/terramar_plan.json` (approved plan option E, 27.0 x 24.5 m): runs A front,
  B/H front chamfers, C/G sides, D/F rear chamfers, E a short rear face; its levels replace the level tops above.
- Wait for the layers this item stands on: AI 647 (roof) for the terrace surface and zones.
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/rebuild/630_props_roof_terrace_furniture_and_paving/`.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_630_BUILDINGS_terramar_props_roof_terrace_furniture_and_paving_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change, with the piece script, the collections it builds, what went to `TM_REPLACED`, the evidence paths and the audit result

## Summary (2026-10-13)
- **References read:** the aerial (b8 cannot see the deck) shows a long dining table with about eight chairs on the west, sofas round a coffee table on the east, more lounge chairs at the front centre, and light stone paving tiles.
- **Layout** (`rebuild/props_layout.py` `roof_furniture()`, written to `plan["props"]["roof_furniture"]` by `make_plan.py`, seed 630), groups in their terrace runs' frames:
  - dining on the H chamfer: a 2.4 m table and eight chairs;
  - lounge on the B chamfer: a sofa, two flanking armchairs, a coffee table and two side tables (an L, after the first layout crowded two of AI 629's islands);
  - front centre: two armchairs, a low table, two sun loungers.
- **Layer** (`rebuild/layer_roof_furniture.py`, registered in `build.py` after `roof_planters`) builds `RB_PROPS/RB_ROOF_FURNITURE`:
  - one object per group, prisms in each item's frame;
  - teak, a seeded cushion tone per group, charcoal metal;
  - every object tagged `rb_hide_from_b8`;
  - footprint checks: at least 1.2 m inside the guard (closest 1.25 m), clear of the islands, penthouse and annex: 0 problems.
  - Nothing went to `TM_REPLACED`.
- **Paving tiles:**
  - the roof layer gives the deck's walking face its own slot (`TM_RB_roof_paving`; `rb_lib` placeholder);
  - the materials pass's new `roof_paving` family dresses it: the kit limestone as 600 mm tiles with a per-tile map offset and 5 mm darker joints, as a material (`layer_materials.dress_tiles`).
- **Checks:**
  - `CAM_B8` sightline: 0 px of furniture; the b8 frame differs in only 22 pixels (at most 13 levels, guard-glass reflections of the new floor);
  - audit 90 objects, 0 z-fights, 0 penetrations;
  - a fresh headless build gives the same counts.
- **Poses:** new `roof_dining_closeup` and `roof_lounge_closeup`; 630 added to `b8_calibrated` and `rebuild_top`.
- **Evidence** in `tests/artifacts/screens/buildings/terramar_recessed/rebuild/630_props_roof_terrace_furniture_and_paving/`:
  - `poses/rebuild_pre630_vs_rebuild/` (8 sheets);
  - `check_sheet.png`, `check_b8_sightline.png`, `checks.json`, `terramar_rebuild.audit.json`.
  - The "before" file: `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild_pre630.blend`.
