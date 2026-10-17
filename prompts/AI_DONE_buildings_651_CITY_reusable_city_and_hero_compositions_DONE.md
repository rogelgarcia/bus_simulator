# DONE

# Problem

The user, 2026-10-17: "the next step is to create a reusable city, instead of copying the same city over and over
again. so, we will have the bradbury file, the terra e mar file and the city file. the city file will be empty at the
block where we put the buildings. another composition will be created for the bradbury and terra e mar. the composition
will put the city (as import) and the building (as import). this way we reuse the city. the composition will also finish
the block, adding the sidewalk curbs etc. also check how you're going to do with the weathering system."

Today the city exists twice:

- **The Bradbury's render scene.** `src/graphics/content3d/buildings/authoring/BradburyBlock/build_scene.py` (3,150
  lines) builds `tests/artifacts/blender/bradbury/portal_project/bradbury_scene.blend` in one pass: sky, sun, haze,
  streets, the block's pavement and kerb, near and far context, the neighbour tower, furniture, the city fill, cameras.
  The (worn) Bradbury block is linked object by object.
- **The Terra & Mar city.** `src/graphics/content3d/buildings/authoring/terramar_recessed/city/build_city_scene.py`
  opens that Bradbury scene, deletes the Bradbury block, rebuilds the block's ground (`city_ground.py`: sidewalk, worn
  kerb, rear parking lot), models 39 front-line neighbours (`city_neighbours.py`) and instances the Terra & Mar part
  files. It saves `tests/artifacts/blender/terramar_recessed/city/terramar_city_scene.blend`.

Any change to the city has to be made in the Bradbury script and then re-copied. The neighbour upgrade exists only in
the Terra & Mar copy, and the two scenes run in different light units.

# Request

Split the pipeline into three kinds of files: one reusable CITY, one file (or file set) per BUILDING, and one
COMPOSITION per hero that links the city and the building and finishes the hero's block. Both heroes (Bradbury,
Terra & Mar) must render from their compositions as they render today (except where the shared city is deliberately
better, e.g. the modelled neighbours), and every weathering system must keep working.

## Backup (already done, do not modify)

`C:\Users\rogel\Projects\bus_simulator_backups\2026-10-17_city_reuse\` (3.0 GB, see its `MANIFEST.md`) holds:

- Copies of `tests/artifacts/blender/bradbury/` and `tests/artifacts/blender/terramar_recessed/`.
- Every PBR set folder the scenes reference. The textures of all of them are untracked; only `pbr.material.config.js`
  is in git, and `assets/` is a shared junction.
- The HDRI, the lantern post, and the tree and game texture files the scenes use.
- A copy of `_catalog_index.js`.

Four sets are not game assets yet, because they are not in `_catalog_index.js`: `bradbury_lettering`,
`terramar_continuous_limestone`, `terramar_sign_coastal_kitchen` and `terramar_sign_terra_and_mar`. Restore from the
backup if anything goes wrong; never delete it.

## Analysis: what moves where

**The site** is the block between Broadway and 3rd Street, the city's origin block. Its kerb rectangle is
`WX -40.227, EX 21.194, SY -22.079, NY 21.577` (the Bradbury hull pushed out `PAVE_W` 4.2), the pavement top is
`Z_GROUND` 0.201, the road is `ROAD_Z` -0.08 and the gutter about -0.105. The whole street grid, the far blocks, the
city's open zone and the neighbour tower are laid out from this rectangle, so the city keeps it as a fixed SITE
descriptor that the compositions read.

| Content (today) | Owner after the split | Notes |
| --- | --- | --- |
| Sky world `BRADBURY_SKY` (kloofendal, turned to az +40), `scn_haze` group | CITY | light units, see below |
| Sun lamp `scene_sun` | COMPOSITION | lamps cannot read a light-scale attribute; each composition places it from the city's site descriptor (az/el) at its own units |
| Road grid `scn_road`, `scn_road_far`, shadow catcher, far blocks' pavements and kerbs, lots | CITY | the road grid under the site already lies flat at the gutter level |
| The site block's `scn_pavement` / `scn_kerb` | COMPOSITION | the city leaves the site empty; Bradbury lays the full kerb rectangle, Terra & Mar the outline with the parking lot (`city_ground.py`) |
| Ground materials `GND_pavement`, `GND_kerb`, `GND_asphalt`, `GND_lot` | CITY | compositions assign the linked materials to their own block meshes (pavement reads the object's `pad_lo`/`pad_hi`) |
| Near context (walls, fence, hedge, tufts, trees), far context (boxes, tree lines, trailers, skyline), `CONTEXT_LIBRARY` | CITY | `context_library.blend` moves to a city-owned folder (it is in the Bradbury's `portal_project/` today) |
| Neighbour tower and wing (the Bradbury photo's second shadow) | CITY | modelled by the neighbours module like the other front-line buildings |
| Street furniture: high-mast posts | CITY | |
| Vault covers `ctx_cover_01..04` and the lantern post `ctx_post_black` | SITE FURNITURE | they stand on the block's own sidewalk: a separate city collection a composition links only if it wants them (the Bradbury composition does) |
| City fill (parcels, boxes, trees, open walled lots, bay lines) | CITY | |
| Front-line neighbours (`city_neighbours.py`: walls, doors, windows, trims, roof kits, `NB_weather`) | CITY | the front line becomes the union of both heroes' cameras (`front_line.py` on both compositions) |
| The Bradbury block (worn file chain: `bradbury_block_worn.blend`, `bradbury_portal_worn.blend`, `wear_nodes.blend`, `ornaments/*.blend`) | BUILDING (Bradbury) | unchanged files; linked by collection, not object by object |
| Terra & Mar parts (`terramar_building/props/interiors/wear/site.blend`) | BUILDING (Terra & Mar) | unchanged; placed turned 45 degrees at the corner (`city_common.ROT_DEG/OFFSET`) |
| Cameras, film (AgX Medium High Contrast), exposure, Cycles settings | COMPOSITION | Bradbury's `VIEWS`, Terra & Mar's `render_city_shots.py` views and flyover |
| Site props check (café sets and palms on the sidewalk) | COMPOSITION (Terra & Mar) | |

**Light units.**

- The Bradbury scene: sun 8, sky and haze strength 1, exposure 0.
- The Terra & Mar copy: every Bradbury light source multiplied by 19.569 (2^4.29), exposure -4.2905. This is because
  the Terra & Mar interiors' lamps are calibrated in absolute units.

A linked city cannot be rescaled per composition by editing its data. So the city's emitters read the scale from the
composition: the world's two Background strengths and the haze group's Emission strength multiply by a scene property
`city_light_scale`, read with an Attribute node of type View Layer, which falls back to the scene. Absent (0) must mean
1. The sun lamp is the composition's own. Bradbury uses scale 1 at exposure 0; Terra & Mar uses scale 19.569 at
exposure -4.2905. First verify that a View Layer attribute works in a world shader and inside the linked haze group in
Cycles. If the world cannot read it, the composition appends (copies) the world instead of linking it, and only the haze
group reads the attribute.

**Weathering.** Four systems, with separate property namespaces on the composition's scene:

1. **The Bradbury wear layer** (`BradburyBlock/wear/`). It is baked into the worn block files. Scene properties
   `wear`, `wear_<feature>`, `edge_*` and `wear_realism` are read by the worn materials. The wear-only collections are
   shown or hidden by `wear.controls.organise()`, and a staleness check runs against the wear manifest. The Bradbury
   composition must set these properties and organise the linked collections exactly as `build_scene.py` does
   (`wear=on|off|debug`, `wear_stale`).
2. **The Terra & Mar wear module** (`terramar_recessed/rebuild/wear/`). Scene properties `tm_wear*` are read by View
   Layer attributes, and its overlays live in `TM_WEAR`. Collection instances ignore view-layer exclusion, so either
   instance each `TM_WEAR_<feature>` collection separately (strength 0 = not instanced), or place the parts in another
   way that keeps the module's exclusion working. `controls.apply()` sets the properties.
3. **The city's ground wear** (road wheel paths, cracks, kerb grime, pavement joints and grime). It lives in mesh
   attributes and AO, built into the city's ground. It also applies to the block meshes a composition builds, provided
   they carry the same attributes.
4. **The neighbours' `NB_weather`** (base dust, coping runoff, from world height and the object's `nb_top`). It is
   city-owned. Expose a scene property `city_weather` (View Layer attribute, absent = 1) to scale or disable it from a
   composition.

Keep the prefixes apart (`wear`, `edge_`, `tm_wear`, `city_`). A switch run on one system must not change another's
pixels.

Tasks:

- **The city builder.** A city authoring folder (for example `src/graphics/content3d/buildings/authoring/city/`) with
  a builder that writes `tests/artifacts/blender/city/city.blend` and a SITE descriptor (JSON: kerb rectangle, levels,
  sun azimuth/elevation, light units, collection names).
  - Build it from copies of `build_scene.py`'s sections (sky, haze, ground, near and far context, neighbour, furniture,
    city), plus the moved `city_neighbours.py` and `front_line.py`.
  - The site block is left empty: no pavement, kerb or building. The site furniture goes in its own collection.
  - Do not edit or delete `BradburyBlock/build_scene.py` or its outputs: it stays the legacy path until the user
    retires it.
  - A `neighbours=off` option keeps the city's drawn-window boxes, for the parity checks.
- **A shared block kit.** The kerb profile, curb returns, pavement and kerb meshes and the parking-lot outline
  (today's code in `build_scene.py` and `city_ground.py`), as a module both compositions use with the city's linked
  materials.
- **The Bradbury composition.** It links the city (by collection), the worn block (by collection) and the site
  furniture, lays the block's full kerb rectangle, adds the sun at units 1, the cameras and film, and the wear controls.
  - Output: `tests/artifacts/blender/bradbury/portal_project/bradbury_city_composition.blend`.
  - Port the Bradbury's render scripts (stills, `render_wear.py`, `render_flyover.py`) to open it, as copies beside the
    originals.
- **The Terra & Mar composition.** It links the city and the Terra & Mar parts (placed as today), lays the block with
  the parking lot, runs the site-props check, adds the sun at scale 19.569 and exposure -4.2905, and the `tm_wear`
  controls.
  - Output: `tests/artifacts/blender/terramar_recessed/city/terramar_city_composition.blend`.
  - Point `render_city_shots.py`, `render_flyover.py` and `front_line.py` at it.
  - `build_city_scene.py` stays as the legacy path until parity is shown.
- **Parity gates** (evidence under `tests/artifacts/screens/city_reuse/`), each a [legacy | composition | difference]
  composite and a mean/max channel difference:
  - Bradbury composition against `bradbury_scene.blend` on `ref_3q`, `hero_3q`, `st_corner` (city built with
    `neighbours=off`).
  - Terra & Mar composition against `terramar_city_scene.blend` on `ref_3q`, `rear_3q`, `entrance`.
  - Same samples, OptiX only, fixed seed. Differences must be explained (expected: none beyond noise).
- **Weathering checks.** In each composition, render one close view with each system switched off, on, and (where it
  exists) debug. Show that a switch changes only its own system's pixels.
- **One city, two heroes.** Rebuild the city once with the neighbours on and the union front line, open both
  compositions without rebuilding them, and render one still each: the city change reaches both.
- **Docs.** A city README (files, site descriptor, light units, weathering namespaces, how to add a hero). Update the
  Bradbury and Terra & Mar READMEs with the composition commands and which scripts are now legacy. List the legacy
  files proposed for retirement in the completion summary; do not delete them without the user's approval.
- **Safety.** Follow `AGENTS.md` and `ai_rules/PROJECT_RULES.md`: never use worktree archival or bulk deletes over
  `tests/artifacts/` or `assets/` (shared junction), and keep generated files under the gitignored artifacts tree.
  Blender runs headless (`C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`), one render job on the GPU at a
  time.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to `prompts/AI_DONE_buildings_651_CITY_reusable_city_and_hero_compositions_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change
- Include the parity table (view, mean and max difference, verdict) and the render time per still for the legacy scene
  and the composition, same machine and samples

# Completion (2026-10-17)

User addendum at the start: "use the latest city from terra & mar as the reference, do not use the older city used for
bradbury". The city is therefore the Terra & Mar city: the Bradbury scene's sections plus the third-pass modelled
neighbours (`city_neighbours.py` as the Terra & Mar session left it in the working tree), and the Bradbury composition
shows that city too.

## Summary

- **Reusable city.** `authoring/city/build_city.py` (copied sections of `build_scene.py`) writes
  `tests/artifacts/blender/city/city.blend` and `site.json`. The site is left empty, with no sun and no cameras.
  `SITE_FURNITURE` (vault covers, lantern post) is its own collection, and the city has its own copy of the context
  library. Wheel wear is cleared under the site.
- **Light units.** The world's two Backgrounds, the haze Emission and the neighbours' hall lights multiply by the
  composition's `city_light_scale` (View Layer attribute; absent = 1 via the attribute's Alpha). This was verified
  first in Cycles on a linked world and a linked node group, so the world is linked, not appended.
- **Neighbours.** `city_neighbours.py` moved into the city with the light-scale hook and `city_weather` (absent 1,
  0 off) on `NB_weather`. The front line is the union of both heroes' cameras (`city/front_line.py` on each
  composition): `city_bld_1003` and `ctx_far_tan2` were added, so 41 buildings are modelled.
- **Block kit.** `city/block_kit.py`: the kerb profile, curb returns, pavement and kerb, `full_block()` (Bradbury) and
  `lotted_block()` (Terra & Mar: the parking lot and bays), in the city's linked materials.
- **Composition helpers.** `city/city_compose.py`: link the city, set the light units and the sun from `site.json`, the
  film, the cameras.
- **Bradbury composition.** `BradburyBlock/build_composition.py` writes
  `portal_project/bradbury_city_composition.blend` in 2 s.
  - It links the city with `SITE_FURNITURE`, lays the full kerb rectangle, links the worn block by its collections
    (an excluded `BRADBURY_SOURCE` shelf), and gathers its objects into a local `BRADBURY_BLOCK` for
    `wear.controls.organise()`. The wear layer can only switch local collections, so a block that adds objects needs
    the composition rerun, and `render_composition.py` warns when that happens.
  - It adds sun 8 at scale 1 and exposure 0, the six `build_scene.py` cameras, and the wear, edge and realism
    controls with the stale check.
  - New copies beside the originals: `render_composition.py` (stills), `render_composition_wear.py` and
    `render_composition_flyover.py` (own output folder).
- **Terra & Mar composition.** `terramar_recessed/city/build_composition.py` writes
  `terramar_city_composition.blend` in 3 s. It links the city, lays the lotted block, instances the parts as before,
  and runs the site-props check (0 off the sidewalk). It sets scale 19.569 and exposure -4.2905, and the `tm_wear`
  switch. `furniture=1` also links the Bradbury's site furniture.
- **Terra & Mar wear in the composition.** `composition_wear.py` instances each `TM_WEAR_<feature>` collection (and
  `TM_WEAR_DEBUG`) on its own, and shows an instance only while that feature is on. In the legacy copy the whole
  `TM_WEAR` was one instance, so strength 0 never removed an overlay.
- **Terra & Mar scripts.** `city_common.CITY_BLEND` now points at the composition, so `render_city_shots.py` and
  `render_flyover.py` open it; `wear=` goes through `composition_wear`. The legacy copy is
  `LEGACY_CITY_BLEND`, still written by `build_city_scene.py`.
- **Tooling.** `parity_render.py` (OptiX only, `seed=`) and `parity_compare.py`; `weather_check.py` and
  `weather_report.py` (per-pixel ray labels: hero, neighbour, city).
- **Docs.** `city/README.md`, a "The city composition" section in the Bradbury README, and the Terra & Mar city
  README (commands, legacy list, third-pass neighbours).

## Parity (1280 px wide, 128 spp, OptiX alone, seed 0, denoised; 8-bit levels, all channels)

The noise floors:

- **Repeat.** The same file rendered twice gives a mean of 0.006-0.011 and a max of 1-2.
- **Decorrelated.** The legacy file at seed 1 against seed 0 gives a mean of 1.0-1.5, a max of 73-120, and 2-5% of
  pixels over 8.

A composition is a different scene structure (linked IDs, object order, a node-driven world strength), so its
samples are partly decorrelated. A residual between those two floors is sampling noise.

| Hero | View | Mean | Max | Pixels >8 | Verdict |
| --- | --- | --- | --- | --- | --- |
| Bradbury (city `neighbours=off`) | ref_3q | 0.092 | 12 | 0.001% | pass: noise (seed floor 1.29 / 120) |
| Bradbury | hero_3q | 0.084 | 11 | 0.001% | pass: noise (1.17 / 73) |
| Bradbury | st_corner | 0.036 | 8 | 0.000% | pass: noise (1.00 / 94) |
| Terra & Mar (as built, no site furniture) | ref_3q | 0.125 | 214 | 0.066% | expected: the legacy copy still had the Bradbury's 4 vault covers and lantern post on its sidewalk |
| Terra & Mar | rear_3q | 0.123 | 65 | 0.008% | expected: the same (the lantern post) |
| Terra & Mar | entrance | 0.209 | 111 | 0.038% | expected: the same (the post's reflection in the glass) |
| Terra & Mar, `furniture=1` | ref_3q | 0.094 | 15 | 0.006% | pass: noise (seed floor 1.49 / 100) |
| Terra & Mar, `furniture=1` | rear_3q | 0.119 | 11 | 0.001% | pass: noise (1.35 / 80) |
| Terra & Mar, `furniture=1` | entrance | 0.203 | 15 | 0.012% | pass: noise (1.31 / 119) |

Render time per still, same machine and settings (legacy / composition): ref_3q 31.2 / 30.8 s, hero_3q 27.9 / 27.5 s,
st_corner 24.7 / 24.5 s for the Bradbury; ref_3q 26.3 / 27.3 s, rear_3q 27.3 / 26.9 s, entrance 33.0 / 33.0 s for
Terra & Mar.

Evidence is in `tests/artifacts/screens/city_reuse/` (all gitignored):

- `parity_bradbury/` and `parity_terramar/`: `*_parity.png` and `*_parity_with_furniture.png` are the
  [legacy | composition | difference x8] composites; `*_noise_floor.png` and `*_noise_seed1.png` are the floors;
  `zoom_diffs.png` shows the furniture spots.
- `logs/`: the build and render logs.

## Weathering checks (960 x 540, 128 spp, OptiX, seed 0; changed = more than 3 levels against the base)

The views each show the hero and modelled neighbours. Bradbury: from (29, -34, 2) looking up Broadway. Terra & Mar:
from (29, -34, 2) at the entrance corner. Shares are of the changed pixels.

| Composition | Switch | Changed px | On hero | On neighbours | On city | Note |
| --- | --- | --- | --- | --- | --- | --- |
| Bradbury | base again | 0 | | | | repeatable |
| Bradbury | `wear` off | 54,554 | 97.5% | 0.5% | 1.9% | bounce off the changed facade |
| Bradbury | `wear` debug | 327,327 | 43% | 32% | 24% | bounced light only (see below) |
| Bradbury | `city_weather` 0 | 6,099 | 0.1% | 95.5% | 4.4% | |
| Bradbury | `tm_wear` 0 | 0 | | | | another namespace: nothing |
| Terra & Mar | base again | 0 | | | | |
| Terra & Mar | `tm_wear` off | 15,016 | 97.2% | 0% | 2.8% | |
| Terra & Mar | `tm_wear` debug | 208,445 | 93.0% | 0.5% | 6.3% | |
| Terra & Mar | `city_weather` 0 | 2,574 | 3.7% | 88.0% | 7.1% | |
| Terra & Mar | `wear` 0 | 0 | | | | another namespace: nothing |

The Bradbury debug view turns the red-brick facade into clay and pastels, so the tower across Broadway loses the pink
light it bounces. Rerun with direct light only (`bounces=0`, `weather_bradbury_direct/`), debug changes 7 neighbour
pixels (0.01% of them) and `wear` off changes none. The neighbours' and the city's materials never read the hero's
namespace. The remaining "city" pixels sit at the hero's silhouette, where the labels are quarter resolution, and on
its contact shadows. Composites are in `weather_bradbury/`, `weather_bradbury_direct/` and `weather_terramar/`.

## One city, two heroes

The city was rebuilt once with the neighbours on and the union front line (41 buildings). Both compositions were then
opened as they were, not rebuilt, and rendered: four UHD stills each, in `tests/artifacts/screens/city_reuse/final/`.
The Bradbury, built and checked against the boxes city, now stands among the modelled neighbours. Terra & Mar picks up
the two newly modelled buildings.

## Notes and open points

- The worn Bradbury block is older than `bradbury_block.blend` (saved 2026-10-12 16:28, after the legacy scene was
  built at 13:47 from the same worn file). The Bradbury composition was built with `wear_stale=ok`, as the legacy
  scene effectively was. Rerunning `wear_layer.py` brings it up to date, and changes the legacy scene's input too.
- `city_neighbours.py`'s third pass (balconies, plain tower, brick trims) was uncommitted work by the Terra & Mar
  session. The city's copy carries it, and the Terra & Mar original is left as that session left it.

## Legacy files proposed for retirement (not deleted; the user decides)

- `BradburyBlock/build_scene.py`, `render_wear.py` and `render_flyover.py` (the composition copies replace them).
- `bradbury_scene.blend` and its `_wear_off` / `_wear_debug` variants and `.blend1` files.
- `portal_project/context_library.blend` (the city has its copy; `build_context.py` still writes the old path).
- `terramar_recessed/city/build_city_scene.py`, `city_ground.py`, `city_neighbours.py`, `front_line.py`, and
  `terramar_city_scene.blend`.
- The backup `C:\Users\rogel\Projects\bus_simulator_backups\2026-10-17_city_reuse\` is untouched.
