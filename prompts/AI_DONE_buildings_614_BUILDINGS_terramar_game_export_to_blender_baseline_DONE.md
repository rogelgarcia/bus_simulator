DONE

# Problem

The Bradbury Block now has a Blender version that copies the real building. It started as a
straight export of the game model (`tests/artifacts/blender/bradbury/before/bradbury_block_before.blend`)
and was then improved in separate Blender files. Those files feed a render scene and a phone
flyover. The next building to get this treatment is **Terra & Mar**.

The game version to start from is the latest one, **`terramar_recessed`** (display name “Terra & Mar
— Recessed Balconies”). The user confirmed this from a screenshot on 2026-10-12. It shows rounded
balcony corners where the front meets the chamfers and windows set back behind the glass guards;
both exist only in this variant. The variant inherits its massing, podium, entrance, signs,
materials, penthouse and roofs from the original `terramar` config.

There is no Blender file for it yet, and the Bradbury export only half supports other buildings:
the spec reads `BUILDING_ID`, but it still writes into the `bradbury` folder and names the group
`BRADBURY_BLOCK`.

This prompt covers only the first step: get Terra & Mar out of the game and into a new, clean
Blender baseline that later work can build on. Improving the model, placing it in a city scene and
rendering a flyover come later, in their own prompts.

# Request

Export `terramar_recessed` from the game, exactly as the game builds it today, into a new Blender
file. Make the file well organized, documented and checked against both the game and the reference
images, so it can be improved piece by piece the way the Bradbury was. The game is used only as the
exporter. Do not change any engine code, building config or catalog entry to make the export look
better.

Tasks:
- Export `terramar_recessed` through the `building_showcase` harness, unmerged, so every part keeps
  its fabrication role. Use the same filtering rules as the Bradbury export (no shadow-only meshes,
  no off-camera-layer meshes, instanced meshes expanded, mesh names `<role>__<n>`). Write a GLB and
  a JSON parts manifest under `tests/artifacts/blender/terramar_recessed/<tag>/`. **Copy-only rule
  (user, 2026-10-12): nothing from the Bradbury may be edited or overwritten.** Every Bradbury file
  this work reuses (the export spec, `link_game_textures.py`, the README conventions) is copied into
  a Terra & Mar file and adapted there; the Bradbury spec, scripts, `.blend` files and artifacts stay
  byte-for-byte as they are.
- Capture the current game version for comparison: front, three-quarter, and an aerial view close to
  the aerial reference's framing. Use the HDRI and lighting from
  `terramar_recessed_capture.pwtest.js`. Save to
  `tests/artifacts/screens/buildings/terramar_recessed/blender_export/game/`. The captures from
  2026-09-02 already in `tests/artifacts/screens/buildings/terramar_recessed/` are older than the
  AI 549 architectural glass (`fe767bdf`) and the removal of the parallax interiors (`de7af7ff`),
  both from 2026-09-18, so they no longer show the current game.
- Build the baseline file
  `tests/artifacts/blender/terramar_recessed/before/terramar_recessed_before.blend`:
  - It is the model as extracted. Once accepted it is never edited. Later improvements go in
    separate files next to it, following the Bradbury before/after rule.
  - Units are metres, z is up, and the frame is documented. The Blender origin should be the
    config's footprint origin at ground level, so the spec's plan tables map straight across:
    config (x, z) → Blender (x, −y), and the front run A faces Blender −Y. If the exported
    coordinates are offset from the config frame (the showcase moves footprints onto its build
    site), measure the offset and remove it.
  - The whole building sits under one top-level collection (for example `TERRAMAR`), so a future
    render scene can link it the way `build_scene.py` links the Bradbury block.
  - Parts are sorted into element collections that match the inventory below (ground storefronts,
    entrance volume, signage, upper podium and its terrace, residential walls and piers, loggias and
    their slabs/belts, balcony platforms, guards and rails including the rounded corner pieces,
    windows and glazing, interiors, penthouse, roofs and parapets, anything else). Object names keep
    their role tags.
  - Materials are named by family (limestone, sandstone brick, bronze/charcoal frames, warm reveal,
    soffit/loggia ceiling, storefront glass, residential glass, guard glass, concrete, lettering, …)
    instead of the importer's `MAT_n_MeshStandardMaterial`, so each family can be swapped later.
  - Textures point at the game's own files under `assets/public/pbr` with relative paths instead of
    being packed into the file, as `link_game_textures.py` does for the Bradbury; its material list
    is hardcoded to Bradbury, so it needs to cover Terra & Mar's sets: `limestone_smooth`,
    `seaworn_sandstone_brick`, `bronze_anodized_panel`, `rough_concrete`, plus whatever the floor
    plates and glass use. Maps the game only creates at runtime may stay packed; list which ones.
    Nothing may be written into `assets/`.
  - It has an `INSPECTION_RIG` collection with the game's HDRI (`german_town_street_2k`) as world
    light and background, and cameras matching (a) the street-level front reference `b8.png` and
    (b) the aerial reference, plus a three-quarter view and a low close-up looking up from the base.
- Make the export reproducible. Put the import / organize / relink / rig steps in tracked scripts
  under `src/graphics/content3d/buildings/authoring/terramar_recessed/` (one
  `authoring/<ConfigName>/` folder per `configs/<ConfigName>.js`), with a README that lists the
  commands, the frame, the collections, the material families, the counts and the known gaps.
  Starting from nothing, the documented commands must rebuild the same baseline.
- Check the baseline against the game and report the results:
  - mesh and triangle counts match the manifest, and every manifest role is present;
  - overall bounds match the spec: podium 28 × 22 m, residential walls 25 × 19 m (loggia backs
    1.5 m in), penthouse 10 × 7.5 m shifted 1.5 m to the rear, an occupied stack of 29.45 m, and
    about 31 m to the top parapet;
  - glazing, balcony guards and storefront glass arrive as see-through glass, not opaque grey;
  - the rounded balcony corners come through as curved geometry, not as gaps or straight stubs;
  - both lettering lines (`TERRA & MAR`, `COASTAL KITCHEN`) are present and readable over the
    entrance;
  - no asset texture is still packed.
- Run the Bradbury-style collision / z-fight audit (pairwise BVH overlap, coplanar vs penetrating
  faces) on the baseline and record the findings in the README. **Report only; fix nothing.**
- Render the rig's views from the baseline and produce one comparison sheet per reference view,
  laid out as [reference | game capture | Blender baseline]. Save them under
  `tests/artifacts/screens/buildings/terramar_recessed/blender_export/`. Copy every reference used,
  unaltered, into `tests/artifacts/screens/buildings/terramar_recessed/references/`. Only `b8.png`
  is there now; the three annotated copies are in the `terramar` folder and the unannotated aerial
  is only in the user's Downloads folder.
- Write the element inventory and a gap list (reference vs baseline) into the README. That list is
  the starting point for the later improvement prompts. Do not act on it here.

## Identified resources

### Game version

| What | Where |
| --- | --- |
| **Export target**: `TERRA_MAR_RECESSED_BUILDING_CONFIG`, id `terramar_recessed`, display “Terra & Mar — Recessed Balconies” | `src/graphics/content3d/buildings/configs/terramar_recessed.js` |
| Parent config it derives from (`TERRA_MAR_BUILDING_CONFIG`, id `terramar`). Not exported unless the user asks | `src/graphics/content3d/buildings/configs/terramar.js` |
| Catalog registration (both ids) | `src/graphics/content3d/catalogs/BuildingConfigCatalog.js` |
| Authored reference contract (dimensions, runs A–H, floor stack, materials, balcony links, the recessed variant's section, uncertainties) | `specs/buildings/TERRAMAR_REFERENCE_FACADE_SPEC.md` |
| Related contracts | `specs/buildings/BUILDING_2_BALCONY_CONTINUITY_SPEC.md`, `specs/graphics/architectural_glass.md` |
| Game capture spec (HDRI, sun, camera framings, plus a smooth-junction close-up) | `tests/headless/visual/specs/terramar_recessed_capture.pwtest.js` |
| Config unit tests | `tests/node/unit/terramar_recessed_config.test.js`, `tests/node/unit/terramar_config.test.js` |
| PBR sets the configs name | `pbr.limestone_smooth`, `pbr.seaworn_sandstone_brick`, `pbr.bronze_anodized_panel`, `pbr.rough_concrete` |
| City placement | none: no city spec places either Terra & Mar id yet (`BigCity2Spec.js` places only `bradbury_block`) |

Massing, from the spec (shared by both ids): an eight-floor occupied stack. Ground retail 4.8 m,
upper podium 4.3 m, five residential floors at 3.35 m, and a detached 3.6 m penthouse. The podium is
a clipped octagon (28 × 22 m). The residential loop is a clipped octagon inset about 1.5 m
(25 × 19 m). Between them sit zero-height terrace roofs, and the final roof follows the penthouse.
The eight runs are A (front) to H, and the annotation letters are not canonical (the annotations'
left “E” is the config's H).

What the recessed variant changes:
- Every balcony bay on the residential floors becomes a `balcony.modern_recessed` loggia, 1.5 m deep,
  with the window at the back and the glass guard on the facade line.
- The residential belt shrinks from 1.5 m to 0.12 m.
- The three AI 537 continuity links (A–B, A–H, rear E–D) each get a rounded corner transition with
  linked 0.42 m runouts. Only the platform edge, fascia, guard and rail curve; the walls stay
  straight.
- The rear runs mirror the front: C reuses G reversed, D reuses B reversed, E reuses A reversed, F
  reuses H.
- The podium restaurant terrace still projects.

### Reference images

All of them are AI-generated concept images of an invented building, not photos of a real one. Use
them for proportions and character only. There are no real photos to look up.

| Image | Where | Notes |
| --- | --- | --- |
| `b8.png`: street-level front, near-frontal corner perspective (1122 × 1402) | `downloads/references_ideas/b8.png` (artifact copies in both `tests/artifacts/screens/buildings/terramar/references/` and `.../terramar_recessed/references/`) | Main source; SHA-256 `EA6A4379…D160B` (full hash in the spec) |
| Unannotated aerial (1122 × 1402) | `C:\Users\rogel\Downloads\ChatGPT Image Aug 30, 2026, 10_03_58 PM.png`, SHA-256 `b2bef9d4bf9168fb2ba074541cd1cb92d35c411da83b9943f9ee8cb7f3cd4989` | The picture the three annotations were drawn on. It is **only** in the user's Downloads folder, so copy it into the artifact references folder without altering it |
| `annotated-pillars-balconies.png` | `tests/artifacts/screens/buildings/terramar/references/` | Pier positions on A, balcony runs on the chamfer, sign position |
| `annotated-faces-penthouse.png` | same folder | Face letters + roof-terrace outline |
| `annotated-curved-face-option.png` | same folder | Rounded-corner option for the residential outline |

### Bradbury pipeline this mirrors

| Step | Bradbury source |
| --- | --- |
| Export spec (GLB + manifest, unmerged, role-tagged) | `tests/headless/visual/specs/bradbury_blender_export.pwtest.js` |
| Texture relink (packed → game asset files, V-mirror mapping) | `src/graphics/content3d/buildings/authoring/BradburyBlock/link_game_textures.py` |
| Authoring folder layout and README conventions | `src/graphics/content3d/buildings/authoring/BradburyBlock/` |
| Baseline file pattern | `tests/artifacts/blender/bradbury/before/bradbury_block_before.blend` (+ `.glb`, `.json`) |
| Later stages (not this prompt) | `assemble_building.py`, `build_scene.py`, `build_context.py`, `render_flyover.py`, wear layer |

Lessons from the Bradbury export that carry over:
- Run the visual config against a private static server for this worktree; port 4173 may be serving
  another checkout. Pass `PLAYWRIGHT_EXECUTABLE_PATH` on this machine.
- three.js (x, y, z) → Blender (x, −z, y). Import with `merge_vertices=False`, and quiet the glTF
  importer's per-node INFO logging so MCP results stay readable.
- A freshly linked or opened object only reports its true `matrix_world` after
  `view_layer.update()`. Measure after the update.
- The BF2 merged shadow caster is a full duplicate of the building's geometry. It has to be filtered
  out of the export.
- Blender: prefer the headed session through MCP. If it is busy, fall back to isolated headless
  Blender, whose path comes from the gitignored `tools/baking/blender.local.json`. That file is
  missing from this worktree, but sibling worktrees have one (Blender 5.2.1 portable). If neither is
  available, follow the AGENTS.md rule for a busy Blender.

## Element inventory (reference → game)

Each line names a reference element and the game feature that should carry it. The README should
link each one to its baseline collection and mark it **present**, **simplified** or **missing**.
Nothing gets fixed in this prompt.

- **Podium, ground floor:** pale limestone frame; full-height restaurant storefronts with slender
  charcoal mullions on the chamfers and sides; a projecting glazed entrance volume (about 1.15 m)
  on A with a double door, sidelights and transom. The reference also shows dark sloped awnings over
  the side storefronts, which the config has none of (expected: missing).
- **Signage:** `TERRA & MAR` (serif, about 0.50 m) over `COASTAL KITCHEN` (about 0.22 m), dark
  bronze, centred over the entrance on A. The game draws them in a copper/orange tone, which needs
  checking against the reference's dark bronze.
- **Upper podium:** full-height glazing, a centred projecting terrace with a glass guard over the
  entrance volume, and a strong pale slab/parapet line. The reference's planter boxes along the
  podium terrace are not in the config (expected: missing).
- **Residential floors (×5):** front A is split loggia / pier / centre loggia / pier / loggia, with
  0.65 m piers. Chamfers B/H have an outer loggia, a centred pier and an A-adjacent loggia. The
  rear mirrors the front. Each loggia is 1.5 m deep with near-full-height sliders at the back and a
  glass guard with slim charcoal rails on the facade line. The guards and platform edges curve
  around the A–B, A–H and E–D corners, which gets closest to the reference's softly curved chamfer
  balconies; the walls behind stay faceted (curved walls deferred to AI 539). The reference shows
  warm wood reveals beside the centre bay and warm wood soffits; the game shows reddish brick
  reveals and near-black loggia ceilings and slab tops in the user's screenshot. Find out whether
  that dark tone comes from the material or the lighting, and record it.
- **Balcony furnishing:** the planters, plants, chairs and tables on every balcony are not in the
  game (expected: missing; context dressing, not facade geometry).
- **Upper roof terrace:** a perimeter glass guard on the residential roof, planters, small trees,
  lounge and dining groups, a pergola. The game has only a low pale ring and an empty deck (amenity
  population deferred to AI 538).
- **Penthouse:** a pale stone box with glazing between stone piers. The reference also shows a darker
  annex with a louvred/slatted roof and rooftop mechanical and solar equipment; the game has a plain
  box.
- **Materials:** pale limestone (`0xD3C5BA`-ish, no heavy grime), warm reveal/soffit
  (`0xB77948`-ish), charcoal/bronze frames (`0x343233`), cool glass (`0xD3E4E4` / `0xA2C4C7`).
- **Site context in the references (not building geometry):** a beachfront corner with palms,
  umbrellas and café tables, a paved plaza, crossings, an ocean promenade, and neighbouring
  mid-rises. Record it for the future city scene and flyover. It is not part of the export.

## Out of scope
- Fixing any gap, modelling new parts, adding planters, awnings, curved walls or roof amenities.
- Wear or weathering.
- Exporting the original `terramar` (projecting balconies) unless the user asks for it.
- The render scene, ground, context, city placement and the flyover. Keep the baseline linkable so
  those stages can use it later.
- Any change to engine code, building configs, catalog entries or shared assets. Only the test-side
  export code and the new authoring scripts change.
- Committing generated files. `.glb`, `.blend`, renders and sheets stay under the gitignored
  `tests/artifacts/`.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_buildings_614_BUILDINGS_terramar_game_export_to_blender_baseline_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change
- In the summary, list the baseline path, the export command, the rebuild command(s), the parity
  results (counts, bounds, glass, rounded corners, lettering, packed textures), the audit findings
  count, the comparison sheet paths, and the gap list's headline items

## Completion summary (2026-10-12)

- Export: new spec `tests/headless/visual/specs/terramar_recessed_blender_export.pwtest.js` (a copy of the Bradbury export spec, which is untouched) writes `tests/artifacts/blender/terramar_recessed/before/terramar_recessed_before.glb` + `.json` (696 meshes, 26,760 triangles, 24.5 MB), with the build-site offset, a per-material table with texture URLs and per-window shade coverage in the manifest.
- Game captures: new spec `terramar_recessed_blender_export_capture.pwtest.js` renders the current build from the five rig cameras into `tests/artifacts/screens/buildings/terramar_recessed/blender_export/game/`. It uses the game's own calibrated daylight. The older capture settings (sun 5.5, hemi 1.5, HDRI 0.84, still in `terramar_recessed_capture`) render nearly black since the 2026-09-10 lighting switch. The spec also waits out the baked-lighting view hold, rendering one frame per task.
- Baseline: `src/graphics/content3d/buildings/authoring/terramar_recessed/import_baseline.py` builds `tests/artifacts/blender/terramar_recessed/before/terramar_recessed_before.blend` (0.6 MB):
  - re-framed: config origin at the Blender origin, front A faces −Y, base z 0.201;
  - organized: one `TERRAMAR` collection with 14 element collections;
  - materials: 143 → 14 merged, named by family;
  - textures: 12 maps linked to `assets/public/pbr` (a copy of the Bradbury relink, pixel-matched); only the 2 runtime maps stay packed;
  - shades: the 110 window shades are hidden, because the game draws none of them (coverage 0);
  - rig: an `INSPECTION_RIG` with the game's calibrated sky, sun and exposure, five cameras and a ground plane.
- Parity: every check passes (`.parity.json`): objects and triangles equal the manifest, all 8 roles present, plan 28.34 × 23.42 m, top 32.162 m, all 3 glass materials see-through, both lettering lines present, the rounded corners curved, textures linked, shades consistent. The game's storeys measure taller than the spec's (residential 3.57 m against 3.35 m).
- Audit (report only, `.audit.json`): 586 objects, 1,061 intersecting object pairs and 26 coplanar face pairs (z-fight candidates: the linked-corner balcony platforms and guard glass on `wall__14`, one ground window part on `wall__0`). The rest are designed seats.
- Renders and sheets: `render_inspection.py` writes `blender_export/blender/`; `compose_sheets.py` writes `blender_export/sheets/sheet_ref_front_b8.png`, `sheet_ref_aerial.png` (reference | game | Blender) and `sheet_views_game_vs_blender.png`.
- References: all five references were copied unaltered (SHA-256 checked) into `tests/artifacts/screens/buildings/terramar_recessed/references/`, including the unannotated aerial from the user's Downloads (`aerial-unannotated.png`).
- README: `authoring/terramar_recessed/README.md` covers the rebuild commands, frame, collections, materials, rig, parity, audit, the element inventory and the gap list. Headline gaps:
  - faceted corners and thin slab edges where the reference is rounded and deep;
  - brick reveals where the reference has wood;
  - a bare roof deck and penthouse;
  - no awnings or planters;
  - copper-brown sign letters instead of dark bronze.
- Deviation from the request: the rig and captures use the game's current calibrated sky (`calibrated/clear-afternoon-55.hdr`) rather than `german_town_street_2k`. That HDRI renders black under the calibrated exposure.
- Environment: another session's uncommitted tree materials in the shared `assets/public/pbr/_catalog_index.js` stop the harness from booting on this branch. These runs served the index as committed at HEAD through a scratch proxy; nothing on disk was changed.
