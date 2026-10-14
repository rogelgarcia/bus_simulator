DONE

# Problem

Terra & Mar (interior): Through the glazing, the reference shows lit interiors with depth: floors, ceilings and room divisions. The extracted interiors are 24 plain plaster shells (`TM_INTERIORS`: a wall, floor and ceiling per level) that read as white boxes. The audit also shows the loggia platforms crossing the interior floor shells (100 object pairs) and the belts crossing them (12).

# Request

Replace the game's interior shells with an interior base that the furnishing items (AI 635–638) can build on.

Tasks:
- Set the 24 shells aside and model floor plates and ceilings for every level at the right heights, without crossing slabs, loggia platforms or fascias.
- Add a core block (stair and lift) and partitions that divide the residential floors into units behind the bays, so views no longer pass straight through the building.
- Use neutral, non-white materials (warm plaster, wood floors) and simple ceiling fixtures.
- Collection: `TM_EDIT_INTERIOR/BASE`.
- Evidence: the AI 639 comparison poses tagged with this item. Render them from the edit copy with `render_poses.py -- items=634` (the baseline "before" set already exists in `poses/baseline/`), then compose them with `compose_pose_sheets.py --items 634`; `b8_target` is judged first, beside `b8.png`. If a pose that this item needs is missing, add it to `poses.json` and render it for the baseline too. Copy the final sheets into the evidence directory, and run the audit after geometry changes.

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
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/edit/634_interior_base_floor_plates_ceilings_partitions/`. It holds the [reference | before | after] composites and the audit report.

## Retargeted to the rebuild (2026-10-12, AI 642)
The user restarted Terra & Mar as a from-scratch, layered Blender model (AI 642). This item stays valid but now targets
the rebuild, not the game-extracted edit copy; where this section and the text above disagree, this section wins:
- Work file: `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild.blend` (created by AI 643), with one
  idempotent script under `src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/` building its own
  collection. Nothing goes to `TM_REPLACED`: there is no game geometry to replace.
- Outlines, runs and levels come from `rebuild/terramar_plan.json` (approved plan option E, 27.0 x 24.5 m): runs A front,
  B/H front chamfers, C/G sides, D/F rear chamfers, E a short rear face; its levels replace the level tops above.
- Wait for the layers this item stands on: AI 643 (structure, the floor plates and core) and AI 644 (envelope).
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/rebuild/634_interior_base_floor_plates_ceilings_partitions/`.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_634_BUILDINGS_terramar_interior_base_floor_plates_ceilings_partitions_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change, with the piece script, the collections it builds, what went to `TM_REPLACED`, the evidence paths and the audit result

## Summary (2026-10-13)
- **Starting point:** the rebuild had no game shells to set aside. The structure layer already provides every level's floor plates, ceilings and the core; this item adds what divides and lights them.
- **Layout** (`rebuild/props_layout.py` `interior_base()`, written to `plan["interior"]["base"]` by `make_plan.py`):
  - seven partitions per residential floor, cut flush on the pilaster line, the core's faces, the chamfer columns' backs and an E-bay mullion: seven units behind the bays;
  - a 2.4 m downlight grid clear of walls, partitions and the core (44 per floor).
- **Layer** (`rebuild/layer_interior_base.py`, registered in `build.py` after `site_palms`) builds `RB_INTERIOR/RB_INTERIOR_BASE`:
  - `rb_interior_partitions` (floors 1-5, floor to slab underside);
  - `rb_interior_downlights` (220, warm emitter at strength 400).
  - Nothing went to `TM_REPLACED`.
- **Finishes** (materials pass): a new `partition` family (warm plaster) on the partitions and the core; warmer ceilings; floors keep the warm interior-floor tone.
- **Glass:** the glass family now lets shadow rays pass (Light Path mix to a tinted transparent BSDF). Cycles' glass blocked the sun and left the rooms black; they are now daylit, and the guards' shadows are softer.
- **Iteration:** the first renders showed the rooms dark even with partitions; fixed with the shadow-transparent glass and a brighter downlight (30 -> 400) for the daylight exposure.
- **Checks:** audit 93 objects, 0 z-fights, 0 penetrations; hidden parts visible from b8: 0 px; a fresh headless build gives the same counts.
- **Poses:** new `interior_unit_chamfer`; 634 added to `b8_calibrated`, `front_centre_bays` and `chamfer_left_balconies`.
- **Evidence** in `tests/artifacts/screens/buildings/terramar_recessed/rebuild/634_interior_base_floor_plates_ceilings_partitions/`:
  - `poses/rebuild_pre634_vs_rebuild/` (7 sheets);
  - `check_sheet.png`, `checks.json`, `terramar_rebuild.audit.json`.
  - The "before" file: `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild_pre634.blend`.
