# Problem

Terra & Mar (exterior): in `b8.png`, `TERRA & MAR` is set in upright serif capitals in dark bronze or charcoal letters, with `COASTAL KITCHEN` smaller beneath it, centred on the entrance volume's stone band. The extracted letters (`TM_SIGNAGE`) are a sans-serif-looking extrusion in copper-brown (`TM_lettering`, `8b5a3c`).

The user has supplied the lettering itself: `01_TERRA_AND_MAR` and `02_COASTAL_KITCHEN` from the Terra & Mar PBR kit, installed by AI 640 as `assets/public/pbr/terramar_sign_terra_and_mar/` and `assets/public/pbr/terramar_sign_coastal_kitchen/`. Each line is an alpha-masked card, 4096 × 512 (suggested 3.20 × 0.40 m and 2.10 × 0.2625 m including padding), drawn from b8 in bespoke upright lettering with subtle wedge serifs. The maps carry the dark patinated metal (colour, roughness, metal, a shallow face-bevel normal, 2.0 and 1.4 mm relief). It is an artistic reconstruction, not a font file. The kit's README says to use real letter geometry for close side views, sampling the kit's maps onto it.

# Request

Rebuild the sign with the kit's lettering: real extruded letters shaped by the kit's masks and finished with its maps, sized and placed as `b8.png` shows.

Tasks:
- Depends on AI 640 (kit installed). Use only the +Y (OpenGL) normal.
- Turn each line's opacity mask into letter outlines (trace the mask at the 0.5 cutoff into clean curves or polygons), and extrude them 0.04–0.07 m. Map the kit's colour, roughness, metal and normal maps onto the letter faces through the card's own UVs, so the faces show exactly the kit's lettering. Give the returns a matching dark metal.
- Size and place both lines from `b8.png`: about 0.50 m and 0.22 m cap height (check against the kit's suggested card sizes), with b8's line gap, centred over the entrance on the stone band, standing just proud of the wall with no coplanar faces.
- If the traced letters lose detail at the street distance, compare them with a plain alpha card (`alphaTest` 0.5, slightly in front of the wall) and record which reads closer to b8.
- Set the game letters aside in `TM_REPLACED`.
- Evidence: the AI 639 comparison poses tagged with this item. Render them from the edit copy with `render_poses.py -- items=625` (the baseline "before" set already exists in `poses/baseline/`), then compose them with `compose_pose_sheets.py --items 625`; `b8_target` is judged first, beside `b8.png`. If a pose that this item needs is missing, add it to `poses.json` and render it for the baseline too. Copy the final sheets into the evidence directory, and run the audit after geometry changes.

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
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/edit/625_exterior_sign_lettering_pbr_kit/`. It holds the [reference | before | after] composites and the audit report.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_625_BUILDINGS_terramar_exterior_sign_lettering_pbr_kit_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change, with the piece script, the collections it builds, what went to `TM_REPLACED`, the evidence paths and the audit result
