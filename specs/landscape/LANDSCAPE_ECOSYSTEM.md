# Landscape ecosystem engine (AI 599)

Status: D1 (ecosystem recipe model) delivered 2026-10-15 on `codex/landscape`; D2 (deterministic hierarchical generation), D3
(content-layer streaming), D4 (instanced renderer), D5 (proof layers at scale) and D6 (integrated acceptance) follow, each recorded
here when it passes. This page is the canonical contract of the natural-content placement and rendering framework the roadmap's
layers L3–L6 share (`LANDSCAPE_NATURAL_WORLD_ROADMAP.md` §4–§6): how biomes and layers are declared, how features are generated
deterministically per world-anchored cell, how the generated tiles are published and streamed through the landscape residency
contracts, and how they are drawn as culled, LOD-selected instanced batches. AI 601 (forests), AI 602 (rocks and cliffs) and AI 603
(ground vegetation and clutter) deliver their ecosystems on this engine; nothing here is hand-placed (procedural-first contract,
roadmap §6). Every number quoted is copied from a receipt under `tests/artifacts/screens/landscape/ai599/` (paths given).

## 1. Contract

| Item | Value |
| --- | --- |
| Algorithm | `landscape-ecosystem-v1` (`ECOSYSTEM_ALGORITHM`, `src/app/landscape/ecosystem/`) |
| Recipe | `landscape-ecosystem-recipe` schema 1 (`validateEcosystemRecipe`); identity `ecosystem-recipe-<24 hex>` = SHA-256 of the canonical JSON (sorted keys at every depth, `canonicalEcosystemJson`) |
| Overrides | `landscape-ecosystem-overrides` schema 1 (`validateEcosystemOverrides`); identity `ecosystem-overrides-<24 hex>` |
| Record | `ecosystem-instance-v1` (`ECOSYSTEM_RECORD`): twelve little-endian float32 per instance (x, y, z, scale, normal x, normal z, yaw, variant, rank, tint r g b) followed by three int32 (site x, site z, child); 60 bytes per instance in a tile payload; rank-sorted so a prefix is a lower-density version of the tile |
| Instance id | `<layer>:<sx>,<sz>` for a lattice site, `<layer>:<sx>,<sz>:<k>` for its k-th child, `<layer>:pin:<name>` for a pinned instance (`ecosystemInstanceId`, `parseEcosystemInstanceId`); structural, never serial |
| Cell | world-anchored: cell `(cx, cz) = (floor(x / meters), floor(z / meters))`, tile id `<layer>/x<cx>/z<cz>` (z grows north like world Z) |
| Sidecar | `landscape-ecosystem` schema 1 under `<landscape>/ecosystem/` (D2, §4) |
| Manifest | `content-layers-v1` capability (`LANDSCAPE_CONTENT_LAYERS_CAPABILITY`): a terrain manifest declaring it may list `attachments` `{id, kind, url, revision}` of the kinds in `LANDSCAPE_ATTACHMENT_KINDS` (`landscape-ecosystem`); without the capability attachments must stay empty as before, so a schema-1 reader without content support refuses content it cannot interpret. The published coastal manifests are untouched: the viewer finds the sidecar beside the manifest (`ecosystem/manifest.json`) like the fields and geology, an attachment only overrides that address |
| Authority | None. Heights, soil, picking and queries stay the terrain's; an instance's `y` is the exact native height at its anchor, read from the stride-1 native chunk at generation time; nothing is ever placed outside the landscape bounds or on the far-field surround |
| Residency | kind `landscape-ecosystem` (D3/D4) |

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
(deterministic procedural boulders and pebbles, D4) and `catalog-distant` `{species (one of the five vegetation species), variants:['mature_01'…],
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
| `distance.cover.<class>`, `distance.layer.<id>` | distance to the nearest native sample of that cover within the halo; to the nearest feature of a higher-priority layer within the halo | 256 |
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

Pending D2.

## 4. Sidecar (D2)

Pending D2.

## 5. Streaming (D3)

Pending D3.

## 6. Rendering (D4)

Pending D4.

## 7. Proof layers, measurements and acceptance (D5, D6)

Pending D5 and D6.
