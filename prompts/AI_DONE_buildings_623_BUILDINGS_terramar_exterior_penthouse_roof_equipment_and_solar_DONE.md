DONE (SUPERSEDED)

# Problem

Terra & Mar (exterior): This item comes from the supplementary aerial only, which shows an array of solar panels over most of the penthouse roof and a few mechanical units near the edge. `b8.png` shows neither. The extracted penthouse roof is flat, with a cap band and a low ring (`roof__41` … `roof__44`, `mesh__695`).

# Request

If the penthouse stays (AI 622), add the solar array and mechanical units the aerial shows, invisible from the b8 viewpoint.

Tasks:
- Start only after AI 622 has settled the penthouse. If it was removed, close this prompt as not applicable.
- Read the array's extent, rows and tilt off the aerial, and the units' positions.
- Model the panels (dark cells, aluminium frames, a regular grid) and 3–5 mechanical units, varied by seed. Keep them back from the edges so nothing shows from `ref_front_b8`.
- Keep the existing low parapet unless the reference contradicts it.
- Evidence: the AI 639 comparison poses tagged with this item. Render them from the edit copy with `render_poses.py -- items=623` (the baseline "before" set already exists in `poses/baseline/`), then compose them with `compose_pose_sheets.py --items 623`; `b8_target` is judged first, beside `b8.png`. If a pose that this item needs is missing, add it to `poses.json` and render it for the baseline too. Copy the final sheets into the evidence directory, and run the audit after geometry changes.

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
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/edit/623_exterior_penthouse_roof_equipment_and_solar/`. It holds the [reference | before | after] composites and the audit report.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_623_BUILDINGS_terramar_exterior_penthouse_roof_equipment_and_solar_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change, with the piece script, the collections it builds, what went to `TM_REPLACED`, the evidence paths and the audit result

## Superseded (2026-10-12, by the owner's decision)
Not implemented as written. The user restarted Terra & Mar as a from-scratch, layered Blender model (AI 642: approved
plan option E, `src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/terramar_plan.json`), so this edit
to the game-extracted copy will not be made. Its findings carry over to AI 647 (roof): the solar array and mechanical units on the penthouse roof, kept below b8's sightline. The edit copy
(`tests/artifacts/blender/terramar_recessed/edit/terramar_recessed_edit.blend`, with AI 615/616) stays as a reference.
