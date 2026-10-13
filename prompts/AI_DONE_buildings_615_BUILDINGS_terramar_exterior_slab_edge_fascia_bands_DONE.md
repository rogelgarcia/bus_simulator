DONE

# Problem

Terra & Mar (exterior): In `b8.png`, every residential floor ends in a deep pale-stone slab edge. It is roughly 0.4–0.5 m tall, runs continuously around the building and turns each front-to-chamfer corner with a soft radius. The roof edge repeats it, deeper. The extracted model has thin floor belts instead: `TM_BELTS` `mesh__558` … `mesh__562`, 0.22 m tall and 0.12 m proud in the recessed variant, faceted at every corner.

# Request

Give each residential floor line a continuous slab-edge fascia with the reference's depth and its rounded corners.

Tasks:
- Read the band height, projection and corner radius off `b8.png` and the aerial, relative to known dimensions: storey 3.57 m, front A 12.8 m, belt line at the floor levels.
- Replace the five residential floor belts with fascia bands that follow the residential outline, rounded where the reference rounds the corners. The faceted walls behind stay. Check whether the reference shows the same band on top of the podium (`mesh__553`) and treat it the same way if it does.
- Align the fascia front with the balcony guard line so the guards read as standing on the slab. Leave no gaps or overlaps with guards, platforms, piers or windows.
- Use the limestone material (`TM_limestone`, or the cladding material from AI 619 if that is done).
- AI 616 (projecting chamfer balconies) extends this fascia at the chamfers. If 616 is already done, follow its slab outline instead of the facade line.
- Evidence: the AI 639 comparison poses tagged with this item. Render them from the edit copy with `render_poses.py -- items=615` (the baseline "before" set already exists in `poses/baseline/`), then compose them with `compose_pose_sheets.py --items 615`; `b8_target` is judged first, beside `b8.png`. If a pose that this item needs is missing, add it to `poses.json` and render it for the baseline too. Copy the final sheets into the evidence directory, and run the audit after geometry changes.

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
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/edit/615_exterior_slab_edge_fascia_bands/`. It holds the [reference | before | after] composites and the audit report.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_615_BUILDINGS_terramar_exterior_slab_edge_fascia_bands_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change, with the piece script, the collections it builds, what went to `TM_REPLACED`, the evidence paths and the audit result

## Completion summary (2026-10-12)

- Piece: `src/graphics/content3d/buildings/authoring/terramar_recessed/pieces/exterior_615_slab_edge_fascia.py`, plus the shared `pieces/edit_lib.py`. The edit lib refuses to run on any file but the edit copy, deletes only objects its piece built, and gives set-aside collections their own `REPLACED_<piece>` name. A first draft shared the name and a rerun deleted the belts; that was caught before saving and fixed, and two consecutive runs now give the same result.
- Measured on `b8.png` (front centre bay): the slab edge is about 16 px against a 110 px storey (0.50 m), the guard stands on it, the loggia ceiling starts at its bottom edge, the front piers run full height and slightly proud, and the front-to-chamfer corners are rounded.
- Builds `TERRAMAR/TM_EDIT_EXTERIOR/615_SLAB_EDGE_FASCIA`:
  - five residential slab rings (floors 2–5 and the roof line), 0.50 m tall with their tops 5 mm under the walking surface. The front sits 0.04 m outside the facade line: in front of the guards, and 0.02 m behind the 0.06 m-proud front piers, so the bands stop against the piers. Each ring reaches 1.51 m inside, so it also forms the loggia ceilings, 0.24 m lower than before and still above every window head. Rounded at the three linked corners (A–B, H–A, D–E) on the guards' own centre (radius 1.0); mitred at the other five, where the game's sharp platforms and guards would stick out (AI 616 takes those);
  - the podium top band, rounded at all eight podium corners (radius 1.0), keeping the game belt's height and 0.12 m projection, because two tall upper-podium windows reach 9.712.
  - `TM_limestone`, arc-length/plan UVs at the game's 1.0 per metre, smooth on the arcs and sharp at 30°.
- Set aside in `TM_REPLACED/REPLACED_615_SLAB_EDGE_FASCIA` (hidden, origin recorded): belts `mesh__553`, `mesh__558`, `mesh__559`, `mesh__560`, `mesh__561`, `mesh__562`.
- Evidence: `tests/artifacts/screens/buildings/terramar_recessed/edit/615_exterior_slab_edge_fascia_bands/` holds the six pose sheets (`b8_target` beside `b8.png`, `full_front_left`, `corner_slabs_front_right`, `soffits_worms_eye`, `front_centre_bays`, `roof_edge_street`) and `audit.json`. The "after" renders are in `poses/edit/`.
- Audit: 26 coplanar face pairs before and after, none involving the new parts; the existing ones belong to AI 626. The new rings cross walls, platforms and the game's interior shells by design (19 object pairs with the shells, because the rings reach 1.51 m inside; AI 634 replaces the shells).
