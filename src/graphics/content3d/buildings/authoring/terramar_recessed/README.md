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
| props | 627 | DONE (rebuild): 94 seeded pots on floors 2–5 with the game's own viburnum shrubs and silver lindens as olives (collection instances), the front loggia's bistro (floor 3) and lounge (floor 5) sets; 0 plants past the guards |
| props | 628 | DONE (rebuild): 46 dark-metal planter modules on the upper recesses, behind the floor-1 guard (H, A, B) and on the entrance terrace, with 352 viburnum forms and 2746 seeded flower heads; 0 plants past the guards |
| props | 629 | DONE (rebuild): a perimeter ring of low limestone troughs with viburnum, feature clusters of procedural cycads, palms and spiky rosettes and linden olives at the corners and along the runs (the front's middle low, as b8), six planter islands after the aerial; 0 foliage past the guard |
| props | 630 | DONE (rebuild): the aerial's dining (table, eight chairs), lounge (sofa, armchairs, tables) and front-centre groups (armchairs, low table, loungers) in teak, off-white cushions and charcoal metal; the deck's limestone paving tiles; 0 px from CAM_B8 |
| props | 631 | DONE (rebuild): 13 dark charcoal slatted canopies, one per podium storefront bay (none over the entrance), 24 degrees, wall plate under the lintel, fascia, 39 tie rods |
| props | 632 | DONE (rebuild, site): `RB_SITE` beside the building: a 6 m paved sidewalk along the front runs, 8 café sets (square cream market umbrellas, round wood tables, 23 woven chairs) before the chamfer storefronts |
| props | 633 | DONE (rebuild, site): 4 tall procedural street palms in limestone tree pits (the two main ones at b8's positions through `CAM_B8`), charcoal entrance pots with cycads, 2 CC0 street lamps |
| interior | 634 | DONE (rebuild): seven units a residential floor (partitions cut flush on pilasters, core, columns, a mullion), warm plaster, a downlight grid; the glass lets shadow rays through so the rooms are lit |
| interior | 635 | DONE (rebuild): dining bands behind every storefront, the entrance zone under a slatted teak ceiling, the bar on the core's teak-panelled front, banquettes; a pendant over every table and a warm area-light fill |
| interior | 636 | DONE (rebuild): dining bands behind every upper bay, the loggia room behind the front centre's glazing, banquettes, a sideboard on the core's teak-panelled front, two tables on the entrance terrace; pendants, a warm fill and a ceiling wash |
| interior | 637 | DONE (rebuild): sheer curtains on ceiling tracks behind every bay's glazing on floors 1-5, drawn to seeded positions (no two floors alike); a seeded lounge, dining or reading set with a floor lamp near the windows |
| interior | 638 | DONE (rebuild): the annex holds the kitchen (counter run with a lit shelf, an island with stools and pendants) and a lounge corner; the penthouse ring a sofa at the front slider and an armchair at the right window; downlights, warm fills, plants |
| material | 640 | DONE: the user's PBR kit installed as three sets (byte-exact, provenance in `source.json`), configs committed, not registered in the catalog (see "The Terra & Mar PBR kit sets") |
| exterior | 641 | ~~Open the side bays (C, G): the game buried the side windows behind solid brick prows~~ superseded by the rebuild → 644 |
| rebuild | 642 | DONE: **restart from scratch** (user, 2026-10-12): calibrated b8 camera, silhouette options, approved plan E in `rebuild/terramar_plan.json`, massing check (see "Rebuild" below) |
| rebuild | 643 | DONE: structure layer (slabs with face sets, pilasters, rounded columns, podium, core), `build.py`, `CAM_B8` fitted to the plan, rebuild switches in the pose renderer, composer and audit |
| rebuild | 644 | DONE: envelope layer (16 bays of black-framed sliders with transoms, corner posts, column-hugging jambs, centre-bay wood reveals on floors 1–4), layout and door panes in `plan["envelope"]` |
| rebuild | 645 | DONE: balconies layer (paving, frameless glass guards with rail and shoe, door thresholds, downlights, soffit tone matched to b8), planter slots reserved in the plan |
| rebuild | 646 | DONE: podium layer (stone piers and bands, storefronts, deep upper recesses with guards, entrance portal and loggia, lanterns, kit lettering traced into real letters), prop slots reserved |
| rebuild | 647 | DONE: roof layer (guard all round, terrace deck, penthouse with the aerial's openings, louvred annex, solar rows, units), all out of b8's view (0 px), terrace prop zones reserved |
| rebuild | 648 | DONE: materials pass (kit limestone through one node group, panel joints cut as bevelled grooves with a UV offset per panel, teak reveals, b8 soffit tone, black steel, clear glass, the kit's bronze letters), tones from b8 boxes; audit still 0 / 0 |

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

### The rebuild files and their layers (AI 643+; split into parts 2026-10-14)

The model is split into four part files, each owning one root collection. A composition links the four roots and is
the file the poses, the audit and the checks open. The parts are built from the plan by `build.py`; `compose.py` makes
the composition.

| File | Root | Holds | Layers |
| --- | --- | --- | --- |
| `terramar_building.blend` | `TM_BUILDING` | the architecture | structure, envelope, balconies, podium, roof (penthouse, annex, solar, units), interior_base (partitions, downlights) |
| `terramar_props.blend` | `TM_PROPS` | the props on the building | balcony_plants, podium_planters, roof_planters, roof_furniture, awnings |
| `terramar_site.blend` | `RB_SITE` | the street | site_cafe (sidewalk, café), site_palms (palms, pits, entrance pots, lamps) |
| `terramar_interiors.blend` | `TM_INTERIORS` | the furnished interiors | restaurant_l0, dining_l1, residential, penthouse |
| `terramar_wear.blend` | `TM_WEAR` | the wear module's overlays (2026-10-14): the runoff streak decals | wear_overlays |
| `terramar_composition.blend` | — | building + props (+ site, interiors) | links the four roots: `TERRAMAR_REBUILD` (local) holds `TM_BUILDING`, `TM_PROPS` and `TM_INTERIORS`; `RB_SITE` sits beside it |

Why four parts and not two:
- **Site:** the street is context, not the building. A city scene can keep or drop it.
- **Interiors:** the furnished interiors are heavy and only seen through the glass. A light composition can leave them
  out.
- **Props:** the props stay apart from the architecture, as asked.

How the parts behave:
- Each part has its own copy of the base scene (`INSPECTION_RIG` with the calibrated HDRI and sun, `RB_CAMERAS`,
  `RB_PLAN_GUIDES`), so it opens lit and renders on its own.
- Each part runs the materials pass on its own slots. Only the building has stone faces, so only it gets joints and
  writes `joint_layout.json`.
- The composition follows the parts whenever they are rebuilt and saved. Rerun `compose.py` only if the parts or their
  roots change.
- Linked data is read-only in the composition: edit a part, never the composition. `check_layers.py` makes the linked
  parts local in its own session (never saved) so it can recolour and hide them.

The split was checked against the single file it replaced:
- every layer gives the same counts;
- five poses render identically (mean pixel difference at most 0.95 of 255, no pixel over 40);
- the audit is the same (120 objects, 0 z-fights, 0 penetrations; the site 7 objects, 0/0);
- hidden parts visible from b8: 0 px.

That evidence is in `tests/artifacts/screens/buildings/terramar_recessed/rebuild/reorganize_parts/`.

```
# every part from scratch, then the composition
blender -b --factory-startup --python src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/build.py -- target=all
# one part from scratch, or one layer in place (layers= picks its part; headed: open the part, exec build.py the same way)
blender -b --factory-startup --python src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/build.py -- target=props
blender -b tests/artifacts/blender/terramar_recessed/rebuild/terramar_building.blend --python src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/build.py -- layers=roof
# the composition again (only if the parts or their roots change)
blender -b --factory-startup --python src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/compose.py
# checks, audit, lit poses: on the composition
blender -b tests/artifacts/blender/terramar_recessed/rebuild/terramar_composition.blend --python src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/check_layers.py -- out=tests/artifacts/screens/buildings/terramar_recessed/rebuild/<item>
python -I src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/compose_checks.py tests/artifacts/screens/buildings/terramar_recessed/rebuild/<item>
blender -b tests/artifacts/blender/terramar_recessed/rebuild/terramar_composition.blend -P src/graphics/content3d/buildings/authoring/terramar_recessed/audit_collisions.py
blender -b tests/artifacts/blender/terramar_recessed/rebuild/terramar_composition.blend -P src/graphics/content3d/buildings/authoring/terramar_recessed/audit_collisions.py -- root=RB_SITE out=<site.audit.json>
blender -b tests/artifacts/blender/terramar_recessed/rebuild/terramar_composition.blend -P src/graphics/content3d/buildings/authoring/terramar_recessed/render_poses.py -- items=<id>
python -I src/graphics/content3d/buildings/authoring/terramar_recessed/compose_pose_sheets.py --before <tag> --after rebuild --items <id>
```

Until 2026-10-14 everything lived in one file, `terramar_rebuild.blend`. The per-item evidence of AI 643–648 and
627–638 was rendered from it. The before/after snapshots and that file went to the Recycle Bin once the parts matched.

| Script | Does |
| --- | --- |
| `build.py` | the entry: `target=` (building, props, site, interiors, wear or all), or `layers=` of one part; refuses any file but that part's (or an unsaved session); sets the part's root, refreshes the base scene, then runs `layer_<name>.py` for each requested layer, which empties and rebuilds only its own collection under the part's root, then the finishing passes (`materials`, then `wear` in the building, props and site; `wear=0` strips the wear); `target=all` builds every part from scratch and composes |
| `compose.py` | the composition (2026-10-14): links the parts' roots into `terramar_composition.blend` beside the base scene (local `TERRAMAR_REBUILD` holding the building, props, interiors and, when built, the wear overlays `TM_WEAR`; `RB_SITE` beside it) and sets the wear switch ON |
| `layer_wear.py` | the wear finishing pass (2026-10-14): strips any previous wear, builds the `TM_WEAR_*` node groups, flags the exterior objects, writes the signals and the features' attributes, splices `TM_WEAR_layer` into the exterior materials; `build_overlays()` is the wear part's layer; standalone on a scratch copy (see "Wear and weathering") |
| `wear.py` | the wear switch on a saved file, normally the composition: `wear=on\|off\|debug\|clear`, `strengths=` (every feature not given takes its default; `all:<v>` sets them all first), `signal=`, `save=1` |
| `wear/` | the wear module: `controls.py` (switch), `classes.py` (slot -> class), `context.py` (the part, walking surfaces, ray scene), `signals.py`, `nodes.py` (builder, groups, insert / remove), `registry.py` (features in ORDER, the contract), `overlays.py` (the wear part), `scratch.py` (private part copies), `sheets.py` (evidence sheets, exact diffs), `features/` (below) |
| `wear/features/teak_weather.py` | wear feature (ORDER 20): outdoor teak, café wood and the architecture's wood greying toward silver on the faces the sky reaches (`teak_open`) |
| `wear/features/fabric_fade.py` | wear feature (30): the café umbrellas' canvas a touch sun-faded on top, a faint dust line along the hems (`fabric_hem`, `fabric_piece`) |
| `wear/features/metal_chalk.py` | wear feature (50): the black powder coat (frames, rails, louvres, storefront canopies) greyer and matt where the sky reaches it, per member (`chalk`) |
| `wear/features/splash_zone.py` | wear feature (100): the street-splash band at the foot of the walls, its height from the rain reaching the pavement in front (`splash`) |
| `wear/features/ledge_dust.py` | wear feature (110): dust on the up-facing ledges and floors, kept where sheltered, rinsed where open, drifted into the lee (`ledge`, `ledge_rain`, render-time occlusion) |
| `wear/features/cavity_soot.py` | wear feature (120): soot in the inside corners and junctions (render-time occlusion), less where rain rinses (`soot_shelter`) |
| `wear/features/joint_dirt.py` | wear feature (130): dirt in the stone joints (horizontal and sheltered runs hold more, `jrun`) and the paving's tile joints (`tile`, `tjoint`) |
| `wear/features/runoff_streaks.py` | wear feature (220): faint runoff streaks below drip points and rust under a lantern, one ray-traced decal each in the wear part (atlas generated into `tests/artifacts/blender/terramar_recessed/rebuild/wear/runoff_streaks/`) |
| `wear/features/glass_film.py` | wear feature (300): an even dust and salt film per pane of the exterior glazing, duller and hazier, never lighter (`pane_film`) |
| `rb_lib.py` | shared helpers: collections, the `TM_RB_*` materials, `solid()` (closed solids from plan regions as n-gons: a region with holes is cut along a line through its hole, and every loop gets the cut points, so tops, bottoms and side faces share their vertices), box UVs, the plan cameras |
| `layer_structure.py` | the structure layer, `RB_STRUCTURE` (below) |
| `layer_envelope.py` / `envelope_layout.py` | the envelope layer, `RB_ENVELOPE`, and its bay/pane layout (written into the plan by `make_plan.py`) |
| `layer_balconies.py` / `balcony_layout.py` | the balconies layer, `RB_BALCONIES`, and its layout (paving pieces, guard runs, downlights, planter slots) |
| `layer_podium.py` / `podium_layout.py` / `trace_sign.py` | the podium layer, `RB_PODIUM`, its layout, and the sign tracer (kit masks -> letter outlines) |
| `layer_roof.py` | the roof layer, `RB_ROOF` (its layout is `plan["roof"]`, written by `make_plan.py`) |
| `roof_units.py` | the penthouse roof's mechanical plant into a caller's bmesh (2026-10-15): top-discharge condensing units (rails on pads, feet, finned coil faces behind a wire guard, seamed service panels, fans with pitched blades under domed guards) and a side-discharge condenser, the insulated lines, the covered pipe tray and the roof hood; `plant(bm, plan["roof"], z)`, `materials()` (`TM_RB_unit_*`, `TM_RB_lift_steel`); test renders with `-- out=` |
| `b8_camera_fit.py` | fits `CAM_B8` to the plan by least squares over the b8 picks (used by `make_plan.py`, written to `plan["cameras"]`) |
| `check_layers.py` / `compose_checks.py` | Workbench checks: the layer's edges over b8, a top cut-away with the plan outlines, the rear, and the core's visibility from b8 with stand-in walls |
| `layer_materials.py` | the materials pass (AI 648): re-dresses every `TM_RB_*` slot from `plan["materials"]` and cuts the stone joints into the layers' objects (since 2026-10-14 also the seams between flush pieces and the named `joints.objects`, such as the site's tree pits); `build.py` runs it after any geometry layer it rebuilds |
| `sample_tones.py` | b8 vs a `CAM_B8` render, box by box (stone, wood, soffit): mean colours, linear ratios, the suggested tone |
| `compose_joint_layout.py` | the stone joint layout as one elevation per run, from `joint_layout.json` |
| `layer_roof_planters.py` / `proc_plants.py` | the roof terrace's planters and trees (AI 629), `RB_PROPS/RB_ROOF_PLANTERS`, from `plan["props"]["roof_planters"]`; the procedural cycads, palms and spiky rosettes the game's vegetation lacks; `fit_scales` fits every instance to its target (the detailed palms within 10 % xy / z) |
| `palm_frond.py` | one detailed feather-palm frond into a caller's bmesh (petiole, tapering rachis, individual creased leaflets; young / mature / old / dead), and its three materials (`RBP_palm_leaflet_foliage`, `RBP_palm_rachis`, `RBP_palm_dead_foliage`); test renders with `-- out=` |
| `palm_trunk.py` | the palm trunk with its leaf-scar rings and crown boot zone into a caller's bmesh (`rbp_*` attributes, cylindrical UVs), and `RBP_palm_bark` / `RBP_palm_boot`; test renders with `-- out=` |
| `palm_base.py` | the root base (boss, adventitious roots, root initials) welded under the trunk, and `RBP_palm_root` (the bark blended into the root zone); test renders with `-- out=` |
| `palm_tree.py` | the whole palm as one mesh (2026-10-14): trunk, base welded on its ring, a crown of 20-30 fronds on the boot zone; `build_palm(bm, rng, scale="street" \| "roof")`, used by `proc_plants.py` for `street_palm` and `palm`; test renders with `-- out=` |
| `furniture_materials.py` | the furniture's shared materials (2026-10-14), one source for both furniture modules: `TM_RB_furn_teak`, `TM_RB_furn_metal`, `TM_RB_furn_fabric_<offwhite\|ecru\|greige>` (procedural, UV driven, shifted per object so linked duplicates differ), and the plain `TM_RB_teak` / `TM_RB_charcoal_metal` of the box-built bar, ceiling, kitchen, poles and lamps |
| `furniture_chairs.py` | detailed chairs into a caller's bmesh (2026-10-14): `dining_chair` (teak, slat / cane / band backs, a seat pad), `cafe_chair` (rattan bistro, arm / side, woven seat and back), `bar_stool`; `build(bm, item, z, slot)`, `materials()` (adds the rattan, wrap, weave and cane materials); test renders with `-- out=` |
| `furniture_tables_seating.py` | detailed tables and soft seating into a caller's bmesh (2026-10-14): `dining_table`, `coffee_table`, `low_table`, `side_table`, `cafe_table` (the pole's hole), `sofa` / `armchair` (upholstered or `frame: "teak"`), `lounger`; `build(bm, item, z, slot)`; test renders with `-- out=` |
| `cafe_umbrella.py` | the café's octagonal market umbrella into a caller's bmesh (2026-10-14): 8 sagging canvas panels with seam ridges and a turned hem, the vent cap and finial, 8 valance flaps, wood ribs and struts on a runner, a two-section pole with its sleeve, pulley, halyard and cleat; `build(bm, slot, centre, axis_u, cfg, z0, seed)`, `materials()` (`TM_RB_cafe_canopy` canvas, `TM_RB_cafe_wood`, `TM_RB_cafe_metal`, `TM_RB_cafe_rope`), `to_object()`; test renders and checks with `-- out=` |
| `layer_roof_furniture.py` | the roof terrace's furniture (AI 630), `RB_PROPS/RB_ROOF_FURNITURE`, from `plan["props"]["roof_furniture"]` (`props_layout.py`); and `furnish()`, the placement every furnished layer shares (one object per item, identical pieces sharing one mesh), with `clear()` and `materials()` |
| `layer_interior_base.py` | the interior base (AI 634), `RB_INTERIOR/RB_INTERIOR_BASE`: partitions and ceiling downlights, from `plan["interior"]["base"]` (`props_layout.py`) |
| `layer_restaurant_l0.py` | the ground-floor restaurant (AI 635), `RB_INTERIOR/RB_RESTAURANT_L0`: furniture, bar, wood ceiling, pendants, plants, fill lights, from `plan["interior"]["restaurant_l0"]` (`props_layout.py`) |
| `layer_dining_l1.py` | the upper-podium dining room (AI 636), `RB_INTERIOR/RB_DINING_L1`: furniture, sideboard, pendants, plants, fill and ceiling-wash lights, from `plan["interior"]["dining_l1"]` (`props_layout.py`); reuses `layer_restaurant_l0.py`'s pieces |
| `layer_residential.py` | residential curtains and furniture (AI 637), `RB_INTERIOR/RB_RESIDENTIAL`: sheer panels and tracks, furniture sets, floor lamps, from `plan["interior"]["residential"]` (`props_layout.py`) |
| `layer_penthouse.py` | the penthouse interior (AI 638), `RB_INTERIOR/RB_PENTHOUSE`: furniture, kitchen, pendants, downlights, lamps, plants, fills, from `plan["interior"]["penthouse"]` (`props_layout.py`); every object tagged `rb_hide_from_b8` |
| `layer_awnings.py` | the storefront canopies (AI 631), `RB_PROPS/RB_AWNINGS`, from `plan["props"]["storefront_awnings"]` (`props_layout.py`) |
| `layer_site_palms.py` | the street palms, entrance planters and lamps (AI 633), site dressing in `RB_SITE/RB_SITE_PALMS`, from `plan["props"]["street_dressing"]` (`props_layout.py`) |
| `layer_site_cafe.py` | the sidewalk and its café (AI 632), site dressing in `RB_SITE` (outside `TERRAMAR_REBUILD`), from `plan["props"]["sidewalk_cafe"]` (`props_layout.py`) |
| `layer_podium_planters.py` | the podium's planter boxes (AI 628), `RB_PROPS/RB_PODIUM_PLANTERS`, from `plan["props"]["podium_planters"]` (`props_layout.py`) |
| `layer_balcony_plants.py` / `props_layout.py` / `decode_vegetation_glb.mjs` | the balcony planting (AI 627), `RB_PROPS/RB_BALCONY_PLANTS`, its seeded layout (written into `plan["props"]` by `make_plan.py`), and the converter that makes the game's KTX2 vegetation readable by Blender |

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
under `tests/artifacts/blender/terramar_recessed/pbr_kit_source/`. Since AI 640 the installed sets are used.

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

**Materials and stone joints (AI 648).** `layer_materials.py` is a pass, not a layer: it owns no collection. `build.py`
appends it whenever it rebuilds a geometry layer (`materials=0` skips it; `layers=materials` alone re-dresses the
materials of a file already cut). Every `TM_RB_*` slot is re-dressed by name from its family in `plan["materials"]`
(`make_plan.py`):

| Family | Slots | Look |
| --- | --- | --- |
| stone | slab fascia, pilaster, column, podium stone, penthouse stone | the kit limestone through the node group `TM_RB_limestone` (basecolor, arm = AO / roughness / metallic, `normal_gl`; UV / 4 m); tone (1.24, 1.113, 1.115) on the base colour |
| paving | paving, threshold, slab top | the same group, tone 0.86 |
| wood | `TM_RB_wood` (front reveals, entrance and loggia linings) | warm teak (0.46, 0.25, 0.10), flat: no wood texture is installed |
| soffit | `TM_RB_soffit` | AI 645's b8-matched tone (0.31, 0.125, 0.085), flat |
| steel | frame, louvre | black powder coat (0.018), roughness 0.38 |
| glass | glass | clear, IOR 1.5, a faint green-grey tint |
| plaster / interior floor / concrete | ceiling; floor; roof top, core, hidden | plain Principled |

The sign letters keep the kit's own bronze sets (the podium layer's `TM_RB_sign_*`).

The joints are geometry, as the kit asks:
- **Grooves:** 8 mm wide, 6 mm deep, with a 3 mm bevel each side. The groove floor takes `TM_RB_stone_joint`; the bevels stay stone and catch the light.
- **Courses:** z-planes from 15 datums: the podium's storey and band levels (0.15, 4.0, 4.75, 5.38, 5.79, 9.15, 9.76), the slab tops, the roof slab and the penthouse parapet. Each band is split into equal courses near 0.67 m, so the tower has five per storey (b8's pilasters) and the sign band reads as three courses with the slab edge (as in b8). A course plane cuts only the faces whose height holds the groove with clearance, so a lintel whose soffit sits on a plane is not cut there.
- **Vertical joints:** per flat face at least 0.2 m tall, equal panels of at most 1.2 m (1200 × 670 large format), carried over the stone soffit or top they meet. They stack-bond with the courses. The curved corners are one piece each.
- **Which slots get which:** pilasters and the podium get both, the columns courses only, the slab fascias vertical joints only.
- **Repeat:** every panel, a region bounded by groove floors, gets its own seeded UV offset, so the 4 m repeat never lines up.

Each object is cut once and tagged `rb_joints`; a layer rebuild makes new, uncut objects. The cutter tracks every
original face through its splits with an int face layer. It pushes each strip vertex by the least-squares direction of
the faces whose joint it lies on, so a groove keeps its depth round a corner. It splits the twisted corners where two
bevels cross along their mitre. Its self-checks (degenerate, non-planar, non-manifold faces) are all 0. Two bugs the
audit caught are fixed:
- a 1 µm strip tolerance missed float32 vertices about 10 m from the origin (now 0.2 mm);
- a soffit got the same plane from both of its faces.

The full build is 22 objects jointed, 779 vertical joints, 1284 panels, in 1.9 s.

**Tones** (`sample_tones.py`, b8 boxes against the `CAM_B8` Cycles render):

| Box | b8 | Render |
| --- | --- | --- |
| soffit | 86/53/26 | 89/53/27 |
| shaded teak reveal | 100/69/45 | 101/69/33 |
| podium stone | 203/193/187 | 200/191/181 |
| lit pilasters and fascia | 215–220 | 205–206 |

On the lit stone the hue matches (R−G 10 vs 12), but the brightness stays about 12 levels short. The kit's red albedo is
already about 0.95, and AgX's shoulder needs albedo above 1 to go further. b8's lit stone is brighter than the
calibrated rig can render with a physical albedo. No weathering or soiling noise.

Audit: 81 objects, 0 z-fights, 0 penetrations. Hidden parts visible from b8: 0 px. The new poses are `pilaster_closeup`
and `joint_detail_pilaster`. Evidence is in `tests/artifacts/screens/buildings/terramar_recessed/rebuild/648_materials/`:
- `poses/rebuild_pre648_vs_rebuild/`: [b8 | before | after] for `b8_calibrated`, and [before | after] for 8 close and full poses;
- `joint_layout.png` and `joint_layout_summary.json`;
- `tone_boxes.png` and `tone_samples.json`;
- the checks and `terramar_rebuild.audit.json`.

The "before" file is `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild_pre648.blend`.

**Balcony planting (AI 627, props).** `props_layout.py` turns AI 645's planter slots into seeded placements in
`plan["props"]["balcony_plants"]` (seed 627; one generator per floor and bay, so a bay keeps its planting when another
changes). From b8:
- **Front centre loggia (A1):** a white pot with a leafy shrub at each end, before the wood panels, on floors 2–4. Floor 5 has one small shrub at its right end and a lounge set (two low upholstered chairs, a low table). Floor 3 has a bistro set (a round table and two ladder-back chairs) between the pots.
- **Every other bay:** pots at both ends (75%) or at one (25%), each holding an olive (silver linden), a shrub or a low spilling plant (50 / 35 / 15). Pots are white, light grey or charcoal (65 / 25 / 10), with sizes, heights, crown radii and turns all seeded.
- **Floors:** 2–5 only. Floor 1 is the podium terrace, whose edge planters are AI 628's.
- **Clear of the guard:** the pots stand 0.12 m in from the reserved slot, so a crown up to 0.46 m stays inside the guard glass.

The plants are the game's own vegetation, `assets/public/vegetation_lod0`:
- the arrowwood viburnum for the shrubs and spilling plants;
- the silver linden, scaled to a 1.6–2.1 m standard, for the olive-like trees. Each olive gets a second, smaller linden form turned against the first, to fill its crown.

Those GLBs carry KTX2 (`KHR_texture_basisu`) maps, which Blender's importer refuses. `decode_vegetation_glb.mjs` transcodes
them with the libktx 4.4.2 the vegetation bake pins (`downloads/tools/ktx-4.4.2`). It writes plain-PNG copies to
`tests/artifacts/blender/terramar_recessed/rebuild/vegetation/` and checks each source's sha256 against the index
(`decoded.json`). It writes nothing under `assets/`.

```
node src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/decode_vegetation_glb.mjs     # once, before the layer
```

`layer_balcony_plants.py` builds `RB_PROPS/RB_BALCONY_PLANTS`:

| Object | What |
| --- | --- |
| `rb_balcony_pots` | the 94 pots as one object: tapered, rolled rim, soil (`TM_RB_pot_white` / `_light_grey` / `_charcoal`, `TM_RB_soil`) |
| `rb_plant_f<floor>_<bay>_<n>[b]` | 136 collection instances of the prototypes, fitted to the plan's height and crown radius; spilling plants lean 10–20° over the rim |
| `rb_set_f3_bistro`, `rb_set_f5_lounge` | the furniture as prisms (`TM_RB_prop_cream`, `TM_RB_prop_white`, black-steel pedestals) |

The game models are imported once into `RB_PROP_PROTOTYPES`, a scene collection outside the rebuild root and excluded from
the view layer, so only the instances render and the audit never sees the prototypes at the origin.
- Each prototype carries its measured height and crown radius.
- The leaves take a small hue / saturation / value step (`LEAF_TONE`): the linden greyer, as an olive, but still fresh green like b8's sunlit trees; the viburnum a touch lighter.

The layer's clearance check samples every instance's foliage against the guard glass's inner face (1.3425 m from the wall
line) and the frames' outer face (0.06): 0 past the guard, 0 into the frames. The closest crown is 2.5 cm inside the glass.

Audit: 84 objects, 0 z-fights, 0 penetrations; the pots and sets sit on the paving as contacts. New poses:
`chamfer_balcony_plants_closeup` and `loggia_bistro_closeup`; 627 is also tagged on `b8_calibrated` and `full_front_left`.
Evidence is in `tests/artifacts/screens/buildings/terramar_recessed/rebuild/627_props_balcony_planters_and_plants/`:
- `poses/rebuild_pre627_vs_rebuild/`: [b8 | before | after] for `b8_calibrated` and `b8_target`, [before | after] for the 7 other poses;
- the checks and `terramar_rebuild.audit.json`.

The "before" file is `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild_pre627.blend`.

**Podium planter boxes (AI 628, props).** b8 shows three runs of planting on the podium. `props_layout.podium_planters()`
lays them out in `plan["props"]["podium_planters"]` (seed 628) from the strips AI 645 and AI 646 reserved:

| Run | Where | Boxes | Planting |
| --- | --- | --- | --- |
| upper | the base of every upper-recess glazing, behind its guard (13 bays) | 26 modules, 0.64 m deep, 0.50 m high | dense greenery: two staggered rows of viburnum forms, a few flower heads |
| edge | behind the floor-1 guard on the podium top, runs H, A, B; the corners the guard rounds stay free | 15 modules, 0.42 deep, 0.40 high | low flowering plants, about 70 heads per metre; the short boxes beside the front pilasters add a tall shrub |
| terrace | the entrance roof, inside its guard | a front trough (3 modules) and a 0.55 m square planter at each front corner | flowers along the front, a tall leafy shrub at each corner |

The modules are at most 2.4 m long with 40 mm joints. The troughs are dark metal (`TM_RB_planter_metal`) with a 30 mm rim,
and their soil (`TM_RB_soil`) sits 40 mm below it.

The game has no flowering plants, so the flowers are small faceted heads in pink, white, yellow, coral and violet. They are
scattered over the shrubs' crowns and kept within the box's rim, with a seeded three-colour mix per box.

Each box records the planes its foliage must stay behind: the guard glass and, on the upper recesses, the glazing frames.
Shrubs keep their crown clear of the box ends.

`layer_podium_planters.py` builds `RB_PROPS/RB_PODIUM_PLANTERS`:
- `rb_podium_planter_boxes`: every box, as one object;
- `rb_podium_plant_<box>_<n>`: 352 collection instances of the viburnum prototypes it shares with AI 627;
- `rb_podium_flowers`: 2746 heads, as one object.

The layer's check finds 0 shrubs past the guard glass or the glazing (closest 3.1 cm).

Audit: 86 objects, 0 z-fights, 0 penetrations. The first run caught flower heads poking into the right pilaster and the
piers; heads now stay inside the rim. Hidden parts visible from b8: 0 px.

New poses: `podium_edge_planters_closeup` and `entrance_terrace_planters`. 628 is also tagged on `b8_calibrated`,
`full_front_left` and `stone_cladding_closeup`. Evidence is in
`tests/artifacts/screens/buildings/terramar_recessed/rebuild/628_props_podium_planter_boxes/`:
- `poses/rebuild_pre628_vs_rebuild/`: [b8 | before | after] for the b8 poses, [before | after] for the rest;
- the checks and `terramar_rebuild.audit.json`.

The "before" file is `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild_pre628.blend`.

**Roof terrace planters and trees (AI 629, props).** b8 shows small palms and spiky rosettes behind the roof guard
against the sky: bushy clusters at the front corners and along the chamfers, and low planting along the front. The aerial
shows a dense band all round and planter islands. `props_layout.roof_planters()` lays them out in
`plan["props"]["roof_planters"]` (seed 629):

| Part | Layout | Planting |
| --- | --- | --- |
| perimeter ring | AI 647's 0.7 m band just inside the guard: 42 low limestone troughs (0.63 x 0.30 m; `TM_RB_paving`, so the materials pass dresses them), each straight run in modules of at most 2.4 m and one curved module per corner arc | an outer row of low viburnum (it covers the trough edge seen through the glass) and a fuller inner row leaning over the terrace |
| feature clusters | the 8 corners and the run midpoints; the front corners carry 4 plants each, and the front's middle stays low (b8) | procedural cycads (the bushy spiky masses), palms and spiky rosettes, and linden olives with a companion form |
| fill plants | one every 2.6 m along every run but A | cycad, spiky or olive (50 / 30 / 20) |
| islands | after the aerial: one at the penthouse's front-left corner, a row of four square planters between the front lounge and the penthouse (paths kept to its door and slider), one by the right-hand lounge; clear of AI 630's seating zones | larger plants (x1.15 height, x1.5 crown) and shrubs, in dark-metal boxes |

`proc_plants.py` builds the plants the game lacks as plain geometry (deterministic per variant), as prototypes in
`RB_PROP_PROTOTYPES`, carrying the same size properties as the game models:
- **spiky:** a short trunk under about 40 arching blades;
- **palm:** a 1.0–1.4 m trunk under about 15 folded fronds;
- **cycad:** a short stout trunk under about 21 fronds, from upright to level.

`layer_roof_planters.py` builds `RB_PROPS/RB_ROOF_PLANTERS`:
- `rb_roof_planter_boxes`: the ring modules (a body, thin rim walls and end caps, so the curved corner modules need no region with a hole) and the islands;
- 441 collection instances.

Every perimeter plant's foliage stays inside the guard shoe's inner line: 0 outside, closest 3.2 cm.

The first pass read wrong against b8:
- the palms looked like lollipops on tall trunks;
- 0.45 m dark troughs showed as a dark band through the glass.

The fix was the cycads, shorter palm trunks, low limestone troughs, the fill plants and the inner row.

Audit: 87 objects, 0 z-fights, 0 penetrations. Hidden parts visible from b8: 0 px. New pose: `aerial_calibrated`
(`CAM_AERIAL`, with the aerial beside it). `compose_pose_sheets.py` now puts a pose's reference first for
`"reference": "aerial"` too. 629 is also tagged on `b8_calibrated`, `full_front_left` and `rebuild_top`. Evidence is in
`tests/artifacts/screens/buildings/terramar_recessed/rebuild/629_props_roof_terrace_planters_and_trees/`:
- `poses/rebuild_pre629_vs_rebuild/`: 8 sheets, with b8 or the aerial first where framed like them;
- the checks and `terramar_rebuild.audit.json`.

The "before" file is `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild_pre629.blend`.

**Roof terrace furniture and paving (AI 630, props).** b8 cannot see the roof deck, so this follows the aerial.
`props_layout.roof_furniture()` lays the groups out in `plan["props"]["roof_furniture"]` (seed 630). Each group sits in the
frame of its run of the terrace loop: u along the run, v in from the guard shoe's inner line.

| Group | Where | Pieces |
| --- | --- | --- |
| dining | the H chamfer, 2.6 m in | a 2.4 m teak table on charcoal legs, eight chairs (three a side, one at each end; teak seat and back, cushion) |
| lounge | the B chamfer, 2.7 m in, as an L | a three-seat sofa backing onto the guard, two armchairs flanking a coffee table, two side tables |
| front centre | run A, 3.6 m in | two armchairs round a low table, and two sun loungers with a raised back, feet towards the view |

Each piece is a prism in its own frame (local +v is its front). The materials are `TM_RB_teak`, a seeded cushion tone per
group (`TM_RB_cushion_offwhite` / `_ecru` / `_greige`) and `TM_RB_charcoal_metal`. Chairs carry a 2 cm, 4° seeded jitter.

`layer_roof_furniture.py` builds `RB_PROPS/RB_ROOF_FURNITURE` (one object per group) and checks every footprint:
- at least 1.2 m inside the guard shoe's inner line (closest 1.25 m), which clears AI 629's planting;
- clear of the islands by 0.25 m and of the penthouse and annex by 0.5 m.

The first layout put two lounge armchairs within 0.25 m of two islands, hence the L. Every furniture object is tagged
`rb_hide_from_b8`, and `check_layers.py`'s sightline render finds 0 px. The `CAM_B8` frame changes in only 22 of 1.57 M
pixels, by at most 13 levels, along the roofline: the guard glass reflecting the new floor.

**Paving tiles.** The deck's walking face is now a face set of its own, `TM_RB_roof_paving` (the roof layer). The materials
pass dresses it as the kit limestone in 600 mm square tiles:
- the tile cells come from the object's x / y;
- a white-noise value per cell offsets that tile's sample of the 4 m map, so neighbours differ;
- the joints are 5 mm, darker (0.30, 0.28, 0.25) and rougher.

It is a material, not geometry: the deck stays one solid, and nothing on it (planters, furniture) has to be cut around.

Audit: 90 objects, 0 z-fights, 0 penetrations. New poses: `roof_dining_closeup` and `roof_lounge_closeup`. 630 is also
tagged on `b8_calibrated` (to show the b8 view unchanged) and `rebuild_top`. Evidence is in
`tests/artifacts/screens/buildings/terramar_recessed/rebuild/630_props_roof_terrace_furniture_and_paving/`:
- `poses/rebuild_pre630_vs_rebuild/`: 8 sheets;
- the checks, including `check_b8_sightline.png`, and `terramar_rebuild.audit.json`.

The "before" file is `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild_pre630.blend`.

**Storefront canopies (AI 631, props).** b8 shows dark charcoal canopies over each chamfer storefront, from pier to pier
and none over the entrance, each with a slatted surface, a dark fascia and thin diagonal tie rods. The aerial continues
them along the side faces. `props_layout.storefront_awnings()` builds one per podium bay (AI 646 reserved all 13) into
`plan["props"]["storefront_awnings"]`:
- **Extent:** along the bay between the pier faces (20 mm clear), from the storefront frames' outer face (v −0.24) out to 1.2 m past the podium outline.
- **Slope:** the slat plane falls 24° from 4.70 m at the wall to 4.06 m at the front. At 12°, the first try, the canopies read edge-on from `CAM_B8`, where b8 shows a clear slatted band.
- **Tie rods:** 2–3 per canopy (one every 2.4 m at most), from the fascia's top to the stone lintel's face at 5.22 m.

`layer_awnings.py` builds `RB_PROPS/RB_AWNINGS`: one object of hexahedra in `TM_RB_awning` (dark charcoal, slightly
metallic). Each canopy has:
- a wall plate on the storefront head panel, 30 mm under the lintel;
- two sloping side rails, with the transverse slats between them (50 mm, at a 90 mm pitch);
- a 140 mm front fascia;
- the tie rods, sheared so both ends are vertical faces: flat on the lintel, standing on the fascia, so nothing penetrates.

They are well above the pier lanterns (2.70–3.02 m).

Audit: 91 objects, 0 z-fights, 0 penetrations. Hidden parts visible from b8: 0 px. New pose: `awning_closeup`. 631 is also
tagged on `b8_calibrated` and `full_front_left`. Evidence is in
`tests/artifacts/screens/buildings/terramar_recessed/rebuild/631_props_storefront_awnings/`:
- `poses/rebuild_pre631_vs_rebuild/`: 7 sheets, with b8 first for the b8 poses;
- the checks and `terramar_rebuild.audit.json`.

The "before" file is `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild_pre631.blend`.

**Sidewalk café (AI 632, site dressing).** b8 shows cream square market umbrellas on wood poles over round wood tables
with brown woven bistro chairs, just in front of the chamfer storefronts on both sides of the entrance: about two per bay.
It belongs to the street, so it is built in `RB_SITE`, a scene collection beside `TERRAMAR_REBUILD`. A city scene can
keep or drop it, and the building's audit root does not include it.

`props_layout.sidewalk_cafe()` writes `plan["props"]["sidewalk_cafe"]` (seed 632):
- **Sidewalk:** its inner edge is the balcony edge's front part (runs H, A, B) with the entrance's bump. The outer edge is the plain front path moved 6 m out. It runs from the street (z 0) up to the ground floor level (0.15).
- **Café sets:** two per bay AI 646 reserved (B0, B1, H0, H1), each 2.4 m from the podium outline. Each is a 2.2 m square umbrella aligned with the run, a table, and 2–4 chairs on a 0.62 m circle facing it (seeded count, turn and jitter).

`layer_site_cafe.py` builds:
- `RB_SITE_GROUND/rb_site_sidewalk`: top `TM_RB_site_paving`, which the materials pass dresses with the roof's 600 mm tiles, a shade greyer;
- `RB_SITE_CAFE/rb_cafe_canopies`: a thin pyramid shell canopy (rim 2.40, apex 2.90 above the street) with a 120 mm valance, in `TM_RB_cafe_canopy`;
- `rb_cafe_poles`, in teak;
- `rb_cafe_tables`: a wood top, a charcoal pedestal and base, each a ring with a hole the pole runs through, so nothing penetrates;
- `rb_cafe_chairs`: woven, in `TM_RB_cafe_rattan`.

The umbrellas stand clear under AI 631's canopies, which start 1.2 m out at 4 m or higher.

The materials pass now lays tiles on any family with `tile_m`: `roof_paving` and `site_paving`.

Audits:
- the building, 91 objects: 0 z-fights, 0 penetrations;
- the site (`audit_collisions.py -- root=RB_SITE`), 5 objects: 0 / 0.

Hidden parts visible from b8: 0 px. New pose: `cafe_closeup`. 632 is also tagged on `b8_calibrated` and `full_front_left`.
Evidence is in `tests/artifacts/screens/buildings/terramar_recessed/rebuild/632_props_sidewalk_cafe_site/`:
- `poses/rebuild_pre632_vs_rebuild/`: 6 sheets;
- the checks, `terramar_rebuild.audit.json` and `site.audit.json`.

The "before" file is `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild_pre632.blend`.

**Street palms, entrance planters and lamps (AI 633, site dressing).** b8 shows two tall pinnate palms with low
planting at their bases rising before the building's front corners, more at the street corners, a large dark leafy plant
in a planter on each side of the entrance, and dark lamp posts. `props_layout.street_dressing()` writes
`plan["props"]["street_dressing"]` (seed 633), and `layer_site_palms.py` builds `RB_SITE/RB_SITE_PALMS`:

| Part | Where | What |
| --- | --- | --- |
| main palms | b8's positions: `CAM_B8`'s rays through their trunk bases (b8 x 278 / 845) meet the sidewalk at (±7.55, −15.26), before the front corners | `proc_plants.py`'s new `street_palm` (an 8–10.5 m leaning trunk, about 25 drooping 2.6–3.3 m fronds), 10.5–12.5 m tall |
| corner palms | the far ends of the sidewalk, near the G/H and B/C corners | the same |
| tree pits | under every palm | raised 1.2 m limestone planters (`TM_RB_paving`, a body and rim walls; soil 40 mm below the rim) with low viburnum round each trunk |
| entrance planters | the spots AI 646 reserved, either side of the entrance | AI 627's tapered pot in charcoal with a procedural cycad (1.7–2.0 m) |
| street lamps | on the kerb side of the H and B chamfers | the installed CC0 `street_lamp_01` (Poly Haven, Josh Dean; `assets/props/street_lamp_01`, with `source.json`), imported read-only once as the prototype `RBP_street_lamp_01` and instanced |

Every crown is capped to stay 0.4 m off the facade, measured 0.4–2.6 m. The palms stand 1.9 m or more from the café
chairs and 2.1 m or more from the lamps.

Two first placements read wrong from `CAM_B8`, where they slid out past the building's silhouette:
- the palms first stood before the chamfers' middles;
- the pits first used a holed rim region, whose cut line meets a turned square's corners.

The fixes were b8's projected positions and a body-plus-rim-walls build.

Audits: the building (91 objects) and the site (7 objects): 0 z-fights, 0 penetrations. Hidden parts visible from b8:
0 px. New pose: `entrance_planters_closeup`. 633 is also tagged on `b8_calibrated`, `full_front_left` and
`cafe_closeup`. Evidence is in
`tests/artifacts/screens/buildings/terramar_recessed/rebuild/633_props_street_palms_and_entrance_planters_site/`:
- `poses/rebuild_pre633_vs_rebuild/`: 7 sheets;
- the checks, `terramar_rebuild.audit.json` and `site.audit.json`.

The "before" file is `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild_pre633.blend`.

**Interior base (AI 634, interior).** b8 shows lit interiors with depth through the glazing. The structure layer already
gives every level its floor plate (`TM_RB_floor`), ceiling (`TM_RB_ceiling`) and the core (stair and two lifts), so
nothing is replaced. `props_layout.interior_base()` writes `plan["interior"]["base"]`, and `layer_interior_base.py` builds
`RB_INTERIOR/RB_INTERIOR_BASE`.

**Partitions** (`rb_interior_partitions`) divide each residential floor (1–5) into seven units behind the bays:

| Wall | From | To |
| --- | --- | --- |
| front centre, left and right | the frames' inner face, behind the pilasters (x ±2.715) | the core's front |
| front left and right | the core's sides | the front chamfer columns (H, B) |
| rear left and right | the core's rear corners | the rear chamfer columns nearer the sides (F, D) |
| rear split | the core's back | an E-bay mullion (x 0.59) |

The units are front centre, front left and right (A's short bays and the chamfers' front halves), left and right (the
chamfers' rear halves and the sides), and rear left and right. Each wall stands from the storey's floor to the slab above,
120 mm thick, its ends cut flush on the faces they meet, so nothing penetrates. Views through the glazing now stop at
walls instead of passing through the building to the sea.

**Downlights** (`rb_interior_downlights`): 44 per floor, 220 in all. They form a 2.4 m grid inside the wall line, kept
0.9 m off the walls and 0.45 m off the partitions and the core, in `TM_RB_ceiling_light` (warm, about 2700 K, emission
400: bright enough to light the rooms at the daylight exposure).

**Finishes:** the new `partition` family is warm plaster (0.66, 0.61, 0.54) on the partitions and the core (no longer grey
concrete through the glass). The ceilings are a warmer plaster (0.74, 0.70, 0.64). The floors keep the warm
interior-floor tone.

**Glass.** Cycles' glass blocks the sun's shadow rays, so the rooms read black. The materials pass's glass family is now
clear Principled glass mixed to a tinted transparent BSDF for shadow rays (Light Path "Is Shadow Ray"). The rooms are
daylit, and the guards cast soft shadows. This applies to every `TM_RB_glass`.

Audit: 93 objects, 0 z-fights, 0 penetrations. Hidden parts visible from b8: 0 px. New pose: `interior_unit_chamfer`. 634 is
also tagged on `b8_calibrated`, `front_centre_bays` and `chamfer_left_balconies`. Evidence is in
`tests/artifacts/screens/buildings/terramar_recessed/rebuild/634_interior_base_floor_plates_ceilings_partitions/`:
- `poses/rebuild_pre634_vs_rebuild/`: 7 sheets;
- the checks and `terramar_rebuild.audit.json`.

The "before" file is `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild_pre634.blend`.

**Ground-floor restaurant (AI 635, interior).** b8 shows a warm-lit restaurant behind the storefronts and the entrance:
wood tables and chairs, banquettes, pendant lights, plants, a bar toward the back and a warm wood ceiling near the
entrance. `props_layout.restaurant_l0()` writes `plan["interior"]["restaurant_l0"]`, and `layer_restaurant_l0.py` builds
`RB_INTERIOR/RB_RESTAURANT_L0` on AI 634's base (the ground floor between its floor plate and ceiling).

| Zone | What stands there |
| --- | --- |
| dining bands | behind every storefront bay, 1.3–5.1 m in from the glass: a row of 2-tops by the glass (one in each gap beside the door, an aisle kept behind it) and a row of 1.2 x 0.8 m 4-tops at a 1.8 m pitch |
| entrance | under the slatted teak ceiling (x ±2.85, y −10.95 to −6.0, underside z 4.16): a 3 x 3 grid of 2- and 4-tops, the front centre spot left free |
| bar | against the core's front, facing the entrance: a teak counter with a stone top, the back cabinet, three shelves with warm LED strips under them, six stools; the core's front is panelled in teak |
| banquettes | along the core's sides and rear, each with tables and chairs before it |

**Placement.** Every set (a table, its chairs and its pendant) is checked against the footprints already placed, and a
set that would overlap is skipped. Placement order is banquettes, entrance, then the bays b8 sees first (B/H, then C/G,
then D/F/E), so the visible zones win any overlap. The skipped sets are recorded in `skipped_sets` (C0, G0, D1, D2, F0,
F1). The seed (635) varies the layout: positions jitter, about 15% of the 4-top tables seat two, and the entrance mixes
2- and 4-tops.

**Counts:** 46 tables, 110 chairs, 3 banquettes, 46 pendants, 15 plants (the game's viburnum in AI 627's charcoal pots,
at the bands' ends and beside the bar).

**Light.**
- A pendant hangs over every table: cord, dark bronze drum shade and a warm diffuser at emission 400. Under the wood
  ceiling each pendant hangs from the nearest slat.
- The ambient light comes from 18 warm area lights (about 2700 K, 20 W per m² of zone, 5.1 kW in all), placed under
  the ceiling over every zone. They are out of camera, glossy and transmission rays, so only their light shows. At
  30 W/m² and a neutral colour the bar wall washed out pale; 20 W/m², a warmer colour and the teak wall read like b8's
  warm interior.
- From the b8 stand the entrance now shows a warm, furnished room with lit pendants and the bar, where it was a grey
  pane. The reference's interior is still brighter.

Audit: 98 objects, 0 z-fights, 0 penetrations. Footprint overlaps: 0, and every piece except the banquettes stands
0.45 m clear of the core. Hidden parts visible from b8: 0 px. New pose: `restaurant_through_entrance`. 635 is also tagged
on `b8_calibrated`, `entrance_sign`, `stone_cladding_closeup` and `cafe_closeup`, and `interior_ground_glass` already
carried it. Evidence is in `tests/artifacts/screens/buildings/terramar_recessed/rebuild/635_interior_ground_floor_restaurant/`:
- `poses/rebuild_pre635_vs_rebuild/`: 6 sheets;
- the checks and `terramar_rebuild.audit.json`.

The "before" file is `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild_pre635.blend`.

**Upper-podium dining room (AI 636, interior).** b8 shows a dining room behind the upper podium's glazing: tables,
chairs, plants and pendant lights. The terrace over the entrance continues it outside. `props_layout.dining_l1()` writes
`plan["interior"]["dining_l1"]`, and `layer_dining_l1.py` builds `RB_INTERIOR/RB_DINING_L1` on the upper storey
(floor 5.79, ceiling 9.76).

**Shared room logic.** AI 635's room logic is now a shared `_Room` helper in `props_layout.py`, used by both floors:
priority placement, table sets, banquettes, dining bands, table grids, plants and the fill rectangles. The ground floor's
layout is unchanged; its plan only gains its `fills` list. `layer_restaurant_l0.py` likewise exposes `back_pieces`,
`furniture`, `fill_lights`, `potted_plants` and `report` for `layer_dining_l1.py`.

| Zone | What stands there |
| --- | --- |
| dining bands | behind every upper bay, 1.9–5.7 m in from the outline (the upper glazing stands 0.9 m in): a row of 2-tops at a 1.6 m pitch and a row of 1.2 x 0.8 m 4-tops at 1.8 m; no doors, so the rows are even |
| loggia room | behind the front centre's loggia glazing (x ±2.8, y −9.8 to −1.2): a 4 x 3 grid of 2- and 4-tops at a 2.35 m row pitch |
| sideboard | on the core's front: the teak-panelled wall, a cabinet and three shelves with LED strips (AI 635's back bar without counter or stools) |
| banquettes | along the core's sides and rear, as on the ground floor |
| entrance terrace | two 2-tops on the terrace paving (z 5.82), between the planters (AI 628) and the loggia glazing, chairs either side; no pendants outside |

**Placement order:** banquettes, the bays b8 sees first, the loggia room, then the terrace. Skipped sets: C0, G0, D1, D2,
F0, F1, and one loggia set by the B0 band. Plants now yield to furniture too: a pot that would stand in a placed
footprint is dropped (three on this floor, none on the ground floor). The seed is 636.

**Counts:** 51 tables, 124 chairs, 3 banquettes, 49 pendants, 14 plants.

**Light.**
- The pendants match AI 635's.
- 18 warm fill lights face down at 20 W/m².
- b8 looks up through the loggia and sees mostly the room's ceiling, which the downward fill leaves dark. A second set of
  18 lights faces up from 0.9 m under the ceiling at 12 W/m² as a warm ceiling wash (`up_w_per_m2` in the fill config;
  the ground floor has none). All of them are out of camera, glossy and transmission rays. Total: 8.1 kW.
- From the b8 stand the loggia shows the pendants' glow, a warmer ceiling and the lit shelves. The reference's room is
  still brighter.

Audit: 102 objects, 0 z-fights, 0 penetrations (the first pass caught three pots inside furniture, hence the plant
check). Footprint overlaps: 0. Hidden parts visible from b8: 0 px. New pose: `loggia_dining_closeup`. 636 is also
tagged on `b8_calibrated` and `entrance_terrace_planters`, and `entrance_sign` and `interior_podium_glass` already
carried it. Evidence is in `tests/artifacts/screens/buildings/terramar_recessed/rebuild/636_interior_upper_podium_dining/`:
- `poses/rebuild_pre636_vs_rebuild/`: 5 sheets;
- the checks and `terramar_rebuild.audit.json`.

The "before" file is `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild_pre636.blend`.

**Residential curtains and furniture (AI 637, interior).** In b8 the residential sliders show white sheer curtains,
partly drawn, with hints of furniture inside. `props_layout.residential()` writes `plan["interior"]["residential"]`,
and `layer_residential.py` builds `RB_INTERIOR/RB_RESIDENTIAL` on floors 1–5.

**Curtains** (`rb_res_curtains_f<n>`, `rb_res_tracks`):
- Every bay's glazed span gets a ceiling track at 0.2 m inside the wall line. The span is trimmed 0.12 m at corners
  and 0.03 m elsewhere, and split where a partition meets the glazing (the E-bay mullion), with 0.03 m clearance.
- Each span's panels are drawn to a seeded style:

  | Style | Weight | Panels |
  | --- | --- | --- |
  | pair | 0.4 | one from each end, covering 15–45% of the span each |
  | start / end | 0.2 each | one panel covering 40–85% from one side |
  | open | 0.2 | both stacked at the ends (10–18% each) |

  Narrow lights (A0, A2) take one panel. A floor whose style sequence repeats an earlier floor is re-rolled, so no two
  floors share a pattern.
- Each panel is a folded sheet hung from 4 cm under the track to 1.5 cm over the floor. The folds come every ~0.1 m,
  deeper and tighter when gathered (2.5–5 cm), 15% deeper at the hem, with a seeded phase.
- The fabric, `TM_RB_sheer`, is 80% cloth and 20% clear. The cloth is mostly diffuse with a quarter translucent,
  because from outside the sheers are lit from the window side.

The counts are 131 panels on 85 tracks.

**Furniture** (`rb_res_furniture_f<n>`, `rb_res_lamps`):
- Every bay of 3 m and more gets a seeded set near its window, each with a floor lamp:

  | Set | Weight | Pieces |
  | --- | --- | --- |
  | lounge | 0.45 | sofa facing the window, coffee table |
  | dining | 0.3 | a 1.4 m table, four chairs |
  | reading | 0.25 | two armchairs, a side table |

- Each set gets up to 12 seeded tries (layout and centre) until it stays 0.35 m clear of the bay ends and clear of the
  partitions and of the core (by 0.45 m).
- 15 bay-floors stay empty. On D1 and F1 the rear partitions cross the band diagonally, leaving only a sliver; the
  others are side or rear bays where no try fitted. Every unit still has a set.
- The lamps have a charcoal base and pole and a linen drum shade glowing warm at strength 10. At 30 the shades read
  as white squares.

The counts are 11 sofas, 11 coffee tables, 44 armchairs, 22 side tables, 22 dining tables, 88 chairs and 55 lamps.

From b8 the curtains add soft pale verticals behind the shaded sliders. The reference's sheers are whiter. The
close-up shows them clearly, drawn to varied positions.

Audit: 114 objects, 0 z-fights, 0 penetrations (the curtains are open sheets, so their non-manifold warnings are
expected). Hidden parts visible from b8: 0 px. New pose: `residential_curtains_closeup` (from first-floor height
across the street, above the palms). 637 is also tagged on `b8_calibrated`, and `chamfer_left_balconies`,
`front_centre_bays`, `side_right_faceon` and `interior_residential_glass` already carried it. Evidence is in
`tests/artifacts/screens/buildings/terramar_recessed/rebuild/637_interior_residential_curtains_and_furniture/`:
- `poses/rebuild_pre637_vs_rebuild/`: 6 sheets;
- the checks and `terramar_rebuild.audit.json`.

The "before" file is `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild_pre637.blend`.

**Penthouse interior (AI 638, interior).** The references barely show the penthouse's interior; it only has to read
plausibly through the glazing. `props_layout.penthouse()` writes `plan["interior"]["penthouse"]`, and
`layer_penthouse.py` builds `RB_INTERIOR/RB_PENTHOUSE`. Every object is tagged `rb_hide_from_b8`, like the penthouse
itself.

**Space.** The core rises to the penthouse roof slab (z 30.45), so inside the walls there is only a ring around it:
- a 1.55 m strip at the front, behind the front slider and door;
- 1.15 m strips at the sides;
- nothing behind (the rear windows face the core 0.25 m away).

The glazed annex on the −X side (inside 3.4 x 5.3 m, through the left door) is the one real room, so the kitchen and
its island go there.

| Place | What stands there |
| --- | --- |
| annex, back | a teak counter run (0.6 m, stone top) on the penthouse wall, a teak shelf over it with an LED strip; an island (1.8 x 0.9 m, the stone top overhanging the stool side) with three stools and three pendants hung from louvre blades |
| annex, front | a lounge corner behind the front glass: sofa, coffee table, armchair, a floor lamp by the sofa |
| front strip | a sofa against the core facing the front slider, a side table, a floor lamp |
| right strip | an armchair at the right window, a side table |
| corners | four potted plants, clear of the door paths |

**Light:**
- 12 downlights in the penthouse ceiling: a row along the front strip and three down each side;
- the island's pendants, hung at louvre-blade centres so their cords meet a blade;
- the two floor lamps;
- 4 warm fill lights (15 W/m², 0.7 kW in all) under the penthouse ceiling and the louvres, out of camera and
  reflection rays.

**Checks.** Every footprint is checked against the others, the walls, the core, the annex posts and the paths from the
front and left doors: 0 problems. Audit: 120 objects, 0 z-fights, 0 penetrations. Hidden parts visible from b8: 0 px.
New poses:
- `penthouse_annex_kitchen`, into the annex from the terrace on its left;
- `penthouse_front_slider`, through the front slider.

638 is also tagged on `b8_calibrated` and `roof_terrace_aerial`, and `penthouse_closeup` already carried it. Evidence
is in `tests/artifacts/screens/buildings/terramar_recessed/rebuild/638_interior_penthouse/`:
- `poses/rebuild_pre638_vs_rebuild/`: 5 sheets;
- the checks and `terramar_rebuild.audit.json`.

The "before" file is `tests/artifacts/blender/terramar_recessed/rebuild/terramar_rebuild_pre638.blend`.

**Final UHD captures (2026-10-14).** Three 3840 x 2160 completion captures of the finished rebuild, rendered from
`terramar_rebuild.blend` by `render_poses.py` (Cycles, 256 samples, denoised). The scene's `INSPECTION_RIG` lights
them: the calibrated HDRI `clear-afternoon-55.hdr` is both the visible sky and the environment and reflection source,
with its matched sun (az 45 / el 55) and the ground plane. The three poses are in `poses.json` (group `final`):

| Pose | View |
| --- | --- |
| `final_front` | straight-on front from 62 m, a level camera at mid height (no keystone) |
| `final_three_quarter` | three-quarter view from the sunlit front right |
| `final_low_closeup` | low angle from the sidewalk at the entrance, looking up the front to the top |

They live in `tests/artifacts/screens/buildings/terramar_recessed/rebuild/final_4k/` with labelled comparison sheets
against the references, whose originals are in `references/`:
- `reference_vs_rebuild_b8_camera.png`;
- `reference_vs_final_front.png`;
- `references_used.png`;
- `final_contact_sheet.png`.

```
blender -b tests/artifacts/blender/terramar_recessed/rebuild/terramar_composition.blend -P src/graphics/content3d/buildings/authoring/terramar_recessed/render_poses.py -- groups=final samples=256 out=tests/artifacts/screens/buildings/terramar_recessed/rebuild/final_4k
```

**Detailed palms (2026-10-14).** The street palms (`street_palm`) and the roof palms (`palm`) are now built by
`palm_tree.py` instead of the folded-strip palms of AI 629/633 (cycads and spiky rosettes are unchanged). One mesh per
tree, built into one bmesh, not through `rb_lib.finish`:
- **Trunk** (`palm_trunk.py`): the leaf-scar rings and the boot zone.
- **Root base** (`palm_base.py`, street palms only): welded to the trunk's ring 0. A roof palm stands 5 cm from its trough's inner rim, so its trunk (r 0.044–0.048) is capped on the soil instead.
- **Crown** (`palm_frond.py` fronds on the boot zone):
  - street: 26–30 live fronds on a golden-angle spiral, from 1–2 near-upright spears through arching mature fronds to old ones drooping below level (the older ones shorter), plus 1–2 dead fronds hanging under the crown;
  - roof: a compact fan of 20–24 fronds with wider, denser leaflets;
  - both: seeded lengths, angles, jitter and a slight asymmetry, the frond bases inside the upper boots.

Changes measured on b8 through `CAM_B8`:
- **Sizes.** b8's two front palms stand 8.9 and 10.4 m above the pit soil, with crowns 4.0 and 4.6 m across (radius ÷ height 0.21–0.23) and trunks about 0.27 m across. The old targets (10.5–12.5 m tall, radius 2.6–3.1 m) stood taller than b8. `props_layout.py` now has street heights (9.0, 10.8) and radius (2.0, 2.45), with `b8_heights` pinning the two front palms; roof palm heights are (1.8, 2.3).
- **Fit.** The old fit squashed the roof palm to 0.55 in xy, which made it read like an agave. `layer_roof_planters.fit_scales` now keeps a prototype that carries `rb_fit_aniso` (the detailed palms, 10 %) within ±10 % xy ÷ z, never past either target. Achieved: street 0.98–1.10, roof 0.90–1.10. The `row_3` island palm gets a crown 11 % narrower than planned.
- **Leaflet tone** (`palm_frond.py`, a scoped fix): a darker, less blue low end, translucency 0.22 → 0.14 and an underside value of 1.08 (was 1.18). The crowns were pale and flat against the stone. Foliage pixels in the `CAM_B8` frame now average (100, 86, 53) and (92, 83, 49), against b8's (96, 83, 50) and (97, 87, 50).
- **Budget.** Street prototypes are 76.8k–79.2k triangles (×3), roof prototypes 16.1k–17.8k (×3). `terramar_site.blend` grew from 74.0 to 78.7 MB and `terramar_props.blend` from 137.9 to 139.0 MB. The ten evidence poses render in 152.8 s instead of 148.7 s (+3 %).

Checks:
- the audit: 120 objects, 0 z-fights, 0 penetrations; the site: 7 objects, 0 / 0;
- hidden parts visible from b8: 0 px;
- roof foliage outside the guard: 0 (closest 3.2 cm);
- a fresh `target=all save=0` build runs clean.

`audit_collisions.py` skips collection instances, so the palm instances were also checked against every mesh (`palm_detail/palm_clearance.json`). Nothing overlaps above the foot: the feet sit on the soil, and the street roots dive into it. One limit remains in the AI 629 layout: the corner-cluster roof plants (cycads as well as palms) stand 1–14 mm from trough walls or end caps, so their trunks cross the 4 cm rim there.

New poses: `street_palm_closeup` and `roof_palm_closeup`. Evidence is in
`tests/artifacts/screens/buildings/terramar_recessed/rebuild/palm_detail/`:
- `poses/pre_palms_vs_rebuild/`: 10 sheets;
- `tree/`: the composer's test renders and the b8 crops;
- `frond/`, `trunk/`, `base/`: the part modules' renders;
- the checks, both audits and `palm_clearance.json`.

**Detailed furniture (2026-10-14).** Every piece of furniture is now real furniture, no longer prisms: the roof terrace,
the restaurant, the upper dining room, the residential units, the penthouse and the sidewalk café. `furniture_chairs.py`
and `furniture_tables_seating.py` build the pieces; `layer_roof_furniture.furnish()` places them for every layer.
- **Placement.** One object per item. Its mesh is built at the origin in the item's frame and placed by the object's
  location and turn, so the plan's footprint checks stay valid.
- **Shared meshes.** Items with the same geometry (kind, size, variant, cushion, heights, frame) share one mesh as linked
  duplicates. Seeded upholstery (sofa, armchair and lounger cushions) keeps one mesh per item, seeded by its place.
  - Why share: one object per group would have stored all 0.90 M triangles. One object per item also lets the audit
    pair pieces with each other, which it never could inside a merged object.
  - They stay MESH objects (not collection instances), so the audit checks every one.
  - `clear()` removes each shared mesh once. `rb_lib.clear_collection` would touch a mesh again after removing it.
- **No `rb_lib.finish`.** It would dissolve the rounded sections and overwrite the grain and weave UVs.
- **Materials, one source.** `furniture_materials.py` defines the teak, the powder-coated metal and the three fabrics.
  The chair pads and stool cushions now use the sofas' `TM_RB_furn_fabric_<colour>`, so a chair and a sofa in one room
  match. `TM_RB_cushion_*` and `TM_RB_cafe_rattan` are no longer used. The box-built pieces keep the plain `TM_RB_teak` /
  `TM_RB_charcoal_metal`, defined there too. Every node material shifts its UVs by the object's random value, so linked
  duplicates do not repeat their grain.
- **Choices per room:**

  | Room | Chairs | Other |
  | --- | --- | --- |
  | restaurant | slat-back teak dining chairs | six `bar_stool`s at 0.76 m replace the bar's stool discs |
  | dining room | caned teak dining chairs | |
  | residential | each set's chairs match, seeded by the set | |
  | roof | slat-back teak dining chairs | sofa and armchairs on open teak frames |
  | penthouse | | three stools at 0.66 m at the island |
  | café | rattan armchairs; one set in four seeded to side chairs; the chairs at one table match | the café table with the pole's hole |

- **Layout:** the roof loungers now face `"out"`. The detailed lounger's raised back is at −v, so its feet still point
  towards the view. The café chairs take b8's 0.45 / 0.90 m seat / back.

| | Before | After |
| --- | --- | --- |
| furniture | prisms in 13 merged objects (one per group or floor) | 602 objects, 118 meshes, 0.90 M triangles placed, 0.28 M stored |
| `terramar_interiors.blend` | 39.8 MB | 42.0 MB |
| `terramar_props.blend` | 139.0 MB | 139.1 MB |
| `terramar_site.blend` | 78.7 MB | 78.7 MB |
| 13 evidence poses | 273 s | 281 s (+3 %) |
| audit | 120 objects, 1188 candidate pairs | 680 objects, 6319 candidate pairs, 68 s with loading |

Checks:
- the audit: 0 z-fights, 0 penetrations; the site: 36 objects, 0 / 0;
- hidden parts visible from b8: 0 px;
- a fresh `target=all save=0` build runs clean;
- a second in-place rebuild of every furniture layer leaves no orphan or duplicated meshes.

New pose: `cafe_chairs_closeup`. Evidence is in `tests/artifacts/screens/buildings/terramar_recessed/rebuild/furniture_detail/`:
- `poses/pre_furniture_vs_rebuild/`: 13 sheets;
- `chairs/` and `tables_seating/`: the modules' renders;
- `module_retest/`: the test entries after the materials merge;
- the checks and `site.audit.json`.

**Detailed café umbrellas (2026-10-14).** The user asked for detailed covers: "not squared", "several parts", "made of
fabric". b8's umbrellas are octagonal market umbrellas: cream canvas in 8 panels, a raised vent cap with a finial, a short
straight valance, a natural-wood pole, wood ribs and struts underneath. `cafe_umbrella.py` builds one, all of it real
geometry; `layer_site_cafe.py` places one per café set as its own object, `rb_cafe_umbrella_<n>`. They replace AI 632's
square pyramid shells (`rb_cafe_canopies`) and plain poles (`rb_cafe_poles`).
- **Canvas:** the 8 panels as one smooth sheet. Each panel sags between its ribs (seeded 2.2-3.4 % of the chord), with a
  soft seam ridge over every rib, a hem scalloped between the rib tips and turned under, and the vent opening turned
  under too. The octagon's flats face the run and the facade, 25 mm inside the old square (largest reach 1.078 of 1.1).
- **Vent cap:** a small 8-panel canopy lifted 75 mm over the vent, with short flaps, rods underneath and a turned finial.
- **Valance:** 8 flaps hanging from the hem's fold, a gap at each rib tip. Each flap is seeded: lean, belly, flutter, a
  sagging and turned bottom edge.
- **Frame:** 8 wood ribs under the seams with metal ferrules; 8 struts from lugs on the runner to brackets under the ribs,
  pinned at both ends; the hub. The pole has two sections joined by a metal sleeve, the runner above its locking pin, a
  pulley under the hub, and the halyard down to the runner and to a cleat. The lower section (r 25 mm) runs through the
  café table's 35 mm hole to the sidewalk, as before.
- **Materials** (procedural, shifted per object):
  - `TM_RB_cafe_canopy`: a fine woven canvas with slubs and sheen, 16 % translucent, so the sunlit canopy glows a little
    from below and the doubled hems and seam bands read darker;
  - `TM_RB_cafe_wood`: varnished natural hardwood, lighter than the teak, as b8's poles;
  - `TM_RB_cafe_metal` (satin stainless) and `TM_RB_cafe_rope`.
- **Layout** (`props_layout.CAFE["umbrella"]`, the umbrella config only):
  - apex 2.75 -> 2.66: b8's canopies rise 0.27-0.28 of their half-width to the vent cap; the square shells' 2.75 read
    steep;
  - valance 0.12 -> 0.06: b8 shows only a thin rim;
  - `shell` dropped. The rim stays at 2.25 above the sidewalk.

Clearances, measured in the composition against every mesh and instance within 1.5 m (`umbrella_clearance.json`):
- the closest neighbouring umbrellas (2.28 m apart): 121 mm (the squares kept 77 mm);
- chairs 0.36 m, the palms 1.20 m, the facade's lanterns and piers 1.42 m, the awnings 1.49 m, the lamps over 1.5 m;
- the table: the pole keeps 9 mm inside the hole, no triangle crossing;
- the sidewalk: the pole's foot stands on it.

| | Before | After |
| --- | --- | --- |
| umbrellas | 2 merged objects, 800 triangles | 8 objects, 113 248 triangles (14 156 each) |
| `terramar_site.blend` | 78.7 MB | 80.4 MB |
| 8 evidence poses | 163.1 s | 164.7 s (+1 %) |

Checks:
- the audit: 680 objects, 0 z-fights, 0 penetrations; the site: 42 objects, 0 / 0;
- hidden parts visible from b8: 0 px;
- a fresh `target=all save=0` build runs clean.

New poses: `umbrella_closeup` and `umbrella_underside`. Evidence is in
`tests/artifacts/screens/buildings/terramar_recessed/rebuild/umbrella_detail/`:
- `poses/pre_umbrellas_vs_rebuild/`: 8 sheets;
- `module/`: the module's test renders and `sheet_*_v3.png` beside b8 (v1: before the flatter canopy and the shorter
  valance; v2: before the straighter ribs);
- `ref/`: the b8 crops; `b8_cafe_strip_b8_pre_post.png`: b8, before and after in `CAM_B8`;
- the checks, both audits and `umbrella_clearance.json`.

### Roof and penthouse adjustments (2026-10-15)

The user: "no dinner table in the roof top. improve the quality of the machines on top of penthouse. that sofa in front
of the glass in the penthouse doesn't make sense. think logically about the structures inside ... is the grass area too
cluttered? should we increase the room area (just a bit)?"

- **Terrace (props).** The dining set is gone. Two zones remain: the lounge on the B chamfer, and two sun loungers with a
  side table mirrored on the H chamfer (feet towards the view). The front-centre armchairs and low table are gone, so
  the middle is open paving. Three planter islands instead of six, near the edges: `annex_front` (before the annex,
  behind the loungers), `lounge_back` (behind the lounge, by the penthouse's right corner) and `side_right` (the right
  side strip). The perimeter ring and its clearance checks are unchanged: 0 perimeter plants past the guard (closest
  3.2 cm), furniture at least 1.25 m inside the guard, 0 footprint problems. `layer_roof_planters.py` now tells the
  island plants by the plan's island ids.
- **Penthouse enlarged.** The front wall moved 1.2 m toward the terrace (`PENTHOUSE` y −2.2…6.5, 10 x 8.7 m). The
  side door and window, the annex (−1.2…4.3), the plant zone and the units moved with it. Solar rows: 5 rows, 37
  modules (was 28). The sightline still holds: front wall 3.86 m against 4.53 m, units 4.6 m against 4.82 m, solar
  3.86 m against 4.84 m, annex 3.05 m against 5.05 m. `check_layers.py`: 0 px.
- **The penthouse's space.** The core (stair and two lifts, x ±3.6, y 0.8…6.0) rises through the penthouse, so the
  penthouse is the roof-access headhouse:
  - the 2.75 m front strip is its **lobby**. The stair door (teak leaf, black frame) and the two lift doors (brushed
    steel frames, centre-opening leaves, a call panel between them) are on the core's front face
    (`rb_penthouse_core_doors`, surface pieces; the shafts are not modelled);
  - the lobby leads to the front door and the slider onto the terrace, and through the left door into the annex. It is
    kept clear: a slim teak console (1.3 x 0.38 m) against the front wall between the door and the slider, and plants
    in the front corners. The sofa, side tables, floor lamp and the right strip's armchair are gone;
  - the glazed annex is still the amenity room (kitchen run and island, lounge corner). Its layout is now measured from
    the annex's front.
- **Rooftop plant (`roof_units.py`).** It replaces the three grey boxes:
  - two top-discharge condensing units along the front parapet (two fans and one fan; light grey powder coat in two
    tones);
  - a side-discharge condenser behind them, blowing out over the low parapet;
  - every unit has finned coil faces behind a wire guard, a seamed service side with screws, a handle and a nameplate,
    and stands on galvanised rails on rubber pads;
  - the fans have 3–5 pitched, swept blades on a hub and motor bracket, under domed ring-and-spoke guards;
  - the insulated lines leave each unit's pipe cover and drop into a covered galvanised tray, which runs to a roof
    hood;
  - 24.5 k triangles, one object (`rb_roof_units`), all under the sightline. New pose: `penthouse_roof_units`.

Checks:
- the audit: 697 objects, 0 z-fights, 0 penetrations; the site: 42 objects, 0 / 0;
- hidden parts visible from b8: 0 px;
- a fresh `target=all save=0` build runs clean.

Evidence is in `tests/artifacts/screens/buildings/terramar_recessed/rebuild/roof_adjust/`:
- `poses/pre_roofadj_vs_rebuild/`: 7 sheets;
- `units_test/`: the module's test renders;
- the checks and both audits.

### Stone returns and connection joints (2026-10-14)

The user, on the entrance recess where the stone pier meets the orange wood lining, and on a tree pit's foot: "i'm
missing some joints, the connections are too flat; where it is orange for example, the stone has no depth; there should
be a small stone on the side so it is 3d and not a wallpaper". Where the limestone stopped, the next material started on
the same edge, so nothing showed the stone's thickness; flush stone pieces met in seams without a joint. The values live
in `plan["returns"]` (`make_plan.RETURNS`):

| Value | | Used for |
| --- | --- | --- |
| `return` | 0.10 m | the reveal stone of the entrance and loggia openings, on the jambs and under the heads (b8 shows stone reveals well into the portal before the wood; 40 mm read as a hairline from the street) |
| `fascia_return` | 0.04 m | under the slab fascias: the cladding's own thickness |
| `arris` | 4 mm | the eased outside corner of every return |
| `gap`, `gap_depth` | 10 mm, 18 mm | the shadow gap between stone and wood, its faces in `TM_RB_stone_joint` |

The junctions, and what each got:

| Junction | Was | Now | Where |
| --- | --- | --- | --- |
| entrance jambs -> wood lining | the stone face stopped at the corner, the lining's edge flush with it | the jamb's front corner wraps 0.10 m into the opening, flush with the lining, arris eased (`layer_structure.return_loop`); a shadow gap floored by a dark backer strip; the lining now starts 0.11 m back (`layer_podium.lining`) | structure, podium |
| sign band underside -> wood soffit | the wood met the stone face at the arris | a 0.10 m stone face slab, front edges eased, its underside the head's return, stopping 4 mm short of each jamb return (a dark joint between their arrises); behind it the body with the gap recessed into its underside, then the wood soffit, flush (`head`) | podium |
| loggia jambs and lintel -> wood linings and soffit | as the entrance | as the entrance | podium |
| front centre wood reveal panels -> pilaster sides (inside corner) | the panel butted the stone | the panel stops 10 mm short, the gap floored 18 mm behind its face | envelope |
| balcony and roof slab fascias -> wood soffits | the soffit's edge was the fascia's bottom arris | a 40 mm stone strip under the fascia, arris eased, a 10 x 18 mm gap, then the soffit. The slab is two stacked spans welded into one solid (`stacked_slab`), so each fascia stays one face top to bottom; the strip stays one piece per fascia face (`finish_kept`) | structure |
| flush stone pieces: pier / lintel, piers, lintels and jambs / slab fascia (5.38, 5.79, 9.76), loggia jamb / corner pier, penthouse walls / head pieces | a coplanar seam: no groove, only a jump in the map | a seam joint centred on the seam over the stretch the two faces share | materials |
| the site's limestone tree pits -> sidewalk | no joint at the foot or the coping | a joint at the foot of every side, seams at the coping and its corners | materials (`joints.objects`) |
| storefront and upper-recess reveals, pilaster and column edges at the frames, penthouse openings | already stone round the corner (0.25-0.90 m reveals) | unchanged; their flush seams now carry joints | - |

The materials pass (`layer_materials.py`):
- **Seam joints** (`joints.seams`): a pre-pass pairs coplanar stone faces of different solids or objects that face the
  same way and share a stretch of an edge (at least `seam_min_length`). Each gets a joint centred on the seam over that
  stretch. Stretches along one line merge; where a stretch ends inside a face, the groove ramps out over the bevel length.
- **Carry:** a vertical joint carries on over the faces it meets square: one face past its own (a lintel's soffit, as
  before), further only across narrow faces (the eased arris, then the return), up to `joints.carry_hops` (2).
- **Objects** (`joints.objects`): named objects jointed in whichever part holds them (`rb_site_tree_pits` on
  `TM_RB_paving`); `base` adds the foot joint. `joint_layout.json` records now carry their part.
- **Float32:** the bisect now snaps vertices within 10 µm to the plane. A neighbour's cut along a shared edge reads ~1e-6
  m off the plane on the diagonal runs, and the old 1e-7 left slivers.
- `joint_slot()` gives the layers `TM_RB_stone_joint` for the gaps they model.

A layer rebuilt alone cuts only its own half of a seam with another layer's piece; `target=building` cuts both. The
building now has 22 jointed objects, 1367 vertical joints (the carried ones counted per face), 1290 seam and foot joint
records, 1408 panels; the self-checks (degenerate, non-planar, non-manifold) are all 0. The site's tree pits get 137.

Checks:
- the audit: 710 objects, 0 z-fights, 0 penetrations; the site: 42 objects, 0 / 0;
- hidden parts visible from b8: 0 px;
- a fresh `target=all save=0` build runs clean.

New poses: `returns_entrance_jamb`, `returns_loggia_corner`, `returns_residential_reveal`, `returns_slab_soffit`,
`returns_tree_pit_base`. Evidence is in `tests/artifacts/screens/buildings/terramar_recessed/rebuild/stone_returns/`:
- `poses/pre_returns_vs_rebuild/`: [before | after] for 12 poses (b8 first for `b8_calibrated`); the "before" renders
  are tag `pre_returns`;
- `zoom/`: [before | after] crops of the corners, the storefront seams, the entrance head and the penthouse walls;
- `site_pit/`: the tree pit before and after, both rendered from the site part, and `zoom_returns_tree_pit_base.png`;
- the checks (`check_sheet.png`, `checks.json`) and both audits.

The site part was re-dressed with `build.py -- target=site layers=materials`, which re-runs its wear pass.

### Wear and weathering (2026-10-14)

The user asked for wear and weathering "as a separate module that can be enabled / disabled. non-destructive". The
module lives in `rebuild/wear/` (nine features in `rebuild/wear/features/`), with the finishing pass
`rebuild/layer_wear.py` and the switch `rebuild/wear.py`. It follows the user's standing rules for wear (learnt on the
Bradbury, whose wear layer it copies the ideas of, never the code):
- every mark has a physical reason and a place;
- no noise, no mottle;
- nothing repeats: per-instance variation comes from seeds on stable ids;
- subtle: b8 shows a new, almost pristine building, so the wear reads as a few years of weather, not neglect.

The composition is saved with the wear ON, every feature at its default strength (1.0).

**Turning it off, on or to debug.** The switch lives in the composition's scene, so one switch drives every part.

From the command line (`save=1` keeps the setting in the composition; without it the setting lasts the session, e.g.
chained with a render):

```
C=tests/artifacts/blender/terramar_recessed/rebuild/terramar_composition.blend
W=src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/wear.py
blender -b $C --python $W -- wear=off save=1                                  # off: exactly the unworn building
blender -b $C --python $W -- wear=on save=1                                   # on: every feature at its default
blender -b $C --python $W -- wear=on strengths=runoff_streaks:0,glass_film:0.5 save=1   # one off, one at half
blender -b $C --python $W -- wear=on strengths=all:0,cavity_soot:1            # one feature alone
blender -b $C --python $W -- wear=clear save=1                                # remove the properties (absent = off)
blender -b $C --python $W -- list=1                                           # print the switch, change nothing
# debug: every worn surface clay, each feature's mask in its colour; signal=<name> shows a signal as a ramp
blender -b $C --python $W --python src/graphics/content3d/buildings/authoring/terramar_recessed/render_poses.py -- wear=debug poses=wear_base_front tag=wear_debug
blender -b $C --python $W --python src/graphics/content3d/buildings/authoring/terramar_recessed/render_poses.py -- wear=debug signal=sky poses=wear_base_front tag=wear_sky
```

Every `wear.py` run sets every feature: the strengths it is given, the others their default. A run therefore never
inherits a value an earlier run left in the scene.

In the Blender UI, open the composition:
- **Scene Properties > Custom Properties:** `tm_wear` (0 off, 1 on, 2 debug) and `tm_wear_<feature>` (the strength;
  1.0 is the calibrated look, 0 turns the feature off), plus `tm_wear_signal` for the debug ramps. A render (F12)
  picks the values up; a rendered viewport may refresh only on its next update (toggle its shading).
- **Outliner, View Layer:** the collection `TM_WEAR` under `TERRAMAR_REBUILD` holds the overlay decals (the runoff
  streaks). Its checkbox ("Exclude from View Layer") must follow the switch by hand: excluded while off; inside it
  `TM_WEAR_runoff_streaks` excluded while that strength is 0, `TM_WEAR_DEBUG` included in debug only. `wear.py` sets
  these itself. A decal left included while off still renders clear, because its material reads the switch.

To take the wear out of the part files altogether: `build.py -- target=<building|props|site> layers=wear wear=0`. The
parts then come out exactly as before the module.

**The switch.**

| Property | Value |
| --- | --- |
| `tm_wear` | 0 off, 1 on, 2 debug |
| `tm_wear_<feature>` | the feature's strength: 1.0 is its calibrated look, 0 turns it off |
| `tm_wear_signal` | debug only: k > 0 shows the k-th signal as a blue-green-yellow ramp |

- The shaders read the properties with Attribute nodes of type View Layer. A property that is absent reads 0, so a
  scene that sets nothing renders exactly as before the module.
- The linked materials read the composition's scene, so one switch drives every part.
- `compose.py` sets the composition ON, every feature at its default strength. The env `TM_WEAR_MODE=off|on|debug`
  overrides that.

**The layers.** The module has three layers. None of them changes a layer's geometry or a material's own nodes: they
splice in.
1. **Shader.** One node group, `TM_WEAR_layer`, sits in each worn material between the material's own outputs and its
   Principled BSDF.
   - It routes only the sockets the features acting on that class write (Base Color and Roughness almost everywhere;
     Metallic on the canvas; Specular on the glass). The glass also routes Transmission, which only the debug view
     changes (`nodes.DEBUG_ROUTES`), so a worn pane shows as clay.
   - It chains the feature groups `TM_WEAR_F_<name>` in ORDER.
   - It mixes the result back by `active = (tm_wear > 0.5) * tm_wear_exposed * (1 - indoor)`, where `indoor` (a
     signal, below) is 1 on the face corners that look into a room; the glass is exempt, since its film shows from
     both sides.
   - Inside each feature group, every output is mixed by `Strength > 0`. A mix by 0 returns its first input exactly,
     so off is the old shading bit for bit, and so is a feature at strength 0 (Cycles then also folds away that
     feature's nodes, its occlusion included).
   - The kit limestone's Principled sits inside `TM_RB_limestone`. A material using it gets a worn copy of that group per
     class (`TM_WEAR~TM_RB_limestone~stone`, `~paving`) with the layer spliced in inside.
2. **Signals.** The pass writes FLOAT attributes `tm_wear_<signal>` on the exterior meshes: extra data, the geometry is
   untouched. It writes them only on the meshes carrying a class some feature acts on; `signals=all` writes them on
   every exterior mesh, for the debug view.

   | Signal | Domain | Meaning |
   | --- | --- | --- |
   | `ground` | point | height above the walking surface the point stands over |
   | `level` | point | the z of that walking surface: below 1.0 at street level (the street, the sidewalk, the ground slab in the bays, the pits' and pots' soil); 5.82 the entrance top; 10.20 the podium terrace; the balconies; 27.30 the roof |
   | `sky` | face corner | the upward sky exposure: the share of 64 cosine-weighted directions over the upper hemisphere that leave the ray scene (an open top reads about 1, an open wall about 0.5) |
   | `panel` | face | a seeded value in [0, 1) per stone panel (faces bounded by the joint floors), or per loose island |
   | `indoor` | face corner | 1 where the corner looks into a room: no direction in front of the face leaves the ray scene without the guards (the glazing counts as a wall, a guard's glass, free at its top, does not). The layer's own gate, written on the building part's worn meshes that have such corners |

   - The walking surfaces come from the plan, so every part sees the same ones.
   - `sky` and `indoor` are sampled per face corner, from a point 5 cm in from the corner along its bisector and 2 cm
     out along the face's true normal. A direction behind the face counts as blocked by it. A back face nearer than
     12 cm means the point started inside a neighbour (the paving over a wall's foot), and the ray goes on past it.
   - The building's exterior objects reach indoors in places: the wood reveals straddle the glazing line, and the
     frames, the podium piers, the columns and the penthouse walls have room sides. `indoor` keeps those faces clean
     (114,155 corners); a face crossing the glazing line fades across it.
   - The ray scene is the part's own fixed geometry plus plan proxies of the other parts: the building's massing, the
     storefront canopies, the tree pits and the entrance pots. The movable café sets and roof furniture are left out.
   - Object flags: `tm_wear_exposed = 1` on every exterior object (the building's `RB_INTERIOR` stays unflagged, so a
     material shared with an interior object stays clean indoors), and `tm_wear_seed`, a seeded value per object.
   - The features add their own attributes: `foot`, `foot_h`, `splash`, `edge`, `edge_h`, `edge_rain`, `soot_shelter`,
     `jrun`, `tile`, `tjoint`, `chalk_a`..`chalk_f`, `teak_ea`, `teak_eb`, `teak_ha`, `teak_hb`, `teak_gap`, `teak_open`,
     `teak_end1`, `teak_end2`, `teak_foot`, `fabric_hem`, `fabric_r`, `fabric_piece`, `fabric_seam`, `pane_grime`,
     `pane_bottom`, `pane_left`, `pane_right` (the registry refuses two features declaring one name). Since the edge
     rework no feature reads `ground` or `level`; they are written with `signals=all` for the debug view.
3. **Overlays.** `terramar_wear.blend` (part `wear`, root `TM_WEAR`, one layer `wear_overlays`) holds geometry that only
   exists when worn, built by the features' `overlays()`: one collection `TM_WEAR_<name>` per feature (today
   `TM_WEAR_runoff_streaks`, 30 decals), and `TM_WEAR_DEBUG` for markers shown in debug only.
   - The composition links `TM_WEAR` under `TERRAMAR_REBUILD`, so the audit checks it.
   - The switch excludes `TM_WEAR` from the view layer while off, and a feature's own collection while its strength is
     0. An overlay's material also reads the switch and scales with the strength.
   - Decals sit 4 mm proud of their surface (the audit counts same-facing faces within 3 mm as coplanar).
   - Images go to `tests/artifacts/blender/terramar_recessed/rebuild/wear/<feature>/`.

**Material classes** (`wear/classes.py`, by slot name):

| Class | Slots | Features |
| --- | --- | --- |
| `stone` | slab fascia, pilaster, column, podium stone, penthouse stone | splash_zone, ledge_dust, cavity_soot, joint_dirt (bevels) |
| `paving` | paving (also the tree pits and roof troughs), threshold, slab top, roof paving, site paving | splash_zone, ledge_dust, cavity_soot, joint_dirt (tile joints) |
| `joint` | `TM_RB_stone_joint` | splash_zone, ledge_dust, joint_dirt |
| `wood_ext` | `TM_RB_wood` (reveals, doors, linings) | teak_weather, cavity_soot, splash_zone |
| `soffit` | `TM_RB_soffit` | cavity_soot |
| `steel` | `TM_RB_frame`, `TM_RB_louvre`, `TM_RB_awning` (the storefront canopies are charcoal metal) | metal_chalk |
| `glass_ext` | `TM_RB_glass` | glass_film |
| `planter` | planter metal and pots | splash_zone (entrance pots), ledge_dust |
| `furn_teak`, `cafe_wood` | `TM_RB_furn_teak`; `TM_RB_cafe_wood` | teak_weather |
| `fabric` | `TM_RB_cafe_canopy` (the umbrellas' canvas) | fabric_fade |
| `concrete` | `TM_RB_roof_top` | ledge_dust |

Interior materials get no group: partition, ceiling, floor, core, hidden, and the furniture fabrics.

**The features**, in ORDER (each module's header has the long form):
- **teak_weather** (20; furniture teak, café wood, the architecture's wood). Outdoor teak weathers at its edges and ends
  only; board faces keep their oiled colour. Arrises (convex edges of 40° or more, eased-corner facets) go silver-grey
  and rougher within about 5 mm, wider and stronger toward a member's ends; end grain turns a darker grey; feet darken
  over about 3.5 cm above their floor; slat sides along open joints darken. It follows `teak_open` (sheltered wood gets
  nothing) and varies per piece ("last oiled") and per board. The band is exact geometry: per face corner the in-plane
  distance to the face's arrises (`teak_ea`/`teak_eb`, `teak_ha`/`teak_hb`).
- **fabric_fade** (30; the café umbrellas' canvas). Dirt at the canvas edges only; the panels stay clean. A drip line
  over the lowest 16 mm of every piece of canvas (valance bottoms, hem, vent cap; `fabric_hem`), a 16 mm line on each rib
  seam (from the umbrella's `rb_seam` UV map, each seam its own amount and reach) and a 3 cm ring at the vent opening.
  Per umbrella and per flap seeded; light, since b8's umbrellas are new.
- **metal_chalk** (50; frames, guard rails and shoes, lantern bodies, louvres, storefront canopies). The powder coat
  chalks along exposed arrises only: a fine lighter line a few millimetres wide; faces keep their colour. An arris is a
  convex edge whose two faces are both free (short ray probes; a mullion into its rail, a sill on stone, a frame on the
  wall or a slat's ends are junctions, not arrises). Its dose is the sky the arris sees, seeded per member and corner,
  1.5x round exposed ends. Each face keeps up to six sides as `chalk_a`..`chalk_f`, so the line is exact at any distance.
- **splash_zone** (100; stone, paving, joint, planter, wood_ext). Street grime in the junctions where walls, piers,
  jambs, tree pits and pots stand on the street-level paving, never over a whole face: a narrow gradient a few cm up the
  wall and out on the floor, climbing 1.5-6 cm higher where the pavement in front takes rain (`splash`). `foot` / `foot_h`
  mark the junction faces; a short-reach Ambient Occlusion (12 cm) draws the gradient at render time, so cross-part
  junctions (the site's sidewalk against the building's piers) are exact. Every 1.35 m plan cell gives its stretch a
  presence (about a quarter absent), amount and width; inside corners are strongest.
- **ledge_dust** (110; paving, stone, joint, planter, concrete). Dust drifted into the edges and inside corners of the
  floors above the street (podium terrace, balconies, roof deck, entrance top), fading out within about 10 cm; the open
  floor stays clean. `edge` / `edge_h` mark the junctions, `edge_rain` keeps all the dust in a sheltered junction and
  45 % in a rinsed one; occlusion over 22 cm; its own stretch draws as in splash_zone.
- **cavity_soot** (120; stone, soffits, paving, wood). Soot and dust where the air stalls, from Cycles' Ambient
  Occlusion over 0.30 m: only the occlusion inside concave junctions counts (soffits meeting the glazing heads, the
  columns and pilasters, the reveals' inner corners, terrace walls' feet, planter bases). `soot_shelter` (face corner)
  keeps it in the sheltered junctions and lets a rinsed one keep 40 %. Each stone panel varies by ±15 %. At full: 18 %
  darker, 30 % greyer, a touch warm, roughness +0.06.
- **joint_dirt** (130; joint floors, their stone bevels, the tiled paving). Dirt lodged in the joints. `jrun` (face)
  sorts each joint floor by its run: course joints and joints on tops 1.0, vertical joints 0.45, soffit joints 0.5,
  each run within ±25 % by seed; the up-facing 3 mm lower bevels take 45 % of their joint. The `sky` signal rinses it:
  an open wall's joints keep 60 %. The paving's drawn tile joints (roof deck, sidewalk) are found again from the
  object's x / y, one seeded value per joint line. At a full, sheltered run: 21 % darker, 52 % greyer, roughness
  +0.075.
- **runoff_streaks** (220; overlays). Faint rain-runoff streaks below the few places where water leaves an edge: the
  guard glass joints over the slab fascias, the roof guard's joints, the rounded corners, the guard shoes' ends at the
  front pilasters, the podium planters' weep holes, the upper recesses' sill corners, and rust under one of the four
  lanterns. 30 of 396 candidates carry one, by seeded probability (a little more often up high; the same place on the
  next floor four times less often). Each streak draws its own amount, length (0.3-1.6 m), width, spread, wander and
  rivulets. Its path is ray-cast on the building part: it stops at an arris, a recess head or an obstacle, is drawn
  into a nearby vertical joint, and hangs a little at bed joints and at its drip edge. Each is one decal, camera rays
  only, a tinted Transparent BSDF over a generated atlas, so it darkens and greys the stone's own shaded colour.
- **glass_film** (300; exterior glass). A grime margin along each pane's edges, where water and dust dry against the
  frame: densest at the bottom gasket, gone by about 2.8 cm, gathering into the two bottom corners, a faint side margin
  low down, nothing under the head; the pane's field stays clear. Per pane (`pane_grime`): 22 % cleaned lately, street
  level more, sheltered panes more. `pane_bottom`, `pane_left`, `pane_right` give the pane's own frame per face corner,
  so the margin is exact. It darkens and dulls; it never lightens the glass.

**Integration fixes (2026-10-14).** The feature agents built and checked their features in private scratch copies.
Integrating them changed the framework:
1. **`sky` was wrong.** Its rays started along the averaged vertex normal and landed inside the neighbouring geometry
   (frames, guard shoes, the paving over the walls' feet), so every floor and junction read sheltered (sky 0). It is
   now sampled per face corner, off the true face normal (see Signals). Open fascias and piers now read about 0.5,
   balcony floors under the slab above 0.14-0.22, and the stone tops on the roof about 1.0.
   - `joint_dirt` was the only reader. It had been calibrated with sky 0, i.e. everything sheltered. Its rinse now
     works, so its amounts went up by 1.5 and its rinsed share from 0.5 to 0.6: an open facade's joints look as
     calibrated (0.9 of it), sheltered ones 1.5 times that.
2. Overlays sit 4 mm proud, not 2 mm (`OverlayContext.PROUD`; `runoff_streaks` already used 4 mm).
3. A feature at strength 0 has its `TM_WEAR_<name>` excluded, so strength 0 is exact for an overlay feature too.
4. `nodes.overlay_material` scales with the strength (alpha = 1 − (1 − a)^s). `runoff_streaks` ships its own
   camera-only material, which already scaled its tint by the strength.
5. `controls.apply()` sets every registered feature (given strengths, the others their default), so switch runs are
   reproducible; `strengths=all:<v>` sets them all first.
6. `TM_RB_awning` is charcoal metal: class `steel`, so `metal_chalk` acts on the storefront canopies and
   `fabric_fade` (now the umbrellas only) does not.
7. The registry refuses two features declaring the same attribute. The overlay layer drops the collections of
   features no longer registered. `TM_WEAR_SKIP=<names>` drops features in one process (the scratch reference below).
8. Builder helpers `b.ao(distance, samples)` and `b.coords(space)` (the features keep their own working code). The
   glass routes Transmission for the debug view. The debug colours are now distinct: `metal_chalk` yellow,
   `teak_weather` green, `fabric_fade` red.
9. **Indoor gate** (found by the interior check): the room sides of exterior objects weathered too, e.g. the wood
   reveal's room side seen from `detail_residential_inside` (up to 39 levels). The `indoor` signal and the gate in
   `TM_WEAR_layer` fix it. A first version counted the balcony guards' glass as walls and closed off the paving along
   the guard; the indoor test now sees through objects with `rb_element = "guard"`. The pass on the building takes
   about 100 s instead of 55 s.

**Edges-only rework (2026-10-15).** Reviewing one picture per feature, the user rejected whole-surface wear: *"if the
wear or dirt is applied over an entire surface, instead of edges, or forming a pattern, then it has no value"*. Six
features that tinted whole faces (splash_zone's band, ledge_dust's floors, glass_film's even film, metal_chalk's faces,
teak_weather's tops, fabric_fade's canopy tops) were rebuilt in place to act only along junctions, edges, arrises, hems
and seams, as described above. joint_dirt, cavity_soot and runoff_streaks already did. Each was checked in a private
scratch copy: off and every strength at 0 render 0 px different, and a feature at 0 equals its absence (0 px). The
building's wear pass grew to about 3-4 minutes (the arris probes and junction marks). Evidence:
`tests/artifacts/screens/buildings/terramar_recessed/rebuild/wear/rework/` (per feature `[off | on | debug]` with 3x
zooms, the old versions against the new) and `wear/parts/sheets/` (one picture per feature from the real composition).

**The build.**
- `build.py`'s finishing passes are `materials`, then `wear`, in the building, props and site parts. The wear follows
  every materials pass, because that pass rebuilds the node trees the wear sits in.
- The pass first strips any previous wear, so it is idempotent: the splices, the `TM_WEAR*` groups, the attributes, the
  flags and the per-object mesh copies all go.
- `layers=wear` re-applies the wear alone (building about 100 s, props and site about 2 s each). `wear=0` strips it,
  and the part is exactly as before the module.
- `target=wear` builds the overlay part. `compose.py` links it when it exists.

```
# re-apply the wear to the parts (after a feature changed), the overlay part, then the composition
blender -b tests/artifacts/blender/terramar_recessed/rebuild/terramar_building.blend --python src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/build.py -- target=building layers=wear
blender -b tests/artifacts/blender/terramar_recessed/rebuild/terramar_props.blend --python src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/build.py -- target=props layers=wear
blender -b tests/artifacts/blender/terramar_recessed/rebuild/terramar_site.blend --python src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/build.py -- target=site layers=wear
blender -b --factory-startup --python src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/build.py -- target=wear
blender -b --factory-startup --python src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/compose.py
# strip it from a part
blender -b tests/artifacts/blender/terramar_recessed/rebuild/terramar_site.blend --python src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild/build.py -- target=site layers=wear wear=0
```

**Verification** (2026-10-14, all nine features, the final parts):
- **Off is exact.** The exact renders use Cycles on the CPU, one thread, 16 samples, no denoiser, seed 0, half
  resolution. That is the only bit-reproducible setting: OptiX repeats and multi-thread CPU repeats both differ by up
  to half a level. The reference is `pre_wear_cpu1`, rendered before any part had wear.
  - `wear=off`: max |diff| 0, 0 pixels differ, on `b8_calibrated`, `wear_base_front` and `wear_base_corner`.
  - `wear=on strengths=all:0`: 0 / 0 px.
  - **Strength 0 is absence.** A scratch copy was rendered with `runoff_streaks`, `cavity_soot` and `glass_film` at 0
    and the six others on. It was then worn again without those three (`TM_WEAR_SKIP`) and rendered with every
    default. 0 px differ on `b8_calibrated`, `wear_cavity_soffit` and `wear_runoff_balconies`.
  - **`build.py -- layers=wear wear=0`** on the building, props and site: node trees, node groups, mesh attributes and
    object properties are identical to the parts before the module. The stripped composition renders 0 px against
    `pre_wear_cpu1` (the overlay strength at 0). Worn again, the parts are identical to the worn ones, attribute values
    hashed.
- **On.** Against off (OptiX, 96 samples, denoised), the mean |diff| per pose is 0.6-4.1 levels (`b8_calibrated` 1.05),
  max 23-65. The largest change is the canopy slats' chalk, 65 levels at the brightest slat edge. Every image was
  looked at: the change stays subtle and in the places the features name, with no blotch, no repeated mark and no
  bright glass band.
- **Interiors.** Seen from `detail_restaurant_inside`, `detail_residential_inside` and `detail_dining_inside`, the room
  surfaces are unchanged, e.g. the reveal's room side: max 1 level, noise; it was 6 before the indoor gate. What
  changes is what shows through the filmed glass.
- **The isolation sets** (`iso_<feature>/`, that feature alone, on and debug): `joint_dirt`, `metal_chalk`,
  `runoff_streaks`. `iso_joint_dirt/joint_recalibration_compare.png` shows the recalibrated open-wall course joint next
  to the agent's calibration.
- **Checks:**
  - the audit: 710 objects (680 plus the 30 decals), 0 z-fights, 0 penetrations; the site: 42 objects, 0 / 0;
  - hidden parts visible from b8: 0 px;
  - a fresh `target=all save=0` runs clean and reproduces the saved parts' features, worn materials, signal counts,
    every feature's attribute summary and the 30 streaks (23,991 faces). The exception is `indoor`, which varies by
    about 20 of its 114,155 corners between fresh sessions (rays grazing triangle edges).
- **Cost.**
  - Render time (OptiX, 96 samples, denoised, off and on interleaved after a warm-up): `b8_calibrated` 13.2 -> 14.2 s
    (+7.4 %), `wear_cavity_soffit` 33.4 -> 35.2 s (+5.4 %). `cavity_soot`'s occlusion alone was measured at +3-5 %
    by its agent.
  - The wear pass: building about 100 s (the `indoor` test about 40 s of it), props and site about 2 s each.
  - Files: `terramar_building.blend` 1.90 -> 2.13 MB, `terramar_props.blend` 139.10 -> 139.30 MB, `terramar_site.blend`
    80.39 -> 80.75 MB. `terramar_wear.blend` is 0.58 MB, plus the atlas `runoff_streaks_atlas.png` (2048 x 1024,
    113 KB).

Evidence is in `tests/artifacts/screens/buildings/terramar_recessed/rebuild/wear/`:
- `final/`:
  - `renders/{off,on,debug}/`: 30 poses (`b8_calibrated`, `joint_detail_pilaster` and the 28 `wear_*` poses);
  - `sheets/all_<pose>.png`: `[b8 crop | off | on | debug]` with an enlarged detail row. `all_full_b8_calibrated.png`
    is the whole `CAM_B8` frame;
  - `overview.png`: the grid, b8 then 12 close-ups;
  - `review/`: `[off | on | |diff| x 6]` per pose, and `review_stats.txt`;
  - `iso_joint_dirt/`, `iso_metal_chalk/`, `iso_runoff_streaks/`;
  - `interior/`: off / on from three interior poses, with diffs;
  - `checks/`: `site.audit.json`, the sightline sheet;
  - `timing/timing.json`;
  - `dev/`: the `sky` (`sky_v1`) and `indoor` (`indoor_v2`) debug ramps;
  - `v1_before_indoor_gate/`: the on / debug set before the indoor gate;
- `exact/`: `final_off_cpu1`, `final_on_all0_cpu1`, `final_wear0_cpu1`, `integ_s0_cpu1`, `integ_skip_cpu1` against
  `pre_wear_cpu1`;
- the feature agents' own development sheets in `wear/<feature>/`.

New poses (group `wear`, 1920 x 1080), from the feature agents:
- teak and fabric: `wear_roof_lounge`, `wear_roof_dining`, `wear_roof_loungers`, `wear_umbrella_top`,
  `wear_awning_top`, `wear_valance_hem`, `wear_awning_fascia`;
- glass and frames: `wear_glass_storefront`, `wear_glass_sliders`, `wear_frames_rails`, `wear_frames_annex`,
  `wear_frames_balcony`;
- dust and joints: `wear_dust_balcony_corner`, `wear_dust_balcony_chamfer`, `wear_dust_podium_top`,
  `wear_dust_roof_corner`, `wear_joints_sidewalk` (the pilaster joints use `joint_detail_pilaster`);
- runoff: `wear_runoff_balconies`, `wear_runoff_podium_edge`, `wear_runoff_front_podium`, `wear_runoff_upper_corner`,
  `wear_runoff_lantern`, `wear_runoff_sill_corner`;
- cavity: `wear_cavity_soffit`, `wear_cavity_pilaster`, `wear_cavity_terrace`.

**The feature contract** (`wear/registry.py`; one module in `wear/features/`, one entry in `registry.MODULES`):

```python
NAME = "splash_zone"            # lowercase identifier; also the strength property tm_wear_<NAME>
ORDER = 100                     # chain order: 0-99 tone and fabric, 100-199 deposits, 200-299 streaks, 300-399 glass
CLASSES = ("stone", "paving")   # classes.NAMES it acts on: their materials get the layer and the sockets it writes
SIGNALS = ("ground",)           # framework signals it reads (signals.SIGNALS), written on its classes' meshes
DEBUG_RGB = (r, g, b)           # its false colour in the debug view (keep it distinct from the others)
def shader(b, ins) -> dict      # b: nodes.Builder; ins: the state sockets, Class, Strength. Return the worn state for
                                # the sockets it changes ("Color", "Roughness", "Metallic", "Normal", "Alpha",
                                # "Transmission", "Specular") and "Mask" (0..1, where it acts). Scale the AMPLITUDE by
                                # Strength (a strength over 1 must not saturate a clamped factor); no noise textures
# optional
LABEL = "..."; DEFAULT_STRENGTH = 1.0
ATTRIBUTES = {"splash": 0.6}    # its own tm_wear_<name> attributes (unique across features) and their debug full scale
def attributes(ctx) -> dict     # write them (ctx: wear/context.py WearContext); runs in every exterior part
def overlays(ctx) -> dict       # build objects into TM_WEAR_<NAME> (ctx: wear/overlays.py OverlayContext)
```

Builder lookups:
- `b.signal(name)` reads a mesh attribute;
- `b.object("exposed" | "seed")` reads an object flag;
- `b.scene(name)` reads a scene control `tm_wear_<name>`;
- `b.geometry(...)`, `b.vertical()`, `b.upward()`, `b.nz()` give the shading point and its orientation;
- `b.ao(distance, samples)` the render-time occlusion, `b.coords("Object")` the object-space position;
- `b.is_class(...)` tests the material's class.

`WearContext` gives `meshes(classes)`, `world(ob)`, `walking_level`, `ray_scene`, `exposure`, `covered`, `own_mesh`,
`set_attribute` and `seed`. Absent attributes read 0, so gate a feature on its own attribute being present. Shared
meshes (furniture) get per-object copies only when a feature writes per-object data on them; otherwise prefer the
object seed.

**Trying a feature in a private scratch copy** (`build.py` refuses any file but the real parts, so the real files stay
untouched):

```
R=src/graphics/content3d/buildings/authoring/terramar_recessed/rebuild
S=tests/artifacts/blender/terramar_recessed/rebuild/scratch_<name>
# 1. copy every part and the composition (image and library paths remapped to the copy)
blender -b --factory-startup --python $R/wear/scratch.py -- name=<name>
# 2. the wear pass in the copies (and the overlay part, if the feature has overlays); a feature not yet in
#    registry.MODULES joins with TM_WEAR_EXTRA=<name>, a registered one is left out with TM_WEAR_SKIP=<name>
blender -b $S/terramar_building.blend --python $R/layer_wear.py -- save=1          # and props, site
blender -b $S/terramar_wear.blend --python $R/layer_wear.py -- save=1
# 3. renders: off / on / debug (+ a signal), into your own folder
blender -b $S/terramar_composition.blend --python $R/wear.py --python $R/../render_poses.py -- wear=on poses=wear_base_front,wear_base_corner out=tests/artifacts/screens/buildings/terramar_recessed/rebuild/wear/<name>/on
# 4. sheets [b8 crop | off | on | debug], and the exact difference of off against a render made before the feature
python -I $R/wear/sheets.py sheet --feature <name> --poses wear_base_front --off off --on on --debug debug --root tests/artifacts/screens/buildings/terramar_recessed/rebuild/wear/<name>
python -I $R/wear/sheets.py diff --a pre --b off --poses wear_base_front --root <dir>
```

Then integrate:
1. Register it in `registry.MODULES`.
2. `build.py layers=wear` on each exterior part, plus `target=wear` if the feature has overlays, then `compose.py`.
3. Run the audit, `check_layers` / `compose_checks`, a fresh `target=all save=0`, the exactness renders and the evidence
   sheets.

## The Terra & Mar PBR kit sets (AI 640)

`make_terramar_kit_pbr.py` installs the user's kit (`Terra_Mar_PBR_Kit.zip` in Downloads, md5
`cc7c7315fd820fa6b1b5b43e602b9f91`, delivered 2026-10-12) as three PBR sets in the shared asset store. The maps are
byte-exact copies of the kit's own, so each installed map carries the kit's md5:
- `basecolor.png`;
- `normal_opengl.png` as `normal_gl.png`;
- `orm.png` as `arm.png` (R AO, G roughness, B metallic);
- `height_16bit.png` as `height.png`.

Beside them go the set's `material.json` and the kit's `README.txt`, `validation.json` and `GENERATION_PROMPTS.json`, a
`pbr.material.config.js` and a `source.json` (archive name and md5, folder, date, an md5 per file, the AI-generated
appearance-estimate note). Before installing, the script re-checks the kit:
- every map is the same size;
- the sign opacity equals the base colour's alpha;
- the ORM equals the separate AO, roughness and metallic maps;
- the height is 16-bit.

```
python -I src/graphics/content3d/buildings/authoring/terramar_recessed/make_terramar_kit_pbr.py [--zip <kit.zip>]
```

| Set | Size | Use | Conventions |
| --- | --- | --- | --- |
| `assets/public/pbr/terramar_continuous_limestone/` | 4096 × 4096, 4 × 4 m repeat (`tileMeters` 4) | the walls, pilasters, podium and slab edges (AI 648) | seamless; NO joints by design: make the gaps and bevels in geometry and vary the UV region per block; displacement 1.5 mm total, midpoint 0.5; mean RGB (227, 215, 202), roughness 0.73 |
| `assets/public/pbr/terramar_sign_terra_and_mar/` | 4096 × 512 card (kit's suggested 3.2 m) | the sign's first line (the rebuild's traced letters, AI 646) | clamp; cutout at alpha 0.5; face-bevel normal, 2.0 mm relief; metallic 0.82 |
| `assets/public/pbr/terramar_sign_coastal_kitchen/` | 4096 × 512 card (kit's suggested 2.1 m) | the second line | as above, 1.4 mm relief; metallic 0.78 |

The normal maps are OpenGL +Y, for Blender and three.js.

Storage and status:
- **Resolution:** full resolution. PBR packs are outside the asset suite's size checks and the largest map is 4096, so there are no reduced copies.
- **Git:** only the three `pbr.material.config.js` files are tracked (plain Git, LF, guarded by `pbr_config_storage.test.js`). The images, the docs and `source.json` stay in the gitignored shared store.
- **Catalog:** the sets are NOT registered in `_catalog_index.js` or `_manifest.json`. Both are shared, and another session has edits in the index. Registering them is a separate step for when the game needs these materials.
- **Rebuild:** the rebuild's sign picks the sets up automatically, and `build.py` now saves every image path relative to the file.
- **Prompts:** the superseded AI 619 (stone) and AI 625 (lettering) pass to AI 648 and AI 646, which use these sets.
