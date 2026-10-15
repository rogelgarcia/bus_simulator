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

## On completion

- Mark the first line DONE only after D1–D6 pass.
- Rename to `prompts/AI_DONE_codex_landscape_599_TOOLS_procedural_ecosystem_scatter_engine_DONE.md`.
- Keep it in `prompts/`; do not archive automatically.
- Add a one-line summary per completed change, focused validation results, before/after performance
  tables with conditions, and artifact paths. Update the roadmap status table.
