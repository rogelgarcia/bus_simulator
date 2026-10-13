DONE

# Problem

Terra & Mar (props): In `b8.png`, dark charcoal canopies with a fine slatted or ribbed surface and a shallow slope cover the ground-floor storefronts on the chamfers, but not the entrance (the aerial and the AI smart model show them continuing along the side faces). The extracted model has none.

# Request

Add the storefront canopies `b8.png` shows.

Tasks:
- Read each canopy's extent per bay, projection, slope and surface (slatted metal or fabric) off `b8.png`; take the side faces from the aerial.
- Model them dark charcoal with slim supports, mounted at the transom head and clear of the sign and the pier lanterns.
- Collection: `TM_EDIT_PROPS/AWNINGS`.
- Evidence: the AI 639 comparison poses tagged with this item. Render them from the edit copy with `render_poses.py -- items=631` (the baseline "before" set already exists in `poses/baseline/`), then compose them with `compose_pose_sheets.py --items 631`; `b8_target` is judged first, beside `b8.png`. If a pose that this item needs is missing, add it to `poses.json` and render it for the baseline too. Copy the final sheets into the evidence directory, and run the audit after geometry changes.

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
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/edit/631_props_storefront_awnings/`. It holds the [reference | before | after] composites and the audit report.

## Retargeted to the rebuild (2026-10-12, AI 642)
The user restarted Terra & Mar as a from-scratch, layered Blender model (AI 642). This item stays valid but now targets
the rebuild, not the game-extracted edit copy; where this section and the text above disagree, this section wins:
- Work file: `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild.blend` (created by AI 643), with one
  idempotent script under `src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/` building its own
  collection. Nothing goes to `TM_REPLACED`: there is no game geometry to replace.
- Outlines, runs and levels come from `rebuild/terramar_plan.json` (approved plan option E, 27.0 x 24.5 m): runs A front,
  B/H front chamfers, C/G sides, D/F rear chamfers, E a short rear face; its levels replace the level tops above.
- Wait for the layers this item stands on: AI 646 (podium) for the storefront bays and awning positions.
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/rebuild/631_props_storefront_awnings/`.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_631_BUILDINGS_terramar_props_storefront_awnings_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change, with the piece script, the collections it builds, what went to `TM_REPLACED`, the evidence paths and the audit result

## Summary (2026-10-13)
- **References read:**
  - b8 (gridded crops of both chamfers): dark charcoal slatted canopies from pier to pier over every chamfer storefront, none over the entrance, a dark front fascia and thin diagonal tie rods, the front edge near 4 m;
  - the aerial: the side faces carry them too.
- **Layout** (`rebuild/props_layout.py` `storefront_awnings()`, written to `plan["props"]["storefront_awnings"]` by `make_plan.py`):
  - one canopy per podium bay (13, the bays AI 646 reserved), from the storefront frames' face to 1.2 m past the podium outline;
  - the slat plane falls 24 degrees (4.70 -> 4.06 m);
  - 2-3 tie rods each.
- **Layer** (`rebuild/layer_awnings.py`, registered in `build.py` after `roof_furniture`) builds `RB_PROPS/RB_AWNINGS`:
  - one object of 286 hexahedra in `TM_RB_awning`: wall plate (30 mm under the lintel), side rails, slats, a 140 mm fascia, 39 sheared tie rods ending flat on the lintel;
  - clear of the pier lanterns.
  - Nothing went to `TM_REPLACED`.
- **Iteration:** at a 12 degree slope the canopies read edge-on from `CAM_B8`; at 24 degrees they read as b8's slatted bands.
- **Checks:** audit 91 objects, 0 z-fights, 0 penetrations; hidden parts visible from b8: 0 px; a fresh headless build gives the same counts.
- **Poses:** new `awning_closeup`; 631 added to `b8_calibrated` and `full_front_left`.
- **Evidence** in `tests/artifacts/screens/buildings/terramar_recessed/rebuild/631_props_storefront_awnings/`:
  - `poses/rebuild_pre631_vs_rebuild/` (7 sheets);
  - `check_sheet.png`, `checks.json`, `terramar_rebuild.audit.json`.
  - The "before" file: `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild_pre631.blend`.
