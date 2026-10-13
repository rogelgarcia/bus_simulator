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
