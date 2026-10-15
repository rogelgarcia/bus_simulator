# Procedural ecosystem scatter engine (AI 599)

# Problem

The references get their richness from hundreds of thousands to millions of placed objects: trees,
shrubs, rocks, grass clumps, pebbles and litter, each placed by ecological rules. The landscape has no
system that can place or draw them.

What exists today:

- **Dressing inputs.** `LandscapeDressingInputs.js` returns unit suitabilities for grass, shrubs,
  trees, rock scatter and beach debris. It is a contract only; nothing places objects.
- **Placement and culling.** There is no Poisson or blue-noise sampler, no instancing manager, no HLOD
  and no GPU culling. The renderer is WebGL2 only, with no compute shaders.
- **City trees.** These are per-tile clones of FBX templates, with no instancing, LOD or streaming.
- **Content-layer streaming.** It is reserved in the specs (`LANDSCAPE_PLANNING_REPORTS.md` "Future
  content-layer residency", `LANDSCAPE_STREAMING.md` leases, `LANDSCAPE_MODEL.md` attachment channels)
  but not implemented. Manifest `attachments` must still be empty.
- **Tree LODs.** The tree catalog's LOD5 impostor rewrites per-object vertices on the CPU every camera
  update, so it cannot be instanced as written.

# Request

Build a deterministic, rule-driven, streamed placement and instanced-rendering framework for natural
content. It is this project's equivalent of UE PCG with Biome Core, Gaia spawners and Horizon Zero
Dawn's GPU placement. AI 601 (forests), AI 602 (rocks and cliffs) and AI 603 (ground vegetation and
clutter) use it. This AI delivers the engine and two proof layers; the content prompts deliver the
final ecosystems.

## Execution and scope

- Start only after AI 595 PROJECTMAINTENANCE (removing the landscape cache from Git history) is
  complete: it rewrites this branch and moves the landscape cache to a gitignored location. Generated
  landscape data (terrain revisions, pages, fields, channels, placement tiles, caches) is a local bake
  output that is never committed or sent through Git LFS. Commit recipes, small authored configuration,
  code, tests and specs. Paths written as `assets/public/landscape/` mean the cache location AI 595
  documents.
- Read `specs/landscape/LANDSCAPE_NATURAL_WORLD_ROADMAP.md` first. This AI owns the shared framework
  for layers L3–L6 and the procedural-first contract in §6.
- Development may start on the current terrain with synthetic fixtures. Final acceptance uses the AI 596
  terrain and channels, and the AI 598 cover outputs where they exist.
- Implement one deliverable at a time, using subagents with maximum reasoning. Verify and commit each
  completed deliverable.
- Keep domain models, rules and generation in `src/app/`, and rendering in `src/graphics/`. Offline
  generation runs as registered `landscape/*` bake leaves.
- Use port 8002. Put evidence under `tests/artifacts/screens/landscape/ai599/<deliverable>/`.
- WebGL2 only. Keep data layouts GPU-friendly so a later WebGPU path stays possible. Follow the shader
  file rules and keep compile cost measured.
- Respect the city's exclusion semantics (`TreePlacementExclusion.js`, `cityReservationsToLandscapeConstraints`)
  and the plan constraints in the roadmap §7.
- Realism first, with budgets accounted in the residency ledger and measured.

## Deliverables and dependencies

| Deliverable | Depends on | Usable outcome |
| --- | --- | --- |
| D1. Ecosystem recipe model | Existing landscape | Versioned, validated biome and layer rule sets with override hooks |
| D2. Deterministic hierarchical generation | D1 | Stable, artifact-free placements per cell, offline and at runtime |
| D3. Content-layer streaming | D2 | Placement tiles streamed through the landscape residency contracts |
| D4. Instanced renderer | D3 | Culled, LOD-selected, cross-faded instanced drawing with wind and shadow-caster hooks |
| D5. Proof layers at scale | D4 | Two real layers on the coastal terrain with measured scaling |
| D6. Integrated acceptance | D5 | Determinism, stability, budgets, specs and handoff |

### D1. Ecosystem recipe model

- [x] **Layers.** Define a versioned, validated recipe in which biomes are ordered sets of layers. Each
  layer declares:
  - its asset set, LOD chain and variation (scale, rotation and tint distributions);
  - footprint and clearance radii;
  - alignment: upright, slope-aligned, or partly sunk into the ground.
- [x] **Rule inputs.** Rules read:
  - AI 596 geology channels, terrain fields and AI 598 surface layers;
  - soil and cover;
  - slope, aspect, altitude, moisture, light and shoreline distance;
  - distance to roads, districts, water and other layers.
- [x] **Rule behaviour.** Rules express:
  - density curves;
  - clustering and clumping: groves, companion species, parent and child patterns;
  - spacing and competition with priorities between layers;
  - inclusion and exclusion zones: plan reservations, road clearances, the swim zone, the open-view
    corridor.
- [x] **Overrides.** Provide data-only hooks for later fine tuning: region parameter overrides,
  include/exclude masks, and pinned or removed instance IDs. They apply in a documented order after
  generation.
- [x] **Gate.** Schema validation and rejection tests pass. A recipe round-trips through save and load.
  The existing dressing inputs map onto the new model without changing their documented meaning.

### D2. Deterministic hierarchical generation

- [ ] **Cell grids.** Generate on world-anchored cell grids sized per layer: large cells for trees and
  boulders, small cells for grass and pebbles. Distributions have blue-noise quality, with no grid
  artifacts and no seams at cell borders.
- [ ] **Ownership and stability.** Every feature is owned by exactly one cell, the one containing its
  anchor. Regenerating or editing a region changes only that region and its halo; instance IDs elsewhere
  stay stable.
- [ ] **Offline and runtime generation.** Large, static layers are generated offline in the bake. Dense,
  small layers are generated on demand at runtime, in workers or GPU passes. Where both Node and the
  browser evaluate a layer, they produce identical results.
- [ ] **Ecological simulation.** Provide an optional offline simulation (for example seed dispersal,
  competition, shade tolerance and age classes) that produces natural stand structure. It must be
  deterministic and bounded in time and memory.
- [ ] **Gate.**
  - Determinism hashes across repeat runs and between Node and the browser.
  - Seam and border tests.
  - Local-stability tests after edits.
  - Spatial-statistics checks: no lattice artifacts, and spacing distributions within the declared
    tolerance.

### D3. Content-layer streaming

- [ ] **Layer descriptors.** Implement the reserved content-layer residency. Each layer carries stable
  IDs, a revision or content key, bounds, its own spatial index, LOD and error semantics, and declared
  dependencies on terrain revisions, channels and halos.
- [ ] **Residency.** Use leases and priorities, CPU and GPU budgets, upload caps, cancellation and
  coarse coverage. Manifest attachment channels become supported, with the capability gating that the
  model spec requires.
- [ ] **Invalidation.** Terrain edits, recipe changes and override changes invalidate only the
  intersecting tiles.
- [ ] **Gate.**
  - Streaming routes (travel, zoom, teleport, fast turns) stay within budgets.
  - Low-budget profiles keep coarse coverage and report degradation explicitly.
  - Disposal returns everything to zero.

### D4. Instanced renderer

- [ ] **Drawing and culling.** Draw instanced batches per tile and LOD, with frustum and distance
  culling and stable LOD selection with hysteresis. Use dithered cross-fades instead of pops.
- [ ] **Impostors.** Support impostors that work with instancing. The existing per-object CPU-updated
  impostor must be adapted or replaced.
- [ ] **Terrain contact and hooks.**
  - Instances conform to the terrain using exact height queries, slope alignment and sinking.
  - Provide hooks for terrain blending: contact darkening and colour matching.
  - Provide a wind-animation hook and shadow-caster LOD and culling hooks for AI 600.
- [ ] **Inspection.** Diagnostics show instance identity, layer and rule trace when an instance is
  picked, plus density heatmaps and LOD colouring.
- [ ] **Gate.** No popping or swimming at normal travel speeds on the AI 577 camera paths. Terrain
  contact holds on slopes. Diagnostics match the resident data.

### D5. Proof layers at scale

- [ ] **Two layers.** Run two real layers end-to-end on the coastal terrain: a boulder layer on rock and
  bluff ground, and a shrub layer on scrub and woodland edges. Use placeholder assets if AI 602 assets
  are not ready yet.
- [ ] **Targets.** Declare target densities per km² for trees, shrubs, rocks, ground cover and clutter,
  derived from the references and the D1 rules.
- [ ] **Scaling.** Measure scaling at 1×, 2× and 4× the target counts: instances, draws, triangles,
  memory, upload, CPU and GPU frame time.
- [ ] **Gate.** Report scaling curves and the bottlenecks found, with a recommended budget for AI
  601–603.

### D6. Integrated acceptance

- [ ] **Regressions.** Run all landscape suites in both surface-cache modes, plus the new engine's Node
  and browser tests.
- [ ] **Measurements.** Record cold and warm loads, edit and revert invalidation, and same-condition
  performance tables.
- [ ] **Specs.** Add a canonical `specs/landscape/LANDSCAPE_ECOSYSTEM.md` covering recipes, generation,
  streaming and rendering contracts. Update the model, streaming, terrain-fields (dressing) and handoff
  specs, and the roadmap status.

## Evidence and measurements

- **Images and statistics.** Density and LOD diagnostics, determinism hashes, spatial-statistics plots,
  and streaming and budget receipts.
- **Performance.** Report frame time, FPS, GPU and CPU time, draws, triangles, instance counts, memory
  and uploads, with full benchmark conditions. Mark missing metrics as not measured, with a reason.

## Research basis

- Epic [PCG framework](https://dev.epicgames.com/documentation/en-us/unreal-engine/procedural-content-generation-overview), [Biome Core](https://dev.epicgames.com/documentation/unreal-engine/procedural-content-generation-pcg-biome-core-and-sample-plugins-overview-guide-in-unreal-engine), [partitioned and hierarchical generation](https://dev.epicgames.com/documentation/unreal-engine/using-pcg-generation-modes-in-unreal-engine).
- Procedural Worlds Gaia spawner model (height, slope, texture, proximity, noise and mask rules; seed-based): [Unity forum thread](https://discussions.unity.com/t/gaia-aaa-terrain-generator-procedural-texturing-planting-and-scene-creation-part-1/581505).
- Guerrilla, [GPU-based procedural placement in Horizon Zero Dawn](https://www.guerrilla-games.com/read/gpu-based-procedural-placement-in-horizon-zero-dawn) (data-driven, deterministic, locally stable).
- Ubisoft, [Procedural world generation of Far Cry 5](https://blog.playstation.com/2018/03/22/the-procedural-world-generation-of-far-cry-5/) (biome recipes, species competition).
- [Octahedral impostor forest for three.js](https://discourse.threejs.org/t/a-forest-of-octahedral-impostors/85735).

## Completion record

Record each deliverable here when it passes: a summary, spec and source locations, validation results,
measurements, limitations and artifact paths.

### D1. Ecosystem recipe model — delivered 2026-10-15

**Summary.** `landscape-ecosystem-recipe` v1 (`src/app/landscape/ecosystem/`): biomes are ordered sets of layers (descending competition
priority, validated); a layer declares its asset set (`placeholder-rocks` or `catalog-distant` with LOD levels), generation mode (offline or
runtime), world-anchored cell (`meters` × `sitesPerAxis`, so the site spacing is `meters / sitesPerAxis`), footprint and clearance radii, jitter,
alignment (upright, slope or sunk with `slopeWeight`, `sinkMeters`), variation (scale distribution, yaw mode, tint value and channel ranges), its
LOD chain to the view distance with a fade band, shadow-caster hooks, and rules. Rules read 96 named inputs (`ECOSYSTEM_RULE_INPUTS` plus one
`distance.layer.<id>` per layer) with documented neutral values: terrain slope, aspect (as north/east components, trig-free) and altitude;
fields moisture, light, shore distance, flow, deposition, rock exposure and convexity; semantic and natural soil weights; land-cover class and
distances to cover classes; every AI 596 geology channel and label; distances to roads, districts and water; the five AI577 dressing inputs.
Density terms are piecewise-linear curves; terms sharing a `group` combine by maximum (any-of habitats), groups multiply; clumping noise,
parent/child spawning, priority competition with clearances and exclusion zones (`planning-cover`, `roads`, `districts`, `water`, `faces`,
`view-corridor`, recipe zones with margins) complete the layer. Validation rejects lattices too dense for the footprints, LOD chains that miss the
view distance, competition against lower priorities, halos wider than half a competitor's cell (locality) and unknown inputs or zones; the recipe
identity is the SHA-256 of its canonical JSON. `landscape-ecosystem-overrides` v1 carries region parameter overrides (density and scale
multipliers), include/exclude masks and pinned or removed instance ids, applied in the documented order (region parameters and include masks
during generation; exclude masks, removed ids, then pinned instances after). The `ecosystem-instance-v1` record (twelve float32 plus three
int32 per instance) and the structural instance ids (`<layer>:<sx>,<sz>[:<child>]`, `<layer>:pin:<name>`) are the contract D2–D4 share. The
terrain manifest gains the `content-layers-v1` capability under which `attachments` may name content layers (`landscape-ecosystem` kind); without
it attachments stay empty as before, and the published v3 manifest is untouched (the sidecar is found beside the manifest, like the fields).

**Spec and sources.** `src/app/landscape/ecosystem/{EcosystemRecipe,EcosystemRules,EcosystemInputs,EcosystemOverrides,EcosystemTiles,index}.js`
(re-exported from `src/app/landscape/index.js`), `LandscapeManifest.js` (capability and attachment validation), the development recipe
`tools/bake_landscape/ecosystem/recipes/coastal-v3-ecosystem-v1.json` (boulders and shrubs offline, pebbles and boulder scree at runtime, the
declared targets per km² with their reference basis). The canonical spec `specs/landscape/LANDSCAPE_ECOSYSTEM.md` is written in D6 with the
generation, streaming and rendering contracts.

**Validation.** `tests/node/unit/landscape_ecosystem_recipe.test.js` (9 tests): the development recipe validates, fills defaults and round-trips
through JSON unchanged; the identity ignores key order and follows every parameter; 24 rejection cases; competitors and halos; curve
interpolation and clamping, group maximum and product, the trace; the input sampler against synthetic sources (neutral values without sidecars,
every geology label, distance saturation at 256 m) reproducing `sampleLandscapeDressingInputs` exactly for the display soil and planning share;
exclusion zones; the record codec round trip, rank sort and malformed payload rejection; override resolution and the post-generation order;
manifest attachment gating. The full landscape unit suite passes (see the D1 commit).

**Limitations.** No generation, streaming or rendering yet (D2–D4); the development recipe's densities are placeholders tuned in D5; the swim
zone is a rectangle approximating the synthesis constraint band (data, replaceable).

## On completion

- Mark the first line DONE only after D1–D6 pass.
- Rename to `prompts/AI_DONE_codex_landscape_599_TOOLS_procedural_ecosystem_scatter_engine_DONE.md`.
- Keep it in `prompts/`; do not archive automatically.
- Add a one-line summary per completed change, focused validation results, before/after performance
  tables with conditions, and artifact paths. Update the roadmap status table.
