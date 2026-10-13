# Problem

The Terra & Mar Blender work so far edits the model extracted from the game (`terramar_recessed`, AI 614–616). That
model carries many engine decisions that `b8.png`, the target, contradicts:

- every residential balcony is a 1.5 m recessed loggia;
- the side runs are solid brick prows, with the side windows buried behind them;
- the corners are faceted and the storeys taller than the spec;
- the walls are giant single meshes, one shell per level holding every pier, notch and reveal;
- there are odd wedge pieces at the roof corners and coplanar faces in the game's own geometry.

AI 615 and 616 had to work around all of this: slab rings reaching 1.5 m into the walls to fake loggia ceilings,
balconies running in front of a blank brick wall, column casings wrapped around square piers, and corners left
sharp because the game's platforms are sharp. Most of the remaining items would mean cutting into copies of those
wall shells, and each cut makes the next harder.

The user decided (2026-10-12) to **restart from scratch**: build Terra & Mar in Blender as a clean, layered model
laid out correctly, instead of relying on the game engine's limited geometry. The first step is the **top-view
silhouette** of the building, the base every later layer is built on. The front is clear from `b8.png`; the sides
and the rear shape have to be redefined.

# Request

Start the from-scratch Terra & Mar build with its foundation: an approved top-view silhouette, one outline per
layer, held in a single parameter file that every later layer script reads. Do not build anything beyond the
silhouette (and a plain massing check) until the user approves it.

Tasks:
- **New, separate build.** Put the scripts in `src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/`
  and the generated file in `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild.blend`. The baseline
  and the AI 615/616 edit copy stay untouched, as references and fallback. Reuse the existing tooling as it is or as
  Terra & Mar copies: `tm_common.py`, the calibrated rig, `poses.json` with `render_poses.py` and
  `compose_pose_sheets.py`, the audit, and the 615/616 geometry helpers (offset outlines, rounded corners).
- **One parameter file** (for example `rebuild/terramar_plan.json`) is the single source of the plan: the levels
  (heights) and, per layer, the closed outline in plan (metres, Blender frame: front faces −Y, z up). Every outline
  and dimension in this phase is written there, not hard-coded in scripts.
- **Measure the front from `b8.png`.** Calibrate a camera to b8's own perspective first (vanishing lines of the
  slab edges and verticals; the method in memory "measure camera match, not overlay"). From it, read the front width
  and its pier positions, the chamfer angle and length, the corner radii, the balcony projection (uniform all around,
  user 2026-10-12), the storey heights and the podium-to-tower setback. Record each value with how it was measured.
  Keep the game's dimensions (podium 28 × 22 m, tower 25 × 19 m) as a comparison, not as the answer.
- **Redefine the sides and the rear.** b8 cannot see them; the supplementary references can:
  - rectify the aerial's roof and slab outlines to a top view (a planar homography using the front width measured
    above) to recover the overall plan shape;
  - read the annotated aerials for face letters, pier positions and the user's "curved face option";
  - consult the AI 3D models' top views (`reference_models/terramar_ai_reference_models.blend`; consultation only).

  Propose two or three side-and-rear options as dimensioned top-view diagrams, for example: the front mirrored into
  a closed rounded octagon (game-like); the front chamfers with longer straight sides and a squared rear; curved
  sides after the annotation. Show each against the rectified aerial and the game outline, then iterate with the
  user until one is approved.
- **The layers to outline** (each a closed plan curve at its level height):
  - podium footprint (ground and upper podium), including the projecting entrance volume;
  - tower wall / glazing line;
  - balcony slab edge line (one depth all around, with the front and rear centre bays between the piers as decided);
  - roof edge and its perimeter guard line;
  - penthouse, if kept;
  - plan markers for the front pilasters and the rounded chamfer columns.
- **Massing check.** Extrude each outline between its levels as a plain grey block (no detail) and render it from
  the calibrated b8 camera beside `b8.png`, and from a straight top view with the outlines dimensioned.
- **Decisions to settle with the user in this phase** (ask; do not assume):
  - the penthouse (b8 shows none: keep, set back out of view, or drop);
  - the front and rear centre loggias (flush between the piers as in b8, or projecting like the rest);
  - whether the plan must keep the game's footprint, so the model can replace the game building in a city scene;
  - which earlier item prompts (AI 617–641) to mark superseded by the rebuild. AI 639 (poses) and AI 640 (PBR kit
    install) stay useful as they are.
- **After approval only**, list the next layers as separate prompts: structure (slabs, pilasters, rounded columns,
  core); envelope (glazing line, frames, wood reveal panels); balconies (walking surfaces, curved glass guards, wood
  soffits); podium (storefronts, entrance, kit lettering, canopies, guards and planters); roof (edge, guard, terrace,
  penthouse); materials (the PBR kit's limestone with joints in geometry); then props, interiors and site.
- **Evidence** under `tests/artifacts/screens/buildings/terramar_recessed/rebuild/plan/`: the camera calibration
  overlay on b8, the rectified aerial with the outlines over it, each side-and-rear option as a top view, the approved
  plan dimensioned, and the massing render beside b8.

## Context
- **The target is `b8.png`.** The aerial and annotated aerials are supplementary (sides, rear, roof); b8 wins where
  they disagree. The AI 3D models are for consultation only.
- What earlier work established and the rebuild carries over:
  - slab edges about 0.5 m tall;
  - balconies the same depth all around, 1.5 m beyond the wall line;
  - corner radii about 1.0–1.2 m;
  - rounded columns between the chamfer bays;
  - full-height front pilasters with the bands stopping against them;
  - warm wood soffits and reveal panels;
  - see the authoring README and the DONE prompts AI 614–616.
- The user's PBR kit (`Terra_Mar_PBR_Kit.zip`, installed by AI 640) supplies the limestone and the sign lettering
  for later layers.
- Blender only. Nothing of the Bradbury's is edited; no engine code changes. Prefer the headed Blender through MCP;
  scripts must also run headless.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_642_BUILDINGS_terramar_rebuild_from_scratch_top_view_silhouette_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change, including the approved plan's key dimensions, the
  decisions the user made, and the list of follow-up layer prompts
