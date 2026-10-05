# Landscape terrain fields

Status: AI577 D5 data contract (landscape-terrain-fields v1), bake, runtime streaming and shader
integration (`landscape-terrain-visibility-v1`, LANDSCAPE_APPEARANCE_RUNTIME.md) are complete and tested.

Terrain fields are derived, unmeasured visual inputs computed offline from one exact terrain revision:
wetness, flow, deposition, rock exposure, sky view, signed shore distance, convexity, slope, eight
terrain horizons and a terrain-driven natural soil for planning-only samples. They never change heights,
land cover, soil semantics, exact queries, saved revisions, appearance sidecars or city bindings.

## Global analysis first

The registered `landscape/terrain-fields` bake leaf (Node only, `configurationPaths: []`, excluded from
`all` and the import parent) assembles the complete authenticated native grid, runs every analysis on
the whole grid, and only then slices pages. Parameters live in the tracked recipe
`tools/bake_landscape/terrain_fields/recipe-v1.json`, embedded in provenance with its SHA-256.

| Field | Algorithm (recipe v1) | Normalization |
| --- | --- | --- |
| slope | central differences matching mesh vertex normals | degrees / 90 |
| convexity | negative Laplacian of the height smoothed at sigma 4, 12, 40 samples (three-pass box Gaussian) | each scale / its land p98 magnitude, clamped to [-1, 1], weights 0.35/0.35/0.30 |
| depressions | Priority-Flood + FIFO pit queue (Barnes 2014) on the sigma-3 smoothed routing surface; outlets: landscape edge and every sample below sea level; ties by (elevation, index) | fill depth in meters |
| flats | Barnes 2014 flat resolution: 2 x distance toward low edges + inverted distance from high edges | - |
| accumulation | donors before receivers; Quinn 1991 MFD, exponent 1.1, contour factors 0.5/0.354; flats by mask differences; low edges equally into draining equal-level neighbors | contributing area in m^2 (conserved) |
| flow | ln(A / spacing), faded over flats (smoothed flat share, sigma 2) | land p60..p99.7 |
| wetness | TWI ln(a / max(0.001, tan beta of the filled surface)), smoothed over land (normalized convolution, sigma 3) | land p2..p98; 1 below sea level |
| deposition | flow_s^0.7 (sigma 2) x (1 - smoothstep(1.5, 12 deg, slope)) x (0.5 + 0.5 smoothstep(0.05, 0.6, -convexity)) + 0.6 x smoothstep(0.05, 1.5 m, fill depth) | clamped [0, 1]; 0 below sea level |
| rockExposure | smoothstep(18, 32 deg, slope) x (0.65 + 0.35 max(0, convexity)) x (1 - 0.75 flow) x (1 - 0.8 deposition) | at most 0.95; 0 below sea level |
| horizons | upper-convex-hull sweeps of every grid line in 16 integer directions (O(samples) each, whole landscape, no ray marching); 8 exact row/column/diagonal directions stored | sine of elevation, clamped to the horizontal |
| skyView | per azimuth closed-form cosine-weighted visible sky of the facet above max(terrain horizon, horizontal, tangent plane); trapezoidal azimuth weights over 16 directions | fraction of isotropic sky irradiance (open ground 1, open slope (1 + cos S) / 2) |
| shoreDistance | marching-squares sea-level polyline (linear crossings; saddles by quad mean), nearest segment by two dead-reckoning passes repeated twice | signed meters, land positive, clamped +/-256 |
| natural soil | see below | catalog soil index |

Earth curvature is ignored (below 0.02 degrees over 4 km). Beyond the landscape there is no terrain.
Robust percentile ranges and per-scale curvature magnitudes are recorded in `statistics`.

**Natural soil inference** (`natural-terrain-inference-v1`) replaces the 15.625 m overview flood fill as
data for planning-only samples (classes 5-7). Each candidate soil (sand, loam, forest, rock, seabed)
scores `log(R + 0.02) + 0.5 x E`. R is the confidence-weighted normalized convolution of the natural
one-hot soils at 23.4375, 93.75 and 375 m (weights 1, 0.5, 0.25) on a stride-4 aligned grid, bilinearly
upsampled. E is the terrain log-likelihood of a naive Bayes over shore distance [-32, 256] m, height
above sea level [-10, 60] m, smoothed slope [0, 40] degrees and smoothed wetness, learned from this
landscape's own natural samples (64 tent-binned bins, bin smoothing 1.5, pseudo-count 1), smoothed
spatially (sigma 6 samples) so narrow planning strips follow their surroundings. The label is the
argmax (catalog order breaks ties). Non-planning samples keep their semantic soil exactly; explicit
soil overrides still apply last at runtime. Coastal result: 747,898 planning samples, 84.2% forest,
15.2% loam, 0.6% sand, 26 speckle samples, 90.5% agreement with the old flood fill and no 15.6 m stair
steps. Display integration: [LANDSCAPE_APPEARANCE_RUNTIME.md](LANDSCAPE_APPEARANCE_RUNTIME.md), Natural
presentation and imported reference data (AI577 D5).

## Sidecar

`<landscape>/fields/manifest.json`, at most 256 KiB, with an immutable `manifest.<sha256>.json`
snapshot and content-addressed `pages/<sha256>.rgba8` / `pages/<sha256>.u8`. Every object has an exact
field set; unknown or missing fields are rejected; JSON key order is irrelevant.

```text
{format:'landscape-terrain-fields', schemaVersion:1, landscapeId, revision:'terrain-fields-<24 hex>',
 terrain:{revision, manifestSha256, sourceSha256, seaLevel, bounds, grid, chunks:[{id, height, landCover}]},
 layout:{samples, halo:2, width, height, layers:4, encoding:'rgba8', filter:'linear', rowOrder:'north-first',
         layerBytes, pageBytes, naturalSoil:{encoding:'uint8', samples, halo:0, rowOrder:'north-first', byteLength}},
 channels:[16 x {name, layer, component, curve, scale, unit}],
 horizon:{azimuthsDegrees:[0,45,...,315], convention:'counterclockwise-from-east-toward-north', encoding:'sqrt-sine',
          interpolation:'linear-sine-between-adjacent-azimuths', solarRadiusDegrees:0.265, beyondLandscape:'no-terrain'},
 pages:[{id, level, column, row, contentKey, fields:{url, byteLength, sha256}, naturalSoil:{url, byteLength, sha256}|null}],
 statistics:{land, flood, curvature, horizon, shore, naturalSoil, channels},
 provenance:{algorithm:'landscape-terrain-fields-v1', recipe, recipeSha256, imports:[...], measured:false, rights, derivedFrom}}
```

`revision` hashes the sidecar with a null revision. `terrain.chunks` lists every native chunk with the
height and land-cover channel hashes used; `contentKey` is the SHA-256 of
`{algorithm, page, natives:[[id, height, landCover], ...]}` over the native chunks inside the page and
is verified by the validator. Square native spacing is required in v1 (diagonal horizons at 45 degrees).
`validateLandscapeTerrainFields(value, landscape?)` throws `LandscapeTerrainFieldsBindingError` for
another landscape, spatial frame or sea level; a different terrain revision is not an error.
`loadLandscapeTerrainFields` returns null only for HTTP 404; every other failure is explicit.

## Pages and channel map

Pages share the chunk IDs, sample grid and two-sample halo of the categorical mask pages: texel
(c + 2, r + 2) is sample (c, r), row 0 north, 261 x 261 texels on the coast. Four RGBA8 layers are
concatenated (layer k at k x layerBytes; 1,089,936 bytes per coastal page). Linear filtering
interpolates encoded bytes; decode after filtering with v = byte / 255:

| Layer.component | Channel | Curve | Decode |
| --- | --- | --- | --- |
| 0.r | wetness | linear | v |
| 0.g | flow | linear | v |
| 0.b | deposition | linear | v |
| 0.a | rockExposure | linear | v |
| 1.r | skyView | linear | v |
| 1.g | shoreDistance | signed-square, scale 256 | s = 2v - 1; sign(s) s^2 x 256 m (bytes <= 127 water, >= 128 land, exact) |
| 1.b | convexity | signed-linear | 2v - 1 |
| 1.a | slope | linear, scale 90 | 90 v degrees |
| 2.rgba | horizon000/045/090/135 | sqrt-sine | sin(h) = v^2 |
| 3.rgba | horizon180/225/270/315 | sqrt-sine | sin(h) = v^2 |

Azimuth is counterclockwise from +X (east) toward +Z (north), the frame of
`azimuthElevationDegToDir`; a game-frame sun must be rotated into landscape space first.
Native pages copy the global bytes. A coarser page sample is the separable tent average (weights
`s - |offset|`, s = sample stride, edge-clamped) of the decoded native values, re-encoded; horizons are
averaged as sines. Natural-soil pages are the aligned native labels (never averaged) without a halo and
exist only where an aligned sample is planning-only cover, so every level reads identical labels at
shared positions. Overlapping borders and halos of adjacent pages are bit identical.

## Staleness and authoring

`landscapeTerrainFieldsStaleness(fields, landscape)` compares `terrain.chunks` with the current native
height and land-cover hashes: changed natives are stale; a page is `stale` when all its natives are,
`partial` when some are, otherwise `fresh`; stale natives also set bits of an 8 x 8 cell grid over the
landscape bounds (bit row x 8 + column, row 0 north; finer native grids map conservatively). Soil-only and
material-only revisions stale nothing. Stale pages are never loaded and stale cells return availability 0
(analytic fallback: geometric slope, no flow or horizon); stale data is never used silently. Reused
fields outside stale chunks are accurate to within: horizon elevation `atan(max|dh| / d)` at distance d
from the edited chunk; sky view `sin^2` of that angle; shore distance the displacement of the shoreline
inside the edited chunk; flow, wetness and deposition only downstream of (or dammed by) the edit, by at
most the catchment draining through it; natural soil only for planning samples within about 1.1 km.
Re-baking binds the new revision.

## Bake validation and publication

Validation re-reads every byte (sizes, hashes, content-addressed URLs), the strict schema and binding,
the sea-level sign of every native shore sample, every shared border and halo, coarse texels recomputed
from native pages, and natural-soil semantics. The global stage runs twice by default and must be
identical. Publication holds the authoring lock, refuses a terrain changed since planning (orphaned
binding) and a current sidecar of another landscape, installs pages, keeps the previous current
sidecar's snapshot, writes the new snapshot and switches `fields/manifest.json` last; terrain and
appearance files are never written. Optional `landscape-terrain-field-imports` v1 requests override
flow, deposition, wetness or rockExposure from retained 8/16-bit grayscale PNG maps (for example Gaea
flow, wear and deposits) with recorded SHA-256 and tool provenance; they are bake inputs only.

Coastal publication `terrain-fields-5dbdfc766dca6cce908bd7b4` (sidecar 80,704 bytes, SHA-256
5d827bcf...a7) binds terrain `materials-bfcf20f7e27aa79db4d9983b`: 85 field pages (92,644,560 bytes) and
27 unique natural-soil pages (1,783,323 bytes). The global stage takes about 11 s, the whole leaf about
26 s, with a 380 MiB tracked working-array peak under the 768 MiB declared limit. Rebuilds are byte
identical.

## Runtime

`LandscapeTerrainFieldPages` (engine3d) reuses the memoized sidecar load of the load's
`LandscapeNaturalInference` (one request for both) after the appearance materials (768 KiB
transient decode credit), computes staleness and allocates one RGBA8 `DataArrayTexture`
(linear, no mipmaps) of `native mask capacity x 4` layers: the page of native mask slot s occupies layers
`4s .. 4s + 3`. A page is requested (appearance worker job `field`: fetch and SHA-256) for every native
mask record holding a slot, at most two in flight at priority 25, and is evicted with its mask record.
One page uploads per frame through layer updates when it fits the remaining share of the 8 MiB cap, then
fades in over 0.3 s; the fade is packed into the native slot's `uMaskMeta.w = 1 + 0.25 x progress`
(native slots stay in (0.5, 1.5]; fine slots keep 2). A failed page retries once after 2.5 s. The array
and decode reservations are charged to the shared ledger (`terrain-fields-array`, `-decode`,
`-manifest-decode`) under their own ceiling of one eighth of each total, outside the appearance
ceilings; a profile that cannot hold the array reports `budget-denied` (`terrain-fields-ceiling`).
Statuses: `pending`, `active`, `active-partial`, `absent` (404), `disabled`, `invalid`,
`binding-mismatch`, `stale`, `budget-denied`. `snapshot().appearance.terrainFields` reports status,
reason, revisions, binding, stale chunks and cells, page states, resident pages and progress, bytes and
peaks, uploads, timing, failures and the shader interface; `appearance.settled` waits for resident fields.
The viewer hook `terrainFieldsSample(x, z, {dx, dy, sunDirection})` is the exact JavaScript mirror.

Coastal measurements (RTX 3060 / ANGLE D3D11, shipped 512/256 MiB): 17 native slots, 18,528,912 bytes
CPU and GPU for the array, peak 25.1 MB CPU with decode reservations, 1,089,936 bytes per upload,
main-thread update 0.07 ms mean, page fetch-to-decoded latency 106-119 ms mean in the shared worker.

**Shader interface** (`chunks/landscape/terrain_fields.glsl`, included by the terrain program since AI577 D5;
defines `LANDSCAPE_TERRAIN_FIELDS`; `landscapeTerrainFieldsAt` has a single exit for FXC): requires
`LANDSCAPE_COVERAGE_SLOTS` and the mask slot uniforms; adds `uniform sampler2DArray uTerrainFields`
(the sixteenth sampler) and `uniform uvec4 uTerrainFieldsState` (stale cells low/high, flags bit 0
active, layers per page): two fixed uniform vectors. Functions: `landscapeTerrainFieldsAt(world, dx, dy)`,
`landscapeTerrainFieldsAtFootprint(world, meters)`, `landscapeTerrainFieldsDecode`,
`landscapeTerrainHorizonSine`, `landscapeSolarDiscVisibility`, `landscapeTerrainFieldsSunVisibility`
(circular-segment visibility of the 0.265-degree solar disc against the azimuth-interpolated horizon)
and `landscapeTerrainFieldsSkyVisibility` (sky view relative to the unobstructed facet). The slot walk
starts at the finest active native slot containing the position; each resident ancestor contributes
arrival progress x (1 - coarser), coarser = smoothstep(1, 2, footprint / page spacing); the remaining
weight is `1 - availability`. GLSL and JavaScript agree within 3e-4 (unit values) on the RTX 3060.

**Terrain appearance layer** (AI577 D5): the array holds capacity × 4 + 1 layers (18,801,396 bytes on the
coast); its last layer is the landscape-scale appearance layer derived in the appearance worker (job
`appearance-layer`, reservation `terrain-appearance-layer-derivation`) and flagged resident by
`uTerrainFieldsState.z` bit 1. `snapshot().appearance.terrainFields.appearanceLayer` reports id, rootId,
layer, bytes, statistics, latencyMs and derivedIn; `.appearanceLayerState` is
`pending|deriving|derived|resident|failed|budget-denied`. See LANDSCAPE_APPEARANCE_RUNTIME.md,
Terrain-driven natural appearance.

## Dressing inputs

`landscape-dressing-inputs` v1 (`sampleLandscapeDressingInputs({soilWeights, planningShare, fields})`)
defines grassDensity, shrubSuitability, treeSuitability, rockScatter and beachDebris as products of
display-soil coverage and smooth field terms. Sand, rock, seabed and unknown host no grass, shrubs or
trees; trees need forest soil; debris needs sand within 0-25 m of the waterline; planning-only cover
suppresses every output; missing fields use documented neutral values and report `fieldsAvailable:false`.
Placement remains out of scope.

The viewer hook `dressingSample(x, z, {dx, dy})` evaluates v1 for the displayed soil (resident coverage,
nearest native planning cover, fine fields) and adds `inferredGround` on planning cover; the diagnostics
`dressing` and `dressing-grass|shrub|tree|rock|debris` mirror it exactly (GPU parity 4.9e-7 relative).

## Verification

Node: `landscape_terrain_fields_analysis.test.js`, `landscape_terrain_fields.test.js`,
`landscape_terrain_fields_framework.test.js`, `landscape_terrain_fields_assets.test.js`,
`landscape_terrain_field_pages.test.js`, `landscape_dressing_inputs.test.js`. Browser:
`landscape_terrain_fields.pwtest.js` (streaming with masks, 404 fallback, GLSL parity). Review images:
`tests/artifacts/screens/landscape/ai577/d5/fields/`.
