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

- [ ] **Model.** Define a versioned model and recipe for the surface:
  - **Substrate classes:** bedrock lithologies (layered coastal sandstone, harder caprock for
    escarpments), scree and gravel, colluvial dirt, alluvial silt and mud, dry, wet and compacted beach
    sand, dune sand, pebble and cobble beach, shell grit.
  - **Cover classes:** turf and grass sward, dry grass, moss, broadleaf litter, needle litter, lichen,
    intertidal algae, wrack.
  - **Per-pixel state:** cover fraction, wetness and disturbance.
- [ ] **Derivation.** Derive the layers from the AI 596 channels (lithology, regolith depth, deposits,
  coastal zone, face mask) and the terrain fields (wetness, flow, sky view, shoreline distance,
  convexity). Planning-only cover keeps its natural inference.
- [ ] **Samplers, diagnostics and overrides.** Provide exact renderer-independent samplers with GLSL
  mirrors and diagnostic views for each layer. Add data-only override hooks for later fine tuning.
  Semantic soil identity and queries do not change.
- [ ] **Gate.** Diagnostic maps at NW-03, NW-05, NW-07 and NW-13 match the intended catena. CPU and GPU
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

## On completion

- Mark the first line DONE only after D1–D7 pass.
- Rename to `prompts/AI_DONE_codex_landscape_598_MATERIAL_layered_substrate_and_ground_cover_surfaces_DONE.md`.
- Keep it in `prompts/`; do not archive automatically.
- Add a one-line summary per completed change, focused validation results, before/after performance
  tables with conditions, and artifact paths. Update the roadmap status table.
