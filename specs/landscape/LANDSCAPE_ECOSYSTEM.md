# Landscape ecosystem engine (AI 599)

Status: D1 (ecosystem recipe model), D2 (deterministic hierarchical generation), D3 (content-layer streaming), D4 (instanced renderer) and
D5 (proof layers at scale) delivered 2026-10-15 on `codex/landscape`; D6 (integrated acceptance) follows and is recorded here when it passes. This page is the canonical contract of the natural-content placement and rendering framework the roadmap's layers L3–L6 share
(`LANDSCAPE_NATURAL_WORLD_ROADMAP.md` §4–§6): how biomes and layers are declared, how features are generated deterministically per
world-anchored cell, how the generated tiles are published and streamed through the landscape residency contracts, and how they are drawn as
culled, LOD-selected instanced batches. AI 601 (forests), AI 602 (rocks and cliffs) and AI 603 (ground vegetation and clutter) deliver their
ecosystems on this engine; nothing here is hand-placed (procedural-first contract, roadmap §6). Every number quoted is copied from a receipt
under `tests/artifacts/screens/landscape/ai599/` (paths given).

## 1. Contract

| Item | Value |
| --- | --- |
| Algorithm | `landscape-ecosystem-v1` (`ECOSYSTEM_ALGORITHM`, `src/app/landscape/ecosystem/`) |
| Recipe | `landscape-ecosystem-recipe` schema 1 (`validateEcosystemRecipe`); identity `ecosystem-recipe-<24 hex>` = SHA-256 of the canonical JSON (sorted keys at every depth, `canonicalEcosystemJson`) |
| Overrides | `landscape-ecosystem-overrides` schema 1 (`validateEcosystemOverrides`); identity `ecosystem-overrides-<24 hex>` |
| Record | `ecosystem-instance-v1` (`ECOSYSTEM_RECORD`): twelve little-endian float32 per instance (x, y, z, scale, normal x, normal z, yaw, variant, rank, tint r g b) followed by three int32 (site x, site z, child); 60 bytes per instance in a tile payload; rank-sorted so a prefix is a lower-density version of the tile |
| Instance id | `<layer>:<sx>,<sz>` for a lattice site, `<layer>:<sx>,<sz>:<k>` for its k-th child, `<layer>:pin:<name>` for a pinned instance (`ecosystemInstanceId`, `parseEcosystemInstanceId`); structural, never serial |
| Cell | world-anchored: cell `(cx, cz) = (floor(x / meters), floor(z / meters))`, tile id `<layer>/x<cx>/z<cz>` (z grows north like world Z) |
| Lattice | `ECOSYSTEM_BLUE_NOISE`: one committed 64 × 64 toroidal void-and-cluster rank table (`EcosystemBlueNoise.js`), rank `(table[(sz mod 64) · 64 + (sx mod 64)] + 0.5) / 4096` |
| Sidecar | `landscape-ecosystem` schema 1 under `<landscape>/ecosystem/` (§4), revision `ecosystem-<24 hex>` |
| Manifest | `content-layers-v1` capability (`LANDSCAPE_CONTENT_LAYERS_CAPABILITY`): a terrain manifest declaring it may list `attachments` `{id, kind, url, revision}` of the kinds in `LANDSCAPE_ATTACHMENT_KINDS` (`landscape-ecosystem`); without the capability attachments must stay empty as before, so a schema-1 reader without content support refuses content it cannot interpret. The published coastal manifests are untouched: the viewer finds the sidecar beside the manifest (`ecosystem/manifest.json`) like the fields and geology, an attachment only overrides that address |
| Authority | None. Heights, soil, picking and queries stay the terrain's; an instance's `y` is the exact native height at its anchor, read from the stride-1 native chunk at generation time; nothing is ever placed outside the landscape bounds or on the far-field surround |
| Residency | kind `landscape-ecosystem` (`LANDSCAPE_ECOSYSTEM.kind`, `src/graphics/engine3d/landscape/ecosystem/LandscapeEcosystemModel.js`): the view holds the share `LANDSCAPE_ECOSYSTEM.budgets` = 64 MiB CPU / 96 MiB GPU as one standing reservation in the shared ledger while the ecosystem streams (`createLandscapeEcosystemLedger` → `createLandscapeReservedShare`, the ocean's pattern) whenever the budget is at least the shipped profile; asset sets, resident tiles, sidecar indexes and the worker's caches are accounted inside it, and an inert ecosystem releases it to the streams. The shipped profiles grew by exactly the share (D3): `LANDSCAPE_STREAMING_BUDGETS` 688 / 432 → 752 / 528 MiB, `LANDSCAPE_SURFACE_CACHE_BUDGETS` 688 / 624 → 752 / 720 MiB at 1920 × 1080 (860 and 1,222 at 2560 × 1440 and 3840 × 2160), `streamReserveGpuBytes` 432 → 528 MiB, appearance ceilings 344 / 216 → 376 / 264 MiB |
| Viewer | `landscapeEcosystem=auto\|off\|<sidecar manifest url>` (default `auto`: the sidecar published beside the landscape, `absent` on a landscape without one), `landscapeEcosystemDiagnostic=none\|lod\|layer\|rank\|fade`; hooks `setEcosystem({mode, density, overrides, layers, diagnostic, wind, contact, shadows, visible})`, `ecosystemPick`, `ecosystemPickTrace`, `ecosystemTrace`, `ecosystemHash`, `ecosystemTile`, `ecosystemHeatmap`, `ecosystemInjectTile`, `ecosystemRemoveTile`; `snapshot().ecosystem`; the Ecosystem toggle of the panel |

## 2. Recipe model (D1)

A recipe is the versioned, data-only input of the engine. `validateEcosystemRecipe(input)` validates once at the boundary, fills the documented
defaults (so a validated recipe round-trips through JSON unchanged), deep-freezes the result and rejects anything the generator or the renderer
could not honour. Unknown fields are rejected; key order is irrelevant.

```text
{format:'landscape-ecosystem-recipe', schemaVersion:1, id, name, seed (uint32),
 zones:{<zoneId>: LandscapeRegion (circle | rectangle | polygon)},
 assets:{<assetSetId>: AssetSet}, layers:{<layerId>: Layer},
 biomes:{<biomeId>: {label, layers:[layerId, ...] (descending priority), where:[Term, ...]}},
 targets:{<id>: {perSquareKilometer, basis}}}
```

**Biomes** are ordered sets of layers: every layer belongs to exactly one biome, and a biome lists its layers in descending competition
priority (validated), so the order is the generation order. `where` terms (same form as density terms) multiply into every layer of the biome.

**Asset sets** (`ECOSYSTEM_ASSET_KINDS`): `placeholder-rocks` `{variants (1..8), seed, footprintRadiusMeters, heightMeters, lods:[{level, triangles}]}`
(deterministic procedural boulders and pebbles, §6) and `catalog-distant` `{species (one of the five vegetation species), variants:['mature_01'…],
footprintRadiusMeters, heightMeters, lods:[{level ∈ 3, 4, 5}]}` (the LOD3/LOD4 panels and the LOD5 impostor of `assets/public/vegetation_distant/`).
Later prompts add kinds for scanned rocks and the near tree LODs; the layer schema does not change.

**Layer** (`recipe.layers[id]`, defaults in parentheses):

| Field | Meaning |
| --- | --- |
| `assetSet`, `generation` | the asset set it draws; `offline` (baked into the sidecar by the leaf) or `runtime` (generated on demand in the worker) |
| `cell: {meters, sitesPerAxis}` | world-anchored cell size (power of two, 16..1024 m) and lattice sites per axis (power of two, 4..256); the site spacing is `meters / sitesPerAxis` (`ecosystemLayerSpacing`) |
| `footprint: {radiusMeters, clearanceMeters}` | the feature's own radius and the clearance it demands from other layers' features |
| `jitter` (0.35) | site displacement as a fraction of the spacing, 0..0.5; validation requires `spacing × (1 − 2·jitter) ≥ 2·radius` unless the radius is 0, so kept sites of one layer never overlap |
| `alignment: {mode, slopeWeight, sinkMeters, sinkScalesWithSize}` | `upright` (slopeWeight 0), `slope` (1) or `sunk` (a positive sink along the instance up axis); `slopeWeight` mixes world up toward the ground normal |
| `variation: {scale:{min, max, distribution}, yaw, tint:{value:[a,b], channels:{r,g,b:[a,b]}}}` | scale uniform or log-uniform; yaw `random`, `none` or `downslope`; tint multipliers (value × channel) around 1 |
| `viewDistanceMeters`, `lods:[{level, distanceMeters}]`, `fadeMeters` (max(5, 5 % of the view distance)) | the LOD chain by far distance, strictly increasing in level and distance, the last reaching the view distance; the dithered cross-fade band |
| `shadow: {castLevels, maxDistanceMeters}` ([], 0) | the shadow-caster hooks AI 600 drives |
| `rules.density: [Term]` | `Term = {input, curve:[[x,y],…], group?}`; see below |
| `rules.clumping` (null) | `{wavelengthMeters, contrast, threshold, octaves}`: world-anchored noise, `clump = smoothstep(threshold − contrast/2, threshold + contrast/2, noise)`, density × `mix(1 − contrast, 1, clump)` |
| `rules.parent` (null) | `{layer, count:[min,max], radiusMeters:[min,max], inheritScale}`: a child layer spawns around the parent layer's features instead of a lattice (the parent must have a higher priority and no parent itself; the radius is at most half the parent's cell) |
| `rules.competition: {priority, clearanceMeters (footprint.clearanceMeters), against: 'all' \| [layerIds]}` | priorities are unique per recipe; a layer competes only against higher priorities; the competition distance to layer A is `max(rA + rB, clearanceMeters)` (`ecosystemCompetitionDistance`) and must not exceed half of A's cell, so one ring of A's cells covers the halo (`ecosystemLayerHaloMeters`) |
| `rules.exclusions: [{zone, marginMeters (0)}]` | built-in zones `planning-cover`, `roads`, `districts`, `water`, `faces`, `view-corridor` or a recipe zone; distinct per layer |

**Rule inputs** (`ECOSYSTEM_RULE_INPUTS`, plus one `distance.layer.<layerId>` per layer, `createEcosystemInputCatalog(layerIds)`) are named scalars at a
position, each with a documented neutral value that stands in when its source is absent, so a recipe evaluates on any landscape and the trace reports
which sources were read:

| Input | Source | Neutral |
| --- | --- | --- |
| `slopeDegrees`, `aspectNorth`, `aspectEast`, `altitudeMeters` | the exact native sample: slope, the downslope direction's north/east components (trig-free), height above sea level | 0 |
| `moisture`, `light`, `shoreDistanceMeters`, `flow`, `deposition`, `rockExposure`, `convexity` | terrain fields (wetness, sky view, signed shore distance ±256 m, flow, deposition, rock exposure, convexity) | .5, 1, 256, 0, 0, 0, 0 |
| `planningShare`, `soil.<id>`, `naturalSoil.<id>`, `cover.<class>` | 1 where the nearest native cover is planning-only (5–7); the semantic soil (`resolveLandscapeSoil`); the display soil (the terrain-driven natural soil under planning cover, the semantic soil elsewhere); the land-cover class (water, sand, grass, forest, rock, urban, road, runway) | 0; `soil.unknown` 1; `naturalSoil.unknown` 1; 0 |
| `geology.<channel>`, `geology.depositType.<label>`, `geology.drainage.<label>`, `geology.coastalZone.<label>`, `geology.lithology` | the AI 596 geology sidecar: the eight decoded channels, one-hot labels, the stratum label | 0; the first label (none, hillslope, inland) 1; 0 |
| `distance.roads`, `distance.districts`, `distance.water` | distance to the nearest planning road edge (centerline less half the width), to the nearest district polygon (0 inside), to the sea (the positive shore distance; 0 at or below sea level); all saturate at 256 m (`ECOSYSTEM_DISTANCE_CAP`) | 256 |
| `distance.cover.<class>`, `distance.layer.<id>` | distance to the nearest native sample of that cover, saturating at 40 m (`ECOSYSTEM_COVER_DISTANCE_METERS`); to the nearest feature of a higher-priority layer, saturating at the generation halo (§3): both pure functions of the position | 256 |
| `dressing.<grassDensity\|shrubSuitability\|treeSuitability\|rockScatter\|beachDebris>` | `sampleLandscapeDressingInputs` of the display soil, the planning share and the fields, exactly as the terrain shader's mirror evaluates them (the AI577 contract keeps its documented meaning) | the neutral-field values |

**Density.** A term's curve is piecewise linear in its input (2..16 points, strictly increasing x, y in [0, 1], clamped outside). Terms that share a
`group` combine by maximum (an "any of these habitats" rule); groups multiply (every condition must hold); a term without a group is its own group
(`compileEcosystemDensity`, `evaluateEcosystemDensity`). The traced evaluation `traceEcosystemRule(groups, vector, {clumping, densityScale, excluded})`
returns `density = min(1, curveDensity × clumping × densityScale)` (0 when an exclusion rejected the site), the factors of every term and the
exclusion reason: the inspection hook shows this trace for a picked instance. A site is kept when its blue-noise rank is below the density (§3).

**Inputs at a position.** `createEcosystemInputSampler({layerIds, sources})` fills a `Float64Array` indexed by the catalog from renderer-independent
sources (`terrain`, `fields`, `naturalSoil`, `geology`, `roadDistance`, `districtDistance`, `viewCorridor`, `coverDistance`, `layerDistance`; all but
`terrain` optional) and reports `availability` per source; `ecosystemExcludedBy(zone, marginMeters, sample, context)` evaluates one exclusion
(`planning-cover` is the nearest cover or, with a margin, any planning cover within it; `roads` and `districts` compare the distances with the margin;
`water` is below sea level or within the margin of the shoreline; `faces` is geology `faceMask ≥ 0.5`; `view-corridor` is the retained open-view
polygon; a recipe zone is its region grown by the margin).

**Overrides** (`landscape-ecosystem-overrides`, the data-only fine-tuning hooks of roadmap §6):

```text
{format, schemaVersion:1, id, recipe,
 regions:[{id, region, layers:{<layerId> | '*': {densityScale (1), scaleMultiplier (1)}}}],
 masks:[{id, mode:'include'|'exclude', region, layers:'*' | [layerIds]}],
 instances:{removed:[instanceId, ...], pinned:[{layer, id, x, z, yaw, scale, variant}]}}
```

Applied in this order (`ECOSYSTEM_OVERRIDE_ORDER`): region parameter overrides and include masks are read during generation
(`ecosystemOverrideParameters(overrides, layerId, x, z)`: the product of the matching regions' scales, a layer entry over a `'*'` entry; inside an
include mask the layer's exclusions are skipped, which cannot be undone after the fact); after generation `applyEcosystemOverrides(tile, {layerId, bounds,
overrides, groundAt})` removes the features inside exclude masks, then the removed instance ids, then appends the pinned instances of the layer whose
anchor lies in the tile (rank 0, so coarse coverage keeps them; child −2; placed on the exact ground the caller samples). Overrides survive regeneration
because they are keyed by region geometry and structural ids; `ecosystemOverridesIntersecting(overrides, layerId, bounds)` lists the ids that enter a
tile's content key, so an edited override invalidates only the tiles it touches.

**Development recipe.** `tools/bake_landscape/ecosystem/recipes/coastal-v3-ecosystem-v1.json`: the two D5 proof layers `boulders` (offline, 256 m cells
at 4 m spacing, rock soil, talus, platform and bluff toe, sunk and slope-aligned, three LODs to 900 m) and `shrubs` (offline, 128 m cells at 4 m spacing,
scrub, woodland edges within 35 m of forest cover, foredune and bluff-crown scrub, the catalog's arrowwood viburnum LOD3/4/5 to 600 m), the runtime
proofs `pebbles` (32 m cells at 0.5 m spacing on talus, the platform, the backshore and exposed rock, drawn within 60 m) and `boulder-scree` (children
of boulders), one biome `coastal-natural`, the swim zone as a rectangle, and the declared targets per km² with their reference basis (boulders 3,000,
shrubs 6,000, trees 25,000, pebbles 1.5 M, ground cover 1 M, clutter 5 M). Its densities are placeholders tuned in D5.

Verification: `tests/node/unit/landscape_ecosystem_recipe.test.js` (round trip, identity, 24 rejections, competitors and halos, curves and traces, the
sampler against synthetic sources including the exact dressing reproduction, exclusion zones, the record codec, overrides, manifest attachments).

## 3. Generation (D2)

`EcosystemGeneration.js` generates one cell of one layer as a pure function of the recipe, the overrides, the inputs at its sites and the already
generated features of the higher-priority layers inside its halo, so the Node bake, the browser worker and the inspection trace share one
implementation (`generateEcosystemCell`, `traceEcosystemSite`, `generateEcosystemLayerCells`).

**Lattice and ranks** (`EcosystemLattice.js`, `EcosystemBlueNoise.js`). Sites `(sx, sz)` are global integers with spacing `s`; a site's position is
`((sx + 0.5 + jx) s, (sz + 0.5 + jz) s)` with jitter `jx, jz ∈ [−jitter, jitter]` from the site's hash (channels 0 and 1 of `ecosystemSiteHash(salt,
sx, sz, channel)`, a murmur-mixed integer hash over the layer salt = hash of the recipe seed and the layer id). A site's rank is the committed 64 × 64
toroidal void-and-cluster table read at `(sx mod 64, sz mod 64)` (Ulichney 1993, toroidal Gaussian of sigma 1.5 texels, seeded through the surface
noise's murmur hash; generated and byte-compared by the `landscape/ecosystem/blue-noise` leaf). A site is a candidate when `rank < density`: any
density threshold is therefore a blue-noise subset, seamless across cells because sites are global, local because a site depends only on its own
inputs, and rank-sorted tiles carry their coarse versions as prefixes. The table beats white noise at every tested density (nearest-neighbour mean
5.83 / 2.58 / 1.23 spacings at 2 / 10 / 30 % against 3.71 / 1.68 / 1.09; `d2/blue-noise.json`) and its selections are isotropic, while a jittered lattice at
full density fails the anisotropy test (`landscape_ecosystem_blue_noise.test.js`, `landscape_ecosystem_generation.test.js`).

**Per site**, in this order (every step deterministic and trig-free except the `downslope` yaw's `Math.atan2`): sites whose rank exceeds the layer's
largest reachable density (`maxDensity` = the product of the curve maxima × the biome maxima × the density scale × the largest override scale touching
the cell) are skipped without sampling — an exact shortcut that keeps a sparse layer cheap on a dense lattice (boulders: 922,624 of 1,048,576 sites
culled on v3); the jittered position; the D1 input vector (`createEcosystemCellSources`: the exact native triangle for height, normal and slope; the
field, natural-soil and geology pages of the owning native chunk; the planning references; exact Euclidean distance transforms of the cover classes
over the cell grown by 40 m, read at the nearest native sample; the nearest feature of each referenced layer); the override parameters; the exclusion
zones in recipe order unless an include mask lifts them; the density (curve groups × biome `where` groups × clumping × scales, clamped); `rank <
density`; competition against the bucketed features of every higher-priority layer in `against` within `max(rA + rB, clearance)`; the variation
(scale, yaw, variant, tint) from independent hash channels 2–8. A **child layer** has no sites: for every parent feature whose disc of the maximum
child radius reaches the cell it spawns `count ∈ [min, max]` children (hash channel 0 of the parent identity) at hashed radii (1) and directions (2,
`ecosystemUnitDirection`, trig-free), keeps those anchored inside the half-open cell whose keep hash (3) is below the local density, ranks them by that
hash, and scales them by `own × (1 + (parentScale − 1) × inheritScale)`; pinned parents spawn none. Finally `applyEcosystemOverrides` runs on the same
ground sampler and the tile is sorted by rank, site x, site z, child.

**Ownership and locality.** A position belongs to the native chunk and page whose column is `min(n − 1, floor((x − minX) / chunkMeters))` and row `min(n − 1,
floor((maxZ − z) / chunkMeters))` (the east and south neighbours own shared borders). A layer reads other layers within its **generation halo**
(`ecosystemLayerGenerationHalo`): the competition distances, the parent radius and the `distance.layer.*` curve reaches, each validated to at most half
the referenced layer's cell so one ring of its cells covers the halo. `generateEcosystemLayerCells` memoizes the referenced cells of higher-priority
layers through one cache (`createEcosystemCellCache`), so one cell, a sub-area or the whole landscape generate identical bytes: the leaf's gates
regenerate 8 cells per layer (identical) and reproduce 4 cells per layer inside their 3 × 3 block (identical), and the unit tests show that raising
heights inside one native chunk changes only the tiles whose dependency reach intersects it while every other record stays bit-identical.

**Cell sources** (`EcosystemCellSources.js`): `ecosystemCellRequirements(manifest, layer, cellX, cellZ, haloMeters)` names the native chunks a cell
needs; `createEcosystemCellSources({manifest, chunks, fieldPages, naturalSoilPages, geologyPages, planning, layerFeatures})` turns in-memory data into
the D1 sources (the bake reads them from the cache directory through `tools/bake_landscape/ecosystem/EcosystemFileSources.mjs` with bounded LRU
caches of 24 chunks and pages; the worker fetches them). Roads: the nearest centerline segment less half the width (0 on the road) over the roads
within 256 m of the cell; districts: 0 inside a polygon, else the edge distance; the view corridor: the retained open-view polygons. Fields and
geology must be bound to the current terrain with no stale native (the bake refuses stale pages); an absent sidecar leaves its inputs neutral and is
recorded as absent. About 15 µs per sampled site in Node.

**Statistics gate** (`EcosystemStatistics.js`, `ecosystemSpatialStatistics(records, count, {spacing, minimumSpacing, area})`): nearest-neighbour
distances by a grid hash (mean, minimum, coefficient of variation), the count of pairs closer than the declared minimum spacing (must be 0), the pair
correlation g(r) in bins up to three spacings against a Poisson process of the same intensity, and the anisotropy of nearest-neighbour directions in
eight 45° sectors (chi-square against uniform; 7 degrees of freedom, 99 % quantile 18.48). The anisotropy statistic is reported per layer and gates
isotropic habitats; on a layer whose habitat is itself linear (the shrubs' woodland-edge mantle) it is informational.

## 4. Sidecar (D2)

`<landscape>/ecosystem/manifest.json` (≤ 1 MiB) with an immutable `manifest.<sha256>.json` snapshot, one content-addressed tile index per offline
layer `layers/<layerId>.<sha256>.json` (≤ 1 MiB, url relative to the manifest) and content-addressed payloads `layers/tiles/<sha256>.bin` listed in an
index as `tiles/<sha256>.bin` (every url relative to the file that lists it, the cache convention; `loadLandscapeEcosystemTile(tile, {indexUrl})`
resolves against the index). Indexes omit empty cells. Strict validation (`validateLandscapeEcosystem(value, landscape?)`,
`validateLandscapeEcosystemTiles`), unknown fields rejected, binding errors as `LandscapeEcosystemBindingError`:

```text
{format:'landscape-ecosystem', schemaVersion:1, landscapeId, revision:'ecosystem-<24 hex>',
 terrain:{revision, manifestSha256, seaLevel, bounds, grid, chunks:[{id, height, landCover}]},
 recipe (validated), overrides (validated | null), densityScale,
 dependencies:{recipeIdentity, overridesIdentity | null, fieldsRevision | null, geologyRevision | null, planningSha256s:[...]},
 layers:[{id, generation, priority, cell:{meters, sitesPerAxis}, assetSet, instanceCount, bounds | null, tiles:{url, byteLength, sha256, count} | null}],
 statistics, provenance:{algorithm:'landscape-ecosystem-v1', recipeSha256, measured:false, rights, derivedFrom}}
index: {format:'landscape-ecosystem-tiles', schemaVersion:1, layer, tiles:[{id, cellX, cellZ, bounds, count, contentKey, payload:{url, byteLength, sha256}}]}
```

The revision hashes the pretty-printed sidecar with a null revision (`landscapeEcosystemRevision`). A tile's `contentKey` is the SHA-256 of the
canonical JSON of everything that can change its bytes (`ecosystemTileContentInput`): the algorithm, the recipe identity, the layer and cell, the
density scale, the native chunks inside the cell grown by the layer's **dependency reach** (`ecosystemLayerDependencyMeters`: the 40 m cover halo and,
recursively, every referenced layer's reach plus its own dependency) with their height and land-cover hashes, the field and geology revisions and the
override entries touching the cell (regions, masks, pins and the removed ids of its sites). Staleness reuses the fields' semantics
(`landscapeEcosystemStaleness`: a native whose hashes changed is stale, 8 × 8 stale cells; `ecosystemTileStale(sidecar, landscape, layerId, tile)` marks
a tile stale when any native of its dependency reach is); stale tiles are never loaded silently. Runtime layers are listed with `tiles: null`.

**Bake** (`tools/bake_landscape/ecosystem/`, `node tools/bake.mjs --target landscape/ecosystem [--publish]`, options `directory`, `recipe`, `overrides`,
`density`, `layers`, `receipt`; depends on `landscape/ecosystem/blue-noise`; Node only, outside `all` and the landscape import parent): validates the
recipe, binds the terrain, fields, geology and planning, generates every offline layer over the landscape bounds in descending priority through one
cell cache, applies the overrides, runs the determinism, seam, spacing and statistics gates, writes the receipt (counts, exclusions, per-km²
densities by cover against `recipe.targets`, statistics, timings, memory) and on `--publish` stages, re-reads and re-verifies every byte, keeps the
previous snapshot, installs the payloads and indexes and switches `ecosystem/manifest.json` last. The cache bundle verifier lists the sidecar among its
current pointers (`LANDSCAPE_CACHE_POINTERS`).

Coastal v3 publication 2026-10-15 (`d2/ecosystem-bake.json`): revision `ecosystem-2db5078ccfd7dfae52d97808`, identical over three runs (one from an
empty directory); boulders 2,068 instances in 143 tiles (of 256 cells; 922,624 of 1,048,576 sites culled by the density bound, 22,005 excluded by
planning cover, 3,557 by districts, 1,592 by the swim zone, 615 by the view corridor, 204 by roads, 96 by faces), shrubs 2,973 in 592 tiles; generation
17.3 s (boulders 7.6, shrubs 9.7), gates 3.1 s, 482 MiB RSS; 1,304 chunk and page reads through the 24-entry caches; sidecar 781,278 bytes (manifest
87,731, indexes 391,087, 735 payloads 302,460). Gates: determinism 8 / 8 and seams 4 / 4 per layer, close pairs 0, nearest-neighbour minimum 5.81 m
(bound 1.2) and 10.18 m (bound 2.0), pair correlation 0 below five metres; anisotropy χ² boulders 2.36 (passes), shrubs 55.7 (the linear woodland-edge
habitat, informational). Densities: boulders 2,901 per km² of exposed rock (target 3,000), 164 on forest soil, 261 on sand (the platform and bluff
toe); shrubs 343 per km² of grass and 346 of forest against the 6,000 target (the placeholder curves cap at 0.09–0.14 and most grass lies inside the
excluded planning districts; D5 tunes the recipe).

## 5. Streaming (D3)

`createLandscapeEcosystemStreamer({landscape, url, budget, createRenderer, planning, densityScale, overrides, signal})`
(`src/graphics/engine3d/landscape/ecosystem/LandscapeEcosystemStreamer.js`; every planning and admission decision is a pure function of plain data in
`LandscapeEcosystemStreamingPlan.js`, Node-tested). It implements the content-layer residency the streaming and planning-report specs reserved
(`LANDSCAPE_STREAMING.md` leases and budgets, `LANDSCAPE_PLANNING_REPORTS.md` "Future content-layer residency"): a layer descriptor is the sidecar's
layer entry (stable id, revision and content keys, bounds, its own cell index, the LOD and fade semantics of the recipe, and the declared dependencies
on the terrain revision, the native hashes, the field and geology revisions and the override entries); roads and buildings will carry theirs the same way.

**Address and binding.** `landscapeEcosystemUrl(manifestUrl, manifest, option)`: the option's URL, else the manifest attachment of kind
`landscape-ecosystem`, else `ecosystem/manifest.json` beside the landscape manifest (a pinned `manifest.<sha>.json` resolves to the same directory). The
sidecar is loaded through the bounded loader (a 3 MiB decode credit reserved first) and bound before anything else is reserved: statuses `active`,
`active-partial` (some natives changed since the bake: their tiles are stale and never loaded, the rest stream), `absent` (404, the ordinary state of a
landscape published without an ecosystem), `disabled`, `invalid`, `binding-mismatch`, `stale`, `budget-denied`, `failed`; an inert handle holds nothing,
says why in `snapshot().ecosystem` and releases the share to the streams. The renderer and asset sets come from the recipe embedded in the sidecar through
the view's factory (`createRenderer(recipe, {signal})`), so the streamer owns and disposes them and stays free of three.

**Planning per frame** (`planEcosystemLayerCells`): for each visible layer the desired cells are those whose boxes (the cell bounds over the layer's
height range, grown by the asset height) meet the disc of `viewDistanceMeters` around the camera's ground position, lie inside the landscape bounds
and pass the frustum planes (Gribb–Hartmann from the view-projection product, the terrain planner's box test), nearest first; a resident cell stays
until it leaves the disc grown by the keep hysteresis 1.15. The merged desired list is served by at most `maxInFlight` = 4 jobs in the ecosystem worker
(priority 20 in the pool); one decoded tile attaches to the renderer per frame within the upload allowance the view passes (its bytes count in the
frame's 8 MiB cap beside geometry, surround, appearance and planning); a tile that stops being desired is cancelled (its abort signal, the pool's
cancellation); tiles leaving the keep disc detach, runtime tiles into a bounded 8 MiB most-recently-used cache that saves their regeneration. The
measured plan cost on the D3 dolly is 0.11 ms mean, 2.9 ms peak (`d3/ecosystem-streaming-suite.json`).

**Worker** (`LandscapeEcosystemWorker.js`, one module worker through `LandscapeWorkerPool`): job `tile` fetches, hash-verifies and decodes a published
payload; `generate` builds a runtime layer's cell with the domain's own `generateEcosystemCell` over `LandscapeEcosystemWorkerSources.js`, the bake's file
sources mirrored over the bounded loaders (native chunks, field, natural-soil and geology pages, the higher-priority layers' features for the halo
ring: published tiles, or runtime cells generated recursively) with LRU caches of 8 chunks, 6 pages and 64 cells whose bytes are one standing reservation
in the share; `trace` re-evaluates the rule at a site with every factor named; `hash` returns the SHA-256 of a cell's encoded tile. Node and the worker
produce identical bytes: the D3 gate hashes the runtime cells `pebbles/x40/z82` (1,338 instances) and `x39/z83` (1,328) in Node through the bake's sources,
in the worker and as resident tiles, all equal.

**Residency.** Every byte is a reservation in the ecosystem share (`createLandscapeEcosystemLedger`, kind `landscape-ecosystem`) made before the job
starts: a published tile reserves `records + ids` CPU and `records` GPU from its index entry, a runtime cell a provisional half of its sites corrected
on arrival; the sidecar indexes and the worker caches are standing reservations (19.0 MiB on v3: indexes 1.5, worker caches 17.5), the asset sets
their own (26.4 MiB). A denial first evicts tiles nobody wants, then admits the longest rank prefix that fits (the coarse coverage of the record
contract), materialized so the accounted bytes are the held bytes, and reports `degradationReason` (`ecosystem-cpu-budget` / `ecosystem-gpu-budget`);
a budget below the shipped profile reports the ecosystem `unavailable` while the terrain streams. The renderer leases a tile while it is attached
(a plain counter: a reserved share offers no ledger leases); eviction detaches first; `off` and disposal release every ecosystem byte (verified to zero).
Measured on v3 (`d3/`): NW-04 23 tiles / 8,563 instances resident, share 45.9 / 26.8 MiB CPU / GPU; NW-06 39 tiles / 199 instances; NW-03 33 tiles /
5,362 instances, 46.2 / 27.0 MiB; the 60-step dolly keeps the frame uploads at a 7.1 MiB peak (the ecosystem's 88 KB) with every frame drawn and a worker
round trip of 267 ms mean (729 peak); a teleport to NW-11 cancels 6 of 17 pending jobs and evicts to 0 resident.

**Invalidation.** A terrain edit changes native hashes: the sidecar's staleness marks the tiles whose dependency reach touches them, which are never
loaded (`active-partial`). `setEcosystem({overrides})` re-derives the resident offline tiles in place through `applyEcosystemOverrides` (no refetch;
the D3 gate drops a tile's drawn count 34 → 0 under an exclude mask) and regenerates the runtime cells (14 on the gate); `setEcosystem({density})`
regenerates the runtime layers only, since offline tiles carry the baked scale (`snapshot().ecosystem.densityScale` reports both). A recipe change is a
new sidecar revision (re-bake).

**Snapshot** (`snapshot().ecosystem`): status and reason, url, revision, recipe id and identity, binding (landscape id, terrain revisions, stale chunks,
field, geology and planning bindings), settled, per layer (generation, priority, visible, desired, resident, pending, cached, published, stale,
instances, drawn, degraded, bytes, counters, failures, keep radius), resident and drawn totals, standing and share bytes, uploads, degradation,
invalidations, the runtime cache, the worker pool, the determinism checks, timing (plan and load), the renderer's snapshot (§6) and the share.

## 6. Rendering (D4)

`createLandscapeEcosystemRenderer({recipe, assetSets, scene, renderer, lighting, lightingTier, ledger, camera, framePasses})`
(`src/graphics/engine3d/landscape/ecosystem/LandscapeEcosystemRenderer.js`; constants and JavaScript mirrors in `LandscapeEcosystemModel.js`,
`landscape-ecosystem-runtime-v1`).

**Draw units.** A resident tile `{id, layerId, cellX, cellZ, bounds, heightRange, records, ids, count}` (rank-sorted D1 records, bound by reference)
becomes one `THREE.Mesh` per LOD band of its layer over a `THREE.InstancedBufferGeometry` that shares the asset geometry's attributes and index and
binds the records as one `InstancedInterleavedBuffer` of twelve floats (`instanceAnchor`, `instanceScale`, `instanceNormal`, `instanceYaw`,
`instanceVariant`, `instanceRank`, `instanceTint`); the instance count is the admitted rank prefix (`setDrawFraction`, coarse coverage under budget
pressure). The asset's variants are merged into one geometry whose vertices carry their variant index and draw only for instances of that variant.
three.js frustum-culls each mesh by a bounding sphere from the cell bounds, the height range and the asset height × the largest scale
(`ecosystemTileSphere`); a (tile, band) mesh is visible only while the camera's distance range to the tile (`ecosystemBoxDistanceRange`) meets the
band's non-zero fade span, grown by the hysteresis 1.1 once visible (`ecosystemBandVisible`). Draws per tile = the layer's LOD count. One zero-record
proxy per material links the programs before any tile arrives (`renderer.compileAsync`, parallel on `KHR_parallel_shader_compile`, 90 s limit);
a lighting-tier or diagnostics change links the new material set in parallel while the current one draws, then every mesh switches at once.

**LOD bands** (`ecosystemLodBands(layer)`): band k draws `lods[k].level` from the previous band's distance to its own, cross-fading over `fadeMeters`
centred on each inner boundary (fade-in `[near − f/2, near + f/2]`, fade-out `[far − f/2, far + f/2]`); the first band never fades in and the last
fades out inside the view distance (`[far − f, far]`), so nothing draws beyond it. The vertex program evaluates both ramps at the camera distance
to the anchor (`ecosystemInstanceFade` is the mirror), the fragment program discards where the fade is below the 8 × 8 Bayer threshold shifted by the
instance rank (`ecosystemDitherThreshold`), so neighbouring instances dither out of step and a transition never pops.

**Instance frame** (`ecosystem_instance.vert.glsl`): `up = normalize(mix((0, 1, 0), groundNormal, slopeWeight))` with the ground normal recovered
from the record (`ny = sqrt(1 − nx² − nz²)`), `east` the world x axis made orthogonal to `up`, `north = cross(east, up)` (right-handed: a mirrored
basis flips the winding and shows the rocks inside out), the yaw rotates `east`/`north` about `up`, the origin is the anchor sunk by
`sinkMeters × (scale or 1)`, the position scales uniformly. Faded-out vertices (or vertices of another variant) collapse behind the far plane. The
**impostor** variant (`LANDSCAPE_ECOSYSTEM_IMPOSTOR`) builds the distant catalog's card in the shader from the camera direction in the instance frame:
the nearest of the 16 views (8 azimuths from −72° in 45° steps × elevations −8° and 15°, `ecosystemImpostorView` mirrors `selectDistantView`), the
card facing the camera with the world up, hung from the view's projected root point (`uEcosystemImpostorFrames`: width, height, root offset) with
the view's atlas rectangle (`uEcosystemImpostorViews`) as texture coordinates — the CPU updater of `DistantTreeBillboard.js` moved to the GPU, so
LOD5 instances. **Wind hook**: `uEcosystemWind` (direction x, z, strength in metres at the asset top, time) sways the position by the squared height
fraction with a per-anchor phase; strength 0 (the default) is still, so captures are deterministic.

**Shading** (`ecosystem_instance.frag.glsl`): the textured variant (`LANDSCAPE_ECOSYSTEM_TEXTURED`, the catalog assets) samples the per-variant
wood atlases and the shared leaf atlas with explicit gradients, alpha-tests at 0.5, builds the tangent-space normal, and reads roughness and
occlusion from the ORM maps; the placeholder rocks use constant albedo and roughness with a per-vertex crease shade as occlusion. Both apply the
per-instance tint, darken the lowest metres toward the ground (`uEcosystemContact`: strength 0.3 over 0.5 m by default, bounded to half the instance
height), and light the opaque surface with the landscape chunks (`landscapeReflectedRadiance` with `landscapeAirLight`, the natural-ground response
of the asset kind, the neutral terrain visibility of a program without terrain fields) under `landscapeAerialPerspective`, writing linear radiance
with alpha 1 for the frame pipeline (`tonemapping_fragment` and `colorspace_fragment` compile out under the linear target like the terrain's). The
diagnostic views (`uEcosystemDiagnostic`: 1 LOD band colour, 2 layer colour, 3 rank, 4 fade; compiled in on request) write display-ready colours with
the alpha-0 sentinel the final pass passes through.

**Asset sets** (`EcosystemAssetSets.js`, reserved in the ecosystem share): `placeholder-rocks` (`EcosystemPlaceholderRocks.js`) displaces an icosphere
per variant and LOD with value noise from the asset seed, flattens it toward the base so the footprint radius sits on the ground and the height
reaches `heightMeters`, and records a crease shade per vertex (v3 recipe: 320 / 80 / 20 triangles per variant, pebbles 80 / 20);
`catalog-distant` (`EcosystemCatalogAssets.js`) loads the species' LOD3 and LOD4 GLBs (viburnum 36 and 12 triangles) and the LOD5 atlas with its 16
view records through `GLTFLoader` + `KTX2Loader` (shared textures per renderer; 27.6 MB CPU and GPU for the viburnum set, the textures dominating).

**Hooks and inspection.** `setShadows({enabled})` sets `castShadow` on the meshes of each layer's `shadow.castLevels` (AI 600 adds the shadow
maps); `setContact`, `setWind`, `setVisible`, `setLightingTier`, `setDiagnostic`. `pick(ray)` tests the admitted instances' bounding spheres (anchor +
up × height × scale / 2, radius `max(footprint, height / 2) × scale`) of the tiles the ray passes within reach and returns the nearest `{layerId,
tileId, index, id, record, distance}`; the view's `ecosystemPick(clientX, clientY)` raycasts from the camera (matrices updated first). The snapshot
reports tiles, instances, drawn, draws, triangles (submitted and visible), per layer and per level, the diagnostic, wind, contact, shadows, the share,
the program compile and the frame cost.

**Viewer.** `LandscapeView` holds the share (`ensureEcosystemShare`, the ocean's profile rule), creates the streamer in the background after the
planning overlay (the streamer builds the asset sets and the renderer from the sidecar's recipe), applies the kept state (`setEcosystem`), updates it every
frame after the appearance with the remaining upload allowance, and keeps `ecosystemInjectTile(tile)` (reserving `records + ids` CPU and `records` GPU in
the share) and `ecosystemRemoveTile(id)` as the renderer's standalone test path (injected tiles are never fetched nor evicted by the streamer).

Verification (`d4/`): `landscape_ecosystem_model.test.js` (bands and fade, impostor view parity with `selectDistantView`, dither permutation, option,
share); `landscape_ecosystem_render.pwtest.js` on coastal v3 (synthetic tiles of every asset set at NW-04 and NW-06: draws and instances as injected,
10 materials as 3 program variants linked in 126–139 ms, the LOD colour diagnostic agreeing with the picked instance's band on 1,097 of 1,098 pixels,
a 40-step dolly with per-frame mean differences of median 4.34 and peak 7.72 (no pop above 3 × the median), picking the aimed instance at 5.55 m,
the boulder covering its anchor pixel and ending 35 rows below it against a 40-row rim projection, removal and disposal to zero).

## 7. Proof layers and scaling (D5)

The development recipe's `boulders` (placeholder rocks on rock soil, talus, the platform and the bluff toe) and `shrubs` (the catalog's arrowwood
viburnum on scrub, the woodland-edge mantle, foredune and bluff-crown scrub) run end to end on coastal v3 beside the runtime `pebbles` and
`boulder-scree`, published as `ecosystem-4c1692c4e6e0a9844e84a67c` (2,258 boulders in 143 tiles, 12,433 shrubs in 619; `d5/bake/`). Targets are
declared per km² in `recipe.targets` with their reference basis; achieved per cover class: boulders 3,192 per km² of exposed rock (target 3,000),
shrubs 1,377 on grass, 1,384 on forest soil and 2,872 on the bluff crown (the 6,000 target names the 35 m edge band, which the per-class receipt
does not isolate). Scaling at 1×, 2× and 4× the density (`landscape_ecosystem_scaling.pwtest.js`, `d5/scaling.md`, RTX 3060 at 1920 × 1080, cache
on, the GPU shared with Blender): resident at NW-04 46–47 tiles with 8,957 / 9,449 / 10,402 instances in 65–66 draws, the share 46–47 MiB CPU and
27 MiB GPU (the viburnum textures 27.7 MB of it), the frame vsync-bound at 17.5 ms in every run including the baseline without the ecosystem, the GPU
pass 8.2–9.1 ms in every run (the ecosystem below the run-to-run noise at these counts), CPU frame work 2.3–3.0 ms, the plan 0.11 ms mean, the
worker round trip 138–153 ms mean, the ecosystem's uploads 88 KB per frame at most. Bottlenecks for the content prompts: the merged-variant draws
submit every variant's triangles per instance (1.52 M submitted for 8,957 instances, a third rasterised: AI 601 draws per variant); texture
memory dominates (one species' distant set 27.7 MB against 0.5 MB of records: AI 601 needs its own texture residency by LOD and distance); the
worker fills about 60 tiles per second (dense near-field layers generate on coarse cells or the GPU); records themselves are cheap (190,000 trees
≈ 11 MB). Tools: `capture.mjs --ecosystem auto|off|<url> --ecosystem-diagnostic lod`, `ecosystem_statistics.py`, `ecosystem_scaling.py`; evidence
`tests/artifacts/screens/landscape/ai599/d5/` (`captures/composites/NW-03..NW-10.png` `[off | on]`, `lod-sheet.png`, `scaling.png`, `bake/statistics-x1.png`).

## 8. Integrated acceptance (D6)

Pending D6.
