# Layered substrate and ground-cover surfaces (AI 598)

# Problem

AI 577 made the landscape ground continuous, anti-tiled, physically scaled and lit like the game. By
design it uses one homogeneous base material per soil class. That rule is right for the base tiles,
but the soil classes are the only layer, so every class reads as a single surface:

- Grass reads as a uniform lawn at eye height (`tests/artifacts/screens/landscape/ai577/d5/views/final/d4-grass-near.png`).
- Forest soil, about two thirds of the land, reads as bare brown ground.
- The plan's exposed-rock band reads as a flat brown strip (`d5-coast-bluff.png`).

There is no distinction between what the ground is made of (substrate) and what grows or lies on it
(cover). So the landscape cannot show:

- stones or dirt showing through grass in small areas;
- moss on rock, or leaf and needle litter under trees;
- scree under steep faces, or strata on cliffs;
- pebble beaches, or wet algae rock at the bluff toe;
- worn paths.

The materials cannot follow geology because no geology exists until AI 596.

The references depend on this layering. R02 mixes moss, grass, rock and puddles. R03 has tall grass
with a stony dirt path. R06 has mud, sedge and pebbles. R10 has strata, a talus apron, cobbles and wet
sand. R08 shows pale rock breaking through a wooded slope.

# Request

Replace "one material per soil class" with a layered surface model driven by the AI 596 geology
channels and the existing terrain fields:

- a substrate layer: lithology and sediment;
- a cover layer with fractional coverage: living and organic material;
- wetness, disturbance and worn ground.

At a 2 m eye height the ground must read as varied natural surfaces. From a distance the same layers
must aggregate into the correct broad tones. This AI covers surfaces; geometry for plants, stones and
rocks comes from AI 602 and AI 603.

## Execution and scope

- Start only after AI 595 PROJECTMAINTENANCE (removing the landscape cache from Git history) is
  complete: it rewrites this branch and moves the landscape cache to a gitignored location. Generated
  landscape data (terrain revisions, pages, fields, channels, placement tiles, caches) is a local bake
  output that is never committed or sent through Git LFS. Commit recipes, small authored configuration,
  code, tests and specs. Paths written as `assets/public/landscape/` mean the cache location AI 595
  documents.
- Read `specs/landscape/LANDSCAPE_NATURAL_WORLD_ROADMAP.md` first. This AI owns layer L2 and the
  catena transitions in §7.
- It depends on AI 596's geology channels. Before those exist, use the current terrain fields for
  development only.
- Extend AI 577 through its documented contracts. Keep these working:
  - the homogeneous base-tile rule (`LANDSCAPE_BASE_MATERIALS.md`) and stochastic sampling;
  - physical scale and multiscale tiers;
  - the surface cache with its view-independent layer contract (`LANDSCAPE_APPEARANCE_RUNTIME.md`);
  - streaming budgets, semantic soil queries and old immutable revisions.
- Implement one deliverable at a time, using subagents with maximum reasoning. Verify and commit each
  completed deliverable.
- Use port 8002. Put evidence under `tests/artifacts/screens/landscape/ai598/<deliverable>/`. Composites
  are `[reference | before | after]` at the review poses.
- New imagery must be CC0, with source URL, author, license, physical size and hashes retained.
  Publish it through the registered `landscape/appearance` leaf or a new registered leaf. `assets/` is
  a shared junction, so never overwrite material assets used by other checkouts.
- Small-area variation must be explained by terrain or ecology fields: moisture, light, slope, soil
  depth, deposition, disturbance. Restrained multi-scale noise may add irregularity. Uniform speckle
  and "random blotches" are not acceptable; earlier procedural-noise weathering was rejected.
- Realism first, with budgets accounted and measured.

## Deliverables and dependencies

| Deliverable | Depends on | Usable outcome |
| --- | --- | --- |
| D1. Surface layer model | AI 596 channels | Versioned substrate/cover/wetness/disturbance model with samplers and diagnostics |
| D2. Material library expansion | D1 | Homogeneous CC0 materials for every substrate and cover class |
| D3. Small-area mixing and ecotones | D2 | Cover breaks to substrate at 0.2–5 m; catena transitions follow landforms |
| D4. Rock faces and strata | D3 | Strata-aligned faces, weathering streaks, ledges, talus aprons |
| D5. Worn ground | D3 | Procedural paths, animal tracks and trampled ground as surface layers |
| D6. Near-field relief evaluation | D4 | Measured decision on per-pixel relief for layered materials at 2 m |
| D7. Integrated acceptance | D6 | Comparisons, cache compatibility, performance, specs |

### D1. Surface layer model

- [x] **Model.** Define a versioned model and recipe for the surface:
  - **Substrate classes:** bedrock lithologies (layered coastal sandstone, harder caprock for
    escarpments), scree and gravel, colluvial dirt, alluvial silt and mud, dry, wet and compacted beach
    sand, dune sand, pebble and cobble beach, shell grit.
  - **Cover classes:** turf and grass sward, dry grass, moss, broadleaf litter, needle litter, lichen,
    intertidal algae, wrack.
  - **Per-pixel state:** cover fraction, wetness and disturbance.
- [x] **Derivation.** Derive the layers from the AI 596 channels (lithology, regolith depth, deposits,
  coastal zone, face mask) and the terrain fields (wetness, flow, sky view, shoreline distance,
  convexity). Planning-only cover keeps its natural inference.
- [x] **Samplers, diagnostics and overrides.** Provide exact renderer-independent samplers with GLSL
  mirrors and diagnostic views for each layer. Add data-only override hooks for later fine tuning.
  Semantic soil identity and queries do not change.
- [x] **Gate.** Diagnostic maps at NW-03, NW-05, NW-07 and NW-13 match the intended catena. CPU and GPU
  results agree within declared tolerances.

### D2. Material library expansion

- [ ] **New materials.** Add homogeneous CC0 materials for each new class: forest litter (broadleaf
  and needle), moss, dry grass, turf sward, gravel and scree, pebble and cobble beach, dirt and mud,
  sandstone strata, caprock, lichen rock, wet algae rock, shell grit.
- [ ] **Quality.** Each one meets the base-tile rule and has a calibrated physical scale, relief in ORM
  alpha, multiscale tiers and audit sheets at one-tile and repeated scale.
- [ ] **Gate.** Audit sheets show no conspicuous patches or tile-scale tonal drift. Provenance is
  complete.

### D3. Small-area mixing and ecotones

- [ ] **Cover breakup.** The cover fraction breaks up at 0.2–5 m scales according to the fields:
  - bare and stony patches on convex, dry or disturbed ground;
  - dirt under dense canopy;
  - grass in rock cracks and on ledges;
  - moss on shaded, moist rock and logs;
  - litter that thins at forest edges.

  Use the AI 577 height competition so raised substrate features poke through the cover naturally.
- [ ] **Ecotones.** Transitions follow the roadmap catena: swash, wet sand, dry sand, wrack, dune,
  scrub, bluff, heath, woodland edge, forest. They are not wide alpha fades.
- [ ] **Gate.** 2 m composites at NW-01, 03, 04, 05, 06 and 07 against R02, R03, R06 and R10. Aerial
  views at NW-10 and NW-11 keep coherent broad tones without new repetition (re-run the AI 577 D3
  repetition metrics).

### D4. Rock faces and strata

- [ ] **Strata.** Steep faces show lithology-aligned banding that follows the AI 596 strata index, not
  the slope projection axes.
- [ ] **Weathering and ledges.** Weathering streaks follow flow lines below ledges. Flat ledges catch
  soil and cover. Talus and scree aprons collect at the toe. A wet zone forms at the bluff toe and on
  the platform.
- [ ] **Blending contract.** Define how AI 602 cliff meshes match these materials: shared lithology
  parameters, colour and normal continuity, and a blending band.
- [ ] **Gate.** R10 composite at NW-03 and NW-04, and an escarpment comparison at NW-07.

### D5. Worn ground

- [ ] **Paths.** Generate trails and desire paths between points of interest: beach arrival, bluff
  tops, viewpoints, forest edges, the high city rim. Use least-effort routing over slope and cover.
  Add animal tracks and trampled patches.
- [ ] **Layer items.** Emit these as surface layer items through the AI 577 layer contract, with
  bounds, order, revisions and a pure GLSL chunk. They are deterministic and procedural, with no
  authoring. They feed the disturbance input that AI 603 uses to thin vegetation.
- [ ] **Gate.** Paths read as natural at NW-02 and NW-04 (compare R03). They never cross the swim zone
  or road surfaces illogically.

### D6. Near-field relief evaluation

- [ ] **Measure.** Re-evaluate per-pixel relief (parallax or height-derived normals) for the layered
  materials at 2 m: pebbles, litter and gravel. AI 577 D4 rejected parallax after measuring only sand.
- [ ] **Decide.** Adopt it only for a measured visible gain at an acceptable cost. It must never alter
  authoritative heights or picking.

### D7. Integrated acceptance

- [ ] **Regressions.** Run all landscape suites with the surface cache on and off. The layers must live
  inside the cached surface with the exact near pass intact.
- [ ] **Performance and compile.** Record same-condition performance and residency tables. Assess the
  impact on cold compile time.
- [ ] **Specs.** Update the appearance and runtime specs, add a canonical `LANDSCAPE_SURFACE_LAYERS.md`,
  and update the roadmap status.

## Evidence and measurements

- **Captures.** Matched captures at the review poses, material audit sheets, layer diagnostics, and
  `[reference | before | after]` composites.
- **Performance.** Report frame time, FPS, GPU time, compile time, CPU and estimated GPU bytes, and
  uploads, with full benchmark conditions. Mark missing metrics as not measured, with a reason.

## Research basis

- Epic [landscape materials and layer blending](https://dev.epicgames.com/documentation/en-us/unreal-engine/landscape-materials-in-unreal-engine) and [runtime virtual texturing](https://dev.epicgames.com/documentation/en-us/unreal-engine/runtime-virtual-texturing-in-unreal-engine).
- Ubisoft, [Procedural world generation of Far Cry 5](https://www.sidefx.com/learn/talks/procedural-world-generation-far-cry-5/): terrain texturing driven by biomes and water flow.
- Houdini [heightfield layers](https://www.sidefx.com/docs/houdini/heightfields/layers.html): sediment, debris and flow layers as texturing inputs.

## Completion record

Record each deliverable here when it passes: a summary, spec and source locations, validation results,
measurements, limitations and artifact paths.

### D1. Surface layer model — delivered 2026-10-15

**Summary.** `landscape-surface-model-v1` (`src/app/landscape/surface/`, canonical spec `specs/landscape/LANDSCAPE_SURFACE_LAYERS.md`): eleven
substrate classes (sandstone, caprock, scree, dirt, mud, sand, wet-sand, compacted-sand, dune-sand, cobble, shell-grit) and nine cover classes
(none, turf, dry-grass, moss, broadleaf-litter, needle-litter, lichen, algae, wrack) with a per-pixel cover fraction, wetness and disturbance,
derived per pixel from the six display soil weights, the terrain fields, every AI 596 geology channel (the categorical labels as one-hot
fractions of the four nearest aligned samples, the lithology unwrapped to the stratum hardness), the fragment's slope and height, the
landscape-scale appearance layer (catena moisture, coastal reach) and the disturbance (0 until D5). The derivation is a data recipe
(`landscape-surface-recipe` schema 1, default `coastal-surface-v1`, identity `surface-recipe-75bb6c2b23a7066a08c0550a`): per soil, rules of base × product of smoothstep terms
feed class weights that normalize per soil, the cover fraction and the wetness; every input has a documented neutral, so unbound sources leave
the soil defaults. The geology sidecar streams into the terrain-field array as three layers per native slot (two field layers, one packed
categorical layer read with `texelFetch`; seven layers per page, flag bits for geology, overrides and the model), so the model adds no sampler
and no uniform: its tables are compile-time defines of the GLSL mirror `chunks/landscape/surface_model.glsl`, compiled into the diagnostics
variant only until D3 composites materials. Data-only overrides (`landscape-surface-overrides` schema 1: regions with class pins, a cover-fraction
scale and a wetness offset) apply after the procedural pass and reach the GPU through one root-grid override layer rasterized in the appearance
worker. Five inspection views (`surface-substrate`, `surface-cover`, `surface-fraction`, `surface-wetness`, `surface-disturbance`), the
`surfaceSample(x, z)` mirror hook, `setSurfaceModel({mode, overrides})`, `snapshot().surface`, the viewer options `landscapeSurfaceModel=on|off`
(the A/B of the model) and `landscapeSurfaceOverrides=<url>`, and the capture tool's `--diagnostic` and `--surface-model` options.

**Spec and sources.** `specs/landscape/LANDSCAPE_SURFACE_LAYERS.md` (new, canonical), `LANDSCAPE_TERRAIN_FIELDS.md` (the geology layers of the
array), the roadmap status; `src/app/landscape/surface/{SurfaceModel,SurfaceRecipe,SurfaceInputs,SurfaceDerivation,SurfaceOverrides,index}.js`,
`src/graphics/engine3d/landscape/LandscapeSurfaceModel.js`, `LandscapeTerrainFieldPages.js`, `LandscapeAppearanceWorker.js`,
`LandscapeAppearanceStreamer.js`, `LandscapeTerrainDiagnostics.js`, `LandscapeShaderLoader.js`, `terrain.frag.glsl`,
`chunks/landscape/surface_model.glsl`, `LandscapeView.js`, `main.js`, `LandscapePanel.js`, `tools/landscape_review/capture.mjs`.

**Validation.** `tests/node/unit/landscape_surface_model.test.js` (11 tests: validation and rejections, identity order independence, the
catena cases, the one-hot and hardness helpers, neutral output, overrides and the override layer, the GLSL table mirror); the landscape unit set
681 / 681 green. `tests/headless/e2e/landscape_surface_model.pwtest.js` on coastal v3, 2 / 2 with the surface cache on and off, and 2 / 2 again
with the cache on after the recipe tuning (`tests/artifacts/screens/landscape/ai598/d1/browser/`): geology `active`, 17 × 7 layers, the array 32,698,080 bytes GPU under the 94 MiB fields
ceiling, peak upload 2,179,872 bytes per frame, GPU readbacks of the five views within 0.6 sRGB bytes of the JavaScript mirror at the berm,
foredune, talus, bluff-toe, forest-interior and escarpment points, override pins byte-exact, the off switch neutral, coastal v2 `absent` with no
console error; `landscape_terrain_fields` 3 / 3 and `landscape_terrain_appearance` 4 / 4 on v2 unchanged. Pixel gate (`d1/pixel-gate.json`): the
default program is unchanged against the before set at NW-01, 03, 05, 07 and 13 (mean ≤ 0.031 sRGB bytes, worst 32-pixel block ≤ 2.23). Gate
sheets `d1/sheets/NW-03.png`, `NW-05.png`, `NW-07.png`, `NW-13.png` (`[shaded | substrate | cover | fraction | wetness]`, `legend.png`) show the
intended catena: sand, compacted sand and a narrow wrack line on the beach with dune sand and sparse dry grass on the foredune, cobble at the bluff
toe, sandstone and caprock bands following the strata dip on the bluff and escarpment faces with scree on the talus benches and lichen on the
stable faces, dirt under closed broadleaf litter in the forest interior, turf over dirt on the grass districts, mud and moss in wet hollows, and
dry graded flats and plateaus.

**Measurements** (`d1/costs.json`, RTX 3060 shared at 6–26 %): field array 18,801,396 → 32,698,080 bytes GPU (33,515,532 CPU) at 17 native slots;
upload per native page 1,089,936 → 1,907,388 bytes (root page with the appearance layer 2,179,872); the diagnostics program variant links in
25–35 s cold (every inspection view in one variant; the default program's compile is untouched); the default program's frame is unchanged.

**Limitations.** The one-hot ramps of the categorical inputs are one native sample wide and straight until D3's breakup; the diagnostics
variant's cold link time; the low lighting tier evaluates neutral views (no fields); planning cover keeps the natural inference soil (the
catena's planning exclusion reaches the model through `catenaMoisture`); materials are not drawn until D3.

## On completion

- Mark the first line DONE only after D1–D7 pass.
- Rename to `prompts/AI_DONE_codex_landscape_598_MATERIAL_layered_substrate_and_ground_cover_surfaces_DONE.md`.
- Keep it in `prompts/`; do not archive automatically.
- Add a one-line summary per completed change, focused validation results, before/after performance
  tables with conditions, and artifact paths. Update the roadmap status table.
