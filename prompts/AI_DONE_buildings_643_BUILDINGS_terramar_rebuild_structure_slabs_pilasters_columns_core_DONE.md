DONE

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

## Summary (2026-10-13)
- **Rebuild file and entry:** `rebuild/build.py` creates and rebuilds `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild.blend`. It refuses any other saved file, refreshes the base scene (`INSPECTION_RIG` appended once from the baseline with AgX and the calibrated exposure, `RB_CAMERAS`, `RB_PLAN_GUIDES`) and runs `layer_<name>.py`, each emptying and rebuilding only its own collection under `TERRAMAR_REBUILD`. It runs headed (MCP) and headless.
- **Shared library** `rebuild/rb_lib.py`: collections, the `TM_RB_*` materials (face sets = material slots), and `solid()`. It builds closed solids from plan regions as n-gons, because a triangulator drops points on straight runs and left T-junctions. Regions with holes are cut along a line through the hole, and every loop gets the cut points. Box UVs and the plan cameras are here too.
- **Structure layer** `rebuild/layer_structure.py` -> `RB_STRUCTURE` (19 objects, 2142 faces, all manifold):
  - eight slabs from the plan's slab list, the residential ones notched round the pilasters, every one holed at the core;
  - face sets: fascia, balcony top / soffit outside the wall line, floor plate / ceiling inside, roof and canopy tops, contact faces;
  - two front pilasters, 0.05 m proud, full height from the podium roof to the roof slab;
  - six rounded chamfer columns of five storey-high segments each;
  - a stair and two-lift core under the penthouse, up to 30.75;
  - the entrance jambs under the canopy.
- **Plan file** (`make_plan.py`): a `structure` section (slab list and kinds, pilaster, column section and storeys, core, entrance, ground floor 0.15 m) and the rear-bay check: three bays of 4.77 m (two would be 7.16 m) against the front chamfers' 5.39 m. It also gains `runs.sharp_corners` and `cameras`.
- **CAM_B8 fitted to the plan** (`rebuild/b8_camera_fit.py`):
  - why: the calibration solve needs the centre bay 1.5 m behind the front corners, but b8 shows the bands and rails level on both sides of the right pilaster, so the front is flat and the step is AI perspective;
  - result: a least-squares fit over 17 b8 picks gives 2.9 px RMS (max 5.5), against 7.8 px for the calibration camera, at y −60.93, height 1.54, focal 1712 px;
  - records: `reference_points.json` gains `front_setback_m` (1.5) with the sweep's finding, and `calibration.json` gains the camera location.
- **Tooling switches:**
  - `render_poses.py` tags the rebuild `rebuild` and supports `plan_camera` poses (lens shift, pixel focal, orthographic);
  - `compose_pose_sheets.py` puts b8 beside any pose with `reference: b8`;
  - `poses.json` gains `b8_calibrated`, `rebuild_rear` and `rebuild_top`, and adds 643 to `full_front_left` and `full_rear_right_aerial`;
  - `audit_collisions.py` audits `TERRAMAR_REBUILD` into `terramar_rebuild.audit.json` on the rebuild file, and splits coplanar into z-fight and contact, and crossing into penetrating and touching. A synthetic cube check proves the split (sunk → 7 penetrating; stacked → touching only).
- **Checks** (`rebuild/check_layers.py`, `rebuild/compose_checks.py`):
  - the structure's edges land on b8's bands, piers and chamfer rails;
  - a top cut-away shows the plan outlines over floor 5;
  - with stand-in walls, the core shows 0 pixels over the roof from `CAM_B8` (it rises 3.5 m; hidden up to 6.47 m).
- **Audit:** 19 objects, 0 z-fights, 0 penetrations (2394 touching face pairs: columns on slabs, slabs against the core and pilasters).
- **Not in this layer:** podium piers and facade (AI 646), the envelope (644), the balcony surfaces and guards (645), the penthouse (647). The open storeys show the core until the envelope exists.
- **Evidence** in `tests/artifacts/screens/buildings/terramar_recessed/rebuild/643_structure/`:
  - `check_sheet.png`, `check_b8_overlay.png`, `check_b8_sightline.png`, `checks.json`;
  - `terramar_rebuild.audit.json`;
  - `poses/`: the [b8 | edit | rebuild] and [edit | rebuild] Cycles sheets for `b8_calibrated`, `full_front_left`, `full_rear_right_aerial`, `rebuild_rear`, `rebuild_top`, and `contact_rebuild.png`.
