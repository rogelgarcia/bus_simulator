# Problem

Terra & Mar (exterior): In `b8.png`, the balconies on the chamfers project beyond the facade as slabs whose fronts curve around the corners. The glass guards bend with them, and the piers between the chamfer balconies read rounded. The front A balconies sit between the two tall piers, loggia-like. In the extracted model every residential bay is a 1.5 m recessed loggia, with its guard on the facade line (`TM_BALCONIES_LOGGIAS`). Only the three linked corners (A–B, A–H, E–D, `TM_BALCONIES_LINKED_CORNERS`) curve, and only through 0.42 m runouts.

# Request

Make the chamfer balconies project as continuous curved slabs like the reference, keeping the front A loggias.

Tasks:
- From `b8.png` and the aerial, work out how far the chamfer balconies project and how their fronts curve between the chamfer and the neighbouring faces. Check which runs carry them (B, H, and by the reference's symmetry D and F).
- On every residential floor, model the curved balcony slab, fascia, walking surface, glass guard and top rail along that curve, with all five floors aligned. The guard runs continuously, with no end posts inside the curve.
- Move the game's loggia platforms, guards and rails on those runs, and any linked-corner parts the new balconies supersede, to `TM_REPLACED`.
- Decide from the reference whether the glazing behind those balconies stays at the back of the 1.5 m recess or comes forward. Document the choice, and if it moves, set the game parts aside rather than editing them in place.
- Keep the front A loggias between the piers as extracted unless the reference contradicts them.
- Match the rounded look of the piers between the chamfer balconies, on copies of the wall parts.
- Materials: limestone slab and fascia, `TM_glass_balcony_guard`, `TM_rail_charcoal`. Coordinate with AI 615 (fascia bands) and AI 617 (wood soffits).
- Evidence: the AI 639 comparison poses tagged with this item. Render them from the edit copy with `render_poses.py -- items=616` (the baseline "before" set already exists in `poses/baseline/`), then compose them with `compose_pose_sheets.py --items 616`; `b8_target` is judged first, beside `b8.png`. If a pose that this item needs is missing, add it to `poses.json` and render it for the baseline too. Copy the final sheets into the evidence directory, and run the audit after geometry changes.

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
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/edit/616_exterior_chamfer_balconies_projecting_curved/`. It holds the [reference | before | after] composites and the audit report.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_616_BUILDINGS_terramar_exterior_chamfer_balconies_projecting_curved_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change, with the piece script, the collections it builds, what went to `TM_REPLACED`, the evidence paths and the audit result
