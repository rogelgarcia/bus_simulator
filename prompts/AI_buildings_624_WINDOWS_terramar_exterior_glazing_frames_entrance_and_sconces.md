# Problem

Terra & Mar (exterior): In `b8.png`:
- the ground-floor storefronts are black steel grids: slender mullions in two or three large panes, under a transom band;
- the entrance is a warm-wood-lined portal with black-framed glass double doors, sidelights and a transom;
- above it, the upper-podium centre glazing sits in a wood-lined recess;
- the residential sliders are black-framed, three to four panes wide, with a transom line near the head;
- small dark lanterns hang on the storefront piers.

The extracted windows (`TM_WINDOWS_L0_GROUND` … `L3_PENTHOUSE`: frames, muntins, glass, handles) have not been checked against those divisions, and there are no lanterns.

# Request

Bring the glazing frames, the entrance portal and the residential sliders in line with `b8.png`, and add the pier lanterns.

Tasks:
- Compare every bay type with `b8.png` (storefront, entrance, upper-podium centre, residential slider): pane count, mullion and transom positions, frame depth and colour.
- Adjust the frames, mullions and transoms on copies of the meshes, setting the originals aside.
- Entrance and upper-podium centre: the door leaves, sidelights, transom and the warm wood linings, as `b8.png` shows them (wood shared with AI 617).
- Add dark bronze lanterns on the storefront piers at b8's positions. In daylight they show no emission, or only a subtle glow.
- Evidence: the AI 639 comparison poses tagged with this item. Render them from the edit copy with `render_poses.py -- items=624` (the baseline "before" set already exists in `poses/baseline/`), then compose them with `compose_pose_sheets.py --items 624`; `b8_target` is judged first, beside `b8.png`. If a pose that this item needs is missing, add it to `poses.json` and render it for the baseline too. Copy the final sheets into the evidence directory, and run the audit after geometry changes.

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
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/edit/624_exterior_glazing_frames_entrance_and_sconces/`. It holds the [reference | before | after] composites and the audit report.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_624_WINDOWS_terramar_exterior_glazing_frames_entrance_and_sconces_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change, with the piece script, the collections it builds, what went to `TM_REPLACED`, the evidence paths and the audit result
