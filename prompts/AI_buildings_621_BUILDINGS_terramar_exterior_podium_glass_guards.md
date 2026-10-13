# Problem

Terra & Mar (exterior): `b8.png` shows two glass guard lines on the podium:
1. At the podium's top edge, the first residential floor's balcony guards run right along the edge, with flower planters behind them, on the front and on both chamfers. The first floor's terrace reaches the podium edge.
2. On the chamfers, a glass guard runs along the base of the upper-podium glazing, just above the storefront awnings, with long planter boxes behind it.

In the extracted model, the first-floor loggia guards sit 1.5 m back on the recessed facade. The podium roof ring between them and the podium edge is open, edged only by the 0.3 m belt; only the two projecting podium terraces have guards (`TM_BALCONIES_PODIUM_TERRACE`). The upper-podium glazing has no guard at its base.

# Request

Add the podium's two glass guard lines as `b8.png` shows them.

Tasks:
- Place a guard about 1.0 m tall along the podium top edge, inboard of the belt, so the first-floor terrace reaches the edge. It runs continuously where b8 shows it, joining the front terrace guard cleanly (set that guard aside if one continuous run needs it).
- Add the guard along the base of the upper-podium glazing on the chamfers and sides, at b8's height and depth (a shallow ledge if the reference shows one).
- Charcoal top rails and posts, `TM_glass_balcony_guard`. The planters behind both guards are AI 628.
- Evidence: the AI 639 comparison poses tagged with this item. Render them from the edit copy with `render_poses.py -- items=621` (the baseline "before" set already exists in `poses/baseline/`), then compose them with `compose_pose_sheets.py --items 621`; `b8_target` is judged first, beside `b8.png`. If a pose that this item needs is missing, add it to `poses.json` and render it for the baseline too. Copy the final sheets into the evidence directory, and run the audit after geometry changes.

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
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/edit/621_exterior_podium_glass_guards/`. It holds the [reference | before | after] composites and the audit report.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_621_BUILDINGS_terramar_exterior_podium_glass_guards_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change, with the piece script, the collections it builds, what went to `TM_REPLACED`, the evidence paths and the audit result
