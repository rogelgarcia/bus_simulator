DONE

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

## Completion summary (2026-10-12)

- Piece: `src/graphics/content3d/buildings/authoring/terramar_recessed/pieces/exterior_616_chamfer_balconies.py` (on `pieces/edit_lib.py`, after AI 615). Two consecutive runs give the same result: 22 objects and 48 parts set aside.
- Read on `b8.png` at 3.5×:
  - the front side bay, the A–B corner and B's front-adjacent bay are one shallow curved balcony (the game's linked corner, kept as extracted);
  - beyond a rounded column, B's outer bay is a deep projecting balcony whose wood soffit reads 4–5× deeper (about 2.8 m slab edge to glazing), turning the B–C corner on about a 1 m radius;
  - the supplementary aerial shows these balconies wrapping onto the sides, and the roof slab overhangs the top one.
- Builds `TERRAMAR/TM_EDIT_EXTERIOR/616_CHAMFER_BALCONIES`, per side (right: B's outer half → B–C → C → C–D → D's outer half; left mirrored on H, G, F):
  - floors 2–5: slabs projecting 1.5 m to the podium silhouette, 0.509 m deep, with their tops at the walking surface (`TM_limestone_plain` on top, `TM_limestone` elsewhere), rounded at the side corners (1.2 m radius) and square against the columns;
  - roof-line overhang slabs over the top floor's balconies;
  - floors 2–5: continuous guards of 0.012 m glass with a charcoal top rail, glass returns to the columns, and posts only on the straight parts (none on the curves);
  - four rounded column casings on the B, D, F and H piers (0.90 m wide, 0.18 m proud, front radius 0.40), into which the 615 bands die.
- Glazing decision: it stays at the back of the loggias; loggia (1.5 m) plus projection (1.5 m) matches b8's deep outer bays. The front A and rear E loggias between the piers, and the linked-corner shallow balconies, are unchanged.
- Set aside in `TM_REPLACED/REPLACED_616_CHAMFER_BALCONIES`: the 24 game railings and 24 guard-glass parts on the deep runs at floors 2–5.
- Not done here:
  - floor 1 is the podium roof, whose guards are AI 621's;
  - the side bays (C, G) are solid brick prows with the side windows buried behind them, so the deep balcony there fronts a wall; filed as AI 641.
- Evidence: `tests/artifacts/screens/buildings/terramar_recessed/edit/616_exterior_chamfer_balconies_projecting_curved/` holds 8 pose sheets (`b8_target` beside `b8.png`, `full_front_left`, `full_rear_right_aerial`, `corner_slabs_front_right`, `chamfer_left_balconies`, `soffits_worms_eye`, the new `side_right_faceon`, `check_corner_platform`) and `audit.json`. The `side_right_faceon` pose was added to `poses.json` and rendered for the baseline too.
- Audit: 26 coplanar face pairs before and after (the pre-existing linked-corner and ground-window ones, AI 626); none involve the new parts.

## Revision (2026-10-12, user correction: "the balcony should be same depth around the building")

- Each side's deep balcony is now one continuous run from the front pier to the rear pier: right A → A–B → B → B–C → C → C–D → D → D–E → E; left A → H → G → F → E.
- There is one slab-edge line (1.5 m) and one glazing line (the back of the loggias) all around. The run replaces the shallow linked-corner balconies and passes in front of the rounded chamfer columns.
- The front and rear centre loggias between the full-height piers stay flush, as `b8.png` shows them.
- Set aside: 88 game guard parts (floors 2–5, everything except the centre loggias); floor 1, the centre loggias and the podium terraces keep theirs.
- The evidence sheets were re-rendered in the same folder; the audit now finds 18 coplanar pairs (26 before), none involving the new parts.
