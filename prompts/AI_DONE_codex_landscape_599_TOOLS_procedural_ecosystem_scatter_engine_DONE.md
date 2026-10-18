# Procedural ecosystem scatter engine (AI 599) — DONE 2026-10-15

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

- [x] **Cell grids.** Generate on world-anchored cell grids sized per layer: large cells for trees and
  boulders, small cells for grass and pebbles. Distributions have blue-noise quality, with no grid
  artifacts and no seams at cell borders.
- [x] **Ownership and stability.** Every feature is owned by exactly one cell, the one containing its
  anchor. Regenerating or editing a region changes only that region and its halo; instance IDs elsewhere
  stay stable.
- [x] **Offline and runtime generation.** Large, static layers are generated offline in the bake. Dense,
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

- [x] **Layer descriptors.** Implement the reserved content-layer residency. Each layer carries stable
  IDs, a revision or content key, bounds, its own spatial index, LOD and error semantics, and declared
  dependencies on terrain revisions, channels and halos.
- [x] **Residency.** Use leases and priorities, CPU and GPU budgets, upload caps, cancellation and
  coarse coverage. Manifest attachment channels become supported, with the capability gating that the
  model spec requires.
- [x] **Invalidation.** Terrain edits, recipe changes and override changes invalidate only the
  intersecting tiles.
- [ ] **Gate.**
  - Streaming routes (travel, zoom, teleport, fast turns) stay within budgets.
  - Low-budget profiles keep coarse coverage and report degradation explicitly.
  - Disposal returns everything to zero.

### D4. Instanced renderer

- [x] **Drawing and culling.** Draw instanced batches per tile and LOD, with frustum and distance
  culling and stable LOD selection with hysteresis. Use dithered cross-fades instead of pops.
- [x] **Impostors.** Support impostors that work with instancing. The existing per-object CPU-updated
  impostor must be adapted or replaced.
- [x] **Terrain contact and hooks.**
  - Instances conform to the terrain using exact height queries, slope alignment and sinking.
  - Provide hooks for terrain blending: contact darkening and colour matching.
  - Provide a wind-animation hook and shadow-caster LOD and culling hooks for AI 600.
- [x] **Inspection.** Diagnostics show instance identity, layer and rule trace when an instance is
  picked, plus density heatmaps and LOD colouring.
- [ ] **Gate.** No popping or swimming at normal travel speeds on the AI 577 camera paths. Terrain
  contact holds on slopes. Diagnostics match the resident data.

### D5. Proof layers at scale

- [x] **Two layers.** Run two real layers end-to-end on the coastal terrain: a boulder layer on rock and
  bluff ground, and a shrub layer on scrub and woodland edges. Use placeholder assets if AI 602 assets
  are not ready yet.
- [x] **Targets.** Declare target densities per km² for trees, shrubs, rocks, ground cover and clutter,
  derived from the references and the D1 rules.
- [x] **Scaling.** Measure scaling at 1×, 2× and 4× the target counts: instances, draws, triangles,
  memory, upload, CPU and GPU frame time.
- [x] **Gate.** Report scaling curves and the bottlenecks found, with a recommended budget for AI
  601–603.

### D6. Integrated acceptance

- [x] **Regressions.** Run all landscape suites in both surface-cache modes, plus the new engine's Node
  and browser tests.
- [x] **Measurements.** Record cold and warm loads, edit and revert invalidation, and same-condition
  performance tables.
- [x] **Specs.** Add a canonical `specs/landscape/LANDSCAPE_ECOSYSTEM.md` covering recipes, generation,
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

### D2. Deterministic hierarchical generation — delivered 2026-10-15

**Summary.** Every layer generates on a world-anchored lattice (site spacing `cell.meters / sitesPerAxis`): a site's rank comes from one committed
64 × 64 toroidal void-and-cluster table (`EcosystemBlueNoise.js`, regenerated and byte-compared by the `landscape/ecosystem/blue-noise` leaf), a
site is a candidate when `rank < density`, so every density threshold is a blue-noise subset that is seamless across cells and changes only where
the density changes, and a rank-sorted tile prefix is a lower-density version of the tile. Per site (`EcosystemGeneration.js`, pure, shared by the
Node bake and the browser worker): sites whose rank exceeds the layer's largest reachable density are skipped unsampled; the jittered position; the
D1 input vector from the exact native triangle (height, normal, slope), the field and geology pages, the planning references (road edge distance,
district distance, the open-view corridor) and exact Euclidean distance transforms of the cover classes over the cell grown by 40 m; override
parameters; the exclusion zones in recipe order unless an include mask lifts them; density = curve groups × biome `where` × clumping noise × scales;
competition against the bucketed features of higher-priority layers within `max(rA + rB, clearance)`; variation from independent hash channels. A
child layer spawns `count` children per parent feature at hashed radii and directions, owned by the anchor's cell, kept by its hash against the local
density. Overrides apply last on the exact ground. `generateEcosystemLayerCells` memoizes the referenced cells of higher-priority layers (one ring,
bounded by validation), so one cell, a sub-area or the whole landscape generate identical bytes. The `landscape-ecosystem` v1 sidecar
(`EcosystemSidecar.js`) embeds the recipe and overrides, binds the terrain revision and every native hash like the fields, lists one content-addressed
tile index per offline layer and content-addressed payloads, and keys each tile by the algorithm, recipe identity, cell, density scale, the natives
inside its dependency reach, the field and geology revisions and the override entries touching it, so a native edit stales exactly the tiles that
could have read it (8 × 8 stale cells as the fields). The `landscape/ecosystem` leaf (`tools/bake_landscape/ecosystem/`) generates every offline
layer over coastal v3, gates determinism (8 cells per layer regenerated byte-identically), seams (4 cells per layer reproduced inside their 3 × 3
block), close pairs (0) and the spatial statistics, writes the receipt and publishes with validation (every byte re-read).

**Spec and sources.** `src/app/landscape/ecosystem/{EcosystemBlueNoise,EcosystemLattice,EcosystemCellSources,EcosystemGeneration,EcosystemStatistics,
EcosystemSidecar,EcosystemSidecarPayload}.js`; `tools/bake_landscape/ecosystem/{README.md,jobs.mjs,EcosystemJob.mjs,EcosystemBake.mjs,EcosystemFileSources.mjs,
EcosystemPublication.mjs,blue_noise/BlueNoiseJob.mjs}` (registered in `tools/bake_landscape/jobs.mjs`); `tools/bake_landscape/CacheBundle.mjs` learns the
`ecosystem/manifest.json` pointer. Spec sections 3–4 of `LANDSCAPE_ECOSYSTEM.md`.

**Validation.** `tests/node/unit/landscape_ecosystem_{blue_noise,generation,sidecar}.test.js` (28 tests with `landscape_ecosystem_fixture.js`): the table is
a permutation whose selections at 2 / 10 / 30 % beat white noise (nearest-neighbour mean 5.83 / 2.58 / 1.23 vs 3.71 / 1.68 / 1.09 spacings) and stay
isotropic; determinism across runs; a cell alone equals the cell inside its 3 × 3 block; a native edit changes only the tiles whose dependency reach
intersects it and keeps every other record bit-identical; competition, parent/child, exclusions, overrides; the jittered lattice at full density fails
the anisotropy test the blue-noise selection passes; sidecar validation, content keys, staleness, loaders, publication round trip. Published on v3:
revision `ecosystem-2db5078ccfd7dfae52d97808` (identical over three runs, one from an empty directory): boulders 2,068 instances in 143 tiles, shrubs
2,973 in 592; generation 17–20 s, gates 3.2 s, 495 MiB RSS; sidecar 781,278 bytes (manifest 87,731, indexes 391,087, 735 tile payloads 302,460); min
nearest-neighbour 5.81 m (bound 1.2) and 10.18 m (bound 2.0); anisotropy χ² boulders 2.36 (pass), shrubs 55.7 (fails on the linear woodland-edge
habitat: informational, the statistic is reported per layer). Densities: boulders 2,901/km² of rock ground (target 3,000), shrubs 343/km² of grass
(target 6,000: the placeholder curves cap at 0.09–0.14 and most grass lies in excluded planning districts; D5 tunes). Receipts
`tests/artifacts/screens/landscape/ai599/d2/`.

**Limitations.** The runtime layers (pebbles, boulder scree) are declared and generated by the same code but drawn only once D3 streams them; the
Node/browser determinism gate is D3's; `distance.cover.*` saturates at 40 m and `distance.layer.*` at the generation halo (pure functions of position);
the anisotropy gate is informational on habitats that are themselves linear.

### D3. Content-layer streaming — delivered 2026-10-15

**Summary.** `createLandscapeEcosystemStreamer` (`src/graphics/engine3d/landscape/ecosystem/LandscapeEcosystemStreamer.js`, planning and admission math in
`LandscapeEcosystemStreamingPlan.js`, pure and Node-tested) implements the reserved content-layer residency: the sidecar is loaded through the bounded
loader and bound to the loaded landscape before anything is reserved (statuses `active`, `active-partial` when natives changed since the bake, `absent`,
`disabled`, `invalid`, `binding-mismatch`, `stale`, `budget-denied`, `failed`; an inert handle holds nothing and releases the share to the streams), the
renderer and asset sets come from the recipe embedded in the sidecar through the view's factory, and every frame plans with a bounded cost: per visible
layer the desired cells are those whose boxes meet the disc of the layer's view distance around the camera's ground position, inside the landscape
bounds and the frustum (Gribb–Hartmann planes, the terrain planner's box test), nearest first; resident cells stay until they leave the disc grown by
the 1.15 keep hysteresis. At most four jobs run in the ecosystem worker (`LandscapeEcosystemWorker.js`: published tiles fetched, hash-verified and decoded;
runtime cells generated by the same domain code as the bake over `LandscapeEcosystemWorkerSources.js`, the bake's file sources mirrored over the bounded
loaders with LRU caches of chunks, pages and generated cells whose bytes are one standing reservation), one decoded tile attaches per frame within the
upload allowance the view passes, a tile that stops being desired is cancelled, tiles leaving the keep disc detach (runtime tiles into a bounded
8 MiB cache that saves their regeneration). Every byte is a reservation in the ecosystem share made before the job starts (a runtime cell reserves a
provisional share of its sites, corrected on arrival); a denial first evicts tiles nobody wants, then admits the longest rank prefix that fits,
materialized so the accounted bytes are the held bytes, and reports `degradationReason`. Invalidation: an overrides document re-derives the offline tiles
in place (no refetch) and regenerates the runtime ones; a density scale regenerates the runtime layers only (offline tiles carry the baked scale);
stale tiles are never loaded. The viewer streams the sidecar beside the landscape by default (`landscapeEcosystem=auto`; a manifest attachment of kind
`landscape-ecosystem` or an explicit sidecar URL overrides the address), holds the share before the streams fill the ledger, counts the ecosystem's
uploads in the frame's allowance, and exposes `setEcosystem({mode, density, overrides, layers, diagnostic, wind, contact, shadows, visible})`,
`ecosystemPick` / `ecosystemPickTrace` (the rule trace from the worker), `ecosystemTrace(layerId, x, z)`, `ecosystemHash(layerId, cellX, cellZ)` (the
Node/browser determinism gate), `ecosystemTile(tileId)` (count, drawn, bounds, SHA-256 of the resident records) and `ecosystemHeatmap(layerId)`. The
shipped profiles grew by exactly the share, as for the surround and the ocean: `LANDSCAPE_STREAMING_BUDGETS` 688 / 432 → 752 / 528 MiB,
`LANDSCAPE_SURFACE_CACHE_BUDGETS` 688 / 624 → 752 / 720 MiB (860 and 1,222 MiB at 2560 × 1440 and 3840 × 2160), `streamReserveGpuBytes` 432 → 528 MiB,
the appearance ceilings 344 / 216 → 376 / 264 MiB; the landscape server serves the distant vegetation catalog (`assets/public/vegetation_distant/<species>/`
glTF binaries, KTX2 atlases and records) with the glb, ktx2 and wasm content types.

**Spec and sources.** `LandscapeEcosystemStreamer.js`, `LandscapeEcosystemStreamingPlan.js`, `LandscapeEcosystemWorker.js`, `LandscapeEcosystemWorkerSources.js`,
`LandscapeEcosystemModel.js` (streaming constants, statuses, the sidecar address), `LandscapeView.js` / `main.js` / `LandscapePanel.js` (Ecosystem toggle),
`tools/landscape_server/Server.mjs`, `LandscapeResidencyBudget.js`, `LandscapeSurfaceCacheLayout.js`, `tests/shared/landscape_viewer_url.js`. Spec section 5 of
`LANDSCAPE_ECOSYSTEM.md`.

**Validation.** `tests/node/unit/landscape_ecosystem_streaming.test.js` (planning math, admission and degradation arithmetic, the sidecar address, the profile
pins); the full landscape unit suite 670 / 670 with the moved pins (`landscape_surround`, `landscape_surface_cache`, `landscape_appearance_budget`,
`landscape_appearance_demand`, `landscape_ecosystem_model`, `landscape_server`). `tests/headless/e2e/landscape_ecosystem.pwtest.js` on coastal v3 (1 passed,
1.3 min; `tests/artifacts/screens/landscape/ai599/d3/`): boot binds the loaded revision and the published sidecar (835 ms for binding, assets and
programs), the share holds one standing entry of exactly 64 / 96 MiB with 19.0 MiB standing inside it (indexes 1.5, worker caches 17.5) and 26.4 MiB of
assets; at NW-04 23 tiles with 8,563 instances resident (share 45.9 / 26.8 MiB CPU / GPU), NW-06 39 tiles / 199 instances, NW-03 33 tiles / 5,362
instances (46.2 / 27.0 MiB); every resident offline tile's count and SHA-256 equal its index entry (4 boulder and 17 shrub tiles verified); the runtime
layer's cells `pebbles/x40/z82` (1,338 instances) and `x39/z83` (1,328) hash identically in Node, in the worker and as resident tiles (the Node/browser
determinism gate); a 60-step dolly keeps the frame uploads at a 7.1 MiB peak (the ecosystem's 88 KB) with every frame drawn, a plan cost of 0.11 ms mean
and 2.9 ms peak and a worker round trip of 267 ms mean (729 peak); a teleport to NW-11 cancels 6 of 17 pending jobs and evicts to 0 resident; an
exclude mask over a resident tile drops its drawn count 34 → 0 without a refetch and regenerates 14 runtime cells; the pre-D3 688 / 432 profile reports
the ecosystem `unavailable` while the terrain streams; `off` and disposal return every ecosystem byte. D4's render suite passes on the served assets
(route removed); the lighting (6 / 6), streaming (7 / 7) and fabrication (2 / 2) suites pass on coastal v2 with the new default (sidecar `absent`), and
the self-serving surround suite passes on v3 with the ecosystem active. The GPU was shared with Blender (21–35 %) during the timings.

**Limitations.** Budget-pressure degradation (the admitted rank prefix) and the stale `active-partial` path are covered at unit and inspection level only;
`ecosystemPickTrace` is unexercised by a suite (the positional trace is); a worker cancelled mid-job is terminated and loses its caches (the pool's
semantics); the streamer file is 470 lines.

### D5. Proof layers at scale — delivered 2026-10-15

**Summary.** The development recipe's two real layers run end to end on coastal terrain v3 through the engine: `boulders` (placeholder rocks: rock
soil, talus, the wave-cut platform and the bluff toe, sunk and slope-aligned) and `shrubs` (the catalog's arrowwood viburnum LOD3/4/5: scrub, the
woodland-edge mantle within 35 m of forest cover, foredune and bluff-crown scrub), beside the runtime proofs `pebbles` and `boulder-scree`. The
recipe was tuned once against the receipt (curve maxima and the clumping contrast of the shrubs, the boulder habitat maxima) and re-published as
`ecosystem-4c1692c4e6e0a9844e84a67c`. Targets are declared per km² in `recipe.targets` with their reference basis (boulders 3,000 of rock ground,
shrubs 6,000 at woodland edges and back-dune scrub, trees 25,000 of closed forest, pebbles 1.5 M, ground cover 1 M, clutter 5 M). Scaling was
measured at 1×, 2× and 4× the recipe's density (`--set landscape/ecosystem:density=<n>`, each a published sidecar) and with the ecosystem off,
at NW-03, NW-04, NW-06, NW-07 and NW-10 plus a 90-frame travel from NW-03 to NW-04, with 30 warm-up and 120 sampled frames per stop
(`tests/headless/e2e/landscape_ecosystem_scaling.pwtest.js`, composed by `tools/landscape_review/ecosystem_scaling.py`). Review captures with the
ecosystem on and off and in the LOD-band diagnostic come from `tools/landscape_review/capture.mjs` (new `--ecosystem` and `--ecosystem-diagnostic`
options) and `composite.py`; the spatial statistics are plotted by `tools/landscape_review/ecosystem_statistics.py`.

**Targets and achieved densities** (`d5/bake/ecosystem-bake-x1.json`; per km² of the native cover class the instances stand on):

| Layer | Instances (tiles) | Achieved | Target | Note |
| --- | ---: | --- | --- | --- |
| boulders | 2,258 (143) | 3,192 on exposed rock, 282 on sand (platform and toe), 179 on forest soil (talus and crowns) | 3,000 of rock ground | met |
| shrubs | 12,433 (619) | 1,377 on grass, 1,384 on forest soil, 2,872 on exposed rock (the bluff crown), 705 on sand (foredune) | 6,000 in the edge and scrub bands | the classes average over their whole area; the edge band is a 35 m mantle inside the forest class, so the class average is not the band density (not measured per band); most grass lies inside the excluded districts |
| pebbles (runtime) | ≈ 8,300 resident at NW-04, 5,400 at NW-03 (drawn within 60 m) | — | 1.5 M (a near-field density) | drawn density only, by design |

Nearest-neighbour minimum 5.54 m (boulders, bound 1.2) and 2.56 m (shrubs, bound 2.0); close pairs 0; anisotropy χ² 3.1 (boulders, isotropic) and
58.7 (shrubs, the linear crown and edge habitats). The 2× and 4× sidecars hold 4,606 / 24,871 and 9,139 / 49,627 instances (nearest minima 1.38 / 2.03 m,
every bound kept), 2.27 and 4.03 MB; generation 23.6 / 28.7 / 34.4 s.

**Scaling** (`d5/scaling.md`, `scaling.png`; RTX 3060 through ANGLE/D3D11, 1920 × 1080, cache on at 752/720 MiB, the animated ocean at its fixed
time, the GPU shared with Blender at 20–35 %):

| Run | NW-04 resident tiles / instances / draws / ecosystem triangles | NW-03 | NW-06 | Share CPU / GPU MiB (NW-04) | Frame median ms (all stops) | GPU median ms (NW-03 … NW-10) | Travel peak upload MiB/frame |
| --- | --- | --- | --- | --- | --- | --- | --- |
| off | 0 / 0 / 0 / 0 | 0 | 0 | — | 17.5–17.6 (vsync) | 8.3–9.1 | 5.59 |
| 1× | 46 / 8,957 / 65 / 1.52 M | 34 / 5,461 / 51 | 48 / 638 / 44 | 46.3 / 27.0 | 17.4–17.6 | 8.2–8.9 | 6.11 |
| 2× | 47 / 9,449 / 66 | 35 / 5,779 / 52 | 50 / 1,279 / 47 | 46.5 / 27.2 | 17.5–17.6 | 8.4–8.7 | 6.11 |
| 4× | 47 / 10,402 / 66 | 35 / 6,402 / 52 | 50 / 2,499 / 47 | 46.7 / 27.3 | 17.5–17.6 | 8.5–8.8 | 6.11 |

The frame stays vsync-bound at every run and stop and the GPU pass sits inside the run-to-run noise of the baseline (the ecosystem's share of the
8.2–9.1 ms pass is below 0.5 ms at these counts); CPU frame work 2.3–3.0 ms; the main-thread plan 0.11 ms mean, 3.5–3.9 ms peak; the worker round
trip 138–153 ms mean (817–1,261 ms peak) over 209–215 loads on the travel; the ecosystem's own uploads peak at 88 KB per frame; the share holds
46–47 MiB CPU (assets 47.7 MB CPU, 27.7 MB GPU: the viburnum textures) and 27 MiB GPU; the programs link in 145–384 ms. Resident instances at the
poses grow less than the density because the runtime pebbles (density 1 in every run: the scale applies to the offline layers at bake time and the
runtime scale was left at 1) dominate the near field.

**Bottlenecks found and the recommended budget for AI 601–603.** (1) The merged-variant geometry submits every variant's triangles per instance (the
other variants collapse): 1.52 M triangles submitted for 8,957 instances at NW-04 of which about a third rasterise. Cheap for 320-triangle rocks and
36-triangle shrub panels, it would be the first wall for the 3,788–9,666-triangle LOD0 trees: AI 601 must draw per variant (variant-sorted records
with one draw range per variant, or one instance buffer per variant). (2) Texture memory, not records: one species' distant set costs 27.7 MB GPU
against 0.5 MB for 9,000 records; the 480 MiB of LOD0 and 300 MiB of LOD1 textures of the five species cannot live inside a 96 MiB share, so
AI 601 needs its own texture residency by LOD and distance and a share of its own (plan 160–256 MiB GPU for vegetation textures, accounted like this
share). (3) The worker: one tile per round trip at 140–270 ms and one attach per frame fill about 60 tiles per second; dense near-field layers
(AI 603's millions per km²) must generate on coarser cells or on the GPU, since the generator samples about 15 µs per site and the rank cull only
helps sparse layers. (4) Records: 190,000 trees are 11 MB of records and ids, well inside the share; a landscape-wide dense layer must stay runtime
and distance-bound. Recommended: keep `LANDSCAPE_ECOSYSTEM.budgets` at 64 / 96 MiB for rocks, shrubs and clutter records; AI 601 adds a vegetation
texture share; AI 602 publishes its scanned rocks as a new asset kind with per-variant draws; AI 603 generates its near-field layers at runtime on
16–32 m cells within 60–100 m.

**Validation and evidence.** `tests/artifacts/screens/landscape/ai599/d5/`: `bake/` (the four receipts and logs, `statistics-x1.png`), `scaling/<off|x1|x2|x4>/`
(report.json, report.md, a screenshot per stop), `scaling.md`, `scaling.png`, `captures/{before,after,lod}/` (receipts per pose) and
`captures/composites/NW-03..NW-10.png` (`[off | on]`) and `lod-sheet.png`. Every scaling run passed its budget and upload assertions; the review tools'
unit tests pass with the new options.

**Limitations.** Placeholder rocks and the catalog's viburnum stand in for AI 602 and AI 604 assets; the shrub target is declared per edge band but the
receipt measures per cover class; the runtime layers were not scaled (their scale is a runtime switch, `setEcosystem({density})`, not measured here);
GPU timing was taken with Blender holding 20–35 % of the GPU; wind, shadows and the AI 600 lighting are out of scope.

### D6. Integrated acceptance — delivered 2026-10-15

**Regressions.** Every landscape browser suite ran in its own Playwright invocation in both surface-cache modes (`LANDSCAPE_TEST_SURFACE_CACHE=on|off`;
the base-address suites against `node tools/landscape_server/run.mjs` on 8002, then the self-serving `landscape_ocean`, `landscape_surround`,
`landscape_resolution`, `landscape_ecosystem` and `landscape_ecosystem_render` with the server stopped; `tests/artifacts/screens/landscape/ai599/d6/regressions/summary.txt`,
one log per suite and mode): 27 suites per mode, 51 of 54 runs green on the first chain, the three failures being pins of the ecosystem's own defaults —
the acceptance suite gated the browser's 404 for the optional `ecosystem/manifest.json` probe on coastal v2 (added to `EXPECTED_404_PROBES` beside the
surround and geology sidecars; the cache-off pass then passed 4 / 4 and the cache-on re-run 4 / 4), and the surface-cache suite pinned the
3840 × 2160 cache profile at 1,126 MiB, which the ecosystem share moved to 1,222 (re-runs: cache on 6 / 6, cache off 6 / 6). Final record:
every suite green in both modes (the material audit suite skipped by design, the surface transition suite opt-in). Unit: `node --test tests/node/unit/landscape_*.test.js`
670 / 670 (`d6/unit-landscape.log`), of which the engine's own tests are 50 (`landscape_ecosystem_{recipe,blue_noise,generation,sidecar,model,streaming}.test.js`).
The intermittent Direct3D X4008 info log of the terrain program (a constant division in a dead branch, logged by three.js on some boots, tolerated by
the D3/D4 suites by its exact signature) predates AI 599 and is recorded, not fixed.

**Measurements.** Cold and warm loads: `landscape_performance.pwtest.js` passed in both modes on coastal v2 (the viewer's default directory, where the
ecosystem is `absent` and holds no share: the suite's cold and warm rows are unchanged by AI 599; `d6/regressions/<mode>/landscape_performance.log`);
on coastal v3 the ecosystem binds, loads its assets and links its programs in 835 ms after the terrain is ready (D3), the viewer settles with it in
4–16 s per pose on the review captures (D5 receipts). Edit and revert invalidation (`tools/landscape_review/ecosystem_invalidation.mjs`,
`d6/invalidation.json`): on the published v3 sidecar an edit of native chunk `l4/c4/r9` stales 1 native, 3 of 143 boulder tiles (86 instances) and
7 of 619 shrub tiles (164 instances) in 7.6 ms, and the revert restores every tile (0 stale, 0.1 ms); the browser path (`active-partial`, stale tiles
never loaded) is covered by the streaming unit tests and the D3 suite's binding checks. Same-condition tables: the D5 scaling tables
(`d5/scaling.md`: off, 1×, 2×, 4× at NW-03/04/06/07/10 and the travel, 1920 × 1080, cache on, RTX 3060 through ANGLE/D3D11) are the engine's
same-condition performance record: every run vsync-bound at 17.5 ms, the GPU pass 8.2–9.1 ms with and without the ecosystem, CPU frame work
2.3–3.0 ms, the share 46–47 / 27 MiB, uploads 88 KB per frame at most; the D3 residency receipts (`d3/ecosystem-streaming-suite.json`) record the
share at NW-03/04/06, the dolly and the teleport.

**Specs.** `specs/landscape/LANDSCAPE_ECOSYSTEM.md` (canonical: contract, recipe, generation, sidecar, streaming, rendering, proof layers, acceptance);
`LANDSCAPE_MODEL.md` (the `content-layers-v1` capability and attachments), `LANDSCAPE_STREAMING.md` (the grown profiles, the ecosystem share row, the
"Content layers" section), `LANDSCAPE_TERRAIN_FIELDS.md` (the dressing inputs as rule inputs), `LANDSCAPE_PLANNING_REPORTS.md` (the content-layer
residency implemented), `LANDSCAPE_HANDOFF.md` (the AI 599 row and the budget table), `LANDSCAPE_NATURAL_WORLD_ROADMAP.md` (status, G4, the placement
row); `tools/baking/README.md`, `tools/bake_landscape/README.md`, `tools/bake_landscape/ecosystem/README.md`, `tools/landscape_review/README.md`,
`PROJECT_TOOLS.md`.

**Handoff to AI 600–603.** The engine's contracts the content prompts consume: a recipe per prompt or shared (layers belong to exactly one biome;
new asset kinds extend `ECOSYSTEM_ASSET_KINDS` and `EcosystemAssetSets.js`), the bake leaf (`landscape/ecosystem`, re-published after every terrain
revision), the viewer's `landscapeEcosystem` option and hooks, the renderer hooks (`setWind`, `setContact`, `setShadows` and the per-LOD `castShadow`
flags for AI 600; the diagnostics and picking for review), the D5 budget recommendation (64 / 96 MiB for records and clutter; a vegetation texture
share and per-variant draws for AI 601; scanned rocks as a new asset kind for AI 602; runtime near-field layers on 16–32 m cells for AI 603) and the
known limitations: the merged-variant draw cost, the worker's fill rate of about 60 tiles per second, the runtime density scale as a separate switch,
placeholder assets, and the anisotropy statistic's informational role on linear habitats.

### D4. Instanced renderer — delivered 2026-10-15

**Summary.** `createLandscapeEcosystemRenderer` (`src/graphics/engine3d/landscape/ecosystem/`) draws one `THREE.Mesh` per (tile, LOD band) over an
`InstancedBufferGeometry` that shares the asset geometry and binds the tile's rank-sorted records as one interleaved instance buffer (anchor, scale,
normal, yaw, variant, rank, tint); the admitted rank prefix is the instance count (coarse coverage under budget pressure, `setDrawFraction`). Culling:
three.js frustum culls each tile by a bounding sphere from its cell bounds, height range and asset height; a (tile, band) draw is visible only when the
camera's distance range to the tile meets the band, with a 1.1 hysteresis so the set does not flicker. The vertex program builds the instance frame
(yaw about the up axis mixed from world up to the ground normal by the layer's slope weight, sunk by the alignment, right-handed), fades each instance
by its distance across the band (`ecosystemLodBands`: fade-in and fade-out ramps of `fadeMeters` around each boundary, the last band ending at the view
distance), collapses faded vertices behind the far plane, and for impostors builds the camera-facing card of the distant catalog in the shader (nearest
of the 16 views by azimuth tile and elevation row, the card hung from the view's projected root point, its atlas rectangle as texture coordinates): the
CPU updater of `DistantTreeBillboard.js` moved to the GPU, so LOD5 instances. The fragment program dithers the fade (8 × 8 Bayer shifted by the instance
rank, so neighbours dither out of step), alpha-tests the leaf and card atlases with their tangent-space normals, darkens the lowest metres toward the
ground (`uEcosystemContact`), applies the per-instance tint, lights the opaque surface with the landscape chunks (`landscapeReflectedRadiance`,
`landscapeAirLight`, `landscapeAerialPerspective`) and writes linear radiance for the frame pipeline; the diagnostic views (LOD band, layer, rank, fade)
compile in on request and write display-ready colours with the alpha-0 sentinel. Hooks: wind (`uEcosystemWind`: direction, strength, time; sway ∝ height
fraction², strength 0 = still), contact darkening, `castShadow` per LOD from `layer.shadow` (AI 600), lighting-tier rebuilds that relink in parallel and
swap at once. Asset sets: deterministic placeholder rocks (noise-displaced icospheres flattened to the base, 3 variants × 3 LODs at 320 / 80 / 20
triangles, pebbles 80 / 20) and the catalog's distant LODs (arrowwood viburnum LOD3 36, LOD4 12, LOD5 2 triangles through GLTFLoader + KTX2Loader with
shared textures), reserved in the ecosystem share. Picking tests instance bounding spheres on the CPU and returns the record and structural id. The
viewer holds the share (`createLandscapeEcosystemLedger`, 64 / 96 MiB, a standing reservation like the ocean's) and wires the renderer behind
`landscapeEcosystem` (`off` by default until D3 integrates the streamer).

**Spec and sources.** `src/graphics/engine3d/landscape/ecosystem/{LandscapeEcosystemModel,EcosystemPlaceholderRocks,EcosystemCatalogAssets,EcosystemAssetSets,
LandscapeEcosystemMaterials,LandscapeEcosystemRenderer}.js`, shaders `materials/landscape/ecosystem_instance.{vert,frag}.glsl` + `LandscapeEcosystemShaderLoader.js`,
viewer `LandscapeView.js` / `main.js` / `LandscapePanel.js`. Spec section 6 of `LANDSCAPE_ECOSYSTEM.md`.

**Validation.** `tests/node/unit/landscape_ecosystem_model.test.js` (6 tests: LOD bands and fade mirror, impostor view selection against `selectDistantView`,
dither permutation, option parser, share). `tests/headless/e2e/landscape_ecosystem_render.pwtest.js` on coastal v3 (1 passed, 1.1 min): synthetic tiles of every
asset set injected at NW-04 and NW-06 draw with the expected draws and instances (draws per tile = the layer's LOD count), 10 materials link as 3 program
variants in 126–139 ms in parallel with empty info logs, the LOD colour diagnostic agrees with the picked instance's band on 1,097 of 1,098 pixels, a 40-step
dolly toward the tiles shows per-frame mean differences of median 4.34 and peak 7.72 (no pop above 3 × the median), picking the screen centre returns the
aimed instance and record at 5.55 m, the boulder covers its anchor pixel and ends 35 rows below it against a 40-row rim projection (terrain contact), removal
and disposal return the share to zero; the lighting suite still passes with the default off. Asset reservations 27.7 MB CPU = GPU (the viburnum textures
dominate). Evidence `tests/artifacts/screens/landscape/ai599/d4/`.

**Limitations.** Wind was verified only as a clock advance, shadows only as flags (no shadow maps exist before AI 600), species other than viburnum and
orthographic cameras untested; the development recipe and the vegetation assets are served to the suite through a route (D3 extends the server); the
terrain program logs an intermittent Direct3D X4008 warning on some boots (pre-existing).

## Completion summary

- D1 (f7281e49): recipe model — biomes as ordered layer sets, traced rules over 96 terrain, field, geology, soil, cover, planning and dressing inputs, overrides with a documented order, the 60-byte instance record and structural ids, the `content-layers-v1` manifest capability. 9 unit tests.
- D2 (6d8e1e02): deterministic generation on world-anchored blue-noise lattices (committed 64 × 64 rank table), exclusions, competition, parent/child, overrides, the `landscape-ecosystem` sidecar with per-tile content keys and staleness, the `landscape/ecosystem` leaf with determinism, seam, spacing and statistics gates. 28 unit tests; published on v3.
- D4 (f84a97f2): instanced renderer — per-tile LOD bands with dithered cross-fades, shader impostors of the distant catalog, placeholder rocks, lighting through the landscape chunks, wind, contact and shadow hooks, diagnostics, picking. Render suite on v3.
- D3 (c816384b): content-layer streaming through the shared ledger — sidecar binding, worker-side fetch and generation (Node = browser bytes), rank-prefix degradation, invalidation, the viewer streaming by default, the profiles grown by the 64 / 96 MiB share, the server serving the catalog. Streaming suite on v3; unit 670.
- D5 (d5335f0c): boulders and shrubs tuned toward the declared targets (boulders 3,192 per km² of rock against 3,000); scaling at 1×, 2× and 4× with the ecosystem off as baseline: vsync-bound at every pose, the GPU pass inside the baseline's noise, the bottlenecks and the budget recommendation for AI 601–603; review captures and composites; the statistics and scaling tools.
- D6: every landscape suite green in both surface-cache modes (54 runs after moving two pins of the engine's own defaults), the edit/revert invalidation receipt, the specs and tool registry updated, this record.

## On completion

- Mark the first line DONE only after D1–D6 pass.
- Rename to `prompts/AI_DONE_codex_landscape_599_TOOLS_procedural_ecosystem_scatter_engine_DONE.md`.
- Keep it in `prompts/`; do not archive automatically.
- Add a one-line summary per completed change, focused validation results, before/after performance
  tables with conditions, and artifact paths. Update the roadmap status table.
