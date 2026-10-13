DONE

# Problem

The Terra & Mar rebuild's structure (AI 643) has no envelope between its slabs. In `b8.png`:
- the residential sliders are black-framed, three to four panes wide, with a transom line near the head;
- the front centre bay (the flush loggia between the pilasters) has its glazing flanked by vertical warm wood
  panels on some floors, under the wood loggia ceiling. Read them floor by floor (from the superseded AI 618);
- the other openings show pale stone or dark frames.

The supplementary aerial shows the sides (C, G) glazed behind the continuous balconies (from the superseded AI 641).
Neither reference sees the rear runs D, E and F.

# Request

Build the envelope layer: the glazing and the wall line of every residential storey, following b8.

Tasks:
- Glaze the tower wall line run by run, divided into bays between the pilasters and the chamfer columns.
- Sliders have black frames, panes and a transom as in b8. Solid wall pieces go only where b8 shows them, for example
  the pilaster returns and bay ends.
- In the front centre bay, put the wood reveal panels on the floors where b8 shows them.
- On the sides C and G and the rear D, E and F, propose glazed bays that follow the front chamfers' rhythm. Ask the
  user before closing any run with solid wall.
- Build the frames as real geometry (mullions, transoms, sills, thresholds), with separate glass and the door
  positions marked for the balconies layer.
- Curtains and interiors belong to AI 637 and AI 634, not here.
- Evidence:
  - `CAM_B8` beside b8, with the bays and frame divisions lining up;
  - close-ups of a chamfer bay and the centre bay;
  - a side and a rear view;
  - the audit.

## Context
- Part of the Terra & Mar from-scratch rebuild (AI 642, DONE).
  - Plan file: `src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/terramar_plan.json` (runs A–H,
    levels, outlines; new dimensions go in through `make_plan.py`).
  - Work file: `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild.blend`, with one idempotent layer
    script under `rebuild/` building its own collection.
  - Needs AI 643 (structure).
- **The target is `b8.png`**, judged from `CAM_B8`. The aerial is supplementary (only its roof plane is usable), and
  the AI 3D models are for consultation only.
- Blender only:
  - no engine code, building config or catalog change;
  - nothing of the Bradbury's is edited;
  - prefer the headed Blender through MCP; scripts must also run headless.
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/rebuild/644_envelope/`, holding
  [b8 | before | after] composites.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_644_BUILDINGS_terramar_rebuild_envelope_glazing_frames_wood_reveals_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change, with the layer script, its collections, the bay layout per
  run, the evidence paths and the audit result

## Summary (2026-10-13)
- **b8 read** (gridded crops of the centre bay and the right chamfer):
  - every residential opening is a black-framed slider with panes of about 1.0 m and a transom about 0.4 m below the head;
  - the glazing wraps the front corners onto the chamfers and meets the pilasters and the rounded chamfer columns;
  - the front centre bay has warm wood reveal panels (about 0.66 m) on both sides on floors 1–4, with four panes between; on floor 5 those zones are glazed, six panes.
- **Layout in the plan** (`rebuild/envelope_layout.py`, called by `make_plan.py`, written to `plan["envelope"]`):
  - frame dimensions and storeys;
  - 16 bays: A0/A2 short front bays, A1 the centre bay with two variants, B0/B1, C0, D0–D2, E0, F0–F2, G0, H0/H1, each with pane spans per floor, door panes and wood spans;
  - the 8 corner posts.
  - Pane counts aim for b8's 1.0 m: 0.91 m on the chamfers, 0.92 in the centre bay, 0.99 / 0.91 on the rear chamfers, 1.12 on the sides and rear.
  - Door panes are the middle pane (odd counts) or pair (even counts); single-pane bays are fixed: 23 door panes per floor layout.
- **Envelope layer** (`rebuild/layer_envelope.py` -> `RB_ENVELOPE`, 14 objects, 9556 faces, all manifold):
  - per floor, a frames object with rounded corner posts on the wall-line fillets; full-height jambs against the pilasters; jambs against the columns shaped to the column arc (3 mm clear); head and sill rails; mullions; a transom per pane;
  - per floor, a glass object with a lower and an upper light per pane;
  - wood reveal panels on floors 1–4.
  - `rb_lib.pieces()` builds many solids into one object; placeholder `TM_RB_frame` / `TM_RB_glass` (transmissive) / `TM_RB_wood` until AI 648. `build.py` registers the layer.
- **Sides and rear:** glazed with the chamfer rhythm. Neither reference sees them and none needed solid wall, so no run was closed (nothing to ask).
- **Checks:**
  - from `CAM_B8` the bays, mullions and transoms land on b8's divisions: centre-bay mullions at about x 492/526/560/594/626 against b8's 492/526/560/594/626, wood zones on floors 1–4, floor 5 glazed;
  - the core stays hidden over the roof (0 px).
- **Audit:** 33 objects, 0 z-fights, 0 penetrations (482 contacts: glass edges against frame members).
- **Seen but not changed:** b8's glass wraps the front corners on a visibly larger curve than the approved wall line's 0.25 m round, which is concentric with the balcony edge. That is a plan question, not an envelope one.
- **Evidence** in `tests/artifacts/screens/buildings/terramar_recessed/rebuild/644_envelope/`:
  - `check_sheet.png`, `check_b8_overlay.png`, `zoom_centre_chamfer_b8_vs_overlay.png`, `checks.json`;
  - `terramar_rebuild.audit.json`;
  - `poses/`: Cycles [b8 | edit | rebuild] for `b8_calibrated`, and [edit | rebuild] for `front_centre_bays`, `chamfer_left_balconies`, `side_right_faceon`, `full_front_left`, `full_rear_right_aerial`, `rebuild_rear`.
