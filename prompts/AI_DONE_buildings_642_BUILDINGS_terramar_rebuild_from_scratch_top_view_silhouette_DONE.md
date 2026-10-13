DONE

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

## Summary (2026-10-12)
- **Calibration** (`rebuild/calibrate_references.py`, `rebuild/reference_points.json`): a pinhole camera fitted to b8 (horizon 1143.5 px from the pedestrians' heads, focal 1636.5 px from the chamfer rails' vanishing point, 48.4 m to the pilaster plane at eye height 1.53 m, lens shift 0.316) measured the front (10.0 m at the balcony edge, pilasters 0.83 m at ±3.07), the chamfers (44°, to 27.0 m wide), the front corner radius (0.64) and the levels (podium top 10.17, roof slab top 27.25); the aerial's roof plane was rectified by homography and given a fitted roof-plane camera (`calibration.json`, overlays).
- **Finding:** the aerial is an AI image with an impossible perspective (roof seen from almost straight above, facades almost level), so only its roof plane is usable; its rear roof guard turns inward right behind the chamfer ends.
- **Options** (`rebuild/plan_options.py` -> `rebuild/terramar_plan_options.json`): A mirrored octagon, B squared rear, C rounded rear, D aerial-literal shallow (11 m), and E from the user's annotated top views; each as a dimensioned top view over the game outline and the rectified aerial edges.
- **Approved plan, option E** (user, three sketches the same day): A's octagon with longer rear chamfers and a short rear face as long as a side, "more aligned to the aerial view"; no sharp point; every junction with the same small curvature. At the balcony edge (= podium = roof edge): 27.0 × 24.5 m; runs A 10.0, B/H 12.0 (45°), C/G 5.0, D/F 15.6, E 5.0 m; corners R 1.0 (front 0.64); the tower wall line 1.5 m inside (uniform balcony depth), corners R 0.25.
- **The plan file** (`rebuild/make_plan.py` -> `rebuild/terramar_plan.json`): levels (podium top 10.17, five storeys of 3.35, slab edge 0.41, roof slab 26.57–27.25), runs, and the outlines of every phase-1 layer (podium, entrance 6.9 × 1.15 m, tower wall line, balcony edge with the flush centre bay, roof edge, roof guard line 0.15 m in, penthouse), markers for the front pilasters and the rounded chamfer columns (B/H from b8, D/F proposed in three bays), decisions and provenance; `plan_approved.png`.
- **Massing check** (`rebuild/massing.py`, headed Blender through MCP, also headless; `rebuild/compose_massing.py`): `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild_massing.blend` with plain blocks per option and the `CAM_B8` / `CAM_AERIAL` / `CAM_REAR` cameras. E's slab bands, pilasters, chamfer ends and podium land on b8 within about 10 px; the kept penthouse shows 0 pixels from `CAM_B8` (27,865 in the rear view).
- **Decisions:**
  - penthouse kept, set back out of b8's view (10 × 7.5 m at the rear; hidden up to 5.49 m above the roof top);
  - front centre bay a flush loggia between the pilasters, as in b8;
  - the rebuild keeps its own footprint (the game's 28 × 22 m is comparison only; no city spec places Terra & Mar yet);
  - exterior AI 617–626 and 641 superseded (renamed DONE with a "Superseded" section pointing at the layer that takes each finding); props AI 627–633 and interiors AI 634–638 retargeted to the rebuild; AI 639 and 640 unchanged.
- **Follow-up layer prompts:** AI 643 structure (slabs, floor plates, pilasters, rounded columns, podium, core, tooling switches), AI 644 envelope (glazing, frames, wood reveals), AI 645 balconies (surfaces, curved glass guards, wood soffits), AI 646 podium (storefronts, entrance, kit lettering, guard, lanterns), AI 647 roof (edge, guard, terrace, penthouse with annex and solar), AI 648 materials (kit limestone with joints in geometry, wood, steel, glass, bronze); then the retargeted props, interiors and site.
- Generated file name: the plan phase writes `terramar_rebuild_massing.blend` (all options, regenerable); `terramar_rebuild.blend`, the layered model, is created by AI 643.
- Evidence: `tests/artifacts/screens/buildings/terramar_recessed/rebuild/plan/` (calibration overlay, rectified aerial, `plan_option_<A-E>.png`, `plan_approved.png`, `massing_b8_sheet.png`, `massing_aerial_sheet.png`, `massing_rear_sheet.png`, `option_E_sheet.png`).
