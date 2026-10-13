DONE

# Problem

Terra & Mar (props): The reference shows a café terrace along the frontage: cream umbrellas, round tables and woven or wood chairs on the sidewalk in front of the side storefronts, several on each side of the entrance (`b8.png`, aerial). It belongs to the street, not the building, and the extracted model has none of it.

# Request

Dress the sidewalk in front of the building with the café terrace the reference shows, as site dressing.

Tasks:
- Build in `TM_SITE/CAFE` (outside `TERRAMAR`), so a future city scene can keep or drop it.
- Model market umbrellas, round tables and chairs, arranged per the reference, varied by seed, standing at the building base level (z 0.201).
- If the sets need ground to stand on, add a simple sidewalk slab in `TM_SITE`.
- Evidence: the AI 639 comparison poses tagged with this item. Render them from the edit copy with `render_poses.py -- items=632` (the baseline "before" set already exists in `poses/baseline/`), then compose them with `compose_pose_sheets.py --items 632`; `b8_target` is judged first, beside `b8.png`. If a pose that this item needs is missing, add it to `poses.json` and render it for the baseline too. Copy the final sheets into the evidence directory, and run the audit after geometry changes.

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
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/edit/632_props_sidewalk_cafe_site/`. It holds the [reference | before | after] composites and the audit report.

## Retargeted to the rebuild (2026-10-12, AI 642)
The user restarted Terra & Mar as a from-scratch, layered Blender model (AI 642). This item stays valid but now targets
the rebuild, not the game-extracted edit copy; where this section and the text above disagree, this section wins:
- Work file: `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild.blend` (created by AI 643), with one
  idempotent script under `src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/` building its own
  collection. Nothing goes to `TM_REPLACED`: there is no game geometry to replace.
- Outlines, runs and levels come from `rebuild/terramar_plan.json` (approved plan option E, 27.0 x 24.5 m): runs A front,
  B/H front chamfers, C/G sides, D/F rear chamfers, E a short rear face; its levels replace the level tops above.
- Wait for the layers this item stands on: AI 646 (podium) for the storefronts and the site edge.
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/rebuild/632_props_sidewalk_cafe_site/`.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_632_BUILDINGS_terramar_props_sidewalk_cafe_site_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change, with the piece script, the collections it builds, what went to `TM_REPLACED`, the evidence paths and the audit result

## Summary (2026-10-13)
- **References read (b8, gridded crops of both sides):** cream square market umbrellas with a short valance on wood poles, round wood tables, brown woven bistro chairs, about two sets per chamfer bay, just before the storefronts.
- **Layout** (`rebuild/props_layout.py` `sidewalk_cafe()`, written to `plan["props"]["sidewalk_cafe"]` by `make_plan.py`, seed 632):
  - a 6 m sidewalk along the front runs H, A and B (inner edge with the entrance's bump, top at the ground floor level 0.15);
  - 8 café sets in the bays AI 646 reserved, 23 chairs (2-4 per table, seeded).
- **Layer** (`rebuild/layer_site_cafe.py`, registered in `build.py` after `awnings`) builds `RB_SITE`, a scene collection beside `TERRAMAR_REBUILD`:
  - `RB_SITE_GROUND/rb_site_sidewalk` (`TM_RB_site_paving`);
  - `RB_SITE_CAFE` with the umbrella canopies (thin pyramid shells and valances), poles, tables (rings round the pole) and woven chairs.
  - Nothing went to `TM_REPLACED`.
- **Materials pass:** a new `site_paving` family (the roof's tiles a shade greyer); the tile shader now serves any family with `tile_m`.
- **Checks:**
  - audit of the building 91 objects and of the site (`root=RB_SITE`) 5 objects: 0 z-fights, 0 penetrations;
  - hidden parts visible from b8: 0 px;
  - a fresh headless build gives the same counts.
- **Poses:** new `cafe_closeup`; 632 added to `b8_calibrated` and `full_front_left`.
- **Evidence** in `tests/artifacts/screens/buildings/terramar_recessed/rebuild/632_props_sidewalk_cafe_site/`:
  - `poses/rebuild_pre632_vs_rebuild/` (6 sheets);
  - `check_sheet.png`, `checks.json`, `terramar_rebuild.audit.json`, `site.audit.json`.
  - The "before" file: `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild_pre632.blend`.
