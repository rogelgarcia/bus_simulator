# Terra & Mar (recessed balconies): Blender baseline from the game (AI 614)

This folder holds the scripts that take the `terramar_recessed` catalog building (“Terra & Mar — Recessed
Balconies”, `configs/terramar_recessed.js`, built on `configs/terramar.js`) out of the game and into a Blender
baseline that can be improved piece by piece, the way the Bradbury Block was (`../BradburyBlock/`). The game is
only the exporter: no engine code, building config or catalog entry was changed for this.

**Copy-only rule (user, 2026-10-12):** nothing of the Bradbury's is edited or overwritten. Everything reused from
it is a Terra & Mar copy: the export spec (`terramar_recessed_blender_export.pwtest.js`, from
`bradbury_blender_export.pwtest.js`) and the texture relink (`link_textures.py`, from
`../BradburyBlock/link_game_textures.py`).

Everything generated is gitignored under `tests/artifacts/`:

| What | Where |
| --- | --- |
| GLB + JSON parts manifest (export) | `tests/artifacts/blender/terramar_recessed/before/terramar_recessed_before.{glb,json}` |
| **The baseline** | `tests/artifacts/blender/terramar_recessed/before/terramar_recessed_before.blend` (0.6 MB: geometry, textures linked) |
| Parity report | `.../before/terramar_recessed_before.parity.json` |
| Collision / z-fight audit | `.../before/terramar_recessed_before.audit.json` |
| Game captures from the rig cameras | `tests/artifacts/screens/buildings/terramar_recessed/blender_export/game/` |
| Blender renders from the rig cameras | `tests/artifacts/screens/buildings/terramar_recessed/blender_export/blender/` |
| Comparison sheets | `tests/artifacts/screens/buildings/terramar_recessed/blender_export/sheets/` |
| Reference copies (unaltered) | `tests/artifacts/screens/buildings/terramar_recessed/references/` |

The baseline is the model **as extracted**. Do not edit it: improvements go into separate `.blend` files next to
it, the Bradbury before/after way.

## Files

| File | Does |
| --- | --- |
| `tm_common.py` | Paths, frame helpers, manifest/rig loading |
| `rig_cameras.json` | The inspection cameras and the lighting, shared by the Blender rig and the game capture |
| `import_baseline.py` | GLB → baseline: re-frame, organize, merge materials, relink textures, rig, parity report, save |
| `link_textures.py` | Packed textures → the game's own files under `assets/` (pixel-matched, V mirror only where the export flipped) |
| `render_inspection.py` | Renders the baseline's rig cameras (Cycles, GPU when available); never saves |
| `audit_collisions.py` | BVH overlap audit, coplanar vs crossing faces; report only |
| `compose_sheets.py` | Copies the references (SHA-256 checked) and composes the comparison sheets (system Python + Pillow) |
| `import_reference_models.py` | Fits the user's two AI-generated 3D models into `reference_models/terramar_ai_reference_models.blend` (consultation only) |
| `make_edit_copy.py` | Creates the editable copy `edit/terramar_recessed_edit.blend` from the baseline; refuses to overwrite an existing one |
| `poses.json` | The 20 comparison poses (AI 639): b8 stand, 2 full-building poses, item close-ups, interiors, audit sites |
| `render_poses.py` | Renders a subset of the poses from any Terra & Mar `.blend` (by pose, item id or group); never saves |
| `compose_pose_sheets.py` | Before/after sheets per pose (b8.png beside the target pose) and contact sheets (system Python + Pillow) |
| `pieces/` | One idempotent script per edit item (AI 615+), created by those prompts |

## Rebuilding from nothing

Blender: the path in the gitignored `tools/baking/blender.local.json` (not in this worktree; the sibling worktrees
point at the portable 5.2.1). `PLAYWRIGHT_EXECUTABLE_PATH` must name this machine's Chromium 1234 build.

```
# 0. a private static server for this worktree (port 4173 may be serving another checkout)
PORT=4274 node tests/headless/e2e/static_server.mjs

# 1. export (about 5 s once booted)
EXPORT_TAG=before VISUAL_BASE_URL=http://127.0.0.1:4274 node node_modules/@playwright/test/cli.js test -c tests/headless/visual/visual.config.mjs terramar_recessed_blender_export.pwtest

# 2. game captures from the rig cameras (about 1 min)
VISUAL_BASE_URL=http://127.0.0.1:4274 node node_modules/@playwright/test/cli.js test -c tests/headless/visual/visual.config.mjs terramar_recessed_blender_export_capture

# 3. the baseline (about 15 s)
blender -b --factory-startup -P src/graphics/content3d/buildings/authoring/terramar_recessed/import_baseline.py

# 4. Blender renders of the same cameras (about 1 min on OptiX)
blender -b --factory-startup tests/artifacts/blender/terramar_recessed/before/terramar_recessed_before.blend -P src/graphics/content3d/buildings/authoring/terramar_recessed/render_inspection.py -- samples=64

# 5. audit (report only)
blender -b --factory-startup tests/artifacts/blender/terramar_recessed/before/terramar_recessed_before.blend -P src/graphics/content3d/buildings/authoring/terramar_recessed/audit_collisions.py

# 6. references + sheets
python -I src/graphics/content3d/buildings/authoring/terramar_recessed/compose_sheets.py
```

The filter `terramar_recessed_blender_export` alone matches both specs; add `.pwtest` to run only the export.
`import_baseline.py` clears the session it runs in, so in a headed Blender run it only in an empty session
(`exec(compile(open(p).read(), p, 'exec'), {'__file__': p, '__name__': '__main__'})`). It saves to a temporary
`.building.blend` beside the baseline first so every relative path is final, and replaces the baseline only at the end.

### Environment notes (2026-10-12)

- **Shared catalog index.** `assets/` is the main checkout's, shared by every worktree. Another session's
  uncommitted edit to `assets/public/pbr/_catalog_index.js` registers tree materials of class `foliage`, which this
  branch's `PbrMaterialCatalog` rejects, and the harness never boots (`[PbrMaterialCatalog] Invalid classId`). The
  run on 2026-10-12 served that one file as committed at this worktree's HEAD through a small proxy in front of the
  static server (`git show HEAD:assets/public/pbr/_catalog_index.js`); nothing on disk was changed. Drop the proxy
  once the catalog accepts the class or the index is restored.
- **Lighting scale.** Since 2026-09-10 the game's defaults are `CALIBRATED_DAYLIGHT` (calibrated disc-free sky,
  sun az 45 / el 55, `sunNormalRgb` ≈ [163, 140, 110], exposure 0.0511). The older capture specs
  (`terramar_capture`, `terramar_recessed_capture`) still pass sun 5.5 / hemi 1.5 / HDRI 0.84 from the previous
  scale and now render nearly black. The AI 614 capture passes **no** lighting overrides.
- **The view hold.** The engine draws nothing while the baked-lighting runtime prepares the view
  (`GameEngine._renderAoFrame` → `BakedLightingRuntime.shouldHoldView()`); the preparation is asynchronous (about 4 s:
  submitting programs, bindings, visible resources, raster) and needs the event loop. Rendering 30 frames inside one
  `page.evaluate` right after a load gives an empty canvas. The capture renders one frame per task until the hold
  clears, then settles 30 frames.

## Frame

The config's own footprint frame. three.js (x, y, z) → Blender (x, −z, y), and the showcase's build-site offset
(three.js x/z (0, −12), recorded in the manifest's `placement`) is removed, so a config plan point (x, z) is at
Blender (x, −z) and **the front run A faces −Y**. Heights are the game's: street z = 0, building base z = 0.201
(the game stands the building on a white site plinth at that height; the plinth belongs to the showcase site, not
the building, and is not exported).

Measured bounds: x −14.17 … 14.17, y −12.25 … 11.17, z 0.201 … 32.162 (28.34 × 23.42 × 31.96 m). Level tops
(the four wall shells): ground 5.412, upper podium 10.012, residential 27.862, penthouse 31.662.

## Collections

```
TERRAMAR                              everything a render scene should link
  TM_WALLS                       4    one facade shell per level (wall__0 ground, __6 upper podium, __14 residential, __36 penthouse)
  TM_BELTS                       8    ground and podium top belts, five residential floor belts, penthouse top belt
  TM_ROOFS                      19    roof cores, surfaces, cap / underside / soffit / transition bands, 2 parapet rings
  TM_SIGNAGE                     2    TERRA & MAR, COASTAL KITCHEN
  TM_WINDOWS
    TM_WINDOWS_L0_GROUND        40    storefront + entry: frames, muntins, glass, door handles
    TM_WINDOWS_L1_PODIUM        36
    TM_WINDOWS_L2_RESIDENTIAL  240
    TM_WINDOWS_L3_PENTHOUSE     12
    TM_WINDOWS_SHADES_HIDDEN   110    hidden (viewport + render): see "Window shades"
  TM_BALCONIES
    TM_BALCONIES_PODIUM_TERRACE  6    the projecting podium terraces (front over the entry, rear right)
    TM_BALCONIES_LOGGIAS       150    recessed loggias: platform, guard glass, rail per bay per floor
    TM_BALCONIES_LINKED_CORNERS 45    the three AI 537 links (A–B, A–H, E–D) x 5 floors, with the rounded corners
  TM_INTERIORS                  24    interior shells: wall / floor / ceiling per level
INSPECTION_RIG                         cameras of rig_cameras.json, RIG_SUN, RIG_GROUND (outside TERRAMAR)
```

Every object keeps its export name (`<role>__<n>`) and carries `tm_role`, `tm_level` (`L0_GROUND` …
`L3_PENTHOUSE`), `tm_element` and `tm_tags` (the BF2 userData tags as JSON: window definition, balcony bay and
floor, continuity, lettering id …). Repeated parts share one mesh (the exporter reuses geometry): copy the mesh
before editing vertices of one of them.

## Materials

The export carries 143 materials that are 14 materials repeated (same colour, maps and tiling); each set is merged
into one named material.

| Material | Merged | Game source | Used by |
| --- | ---: | --- | --- |
| `TM_limestone` | 12 | `limestone_smooth`, tint `e3d7bd` | walls, belts, roof bands |
| `TM_limestone_plain` | 6 | `limestone_smooth`, untinted, rough/metal from ARM | balcony platforms, roof surfaces, parapet rings |
| `TM_warm_reveal_brick` | 3 | `seaworn_sandstone_brick`, tint `b77948` | window reveals (wall shells) |
| `TM_roof_concrete` | 1 | `rough_concrete` | roof |
| `TM_interior_plaster` | 30 | `painted_plaster_wall` | interior shells |
| `TM_frame_charcoal` | 28 | `292c2b`, runtime normal map | window frames, muntins |
| `TM_window_shade` | 28 | `f3f1ea`, runtime fabric map | window shades (hidden) |
| `TM_glass_storefront` | 18 | physical, transmission 1, IOR 1.52, `d3e4e4` | ground and podium glazing |
| `TM_glass_residential` | 10 | physical, transmission 1, IOR 1.52, `a2c4c7` | residential and penthouse glazing |
| `TM_glass_balcony_guard` | 2 | physical, transmission 0.5, alpha 0.25, `b4ccd0` | balcony guards |
| `TM_rail_charcoal` | 1 | `343735`, metal 0.72 | rails and posts |
| `TM_rail_dark` | 1 | `2a2d31`, metal 0.7 | two rail parts |
| `TM_metal_handle` | 2 | `858d91`, metal 0.92 | entry door handles |
| `TM_lettering` | 1 | `8b5a3c` | the sign letters |

Textures: the 12 PBR maps (basecolor / normal_gl / arm of the four sets) point at `assets/public/pbr/...` with paths
relative to the `.blend`, each matched by its pixels (correlation 0.946 … 0.9999) and V-mirrored (the exporter
flipped all of them). The two maps the game draws at runtime stay packed: the 64 px shade fabric and the 128 px
frame normal. Nothing was written into `assets/`.

## Window shades

The game cuts every shade in its shader by a per-window coverage (`WindowMeshMaterials.patchShadeShader`: discard
when coverage is 0, else draw where the shade coordinate ≤ coverage). A GLB cannot carry that, so the export
records each window's coverage (`parts[].shade`) and keeps the shader's shade UV as the second UV set. All 110
shades of this build have coverage 0, i.e. the game draws none of them; they are kept in
`TM_WINDOWS_SHADES_HIDDEN`, switched off for viewport and render. A future export with a partly drawn shade is
listed in the parity report (`shades.partially_drawn_not_reproduced`) and fails it.

## Inspection rig and lighting

`INSPECTION_RIG` mirrors the game's calibrated daylight: the world is the same disc-free sky
(`assets/public/lighting/calibrated/clear-afternoon-55.hdr`, strength 1; its brightest region already sits at the
sun's azimuth, rotation 0.3°), `RIG_SUN` carries `sunNormalRgb` (strength 162.7, colour (1, 0.859, 0.676), 0.53°)
from az 45 / el 55, and the film exposure is log2(0.0511) = −4.29 stops (AgX; the game uses ACES). `RIG_GROUND` is a
plain grass-toned plane for the contact shadow.

Cameras (`rig_cameras.json`, plain look-at, vertical FOV):

| Camera | Frame | Purpose |
| --- | --- | --- |
| `ref_front_b8` | 1122 × 1402 | the street-level front of `b8.png` |
| `ref_aerial` | 1122 × 1402 | the aerial reference's front, elevated 40° |
| `front` | 1920 × 1080 | straight front |
| `three_quarter` | 1920 × 1080 | from the front left (the game capture's direction) |
| `low_closeup` | 1920 × 1080 | from the base toward the top |

The reference cameras are approximations: the photos have parallel verticals (lens shift) and their own stand.
Matching them exactly is a later calibration step (measure frame fractions on both pictures).

Game vs Blender differences that are lighting, not geometry: the game draws balcony and roof undersides near
black (no bounce light; hemisphere 0), Cycles lights them from the ground; Cycles glass shows the interior shells
through the panes where the game's reads as dark reflective glass.

## Parity (2026-10-12)

| Check | Result |
| --- | --- |
| Objects | 696 = manifest 696 |
| Triangles | 26 760 = manifest 26 760 |
| Roles | all 8 manifest roles present |
| Plan | 28.34 × 23.42 m (spec podium 28 × 22, plus the 1.15 m entrance projection and belt overhangs) |
| Height | base 0.201, top 32.162 (spec occupied stack 29.45, visual top ≈ 31) |
| Glass | 3 glass materials see-through (transmission 1 / 1 / 0.5 + alpha 0.25) |
| Lettering | `TERRA & MAR`, `COASTAL KITCHEN` |
| Rounded corners | 15 linked-corner rails, ≥ 17 horizontal edge directions each (curved) |
| Textures | 12 linked, 2 runtime maps packed (64 px, 128 px) |
| Shades | 110 hidden (coverage 0), none partially drawn |

The game's storeys measure taller than the spec's floor heights: ground 5.21 m against 4.8, upper podium 4.6
against 4.3, residential 3.57 against 3.35, penthouse 3.8 against 3.6. For the upper podium, residential and
penthouse the difference equals that level's belt height (0.30, 0.22, 0.20); the ground floor's 0.41 m is not
explained by its 0.24 m belt alone.

## Audit (report only)

586 visible objects (hidden shades skipped), 2 313 bounding-box candidate pairs, 1 061 intersecting object pairs,
**26 coplanar face pairs** (z-fight candidates) and 28 474 crossing face pairs. The coplanar ones: the linked-corner
balcony platforms and guard glass against the residential wall `wall__14` (22) and one ground window part
(`mesh__85`) against the ground wall `wall__0` (4). The crossing pairs are mostly designed seats: frames, muntins and
glass inside one window, frames set into the walls, rails and guard glass into their platforms, the letters crossing
the sign wall (702 face pairs), belts into the walls. Two to read before modelling: loggia platforms crossing the interior floor shells
(100 pairs) and belts crossing the interior shells (12). Full list: `terramar_recessed_before.audit.json`.

## Element inventory (reference → baseline)

References: `b8.png` (street front) and the unannotated aerial (the user's Downloads, copied as
`aerial-unannotated.png`), plus the three annotated aerials. All are AI-generated concept images.

| Reference element | Baseline | Status |
| --- | --- | --- |
| Pale limestone podium frame, two storeys | `TM_WALLS` wall__0 / __6, `TM_BELTS` | present |
| Full-height storefronts with charcoal mullions | `TM_WINDOWS_L0_GROUND`, `TM_WINDOWS_L1_PODIUM` | present |
| Projecting glazed entrance volume on A | part of wall__0 + entry storefront | present |
| `TERRA & MAR` / `COASTAL KITCHEN` | `TM_SIGNAGE` | present (copper-brown `8b5a3c`, reference dark bronze) |
| Podium terrace over the entrance, glass guard | `TM_BALCONIES_PODIUM_TERRACE` | present |
| Residential A: balcony / pier / centre / pier / balcony | wall__14 + `TM_BALCONIES_LOGGIAS` | present (loggias) |
| Chamfer B/H balconies with soft curved edges | `TM_BALCONIES_LINKED_CORNERS` | simplified: only the guard and platform curve at the links; walls faceted |
| Floor slab edges | `TM_BELTS` (0.12 m in the recessed variant) | simplified: the reference's deep rounded slab edges are thin belts |
| Warm wood reveals and soffits | `TM_warm_reveal_brick` | different: reddish brick reveals on every window, no wood soffits |
| Glass guards with slim charcoal rails | `TM_BALCONIES_*` guard glass + rails | present |
| Residential roof: deep slab, rounded corners, perimeter glass guard | `TM_ROOFS` cap bands + parapet ring | simplified: a low pale ring, no glass guard |
| Penthouse: stone box with glazing between piers | wall__36 + `TM_WINDOWS_L3_PENTHOUSE` | present |
| Penthouse annex (dark, louvred roof), solar / mechanical | — | missing |
| Roof terrace planters, trees, lounge and dining groups, pergola | — | missing (AI 538) |
| Dark sloped awnings over the side storefronts | — | missing |
| Planter boxes along the podium terrace | — | missing |
| Balcony plants and furniture | — | missing (dressing) |
| Large-format stone panel joints | `TM_limestone` | missing (smooth limestone) |
| Window shades | `TM_WINDOWS_SHADES_HIDDEN` | the game draws none |
| Interior shells | `TM_INTERIORS` | present (the Bradbury assembly removed its own) |
| Site: plaza paving, palms, umbrellas, café tables, crossings, ocean promenade | — | context for the city scene, not building geometry |

## Gap list (for the improvement prompts; nothing acted on here)

1. Corners: the reference reads as softly rounded at every chamfer (walls, slabs, guards); the baseline is eight
   faceted runs with only the three linked balcony corners curved.
2. Slab edges: deep rounded slab/fascia bands with warm wood soffits on the reference vs thin 0.12 m belts and
   loggia ceilings in the baseline.
3. Reveals: warm wood on the reference's centre bays vs reddish sandstone-brick reveals around every window.
4. Roof: the reference's deep top slab with a perimeter glass guard, planters, trees, furniture and a pergola vs a
   flat deck with a low ring.
5. Penthouse: add the dark louvred annex and rooftop equipment.
6. Ground floor: awnings over the side storefronts; podium-terrace planters.
7. Sign colour: dark bronze lettering instead of copper-brown.
8. Stone: large-format limestone panel joints; the reference has no grime.
9. Proportions: the game's storeys measure taller than the spec (top 32.16 m against about 31 m).
10. The 26 coplanar face pairs (linked-corner platforms and guard glass on `wall__14`; `mesh__85` on `wall__0`).
11. Camera calibration of the reference views before any overlay work.

## Editing: the copy, the references and the rules (AI 615+)

**The target is `b8.png`** (user, 2026-10-12): the street-front image in
`tests/artifacts/screens/buildings/terramar_recessed/references/`. Results are judged against it, first from the
`ref_front_b8` camera. The unannotated aerial and the three annotated aerials are supplementary: they fill in only
what b8 cannot show (the roof, the rear, face letters), and b8 wins where they disagree. The work **adjusts the
model extracted from the game**; it is not a rebuild.

**The editable copy**: `tests/artifacts/blender/terramar_recessed/edit/terramar_recessed_edit.blend`, made from the
baseline by `make_edit_copy.py` (which refuses to overwrite an existing copy). The baseline stays as extracted.
The copy adds, without changing the building:

| Collection | Where | For |
| --- | --- | --- |
| `TM_EDIT_EXTERIOR`, `TM_EDIT_INTERIOR`, `TM_EDIT_PROPS` | inside `TERRAMAR` | new building parts (a city scene links `TERRAMAR` with them) |
| `TM_SITE` | scene root | street dressing in front of the building (cafe, palms), outside `TERRAMAR` |
| `TM_REPLACED` | scene root, hidden | game parts an edit sets aside instead of deleting |
| `REFERENCE_AI_MODELS` | scene root, hidden | `REF_AI_SMART` linked for consultation |

**The AI 3D models are consultation only.** The user's two models were generated automatically from the image
(`import_reference_models.py` fits them into `reference_models/terramar_ai_reference_models.blend`:
`REF_AI_DENSE` 1.9M faces, `REF_AI_SMART` 28k faces, the smart one also linked hidden in the edit copy). They are
not sharp and invent things (copies of the sign on other faces, a glass dome, an open roof, no penthouse). Use them
only to read an arrangement the images leave unclear (where awnings sit, how planters run on the roof); never copy
their geometry, and when they disagree with b8, b8 wins.

Rules for every edit prompt:

1. One item per prompt; one idempotent script per item, `pieces/<area>_<id>_<item>.py` in this folder
   (area = `exterior` | `interior` | `props`), which clears and rebuilds its own collection
   (`TM_EDIT_<AREA>/<ITEM>` or `TM_SITE/<ITEM>`), runs on the edit copy and saves it. Rerunning a piece must not
   duplicate anything.
2. Game parts that an item replaces go to `TM_REPLACED/REPLACED_<piece>` (hidden; its own name, because
   collection names are global in Blender), never deleted. Never edit a shared mesh in place (repeated parts share
   one mesh: copy it first). `pieces/edit_lib.py` does this (`open_edit_copy`, `piece_collection`, `set_aside`,
   `restore_set_aside`, `box_uvs`, `save`) and refuses to run on any file but the edit copy.
3. New meshes get UVs (box-projected, metre scale like the game's), materials reuse the `TM_*` families or add new
   `TM_<family>` ones; textures come from `assets/public/pbr` (or new assets per the project asset rules).
4. Keep the look restrained and consistent with the reference: no procedural grime, no identical repeated props
   (seeded variation per instance), no strength sweeps for the user to pick from.
5. Evidence per item under `tests/artifacts/screens/buildings/terramar_recessed/edit/<item>/`: renders of the
   baseline (before) and the edit copy (after) from the same rig cameras plus item close-ups
   (`render_inspection.py -- out=<dir>`), composed as [b8.png | before | after], `ref_front_b8` first.
6. After geometry changes, audit the edit copy (`audit_collisions.py -- out=<item dir>/audit.json`): no new
   coplanar pairs.
7. Prefer the headed Blender through MCP (the user watches); isolated headless Blender is the fallback.
8. Nothing of the Bradbury's is edited (copy-only rule), and no engine code, config or catalog entry changes.

### Prompt index (2026-10-12)

| Area | Id | Item |
| --- | --- | --- |
| exterior | 615 | Slab edge fascia bands, deep and rounded at the chamfers |
| exterior | 616 | Chamfer balconies as projecting curved slabs |
| exterior | 617 | Warm wood soffits under balconies and slab overhangs |
| exterior | 618 | Warm wood reveal panels at the front centre bays (the brick reveals go) |
| exterior | 619 | Limestone cladding with the PBR kit stone, panel joints in geometry (needs 640) |
| exterior | 620 | Roof edge: deep top slab, rounded corners, perimeter glass guard |
| exterior | 621 | Podium glass guards: the top-edge line and the upper-podium window-base line |
| exterior | 622 | Penthouse against b8 (b8 shows none: user decision), then the aerial's louvred annex |
| exterior | 623 | Penthouse roof: mechanical units and solar panels (aerial only, if 622 keeps it) |
| exterior | 624 | Glazing frames (storefronts, entrance, residential sliders), pier lanterns |
| exterior | 625 | Sign lettering from the PBR kit masks and maps (needs 640) |
| exterior | 626 | Coplanar face fixes from the audit |
| props | 627 | Balcony planters and plants |
| props | 628 | Podium planter boxes (window-base line, top edge, entrance terrace) |
| props | 629 | Roof terrace planters and small trees |
| props | 630 | Roof terrace furniture and paving (aerial only, lower priority) |
| props | 631 | Storefront canopies |
| props | 632 | Sidewalk cafe: umbrellas, tables, chairs (site) |
| props | 633 | Street palms and entrance planters (site) |
| interior | 634 | Interior base: floor plates, ceilings, partitions |
| interior | 635 | Ground-floor restaurant |
| interior | 636 | Upper-podium dining room |
| interior | 637 | Residential units: sheer curtains and furniture |
| interior | 638 | Penthouse interior |
| material | 640 | Install the Terra & Mar PBR kit (user-supplied) as PBR sets with provenance; no game catalog registration yet |
| exterior | 641 | Open the side bays (C, G): the game buried the side windows behind solid brick prows |
| rebuild | 642 | **Restart from scratch** (user, 2026-10-12): layered parametric build; phase 1 is the top-view silhouette (front from b8, sides and rear redefined); the edit copy stays as reference and fallback |

## Comparison poses (AI 639)

`poses.json` holds the poses every edit prompt renders its evidence from, each tagged with the prompt ids it serves
and a group. Rendering uses the file's own `INSPECTION_RIG` (calibrated sky, sun az 45 / el 55 from the front right,
ground plane) through a temporary camera; the `.blend` is never saved.

| Pose | Group | Frames | Items |
| --- | --- | --- | --- |
| `b8_target` | target | the b8 street stand (1122 x 1402), the frame b8.png is judged in | 615–633 (exterior + props) |
| `full_front_left` | full | whole building, three-quarter from the front left (1440 x 1800) | 615 616 619 620 621 627 629 631 |
| `full_rear_right_aerial` | full | whole building, elevated from the rear right: rear, roof, penthouse (1440 x 1800) | 616 620 622 623 629 630 |
| `corner_slabs_front_right` | exterior | A–B corner floors: fascias, curved balconies, soffits, roof edge | 615 616 617 620 627 |
| `chamfer_left_balconies` | exterior | H chamfer face-on: balconies, guards, plants, curtains | 616 617 627 637 |
| `soffits_worms_eye` | exterior | up the B chamfer from the sidewalk: slab undersides | 617 616 615 |
| `front_centre_bays` | exterior | front A centre bays, floors 2–4 straight on | 618 624 627 637 615 |
| `stone_cladding_closeup` | exterior | front podium pier, storefront and band at eye level | 619 624 |
| `roof_edge_street` | exterior | roofline from the b8 stand, telephoto (guard, trees, penthouse visibility) | 620 622 629 615 |
| `roof_terrace_aerial` | exterior | roof terrace from above the front left | 620 622 623 629 630 |
| `podium_top_chamfer_right` | exterior | B chamfer podium: both guard lines, planters, canopy | 621 628 631 624 |
| `entrance_sign` | exterior | entrance, sign, upper-podium centre at eye level | 624 625 628 635 636 |
| `storefront_canopies_left` | props | H chamfer ground floor face-on, front receding | 631 624 632 633 |
| `street_frontage` | props | frontage at eye level from across the street | 632 633 631 |
| `penthouse_closeup` | exterior | penthouse from above the front-right roof edge | 622 623 638 630 |
| `interior_ground_glass` | interior | into the restaurant through the B storefront | 634 635 |
| `interior_podium_glass` | interior | into the upper-podium dining room | 636 634 621 |
| `interior_residential_glass` | interior | into a front A centre unit across its loggia | 637 634 618 |
| `check_corner_platform` | check | audit site `balcony_platform__567` on `wall__14` | 626 616 |
| `check_rear_ground_window` | check | audit site `mesh__85` on `wall__0` (rear right) | 626 624 |

```
# the "before" set (done 2026-10-12) and an item's "after"
blender -b --factory-startup tests/artifacts/blender/terramar_recessed/before/terramar_recessed_before.blend -P src/graphics/content3d/buildings/authoring/terramar_recessed/render_poses.py -- samples=96
blender -b --factory-startup tests/artifacts/blender/terramar_recessed/edit/terramar_recessed_edit.blend -P src/graphics/content3d/buildings/authoring/terramar_recessed/render_poses.py -- items=616
python -I src/graphics/content3d/buildings/authoring/terramar_recessed/compose_pose_sheets.py --items 616
```

Options: `poses=a,b`, `items=615,621`, `groups=target,full,exterior,props,interior,check` (a union; none = all),
`list=1` (print, render nothing), `samples=` (96), `pct=` (100), `engine=cycles|eevee`, `out=`, `tag=`. Renders go to
`tests/artifacts/screens/buildings/terramar_recessed/poses/<tag>/` (`baseline`, `edit`, or the file name) with a
`poses_manifest.json`; sheets to `poses/sheets/` (`<before>_vs_<after>/<pose>.png`, `contact_<tag>.png`). Item
prompts copy their final sheets into their own evidence folder under `.../terramar_recessed/edit/`.

## Pieces done

| Id | Piece | Builds | Sets aside |
| --- | --- | --- | --- |
| 615 | `pieces/exterior_615_slab_edge_fascia.py` | `TM_EDIT_EXTERIOR/615_SLAB_EDGE_FASCIA`: five residential slab rings (floors 2–5 and the roof line), and the podium top band | `REPLACED_615_SLAB_EDGE_FASCIA`: belts `mesh__553`, `mesh__558` … `mesh__562` |
| 616 | `pieces/exterior_616_chamfer_balconies.py` | `TM_EDIT_EXTERIOR/616_CHAMFER_BALCONIES`: one continuous deep balcony per side, front pier to rear pier (floors 2–5 slabs and guards, roof-line overhangs), four rounded chamfer columns | `REPLACED_616_CHAMFER_BALCONIES`: the 88 game guard parts on floors 2–5 except the front and rear centre loggias |

**615.** Each residential ring:
- is 0.50 m tall (b8: about 16 px of a 110 px storey), with its top 5 mm under the walking surface (under the roof surface for the roof line);
- has its front 0.04 m outside the facade line: in front of the guards, and 0.02 m behind the 0.06 m-proud front piers, so the piers run full height and the bands stop against them;
- reaches 1.51 m inside the facade line, so it also forms the loggia ceilings at the band's underside, 0.24 m lower than the game's and still above every window head;
- is rounded at the three linked corners, on the guards' own centre (radius 1.0 at the facade line), and mitred at B–C, C–D, F–G, G–H and E–F, where the game's sharp platforms and guards would stick out (AI 616's curved chamfer balconies take those corners).

The podium top band keeps the game belt's height (9.712 … 10.007) and its 0.12 m projection, because two tall upper-podium windows reach 9.712; it is rounded at all eight podium corners.

The audit is unchanged: 26 coplanar pairs before and after, none involving the new parts. The rings cross the game's interior shells (19 object pairs), because they reach 1.51 m inside; AI 634 replaces those shells. Evidence: `tests/artifacts/screens/buildings/terramar_recessed/edit/615_exterior_slab_edge_fascia_bands/`.

**616.** b8 read at 3.5×:
- The front side bay, the A–B corner and B's front-adjacent bay form one shallow curved balcony (the game's linked corner, kept).
- Beyond a rounded column, B's outer bay is a deep projecting balcony. Its wood soffit reads 4–5× deeper (about 2.8 m from slab edge to glazing), and its front turns the B–C corner on about a 1 m radius. The supplementary aerial shows these balconies wrapping onto the sides, and the roof slab overhangs the top one.

What was built, per side (right: B's outer half → B–C → C → C–D → D's outer half; left mirrored on H, G, F):
- Floors 2–5: a slab projecting 1.5 m beyond the facade line, its edge on the podium silhouette. It is 0.509 m deep with its top at the walking surface (top faces in `TM_limestone_plain`), rounded at the side corners with a 1.2 m radius at the slab edge, and ends square against the columns.
- The same slab at the roof line (top 4 mm above the roof surface) as an overhang.
- A guard on floors 2–5: 0.012 m glass, 0.96 m tall, with a charcoal top rail 0.05 m inside the edge, glass returns to the columns at both ends, and posts at no more than 1.6 m apart on the straight parts only.
- Rounded casings on the B, D, F and H piers: 0.90 m wide, 0.18 m proud, front corner radius 0.40, from the podium roof to the roof line. The 615 bands die into them.

The glazing stays at the back of the loggias: the loggia (1.5 m) plus the projection gives b8's deep bays. Floor 1 is the podium roof (its guards are AI 621's). The buried side windows on C and G are AI 641. The audit is unchanged at 26 coplanar pairs, none involving the new parts. Evidence: `tests/artifacts/screens/buildings/terramar_recessed/edit/616_exterior_chamfer_balconies_projecting_curved/` (8 poses, including the new `side_right_faceon`).

**616, user correction (2026-10-12): "the balcony should be same depth around the building".** Each side's deep balcony is now one continuous run from the front pier to the rear pier: A → A–B → B → B–C → C → C–D → D → D–E → E on the right, and A → H → G → F → E on the left.
- One slab-edge line (1.5 m beyond the facade line) and one glazing line (the back of the loggias) all around.
- The run replaces the game's shallow linked-corner balconies too, and passes in front of the rounded chamfer columns.
- The front and rear centre loggias between the full-height piers stay flush, as b8 shows them.
- Set aside: 88 guard parts. Still in place: floor 1's guards (AI 621), the centre loggias' guards, and the two podium terraces.
- The audit drops to 18 coplanar pairs (some of the replaced guard glass carried them), none involving the new parts.
