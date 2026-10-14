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
| `build.py` | the entry: `target=` (building, props, site, interiors or all), or `layers=` of one part; refuses any file but that part's (or an unsaved session); sets the part's root, refreshes the base scene, then runs `layer_<name>.py` for each requested layer, which empties and rebuilds only its own collection under the part's root, then the materials pass; `target=all` builds every part from scratch and composes |
| `compose.py` | the composition (2026-10-14): links the four parts' roots into `terramar_composition.blend` beside the base scene (local `TERRAMAR_REBUILD` holding the building, props and interiors; `RB_SITE` beside it) |
| `rb_lib.py` | shared helpers: collections, the `TM_RB_*` materials, `solid()` (closed solids from plan regions as n-gons: a region with holes is cut along a line through its hole, and every loop gets the cut points, so tops, bottoms and side faces share their vertices), box UVs, the plan cameras |
| `layer_structure.py` | the structure layer, `RB_STRUCTURE` (below) |
| `layer_envelope.py` / `envelope_layout.py` | the envelope layer, `RB_ENVELOPE`, and its bay/pane layout (written into the plan by `make_plan.py`) |
| `layer_balconies.py` / `balcony_layout.py` | the balconies layer, `RB_BALCONIES`, and its layout (paving pieces, guard runs, downlights, planter slots) |
| `layer_podium.py` / `podium_layout.py` / `trace_sign.py` | the podium layer, `RB_PODIUM`, its layout, and the sign tracer (kit masks -> letter outlines) |
| `layer_roof.py` | the roof layer, `RB_ROOF` (its layout is `plan["roof"]`, written by `make_plan.py`) |
| `b8_camera_fit.py` | fits `CAM_B8` to the plan by least squares over the b8 picks (used by `make_plan.py`, written to `plan["cameras"]`) |
| `check_layers.py` / `compose_checks.py` | Workbench checks: the layer's edges over b8, a top cut-away with the plan outlines, the rear, and the core's visibility from b8 with stand-in walls |
| `layer_materials.py` | the materials pass (AI 648): re-dresses every `TM_RB_*` slot from `plan["materials"]` and cuts the stone joints into the layers' objects; `build.py` runs it after any geometry layer it rebuilds |
| `sample_tones.py` | b8 vs a `CAM_B8` render, box by box (stone, wood, soffit): mean colours, linear ratios, the suggested tone |
| `compose_joint_layout.py` | the stone joint layout as one elevation per run, from `joint_layout.json` |
| `layer_roof_planters.py` / `proc_plants.py` | the roof terrace's planters and trees (AI 629), `RB_PROPS/RB_ROOF_PLANTERS`, from `plan["props"]["roof_planters"]`; the procedural cycads, palms and spiky rosettes the game's vegetation lacks |
| `layer_roof_furniture.py` | the roof terrace's furniture (AI 630), `RB_PROPS/RB_ROOF_FURNITURE`, from `plan["props"]["roof_furniture"]` (`props_layout.py`) |
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
