# Problem

The from-scratch Terra & Mar rebuild has an approved plan (AI 642, option E), but only as outlines in a parameter
file and a plain grey massing. Every later layer (envelope, balconies, podium, roof, materials) attaches to the
structure, which does not exist yet. The shared tooling also still points at the game-extracted edit copy: the pose
renderer and composer (AI 639) and the collision audit.

# Request

Build the structure layer of the Terra & Mar rebuild from the plan file, and make the shared tooling work on the
rebuild.

Tasks:
- **The rebuild file.** Create `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild.blend` from a build
  entry that runs the layer scripts in order. Each layer script is idempotent and replaces only its own collection.
- **Floor slabs:**
  - the podium roof and the residential balcony slabs on the balcony-edge outline, at the plan's slab tops and edge
    thickness;
  - the roof slab on the roof-edge outline;
  - every corner rounded as the plan gives it;
  - the slab edge (fascia) and the underside as separate face sets, so later layers can give them stone and wood.
- **Floor plates** inside the tower wall line for every residential storey, plus the ground and upper podium floors,
  for the interiors later.
- **Front pilasters** at the plan markers, full height from the podium top to the roof slab. Between them the slab
  edges are flush with the pilaster faces: the flush centre loggia the user chose.
- **Rounded chamfer columns** at the plan markers. B and H are read from b8. The rear-chamfer columns on D and F are a
  proposal (three bays each): check their rhythm against the front chamfers' two bays before building them.
- **Podium structure:** the ground storey to the plan's ground-floor top, the upper podium to the podium top, and the
  projecting entrance volume.
- **Core:** a stair and lift core that serves every floor and the penthouse, placed under the penthouse rectangle and
  out of sight from b8.
- **Tooling:** `render_poses.py`, `compose_pose_sheets.py` and `audit_collisions.py` take the rebuild file through a
  switch (not a copy). Add rebuild poses where the edit-copy poses no longer fit the plan. `poses.json` tags each pose
  with its items.
- **Evidence:**
  - the `CAM_B8` render beside b8, with the slab bands and pilasters lining up;
  - a top view with the plan outlines;
  - the rear three-quarter view;
  - a clean audit (no coplanar faces, no interpenetrating slabs and columns).

## Context
- Part of the Terra & Mar from-scratch rebuild (AI 642, DONE).
  - The plan file is `src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/terramar_plan.json`,
    written by `make_plan.py`. It holds the levels, the runs A–H and, per layer, the closed outline (Blender frame,
    metres, front faces −Y, z up, street z 0).
  - Layer scripts read that file. New dimensions go into it through `make_plan.py`, never hard-coded in a script.
- The approved plan, at the balcony edge:
  - 27.0 × 24.5 m;
  - runs: A front 10.0, chamfers B/H 12.0, sides C/G 5.0, rear chamfers D/F 15.6, rear E 5.0 m;
  - balcony 1.5 m deep all around;
  - corner radius 1.0 m, front corners 0.64 m;
  - podium top 10.17 m, then five storeys of 3.35 m, roof slab 26.57–27.25 m.
- These stay untouched, as references:
  - the plan-phase massing `rebuild/terramar_rebuild_massing.blend`;
  - the game-extracted baseline;
  - the AI 615/616 edit copy.
- **The target is `b8.png`** (`tests/artifacts/screens/buildings/terramar_recessed/references/`). Judge it from the
  calibrated camera `CAM_B8`: `calibration.json` in `tests/artifacts/screens/buildings/terramar_recessed/rebuild/plan/`;
  `massing.py` builds the camera.
  - The aerial is supplementary. It is an AI image whose roof and facades cannot share one camera; only its roof plane
    is usable.
  - The AI 3D models are for consultation only.
- Blender only:
  - no engine code, building config or catalog change;
  - nothing of the Bradbury's is edited;
  - prefer the headed Blender through MCP; scripts must also run headless.
- Evidence directory: `tests/artifacts/screens/buildings/terramar_recessed/rebuild/643_structure/`, holding
  [b8 | before | after] composites.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_643_BUILDINGS_terramar_rebuild_structure_slabs_pilasters_columns_core_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change, with the layer scripts, the collections they build, the
  tooling switches, the evidence paths and the audit result
