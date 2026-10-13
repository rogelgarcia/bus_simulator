# Problem

Terra & Mar (exterior): `b8.png`, the target, shows no penthouse from the street: above the roof edge there are only the glass guard, planters and small trees. The extracted model has a 3.8 m penthouse box (`wall__36`, its roofs and windows; x −5 … 5, y −2.25 … 5.25). It was authored from the user's annotated aerial, and it shows above the roof in the `ref_front_b8` render. The aerial also shows a darker annex with a louvred, slatted roof beside the box, on its −X side.

# Request

Settle the penthouse against the target image. Only if it stays, add the aerial's louvred annex.

Tasks:
- Show the user the `ref_front_b8` comparison and ask whether the penthouse stays as is, moves back or down so it is hidden from the b8 viewpoint, or goes. **Do not change it before the user answers.**
- Apply the answer reversibly: any game penthouse parts that are moved or removed go to `TM_REPLACED`.
- If the penthouse stays, model the annex from the aerial: a charcoal frame with a slatted roof of regular louvres, glazed or open sides as shown, seated on the roof terrace (base z 27.862) against the box, with no coplanar faces. It must stay consistent with what `b8.png` shows from the street.
- Evidence: the AI 639 comparison poses tagged with this item. Render them from the edit copy with `render_poses.py -- items=622` (the baseline "before" set already exists in `poses/baseline/`), then compose them with `compose_pose_sheets.py --items 622`; `b8_target` is judged first, beside `b8.png`. If a pose that this item needs is missing, add it to `poses.json` and render it for the baseline too. Copy the final sheets into the evidence directory, and run the audit after geometry changes.

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
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/edit/622_exterior_penthouse_against_b8_and_annex/`. It holds the [reference | before | after] composites and the audit report.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_622_BUILDINGS_terramar_exterior_penthouse_against_b8_and_annex_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change, with the piece script, the collections it builds, what went to `TM_REPLACED`, the evidence paths and the audit result
