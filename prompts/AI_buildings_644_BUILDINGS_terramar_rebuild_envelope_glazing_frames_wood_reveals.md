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
