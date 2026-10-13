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

The rebuild (AI 642) superseded the exterior edit items; the props and interiors now target the rebuild file.

| Area | Id | Item |
| --- | --- | --- |
| exterior | 615 | Slab edge fascia bands, deep and rounded at the chamfers |
| exterior | 616 | Chamfer balconies as projecting curved slabs |
| exterior | 617 | ~~Warm wood soffits under balconies and slab overhangs~~ superseded by the rebuild → 645 |
| exterior | 618 | ~~Warm wood reveal panels at the front centre bays (the brick reveals go)~~ superseded by the rebuild → 644 |
| exterior | 619 | ~~Limestone cladding with the PBR kit stone, panel joints in geometry (needs 640)~~ superseded by the rebuild → 648 |
| exterior | 620 | ~~Roof edge: deep top slab, rounded corners, perimeter glass guard~~ superseded by the rebuild → 647 |
| exterior | 621 | ~~Podium glass guards: the top-edge line and the upper-podium window-base line~~ superseded by the rebuild → 645, 646 |
| exterior | 622 | ~~Penthouse against b8 (b8 shows none: user decision), then the aerial's louvred annex~~ superseded by the rebuild → 647 |
| exterior | 623 | ~~Penthouse roof: mechanical units and solar panels (aerial only, if 622 keeps it)~~ superseded by the rebuild → 647 |
| exterior | 624 | ~~Glazing frames (storefronts, entrance, residential sliders), pier lanterns~~ superseded by the rebuild → 644, 646 |
| exterior | 625 | ~~Sign lettering from the PBR kit masks and maps (needs 640)~~ superseded by the rebuild → 646, 648 |
| exterior | 626 | ~~Coplanar face fixes from the audit~~ superseded by the rebuild → none (game geometry) |
| props | 627 | Balcony planters and plants (retargeted to the rebuild) |
| props | 628 | Podium planter boxes (window-base line, top edge, entrance terrace) (retargeted to the rebuild) |
| props | 629 | Roof terrace planters and small trees (retargeted to the rebuild) |
| props | 630 | Roof terrace furniture and paving (aerial only, lower priority) (retargeted to the rebuild) |
| props | 631 | Storefront canopies (retargeted to the rebuild) |
| props | 632 | Sidewalk cafe: umbrellas, tables, chairs (site) (retargeted to the rebuild) |
| props | 633 | Street palms and entrance planters (site) (retargeted to the rebuild) |
| interior | 634 | Interior base: floor plates, ceilings, partitions (retargeted to the rebuild) |
| interior | 635 | Ground-floor restaurant (retargeted to the rebuild) |
| interior | 636 | Upper-podium dining room (retargeted to the rebuild) |
| interior | 637 | Residential units: sheer curtains and furniture (retargeted to the rebuild) |
| interior | 638 | Penthouse interior (retargeted to the rebuild) |
| material | 640 | Install the Terra & Mar PBR kit (user-supplied) as PBR sets with provenance; no game catalog registration yet |
| exterior | 641 | ~~Open the side bays (C, G): the game buried the side windows behind solid brick prows~~ superseded by the rebuild → 644 |
| rebuild | 642 | DONE: **restart from scratch** (user, 2026-10-12): calibrated b8 camera, silhouette options, approved plan E in `rebuild/terramar_plan.json`, massing check (see "Rebuild" below) |
| rebuild | 643 | DONE: structure layer (slabs with face sets, pilasters, rounded columns, podium, core), `build.py`, `CAM_B8` fitted to the plan, rebuild switches in the pose renderer, composer and audit |
| rebuild | 644 | DONE: envelope layer (16 bays of black-framed sliders with transoms, corner posts, column-hugging jambs, centre-bay wood reveals on floors 1–4), layout and door panes in `plan["envelope"]` |
| rebuild | 645 | DONE: balconies layer (paving, frameless glass guards with rail and shoe, door thresholds, downlights, soffit tone matched to b8), planter slots reserved in the plan |
| rebuild | 646 | DONE: podium layer (stone piers and bands, storefronts, deep upper recesses with guards, entrance portal and loggia, lanterns, kit lettering traced into real letters), prop slots reserved |
| rebuild | 647 | DONE: roof layer (guard all round, terrace deck, penthouse with the aerial's openings, louvred annex, solar rows, units), all out of b8's view (0 px), terrace prop zones reserved |
| rebuild | 648 | Materials: kit limestone with panel joints in geometry, wood, black steel, glass, bronze (needs 640) |

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

## Rebuild from scratch (AI 642+)

The game-extracted model carried too many engine decisions (recessed loggias everywhere, brick prows, faceted corners,
one shell per level), so the user restarted Terra & Mar as a clean, layered Blender model (2026-10-12). The baseline and
the 615/616 edit copy stay as references. Scripts live in `rebuild/`; the single source of the plan is
`rebuild/terramar_plan.json`.

```
python -I src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/calibrate_references.py   # b8 camera, aerial roof homography
python -I src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/plan_options.py           # options A-E -> terramar_plan_options.json
python -I src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/make_plan.py              # approved option -> terramar_plan.json
blender -b --factory-startup --python src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/massing.py -- options=EABCD
python -I src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/compose_massing.py
```

| Script | Does |
| --- | --- |
| `reference_points.json` | points picked on gridded crops of b8 and the aerial, each with where it was read |
| `calibrate_references.py` | calibrates a pinhole camera to b8 (horizon from the pedestrians' heads, focal from the chamfer rails' vanishing point, scale from the 3.35 m storey); measures the front, chamfers, corner radius and levels; rectifies the aerial's roof plane and fits a camera to it; writes `calibration.json` and overlays |
| `plan_options.py` | the silhouette options as dimensioned top views over the game outline and the rectified aerial edges |
| `make_plan.py` | the approved plan: every layer outline, levels, runs, markers, the structure parameters, the cameras, decisions, provenance; `plan_approved.png` |
| `massing.py` | Blender: plain blocks per option, `CAM_B8` / `CAM_AERIAL` / `CAM_REAR`, Workbench renders; saves `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild_massing.blend`; refuses to run inside any other saved file |
| `compose_massing.py` | massing edges (magenta) over b8 and the aerial, the rear sheet, the chosen-option sheet, and the count of penthouse pixels visible from `CAM_B8` (must be 0) |

**Approved plan (option E, the user's annotated top views):** the front from b8, then A's octagon with longer rear
chamfers and a short rear face as long as a side. At the balcony edge (= podium = roof edge): 27.0 × 24.5 m; runs A 10.0,
B/H 12.0 (45°), C/G 5.0, D/F 15.6, E 5.0 m; every corner R 1.0, the two front corners 0.64 (b8); the tower wall line
1.5 m inside (balcony depth, uniform), its corners R 0.25. Levels: podium top 10.17, five storeys of 3.35, roof slab
26.57–27.25. Decisions: the penthouse is kept but out of b8's view (10 × 7.5 m at the rear; hidden up to 5.49 m above the
roof top at its front wall, 0 pixels in `CAM_B8`); the front centre bay is a flush loggia between the pilasters; the
rebuild keeps its own footprint (the game's 28 × 22 m is comparison only); the exterior edit prompts are superseded.

Gotchas:
- b8 and the aerial are AI images (±5–10 %). The aerial cannot be one camera: its roof reads as seen from almost
  straight above and its facades as seen almost level (foreshortenings 0.97 and 0.92, impossible together). Use its
  roof plane only (homography / roof-plane camera fit); its rear guard lines turn inward right behind the chamfer ends.
- Workbench edges from shadows read as false lines in overlays: the reference cameras render without shadows.
- Never offset a fillet by more than its radius (it folds into swallowtails): offset the sharp polygon, then round.

Evidence: `tests/artifacts/screens/buildings/terramar_recessed/rebuild/plan/` (`calibration.json`,
`b8_calibration_overlay.png`, `aerial_rectified_overlay.png`, `plan_option_<A-E>.png`, `plan_options_sheet.png`,
`plan_approved.png`, `massing_b8_sheet.png`, `massing_aerial_sheet.png`, `massing_rear_sheet.png`, `option_E_sheet.png`,
`massing/`).

### The rebuild file and its layers (AI 643+)

```
# first time (creates tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild.blend)
blender -b --factory-startup --python src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/build.py -- layers=structure
# rebuild one layer in place (headed: open the file, exec build.py with the same argv)
blender -b tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild.blend --python src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/build.py -- layers=structure
# checks, audit, lit poses
blender -b tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild.blend --python src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/check_layers.py -- out=tests/artifacts/screens/buildings/terramar_recessed/rebuild/643_structure
python -I src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/compose_checks.py tests/artifacts/screens/buildings/terramar_recessed/rebuild/643_structure
blender -b tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild.blend -P src/graphics/content3d/buildings/authoring/terramar_recessed/audit_collisions.py
blender -b tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild.blend -P src/graphics/content3d/buildings/authoring/terramar_recessed/render_poses.py -- items=643
python -I src/graphics/content3d/buildings/authoring/terramar_recessed/compose_pose_sheets.py --before edit --after rebuild --items 643
```

| Script | Does |
| --- | --- |
| `build.py` | the entry: refuses any file but the rebuild (or an unsaved session); refreshes the base scene, then runs `layer_<name>.py` for each requested layer, which empties and rebuilds only its own collection under `TERRAMAR_REBUILD` |
| `rb_lib.py` | shared helpers: collections, the `TM_RB_*` materials, `solid()` (closed solids from plan regions as n-gons: a region with holes is cut along a line through its hole, and every loop gets the cut points, so tops, bottoms and side faces share their vertices), box UVs, the plan cameras |
| `layer_structure.py` | the structure layer, `RB_STRUCTURE` (below) |
| `layer_envelope.py` / `envelope_layout.py` | the envelope layer, `RB_ENVELOPE`, and its bay/pane layout (written into the plan by `make_plan.py`) |
| `layer_balconies.py` / `balcony_layout.py` | the balconies layer, `RB_BALCONIES`, and its layout (paving pieces, guard runs, downlights, planter slots) |
| `layer_podium.py` / `podium_layout.py` / `trace_sign.py` | the podium layer, `RB_PODIUM`, its layout, and the sign tracer (kit masks -> letter outlines) |
| `layer_roof.py` | the roof layer, `RB_ROOF` (its layout is `plan["roof"]`, written by `make_plan.py`) |
| `b8_camera_fit.py` | fits `CAM_B8` to the plan by least squares over the b8 picks (used by `make_plan.py`, written to `plan["cameras"]`) |
| `check_layers.py` / `compose_checks.py` | Workbench checks: the layer's edges over b8, a top cut-away with the plan outlines, the rear, and the core's visibility from b8 with stand-in walls |

Base scene: `INSPECTION_RIG` (appended once from the baseline: the calibrated sky, sun, ground and rig cameras, with
AgX and the game's exposure), `RB_CAMERAS` (`CAM_B8`, `CAM_AERIAL`, `CAM_REAR`, `CAM_TOP` from `plan["cameras"]`),
`RB_PLAN_GUIDES` (the layer outlines as curves at z 0, not rendered).

**`CAM_B8`.** The calibration solve only closes if the centre bay sits 1.5 m behind the front corners (with the plan's
45° chamfers; the sweep is in `reference_points.json`), but b8 itself shows the bands and rails level on both sides of the
right pilaster, so the front is flat and the step is b8's AI perspective. The plan's camera is therefore fitted to the
plan: 17 picks (pilaster edges, front corner, chamfer end, centre-bay band bottoms, podium and roof tops, base,
chamfer-end rails) give 2.9 px RMS (max 5.5) against 7.8 px for the calibration camera. Every layer is judged from it.

**`RB_STRUCTURE` (AI 643).** Face sets are material slots, the contract later layers use:

| Object | What | Face sets |
| --- | --- | --- |
| `rb_slab_ground` | −0.25…0.15 on the podium outline + entrance | floor, fascia, hidden |
| `rb_slab_upper_podium` | top 5.79; podium + entrance canopy | floor / ceiling inside, canopy top `TM_RB_roof_top` / soffit, fascia |
| `rb_slab_podium_roof` | top 10.17, balcony edge, split at the wall line | terrace `TM_RB_slab_top`, floor, ceiling, fascia |
| `rb_slab_floor2`…`5` | 0.41 thick, notched round the pilasters | balcony `TM_RB_slab_top` / `TM_RB_soffit` outside the wall line, `TM_RB_floor` / `TM_RB_ceiling` inside, fascia |
| `rb_slab_roof` | 26.57–27.25 | `TM_RB_roof_top`, soffit outside, ceiling inside, fascia |
| `rb_pilaster_left/right` | 0.83 m, 0.05 proud of the slab edge, back face on the wall line, podium roof to roof slab | `TM_RB_pilaster` |
| `rb_column_B1 H1 D1 D2 F1 F2` | rounded casings 0.9 × 0.48 (0.18 proud of the wall line, front radius 0.4), storey by storey | `TM_RB_column` |
| `rb_core` | stair + two lift shafts, −0.25 to the penthouse roof (30.75), under the penthouse | `TM_RB_core` |
| `rb_entrance_jamb_left/right` | 0.4 m jambs under the entrance canopy | `TM_RB_pilaster` |

`TM_RB_hidden` marks faces in contact (slab hole at the core, notch against a pilaster, column ends). Interior floor
plates are the `TM_RB_floor` faces, interior ceilings the `TM_RB_ceiling` faces. The rear-chamfer columns use three bays
(4.77 m) because two (7.16 m) would be far from the front chamfers' 5.39 m. The core is hidden from b8: 0 red pixels over
the roof with stand-in walls (it rises 3.5 m above the roof, hidden up to 6.47 m).

**Audit (rebuild switch, AI 643).** On the rebuild file `audit_collisions.py` audits `TERRAMAR_REBUILD` and writes
`terramar_rebuild.audit.json`. Its classes are split so abutting pieces read correctly: coplanar = z-fight (same facing)
or contact (opposed); crossing = penetrating (the faces' common line runs strictly inside both) or touching. A synthetic
check (rotated cubes sunk into each other → 7 penetrating; offset stacked cubes → touching only) proves the split. The
structure: 19 objects, 0 z-fights, 0 penetrations (2394 touching pairs: columns on slabs, slabs against the core and
pilasters).

**Poses.** `render_poses.py` tags the rebuild `rebuild`; a pose may name a plan camera (`"plan_camera": "b8" | "rear" |
"top"`, with lens shift and orthographic support) and `"reference": "b8"` puts b8.png beside its sheets. New poses:
`b8_calibrated`, `rebuild_rear`, `rebuild_top`.

Evidence: `tests/artifacts/screens/buildings/terramar_recessed/rebuild/643_structure/` (`check_sheet.png`,
`check_b8_overlay.png`, `check_b8_sightline.png`, `checks.json`, `terramar_rebuild.audit.json`, `poses/`).

**`RB_ENVELOPE` (AI 644).** The glazing on the tower wall line, from b8: black-framed sliders with panes of about 1.0 m
and a transom 0.4 m below the head. The glazing wraps the corners on rounded posts and meets the pilasters and the
rounded chamfer columns. In the front centre bay, warm wood reveal panels (0.66 m) flank four panes on floors 1–4;
on floor 5 they are glazed. The sides and the rear repeat the chamfer glazing (neither reference sees them; no run is
closed with solid wall). The layout is computed by `rebuild/envelope_layout.py` and written to `plan["envelope"]`:
- frame dimensions;
- the storeys (floors 1–5 above the podium roof);
- 16 bays, each with its run, start point, direction, length, end kinds (corner / pilaster / column) and per-floor
  variants: pane spans, door panes and wood spans;
- the 8 corner posts.

The door panes (the middle pane or pair of each bay; single-pane bays are fixed) are the balconies layer's thresholds.

| Object | What |
| --- | --- |
| `rb_frames_f1`…`f5` | `TM_RB_frame`: rounded corner posts on the wall-line fillets; full-height jambs against the pilasters and against the columns (shaped to the column arc, 3 mm clear); head and sill rails; mullions; a transom across every pane |
| `rb_glass_f1`…`f5` | `TM_RB_glass`: a lower light (the slider) and an upper light per pane, 24 mm, centred on the wall line |
| `rb_wood_f1`…`f4` | `TM_RB_wood`: the centre bay's reveal panels |

Frame depth 0.12 (centred on the wall line), members 0.06, head 0.08, sill 0.05. The audit stays clean: 0 z-fights and
0 penetrations. The contacts are glass against frame members; the frames rest on the slabs and touch the pilasters.
`rb_lib.pieces()` builds many closed solids into one object (one frames object per storey).

Evidence: `tests/artifacts/screens/buildings/terramar_recessed/rebuild/644_envelope/` (`check_sheet.png`,
`check_b8_overlay.png`, `zoom_centre_chamfer_b8_vs_overlay.png`, `checks.json`, `terramar_rebuild.audit.json`, `poses/`).

**`RB_BALCONIES` (AI 645).** From b8: frameless clear glass guards with a slim dark top rail 1.0 m above the floor,
on a dark base shoe just behind the slab fascia, following the rounded corners. Floor 1's guards run on the podium
edge. The soffits are warm wood with small downlights. `rebuild/balcony_layout.py` computes the layout into
`plan["balconies"]`:
- the walking-surface pieces: from the window frames' outer face (wall line + 0.06, R 0.31 at the corners, meeting
  the corner posts exactly) to the guard shoe. They split at the pilasters and step round each column front, 3 mm clear;
- the guard runs on the guard line (balcony edge − 0.15): one 71.9 m run from pilaster to pilaster round the
  building, and the centre loggia's 5.3 m run. In b8 the chamfer columns stand at the slab edge and break the guard;
  in the approved plan they stand 1.3 m back, so the guard passes in front of them;
- the downlight points on the soffit centre line, clear of the pilasters;
- the reserved prop slots: 140 planter slots (pots against the guard, per bay and floor, in front of the centre bay's
  wood panels) for AI 627, and five podium-edge planter strips on floor 1 for AI 628.

| Object | What |
| --- | --- |
| `rb_paving_f1`…`f5` | `TM_RB_paving`, 30 mm walking surface (floor 1 = the podium-roof terrace out to the podium edge) |
| `rb_guard_f1`…`f5` | shoe 0.06 × 0.10 and rail 0.04 × 0.04 (`TM_RB_frame`); glass panels of 15 mm, ≤ 1.6 m, 10 mm joints (`TM_RB_glass`); 245 panels in all |
| `rb_thresholds_f1`…`f5` | `TM_RB_threshold`: a 15 mm stone step before every door pane of `plan["envelope"]`, between the paving and the 50 mm sill |
| `rb_downlights_f1`…`f5` | `TM_RB_downlight` discs under the soffit above each floor's balcony |

**Soffit tone.** The layer sets `TM_RB_soffit` to `plan["balconies"]["soffit_rgb"]`, matched to b8 under the
calibrated rig in two Cycles iterations from `CAM_B8`: (0.62, 0.50, 0.38) → (0.32, 0.135, 0.09) → (0.31, 0.125, 0.085).
The rendered soffits now read within about 5 levels of b8's at three soffit boxes: centre 87/55/31 vs 86/53/26,
right chamfer 106/77/51 vs 102/72/49, left 74/57/32 vs 76/53/34.

Audit: 53 objects, 0 z-fights, 0 penetrations. Evidence:
`tests/artifacts/screens/buildings/terramar_recessed/rebuild/645_balconies/` (`check_sheet.png`, `check_b8_overlay.png`,
`zoom_corner_b8_vs_overlay.png`, `checks.json`, `terramar_rebuild.audit.json`, `poses/`).

**`RB_PODIUM` (AI 646).** From b8 (heights through `CAM_B8`):
- **Piers and bays:** stone piers at the corners, wrapping the rounded corners, and one under every chamfer column. On the front the corner piers reach the entrance volume. Each chamfer gets two bays, the sides and rear follow the same pattern, and there are 13 bays in all.
- **Storefronts:** black steel, 0.30 m back, with 2–3 panes, a transom band at 3.40–4.00 m and a head panel up to 4.75 m. A stone band runs up to the upper podium slab.
- **Upper recesses:** glazing 0.90 m back, from 5.79 to 9.15 m with a transom at 8.55 m. A glass guard stands at the front, and a paving strip reserved for planter boxes sits behind it.
- **Entrance:** the structure's jambs widen to b8's 0.57 m.
  - The stone sign band (lintel) runs from 4.0 m, with a wood soffit.
  - A warm-wood-lined vestibule has black-framed double doors, sidelights and a transom on a 1 m grid, with wood panels to the jambs.
  - The entrance roof is a terrace with one mitred guard run, in front of a wood-lined loggia with the same grid.
- **Lanterns:** small dark lanterns on the entrance jambs and the chamfers' outer piers.

`rebuild/podium_layout.py` computes the piers and bays into `plan["podium"]`, along with the entrance and loggia grids, the lantern positions and the prop reservations:
- awnings per storefront bay (AI 631);
- upper planter strips (AI 628);
- café zones in front of the chamfers (AI 632);
- planters beside the entrance (AI 633).

**Sign.** `rebuild/trace_sign.py` traces the kit's opacity masks into letter outlines and writes them to
`tests/artifacts/blender/terramar_recessed/rebuild/sign/<line>.json`. It uses sub-pixel marching squares at the 0.5 cutoff, with saddles
resolved by the cell centre, Douglas-Peucker simplification and holes nested into their glyphs: 9 glyphs and 7 holes
for TERRA & MAR, 14 and 3 for COASTAL KITCHEN. It needs only numpy and Pillow; run it before building the podium. The
layer fills and extrudes the letters 30 mm deep, 15 mm off the sign band, with the kit's base colour, roughness,
metallic and OpenGL normal maps planar-mapped from the card. Sizes come from b8 through `CAM_B8`: visible glyph widths of
3.85 and 2.54 m, centres at z 5.01 and 4.47. The kit's 3.2 / 2.1 m are its suggested working scale, not a survey. The maps
come from the PBR sets AI 640 installs (`assets/public/pbr/terramar_sign_*`) when present, otherwise from the extracted kit
under `tests/artifacts/blender/terramar_recessed/pbr_kit_source/`. AI 640 has not run yet, and nothing under `assets/` was touched.

| Object | What |
| --- | --- |
| `rb_podium_piers` / `rb_podium_lintels` | `TM_RB_podium_stone`: corner and column piers; storefront and recess lintels; the sign band; the front centre's upper jambs and loggia lintel (wood undersides) |
| `rb_storefront_frames` / `_glass`, `rb_upper_frames` / `_glass`, `rb_entrance_frames` / `_glass` | black frames and 24 mm glass |
| `rb_podium_guards`, `rb_podium_paving`, `rb_podium_wood`, `rb_podium_lanterns` | guards, recess and terrace paving, wood linings and panels, lanterns |
| `rb_sign_terra_and_mar`, `rb_sign_coastal_kitchen` | the letters, `TM_RB_sign_<line>` with the kit maps |

**Audit, sharpened (AI 646).**
- `BVHTree.overlap()` never reports exactly coplanar triangles, so the audit now hashes every face by its plane and compares same-plane faces of the two objects directly.
- Same-plane faces are classed as z-fight (facing the same way and overlapping), adjacent (facing the same way, only sharing an edge) or contact (facing each other).
- Overlap means a vertex or a triangle centroid of one face lies strictly inside the other. Triangle centroids are used because a concave face's centroid can lie outside it.
- The synthetic self-test checks all classes:
  - twin cubes: 6 z-fights;
  - flush neighbours: 1 contact and 4 adjacent;
  - stacked cubes: contact and touching;
  - sunk cubes: 7 penetrating.
- The full rebuild audits to 67 objects, 0 z-fights, 0 penetrations. The first run caught a real bug: the podium glass had the frames' full depth.

Evidence: `tests/artifacts/screens/buildings/terramar_recessed/rebuild/646_podium/` (`check_sheet.png`, `check_b8_overlay.png`,
`zoom_podium_b8_vs_overlay.png`, `checks.json`, `terramar_rebuild.audit.json`, `poses/`).

**`RB_ROOF` (AI 647).** The deep rounded roof edge (0.68 m) is the structure's slab. This layer adds:
- **Guard:** b8's frameless glass guard with a slim top rail, all round the roof guard line, as two mitred halves meeting at the front and rear centres. One closed band would be a single face that touches itself.
- **Terrace:** a flat 50 mm deck, with the drainage falls left in the slab below, running from the guard shoe to the penthouse walls.
- **Penthouse:** the user kept it, set back out of b8's view (10 × 7.5 m at x ±5, y −1…6.5):
  - pale stone walls 0.25 m thick, with a parapet 3.8 m above the roof and a cap;
  - the aerial's openings: a wood door and a two-pane slider on the front, a tall side window, a door into the annex, two rear windows, all in black frames;
  - its roof slab covers the core, whose top now ends under it at 30.45;
  - four rows of tilted solar modules (28 modules, 10°) on edge rails, kept clear of the three mechanical units.
- **Annex:** the aerial's glazed pavilion on the −X side, with four posts, beams, 17 louvre blades and glazing on three sides.
- **Reserved props:** the terrace planter ring (AI 629) and three furniture zones (AI 630) in `plan["roof"]["props"]`.

Everything above the roof carries `rb_hide_from_b8`. `plan["roof"]["sightline"]` checks each part against `CAM_B8`'s line
over the roof edge; the tightest is the units, 4.6 m against a 5.43 m limit. `check_layers.py` renders them all red from
`CAM_B8` beside stand-in walls and finds 0 pixels. It also renders the roof level from `CAM_AERIAL` over the aerial:
- the roof's front edge and guard sit on the aerial's;
- the penthouse lands behind the aerial's, because the plan is deeper than the aerial's inconsistent roof plane;
- at the aerial's position, about 7 m behind the roof front, b8 would see anything over 3.76 m, and the penthouse with its cap is 3.86 m.

`rb_lib` gains `glass_frame` (shared with the podium), `equal_spans` and `boxes()` (hexahedra, for the tilted panels).

Audit: 81 objects, 0 z-fights, 0 penetrations. Evidence: `tests/artifacts/screens/buildings/terramar_recessed/rebuild/647_roof/`
(`check_sheet.png`, `check_b8_overlay.png`, `check_b8_sightline.png`, `check_aerial_overlay.png`, `checks.json`,
`terramar_rebuild.audit.json`, `poses/`).
