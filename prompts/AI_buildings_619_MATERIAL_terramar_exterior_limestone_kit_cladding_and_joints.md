# Problem

Terra & Mar (exterior): in `b8.png`, the walls, piers, podium and slab edges are clad in a pale, warm, travertine-like limestone, with visible large-format panel joints, soft veining and no grime. The extracted model uses smooth `limestone_smooth` tinted `e3d7bd` (`TM_limestone`, `TM_limestone_plain`), with no joints.

The user has supplied a matching stone: `03_CONTINUOUS_LIMESTONE` from the Terra & Mar PBR kit, installed by AI 640 as `assets/public/pbr/terramar_continuous_limestone/`. It is a seamless ivory-beige honed limestone, 4096 × 4096 for a 4 × 4 m repeat. On purpose it has **no joints, grout or block outlines**. The kit's README says to add stone gaps and edge bevels in geometry, and to give individual blocks different UV regions to hide the repeat. Its displacement range is 1.5 mm in total.

# Request

Clad the stone surfaces with the kit's limestone, laid out in the large-format panels that `b8.png` shows.

Tasks:
- Depends on AI 640 (kit installed). Use only the +Y (OpenGL) normal.
- Read the panel module off `b8.png`: joint spacing relative to the storey height and pier widths, and the joint width and contrast. The front piers and the podium face show it best.
- Build one `TM_limestone` replacement material from the kit's maps, applied at the kit's real scale (4 m per repeat) with world or box mapping, so that adjacent faces line up. Give each panel its own UV region (a seeded offset within the 4 m repeat) so the repeat does not show; never crop the maps arbitrarily.
- Make the joints the way the kit asks: thin recessed gaps or panel splits in geometry where they read in the close-ups, aligned to floor lines and pier edges, on copies of the game meshes (originals set aside). If geometry is not practical on a surface, use a joint mask aligned to the same module, and record which surfaces use which.
- Keep the joints subtle: readable in `stone_cladding_closeup`, not a grid that dominates the `b8_target` view. No grime and no weathering noise.
- Apply the material to every limestone user in the edit copy, including the AI 615 slab edges and later items' parts. Decide whether `TM_limestone_plain` (the untinted set on platforms and roof surfaces) should share it, and record the decision.
- Evidence: the AI 639 comparison poses tagged with this item. Render them from the edit copy with `render_poses.py -- items=619` (the baseline "before" set already exists in `poses/baseline/`), then compose them with `compose_pose_sheets.py --items 619`; `b8_target` is judged first, beside `b8.png`. If a pose that this item needs is missing, add it to `poses.json` and render it for the baseline too. Copy the final sheets into the evidence directory, and run the audit after geometry changes.

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
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/edit/619_exterior_limestone_kit_cladding_and_joints/`. It holds the [reference | before | after] composites and the audit report.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_619_MATERIAL_terramar_exterior_limestone_kit_cladding_and_joints_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change, with the piece script, the collections it builds, what went to `TM_REPLACED`, the evidence paths and the audit result
