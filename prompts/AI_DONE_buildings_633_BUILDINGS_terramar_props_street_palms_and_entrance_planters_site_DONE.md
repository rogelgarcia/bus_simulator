DONE

# Problem

Terra & Mar (props): The reference shows tall palms along the frontage and at the corners, in tree pits or planters, potted plants flanking the entrance, and dark street lamps (`b8.png`, aerial). The extracted model has none of these.

# Request

Add the street palms, the entrance planters and the street lamps, as site dressing.

Tasks:
- Build in `TM_SITE/PALMS` (outside `TERRAMAR`).
- Place palms (Washingtonia-like; CC0 sources with `source.json` per the provenance rule) with tree-pit or planter bases at the reference's positions.
- Add the entrance pots, and one or two street lamps. The CC0 `street_lamp_01` already installed under `assets/props/` may be reused by importing it, read-only.
- Evidence: the AI 639 comparison poses tagged with this item. Render them from the edit copy with `render_poses.py -- items=633` (the baseline "before" set already exists in `poses/baseline/`), then compose them with `compose_pose_sheets.py --items 633`; `b8_target` is judged first, beside `b8.png`. If a pose that this item needs is missing, add it to `poses.json` and render it for the baseline too. Copy the final sheets into the evidence directory, and run the audit after geometry changes.

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
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/edit/633_props_street_palms_and_entrance_planters_site/`. It holds the [reference | before | after] composites and the audit report.

## Retargeted to the rebuild (2026-10-12, AI 642)
The user restarted Terra & Mar as a from-scratch, layered Blender model (AI 642). This item stays valid but now targets
the rebuild, not the game-extracted edit copy; where this section and the text above disagree, this section wins:
- Work file: `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild.blend` (created by AI 643), with one
  idempotent script under `src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/` building its own
  collection. Nothing goes to `TM_REPLACED`: there is no game geometry to replace.
- Outlines, runs and levels come from `rebuild/terramar_plan.json` (approved plan option E, 27.0 x 24.5 m): runs A front,
  B/H front chamfers, C/G sides, D/F rear chamfers, E a short rear face; its levels replace the level tops above.
- Wait for the layers this item stands on: AI 646 (podium) for the entrance and the site edge.
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/rebuild/633_props_street_palms_and_entrance_planters_site/`.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_633_BUILDINGS_terramar_props_street_palms_and_entrance_planters_site_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change, with the piece script, the collections it builds, what went to `TM_REPLACED`, the evidence paths and the audit result

## Summary (2026-10-13)
- **References read:** b8 (gridded crop of the street) shows two tall pinnate palms with low planting at their bases before the front corners, more at the street corners, a dark leafy plant in a planter either side of the entrance, and dark lamp posts.
- **Layout** (`rebuild/props_layout.py` `street_dressing()`, written to `plan["props"]["street_dressing"]` by `make_plan.py`, seed 633):
  - the two main palms at b8's positions, found by casting `CAM_B8` rays through their trunk bases onto the sidewalk: (+-7.55, -15.26);
  - two palms at the sidewalk's far corners;
  - raised tree pits with low planting;
  - charcoal pots with cycads at the entrance spots AI 646 reserved;
  - two lamps on the kerb side;
  - crowns capped 0.4 m off the facade.
- **Palms:** procedural, `proc_plants.py`'s new `street_palm` kind (an 8-10.5 m leaning trunk, about 25 long drooping fronds). The CC0 route of the prompt would need a download; the procedural palm matches b8's pinnate silhouettes and needs none.
- **Lamps:** the installed CC0 `street_lamp_01` (Poly Haven, `assets/props/street_lamp_01` with `source.json`), imported read-only once as a prototype and instanced.
- **Layer** (`rebuild/layer_site_palms.py`, registered in `build.py` after `site_cafe`) builds `RB_SITE/RB_SITE_PALMS`:
  - `rb_site_tree_pits` (limestone, body plus rim walls);
  - the palm, pit-planting and entrance-plant instances;
  - `rb_site_entrance_pots`;
  - the lamp instances.
  - Nothing went to `TM_REPLACED`.
- **Iteration:** palms first placed before the chamfers' middles slid out past the building's silhouette from `CAM_B8`; b8's projected positions put them in front of the chamfer storefronts as in b8.
- **Checks:** audits of the building (91 objects) and the site (7 objects): 0 z-fights, 0 penetrations; hidden parts visible from b8: 0 px; a fresh headless build gives the same counts.
- **Poses:** new `entrance_planters_closeup`; 633 added to `b8_calibrated`, `full_front_left` and `cafe_closeup`.
- **Evidence** in `tests/artifacts/screens/buildings/terramar_recessed/rebuild/633_props_street_palms_and_entrance_planters_site/`:
  - `poses/rebuild_pre633_vs_rebuild/` (7 sheets);
  - `check_sheet.png`, `checks.json`, `terramar_rebuild.audit.json`, `site.audit.json`.
  - The "before" file: `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild_pre633.blend`.
