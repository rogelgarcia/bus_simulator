# Landscape terrain synthesis (AI 596)

Status: delivered (AI 596 D1–D6, 2026-10-09 to 2026-10-11; consumer handoff in `LANDSCAPE_AI596_HANDOFF.md`). This page is the contract for the in-repository
terrain synthesis engine, its recipes, the geology channels it derives, the review poses every natural-world
prompt reuses and the `landscape/synthesis/*` bake leaves. The roadmap context is
[LANDSCAPE_NATURAL_WORLD_ROADMAP.md](LANDSCAPE_NATURAL_WORLD_ROADMAP.md) (layer L0, far-field land of L8).

## Why

Coastal terrain v2 is a designed prototype generated from Gaussian hills, a sinusoidal roll, feathered district
plateaus, blended road shoulders and a final blur (`build_terrain.py`, retained under the source package). It
matches its plan numerically but has no erosion, geology or coastal process: 92.4% of natural land is below 5°,
the steepest native sample is 34.9°, the seabed is a planar ramp and the beach is a 0 → 2.6 m sand ramp. The
engine replaces that generator with a deterministic operator graph (landform primitives, warps and noise,
fluvial, hydraulic and thermal erosion, sediment transport, strata, coastal processes and constraint
re-imposition) that publishes a new terrain revision plus geology channels, while every hard plan constraint
(district bands, road network and grades, shoreline tolerance, beach arrival, bus stop, view corridor, swim
zone, sea level, planning land cover) is re-imposed with designed edge profiles instead of wide feathers.

## Layout

| Path | Owns |
| --- | --- |
| `src/app/landscape/LandscapeSynthesisRecipe.js` | Pure recipe model: schema validation, typed operator parameter catalog, canonical JSON and identity hashing (`synthesis-<24 hex>`). No Node, DOM or renderer imports. |
| `src/app/landscape/LandscapeGeology.js`, `LandscapeGeologyPayload.js` | Geology sidecar contract (`landscape-geology` v1): channel map, encoding, strict validation, exact renderer-independent samplers; loader (D2/D4). |
| `tools/bake_landscape/terrain_synthesis/` | The engine: `SynthesisGraph.mjs` (executor), `operators/*.mjs`, `SynthesisAnalysis.mjs` (measurements and constraint reports), `SynthesisReview.mjs` (hillshade, slope, relief and plot images), `SynthesisLandscape.mjs` (grid → saved landscape directory), `interchange/` (PNG 8/16, RAW float32, EXR), `relief_study/`, `fixture/`, `coastal_v3/` leaves, README. |
| `tools/landscape_review/` | Versioned review poses (`poses/natural-world-v1.json`), the pose resolver, the matched-camera capture tool and the composite builder. |
| `tests/node/unit/landscape_synthesis_*.test.js` | Engine, analysis, interchange, poses and leaf-registration tests. |

Generated terrain, pages and captures are local bake outputs under the gitignored landscape cache
(`assets/public/landscape/<id>/`) and `tests/artifacts/screens/landscape/ai596/<deliverable>/`. Recipes, poses,
code, tests and specs are committed.

## Coordinates and grids

World X east, Y up, Z north; raster row 0 is north (`z = maxZ - row * spacing`), column 0 is west
(`x = minX + column * spacing`); heights are absolute world Y in meters; sea level is the manifest's
`coordinates.seaLevel` (0 on the coast). The engine works on one global float grid (`Float32Array` storage,
float64 arithmetic, fixed visitation order) so results never depend on tiling; published chunks slice that
grid and therefore share bit-identical borders. A recipe may declare a coarser `working` spacing (fast
studies); the result is resampled to the output grid with the declared filter and reported as such.

## Recipe model (`landscape-synthesis-recipe` v1)

```text
{format:'landscape-synthesis-recipe', schemaVersion:1, id, seed (uint32), seaLevel,
 grid:{columns, rows, spacingX, spacingZ, bounds:{minX,maxX,minZ,maxZ}, chunkIntervals, maxLevel},
 working:{spacing}|null,
 inputs:{landscape:{directory, expectedRevision|null}, plan:{districts, roads, shoreline, beachPoints, landCover}|null, imports:[{id, file, kind, encoding, ...}]},
 operators:[{id, op, params:{...}, mask:{selector...}|null, seed:uint32|null, enabled:true}],
 outputs:{heightCap:number|null, coverPolicy:'keep-source'|'derive', channels:[...]},
 overrides:[...]}
```

- Every operator type declares its parameters in `LANDSCAPE_SYNTHESIS_OPERATORS` with type, unit, range and
  default; unknown operators, unknown parameters, missing required parameters and out-of-range values are
  rejected at the recipe boundary (`validateLandscapeSynthesisRecipe`). Units are meters, degrees, samples,
  seconds-equivalent iteration counts or dimensionless rates and are part of the parameter name or catalog.
- Identity: `landscapeSynthesisRecipeIdentity(recipe, inputHashes)` hashes the canonical JSON (sorted keys,
  no defaults filled in) together with the SHA-256 of every input file and the bound landscape revision. Two
  runs with the same identity must produce bit-identical outputs.
- Seeds: the recipe seed salts every operator's seed (`operator.seed ?? hash(recipe.seed, operator.id)`), so
  operators can be re-seeded independently without reshuffling the others.
- Masks: `mask` is a selector expression evaluated on the current layer state (slope, curvature, height, flow,
  distance to features, cover class, polygon, district) combined with `min/max/multiply` and smoothstep
  edges; a null mask means the whole grid.
- Overrides evaluate after the procedural operators in document order: region masks with parameter overrides,
  include/exclude zones and imported maps that replace a stage output. They survive regeneration.

### Interchange

Maps enter and leave the engine as files with an authenticated metadata sidecar
(`tools/bake_landscape/terrain_synthesis/interchange/`: Node only, `node:zlib` the sole dependency):

| Encoding | File | Values |
| --- | --- | --- |
| `raw-float32` | `.raw`/`.r32`: float32 little-endian, row-major, row 0 north, no header | exact meters (heights) or 0..1 (masks) |
| `exr-float32` | OpenEXR 2.0 single-part scanline image, one FLOAT channel `Y`, `NO_COMPRESSION`, the sidecar embedded as the string attribute `landscapeMeta` (without its hash fields); the reader also takes `ZIPS`/`ZIP` blocks, HALF channels (converted exactly), any line order and the channel `Y`, `height`, `Z` or `R` of a multi-channel file; tiled, deep, multi-part and PIZ/PXR24/B44/DWA files are rejected | exact |
| `png-gray16`, `png-gray8` | non-interlaced gray PNG | quantized over the declared `range` (heights; values outside are rejected, never clamped) or over 0..1 (masks); exact to half a quantization step |

Every map `<file>` has `<file>.meta.json` (`landscape-interchange-map` schema 1): `kind` (`heights`|`mask`),
`encoding`, `columns`, `rows`, `spacing:{x,z}`, `bounds:{minX,maxX,minZ,maxZ}`, `rowOrder:'north-first'`,
`axes:'X east, Z north, Y up'`, `units` (`meters`|`dimensionless`), `range:{min,max}` (the PNG quantization
range, the measured extent for the float encodings, 0..1 for masks), `seaLevel`, `sha256` and `byteLength` of
the map, `provenance` (an object with at least `tool`; engine exports write `{tool:'landscape-synthesis',
recipeId, recipeIdentity, seed, operatorId, layer, workingSpacing}`) and `created`, which carries the recipe
identity and never a timestamp, so repeated bakes write identical sidecars. An import authenticates the hash
before decoding, compares the frame exactly with the expected grid and never resamples; an EXR whose embedded
`landscapeMeta` disagrees with its sidecar is rejected. External tools (Gaea, World Machine, Houdini) stay
optional inputs: their maps are adopted by writing the sidecar from declared parameters (`adoptLandscapeMap`),
the recipe declares them under `inputs.imports[{id, file, kind, encoding}]` and their hashes enter the recipe
identity as `import/<id>`; no external tool is ever a runtime or build dependency. Gaea Community exports are
capped at 1024² and are non-commercial, so a 2049² production terrain cannot come from it whole.

Operators: `import-map` `{importId, target, mode:'replace'|'add'|'multiply'|'max'|'min', scale, offset}` combines
the map into a float layer under the operator mask (`v = scale · map + offset`; `replace` without a mask
creates a missing layer; categorical targets are rejected at the recipe boundary; the map frame must equal the
working grid, or the output grid when the recipe works coarse, in which case it is decimated with the aligned
tent average like `import-heights` and reported as `decimated`). `export-map` `{layer, kind, file, encoding,
range}` writes the current working-grid layer under the runtime input `inputs.exportRoot` (a leaf sets it to
its stage directory; a missing root is an error) with the recipe identity as provenance; the validator places
every `export-map` after the last input operator and the executor reads the maps of `import` overrides before
the first operator, so that identity is the final one. Leaves export final (post-override, resampled) maps
through `exportLandscapeMap` directly.

### Overrides

`recipe.overrides[]` is data the user keeps while the procedural recipe regenerates. The executor evaluates it
after the last operator and before the resample, in document order, each entry with its own mask (the same
selectors as operators; `null` selects the whole grid where allowed):

| Type | Fields | Effect |
| --- | --- | --- |
| `import` | `{id, type, importId, target, mode, scale, offset, mask}` | the `import-map` combination as an override: an imported map replaces or combines a stage output in the masked region |
| `region` | `{id, type, mask (required), height:{mode:'set'|'raise'|'lower', meters}}` | a data-only local height edit; the selector edges give the smoothstep transition |
| `operator` | `{id, type, operatorId, params:{partial}, mask}` | re-runs the named enabled recipe operator (landform, warp, erosion, geology, coastal or constraint family, never inputs/output) on the current state with `params` merged over its own, inside the mask (multiplied with the operator's mask when both exist), with the operator's seed; additive operators add again |
| `exclude` | `{id, type, mask (required)}` | protects the zone: every layer the other overrides may write is snapshotted before the first override and restored under the mask after the last one (float layers blend by the mask, categorical layers restore where the mask exceeds 0.5), wherever the exclude sits in the list |

Validation: ids unique; `importId` declared; `target` a declared float32 layer written by an earlier operator
unless `replace` without a mask creates it; `operatorId` an enabled recipe operator whose merged parameters pass
the catalog and its cross-parameter rules; masks validated like operator masks against the layers the enabled
operators write. The engine report lists every override (`report.overrides[{id, type, seconds,
statistics:{changedSamples, maxChangeMeters, details}}]`; height changes are measured against a snapshot taken
before each override, and `exclude` entries report the protected samples and what each layer restored).
Overrides are part of the canonical recipe JSON, so they renew the identity, and the maps of `import` overrides
are recorded inputs.

## Operators

| Family | Operators (D1 subset in bold) |
| --- | --- |
| Inputs | **`import-heights`** (landscape directory or interchange file; a source coarser than the recipe grid by an integer factor over the same extent is upsampled once with the `resample` filter — `catmull-rom` (separable, edges continued linearly, so a linear ramp is reproduced exactly), `bilinear` or `nearest` — and its cover takes the nearest source label; the statistics report `importResample {factor, filter, cover, target}`, and upsampled samples are interpolation that the provenance never counts as source detail; a source on the recipe grid and the decimation onto a coarser working grid are unchanged since D1; `placement: embed` (D5) takes a landscape whose bounds are an aligned sub-rectangle of the recipe grid at its spacing or finer by an integer factor, decimates it with the `filter` (tent or nearest) into that rectangle — the cover by the aligned label — and fills every sample outside it: `fillMode` `extend-edge` continues the nearest rectangle boundary sample outward, blurred along the boundary by a Gaussian whose sigma grows from 0 to `fillSmoothingMeters` at `fillFadeMeters` and faded by a smoothstep of the distance to the rectangle over `fillFadeMeters` toward `fillHeightMeters` (exact at and beyond the fade), or `constant`; the cover outside is `fillCoverClass`; the embedded samples are the source decimated bit for bit and an operator masked to the outside never touches them; the statistics report `importPlacement {factor, rectangle in samples, filledSamples, fill}`), **`plan-inputs`** (districts, roads, shoreline, beach points, land cover → masks and distance fields; a plan may hold no districts and no roads (the road distance stays infinite), the shoreline is always required), `import-map` (declared interchange map combined into a float layer under the mask) |
| Landforms | **`landform-plateau`** (district/polygon target with an edge profile: escarpment, embankment, retaining slope, ramp), **`landform-hills`** (bounded ridged multi-scale relief), **`landform-valley`**, `landform-headland`, `landform-cove` |
| Warps and noise | **`warp`**, **`noise`** (world-anchored, bit-exact `LandscapeSurfaceNoise` octaves) |
| Erosion | `fluvial-erosion` (stream power over a Priority-Flood/D8 drainage network, implicit), `hydraulic-erosion` (seeded droplet detail erosion), `thermal-weathering` (angle of repose per lithology, talus deposits), `sediment-deposit` |
| Geology | `strata` (dipping layer stack with hardness), `terraces` |
| Coastal | `coastal-bluff` (bluff retreat with a wave-cut platform), `coastal-beach` (equilibrium profile, berm, swash zone, foreshore slope; since D4 `offshoreMode` `cut` lowers the seabed to the profile only where it is shallower (the D2 behaviour) or `replace` sets it, depositing beach sand where the seabed rises, and `deanDepthMeters` hands the Dean curve over at that depth to a planar shelf at `shelfSlopeDegrees` that flattens at `shelfFloorDepthMeters`, the handover and floor distances reported), `coastal-foredune`, `coastal-nearshore` (bars), `coastal-reef` |
| Constraints | **`constrain-districts`**, **`constrain-roads`** (grade-limited centerline profile, designed cut/fill shoulders), **`constrain-shoreline`**, **`constrain-points`** (beach arrival, bus stop, view corridor, swim zone), **`constrain-runway`**, **`height-cap`** |
| Output | **`resample`**, `geology-channels`, `derive-land-cover` (D4: the natural land cover of every sample from the final geology after `geology-channels`, requires `outputs.coverPolicy: 'derive'`; see below), `export-map` (working-grid layer → interchange map with the recipe identity as provenance) |

`derive-land-cover` writes the `cover` layer in a fixed precedence, every rule a catalog parameter with units and ranges: the
`planningClasses` (5 urban, 6 road, 7 runway) are copied from the source cover exactly wherever they occur; samples below sea level
become 0 water; 1 sand where the deposit is beach or dune sand or the coastal zone is one of `sandCoastalZones` (swash, berm,
backshore, foredune); 4 rock where the face mask reaches `faceMaskThreshold` (0.5), the slope reaches `rockSlopeDegrees` (40°),
talus is at least `talusRockMinMeters` (0.5 m) thick, or bedrock is exposed (mantle ≤ `exposedMantleMeters` 0.05 m) on a slope of
at least `bedrockSlopeDegrees` (25°) in a stratum of hardness ≥ `rockHardnessThreshold` (0.6; needs the `hardness` layer of
`strata`, else that rule is off and reported); 2 grass and scrub on alluvium valley floors (alluvium ≥ `alluviumGrassMinMeters` 0.3 m
on slopes ≤ `valleyFloorSlopeDegrees` 6°); otherwise the source class where it is natural (the forest/grass partition of the source
is kept wherever the geology is neutral: regolith, colluvium or thin alluvium on gentle ground) and `emergedLandClass` (2) where the
source held water. The statistics carry the from → to transition matrix with sample counts, the per-class totals before and after
and the count each rule decided. The recipe validator requires the operator after an enabled `geology-channels` (final flow,
drainage, face mask and deposits) and exactly one such operator when `outputs.coverPolicy` is `derive` (none for `keep-source`);
under `derive` the executor publishes the working cover as the output cover, nearest-upsampled from a coarser working grid with the
planning classes restored from the native cover exactly (reported as `outputCover`).

Each operator reads and writes named layers: `height`, `cover`, the plan layers (`districtId`, `landMask`,
`roadDistance`, `roadHeight`, `roadWidth`, `roadIndex`, `shoreSigned`, `corridorMask`, `runwayMask`,
`apronMask`) and, from D2, `bedrock`, `regolith`, `depositType`, `depositThickness`, `lithology`, `hardness`
(the strata erodibility reduction, engine-internal), `wear`,
`deposition`, `flow`, `drainage`, `faceMask`, `coastalZone`, `waveExposure`. Operators report progress and honor
an `AbortSignal`; every full-grid array goes through the tracked `TerrainFieldMemory` ledger with the recipe's
declared working limit, and the recipe validator checks the data flow (an operator reads only layers an
earlier enabled operator wrote).

Every deposit is bounded by the repose plane of the receiving sample's neighbours: a deposit never raises a
sample above `min_j (h_j + d_ij · tan(reposeDegrees))` over its 8 neighbours, with the material's angle
(`hydraulic-erosion` `colluviumReposeDegrees` 34° / `alluviumReposeDegrees` 30°, `sediment-deposit`
`alluviumReposeDegrees` 30°, `terraces` `talusReposeDegrees` 34°, `thermal-weathering` `talusReposeDegrees`
for the inflow a sample takes against its highest neighbour after that neighbour sheds). A heightfield cannot
hold a one-sample spike at any spacing, so the bound is what keeps a finer spacing from multiplying needles.
The refused remainder never vanishes: it stays in the droplet's load (at the end of life it spreads over the
brush footprint, then rolls downhill, then is exported), in the downstream flux (ponds still fill flat from
their floor up to the spill level), rolls on to the lowest neighbour for at most 512 hops before it is exported
(terraces), or stays at the thermal donors; the mass balance (`eroded = deposited + exported`,
`cut = talus + exported`) and `height = bedrock + regolith + depositThickness` stay exact, and every operator
reports `reposeLimitedSamples` with the deferred, exported or held volume.

### Designed edges

A plateau (`landform-plateau`, `constrain-districts`) carries its target outward from the polygon boundary
with a profile: `escarpment` (flat rim, rock face at `faceSlopeDegrees` for `faceDropMeters`, talus apron at
`talusSlopeDegrees`), `embankment`, `retaining` (bounded by the steepest slope a heightfield holds), `ramp` or
`feather` (the v2 smoothstep, kept for comparison). The rim belongs to the escarpment alone: an embankment or
retaining slope descends from the boundary and its daylight march starts there (AI 596 D4; before, the march
skipped the escarpment's 12 m default rim and cut a trench along the descent around every embankment pad). The
profiles only descend, so a pad below the surrounding ground gets its cut from `combine: blend` (the boundary
step blended over `blendMeters`: a short retaining cut), the fill side the declared slope. Samples farther from
the boundary than `daylightReachMeters` keep their ground (also D4: `blend` used to mix them with the descent at
the reach inside the blend band, a ring lowered by half the descent around every pad; `max` and `replace` gave the
ground there already and are unchanged). The base the profile descends to is measured along the
outward normal on the pre-operator ground: `daylight` marches until the descent meets the ground, `probe` reads
the ground at `baseProbeMeters` and cuts everything above it (removes an old feather, leaves a bench),
`extrapolate` continues the natural slope measured beyond the probe distance back under the old feather and
daylights against that line (removes a feather without a bench), `sample-ground`, `explicit`. `combine` is
`max` (fill over the ground with a rounded toe), `replace` (cut and fill through the run) or `blend`.
`insideMode: keep` leaves the interior untouched and starts the edge from the boundary ground, which cuts a
bluff along an existing terrace (the coastal bluff of the relief study: a polygon 115 m landward of the
design shoreline with a 65° face down to the ground 45 m seaward).

### Road network profiles

`constrain-roads` profiles every plan road as one network. Centerline heights are sampled (or taken from the
design), smoothed over `profileSmoothingMeters`, held level over `junctionLevelMeters` at both ends, and
fitted with the L∞-optimal grade-limited profile (the average of the largest g-Lipschitz minorant and the
smallest g-Lipschitz majorant) relaxed over the graph of stations: stations of different roads, or
non-consecutive stations of one road, within `couplingMeters` are one node (junctions, merging corridors, a
loop closing on itself). Stations inside districts and the level end sections are anchors that hold their
target exactly; the free fit is clamped into the band the anchors allow and a road whose anchors conflict at
the grade, or whose fitted ends leave the ground beyond `endFitToleranceMeters`, is reported infeasible
(nothing is pinned by force). The carriageway (`width / 2 + marginMeters`) takes the profile height; cut and
fill shoulders at `cutSlopeDegrees` / `fillSlopeDegrees` extend over `shoulderWidthMeters`; the ground beyond is
untouched, so a steep flank crossed by a road leaves a visible bench (the D4 ramp treatment).

## Geology channels (`landscape-geology` v1, D2/D4)

The engine keeps these layers (working grid, float32 unless noted) and the geology sidecar publishes them:

| Layer / channel | Unit, range | Meaning |
| --- | --- | --- |
| `bedrock` | m, absolute Y | Bedrock surface: `height − regolith − depositThickness` after erosion; never above `height` |
| `regolith` | m, 0..8 | Weathered in-place mantle thickness (thermal weathering output) |
| `depositType` | uint8 enum: 0 none, 1 talus, 2 colluvium, 3 alluvium, 4 beach sand, 5 dune sand, 6 reef rock | Dominant loose deposit at the surface |
| `depositThickness` | m, 0..30 | Thickness of that deposit |
| `lithology` | uint8 strata index 0..255 | Index of the stratum the bedrock surface lies in (0 = unstratified) |
| `wear` | 0..1 | Normalized cumulative fluvial and hydraulic erosion depth (Gaea "wear") |
| `deposition` | 0..1 | Normalized cumulative sediment deposition |
| `flow` | 0..1 | Normalized `ln(A / spacing)` of the final surface (same convention as the terrain fields) |
| `drainage` | uint8 class: 0 hillslope, 1 rill, 2 gully, 3 channel, 4 flat/pond, 5 sea | Drainage class from contributing area and incision |
| `faceMask` | 0..1 | Slope beyond what the heightfield represents faithfully (smoothstep 55..75°): where L3 rock faces belong |
| `coastalZone` | uint8 enum: 0 inland, 1 offshore, 2 reef, 3 bar, 4 surf, 5 swash, 6 berm, 7 backshore, 8 foredune, 9 platform, 10 bluff toe, 11 bluff face, 12 bluff crown | Coastal zone class |
| `waveExposure` | 0..1 | Exposure of the shore to the open-sea fetch (headlands 1, sheltered coves 0), carried inland over the surf and swash |

The sidecar (`geology/manifest.json`, format `landscape-geology`, schema 1, `src/app/landscape/LandscapeGeology.js`)
mirrors the terrain-fields layout: mask-aligned pages with the two-sample halo holding two RGBA8 layers
(0.r `bedrockOffset` = `height − bedrock`, linear 0..32 m; 0.g `regolith` linear 8 m; 0.b `depositThickness`
linear 30 m; 0.a `wear`; 1.r `deposition`; 1.g `flow`; 1.b `waveExposure`; 1.a `faceMask`, all linear 0..1) and one
categorical uint8 page per chunk without halo holding four aligned label layers (`depositType`, `lithology`,
`drainage`, `coastalZone`, layer k at k × samples²), content-addressed pages, a `terrain` binding to the exact
revision and native chunk hashes (staleness shares the terrain-fields semantics), content keys that include the
recipe identity, strict validation, exact JavaScript samplers (`sampleLandscapeGeologyPage`, bilinear on the
encoded bytes then decoded; `sampleLandscapeGeologyCategory`, nearest aligned label) and the GLSL decode mirror
`chunks/landscape/geology.glsl` (constants, `landscapeGeologyDecode`; not included by any program until a
consumer renders geology). The `geology-channels` operator runs once, after every operator that moves the surface:
it derives `faceMask`, recomputes `flow` and `drainage` on the final surface, normalizes `wear`/`deposition` from
meters to 0..1 and fills missing layers with their neutral values (recorded as defaulted); only `derive-land-cover`
(which reads the finalized layers), `export-map` and `resample` may follow it. Publication (`geology/GeologyPreparation.mjs`) follows
the fields pattern: candidate pages, byte-level validation, manifest-last switch under the authoring lock.
The sidecar limit is 1 MiB (`LANDSCAPE_GEOLOGY_LIMIT`, AI 596 D3; 256 KiB before): measured on the real
preparation, a 341-node tree (4097² at 0.9765625 m) serializes to 283,435 bytes and a 1365-node tree (8193²)
to 1,116,668 bytes, which still exceeds it. The preparation reads the full native grid under its 512 MiB
working limit like the fields bake, so 4097² and finer grids need the streamed assembly recorded in
`LANDSCAPE_TERRAIN_FIELDS.md` (a D4 prerequisite).

## Review poses (`landscape-review-poses` v1)

`tools/landscape_review/poses/natural-world-v1.json` pins NW-01..NW-13 as
`{id, intent, x, z, eyeHeightMeters | altitudeMeters, headingDegrees, pitchDegrees, fovDegrees, references}`
(heading 0° = north/+Z, 90° = east/+X; pitch negative looks down; eye height is above the authoritative native
ground at (x, z), re-resolved on every terrain revision; altitude is above sea level). The resolver turns a pose
into the viewer camera (`position`, `target` 100 m ahead, perspective FOV, zoom 1) and records the resolved
ground height and terrain revision in every capture receipt. Later prompts reuse this file; a new pose set is a
new versioned file.

## Bake leaves

| Leaf | Purpose |
| --- | --- |
| `landscape/synthesis/relief-study` | D1: diagnose the current terrain, synthesize the coarse relief variants from their recipes, measure constraints and targets, render hillshades, slope maps, profiles and statistics |
| `landscape/synthesis/fixture` | D2 gate: the synthetic 1 × 1 km plateau/road/shoreline fixture with determinism, seam and constraint checks |
| `landscape/synthesis/resolution-study` | D3: the fixture recipe at 1.953125, 0.9765625 and 0.48828125 m (and, with `city-extent=true`, the analytic base over 4 × 4 km at 1.953125 and 0.9765625 m through a reduced recipe; `city-extent=only` re-runs that pair alone into the existing receipt) written as standalone saved landscapes `ai596-d3-fixture-<tag>` with the `procedural-synthesis` provenance and measured for data size, hierarchy depth and nodes, synthesis and hierarchy seconds, peak tracked memory, relief, the height agreement between spacings and feature sharpness on fixed world geometry, with `[1.953 \| 0.977 \| 0.488]` hillshade composites; `--publish` writes the landscapes under the cache root for the browser measurements |
| `landscape/synthesis/coastal-v3` | D4: run `tools/bake_landscape/terrain_synthesis/recipes/coastal-v3.json` once (4097² at 0.9765625 m from the v2 base upsampled 2×; `working=1953` iterates on the 1.953125 m working grid with the final resample), evaluate every column-B declared target and every hard plan constraint (`analysis/TargetsReport.mjs`: one `{id, kind, measured, target, passed, note}` row each, including `district-edges`, which lists every district's recipe edge profile (never `feather`) beside the measured edge outside its boundary — median slope of the first 20 m, width until the surface flattens, step — and fails a feather, an un-re-imposed district or an edge wider than 25 m unless it is an escarpment; the leaf fails on any failing row after writing the receipt and images), render hillshade, slope, elevation, relief, coastal-zone, deposit, drainage and cover maps, the operator sheet and the beach, bathymetry, bluff, rim and route profiles, write the landscape `coastal-city-v3` through `writeSynthesizedLandscape` (references copied from v2, appearance none because the grid changed, fields re-baked under `recipes/terrain-fields-coastal-v3.json`, the `procedural-synthesis` provenance) and prepare, validate and publish the geology sidecar manifest-last under the authoring lock (`geology=publish`, native runs only); `--publish` writes under `landscape-root` (default the cache root), otherwise under the output directory; `replay-edits=<previous landscape>` replays its accepted edit batches through `tools/landscape_authoring/BatchReplay.mjs` (skipped with a logged note when that module is absent); receipt `tests/artifacts/screens/landscape/ai596/d4/v3/coastal-v3.{json,md}` (`landscape-coastal-v3` schema 1) with the pass/fail table, per-operator timings, peak tracked memory, bytes on disk, the land cover transition matrix, the published revision and the immutable manifest snapshot name |

| `landscape/synthesis/surround` | D5: run `tools/bake_landscape/terrain_synthesis/recipes/coastal-v3-surround.json` once (2049² at 15.625 m over −14,000..18,000 m on both axes, chunkIntervals 256, maxLevel 3, 85 nodes: v3 at its pinned revision embedded through `import-heights` `placement: embed` — decimated ×16 with the tent filter into the 4 km extent, the outside filled by the smoothed, faded continuation of the boundary toward an 18 m plain — then the far shoreline plan `surround/plan/far_shoreline.json` (the design shoreline verbatim, continued to the bounds by a base coast that `surround/plan/author.mjs` displaces seaward where the recipe's `spurs` field — an anisotropic ridged `landform-hills` stretched across the coast — is high, so its ridges run into the sea on promontories with the field's own outline, and notches with the recipe's cove footprint arcs), the shelf to −60 m, the v3 hills octaves, the spurs, the max-composited ranges (8–12 km massifs), the coves, fluvial and sediment passes, the shoreline constraint, the 500 m soft cap, geology channels and the derived cover, every surface operator masked outside the extent with a 0–300 m blend (the shelf 0–30 m)), recompute the decimation of the v3 natives independently and fail when any embedded height differs (the seam metric inside the extent must be 0), measure the step between the boundary samples and their first outside neighbours on the four edges against the inside neighbour steps, the land/sea fractions, the far-shoreline continuity at the design shoreline's ends and the NW-11 skyline (the surface's elevation angles from 800 m over (−400, 2000) across azimuths 20–160° against the grid's far edge: massifs, peaks, gaps), render the 32 km hillshade, multidirectional hillshade, slope, elevation and cover maps with the extent outlined, the per-operator sheet, the skyline plot and 512 px crops of every cove, of the most prominent spur headlands and of the four edge midpoints, and write the render-only document `coastal-city-v3-surround` (no references, appearance, fields or geology; `procedural-synthesis` provenance with `preparation.surround = { landscapeId, revision, manifestSha256, extent, boundaryHash }`, the boundary hash being the SHA-256 of the v3 native heights along the north row west → east, the south row west → east, the west column north → south and the east column north → south as float32 little-endian) through `writeSynthesizedLandscape`; `--publish` installs it under `<landscape>/surround/` under the v3 authoring lock after re-reading v3 (a changed revision or manifest hash refuses the publication; the canonical v2 directory is refused as `landscape`), otherwise under the output directory; options `recipe`, `landscape` (default `assets/public/landscape/coastal-city-v3`), `output`; receipt `tests/artifacts/screens/landscape/ai596/d5/surround/surround.{json,md}` (`landscape-surround` schema 1) |

All are Node-only (`configurationPaths: []`), excluded from production `all` and the `landscape` import parent,
and keep the authoring lock, candidate validation and manifest-last publication gates of the existing leaves.

## D1 relief study (2026-10-09)

Measured on the retained v2 terrain (natural land = cover 1–4 above sea level, 2,335,907 samples): 73.7% of
natural land below 2°, 90.1% below 5°, p99 13.7°, maximum 33.7°; local relief p90 10.0 m over 100 m and
25.5 m over 500 m; drainage incision p90 2.3 m with no network larger than a road-shoulder trough; every
beach transect is a 1.6–1.8° sand ramp with no berm, rising above 3 m at 59–61 m from the waterline over a
12–15° band; the high-city rim drops 14–20 m over 700 m at mean 1.2–1.6°; the plateau subtends 0.8° from
NW-01, 1.8° from NW-08 and 1.1° from NW-09, every one of them below the foreground skyline. The plan
constraints pass except the beach-arrival district band (2–3 m) that the plan itself exceeds (p95 4.78 m,
the deliberate approach grade above the plaza).

The three variants (synthesized on the native 2049² grid; a 3.90625 m working grid was tried first and aliased the
65° faces into zigzags) and their measured outcome:

| Variant | High city | Cap | Natural slope p90 / p99 / max | Relief p90 over 100 / 500 m | High city above NW-08 | Roads (sustained) | Constraints |
| --- | ---: | ---: | --- | --- | ---: | ---: | --- |
| v2 (retained) | 49 m | 50 m | 5.0 / 13.7 / 33.7° | 10.0 / 25.5 m | 1.8° | 2.5% | district 7 only |
| A `relief-a-v2-sharpened` | 49 m | 50 m | 4.4 / 15.0 / 66.8° | 10.4 / 25.3 m | 1.8° | 5.80% ≤ 6 | district 7 only |
| B `relief-b-raised-80` | 80 m | 90 m | 6.0 / 18.3 / 73.2° | 12.5 / 43.5 m | 3.7° | 5.80% ≤ 6 | district 7 only |
| C `relief-c-dramatic-160` | 160 m | 170 m | 12.4 / 32.3 / 86.3° | 28.9 / 107.0 m | 8.6° | 7.80% (exception: 8% short-section rule on the two ascents) | district 7 only |

The shoreline stays within 2.6 m of the design (tolerance 10 m), the beach arrival and bus stop are flat at
2.6 m, the view corridor keeps its sightline and the swim zone its sand in every variant. The dramatic
variant cannot climb its two ascents below about 7.1% on the plan alignments (138–141 m over 1,957–2,309 m
with the last 150 m shared with the rim roads), so the recipe allows 7.8% and reports it; a 6% ascent needs
switchbacks inside the plan corridor (a D4 realignment). The decision gate (variant and targets) is recorded
in the AI 596 prompt file.

## D2 terrain synthesis engine (2026-10-09)

The engine is complete for the roadmap's L0 scope: 31 operators in 8 families (see Operators), overrides,
interchange, the geology sidecar and the fixture gate leaf `landscape/synthesis/fixture`. The gate recipe
`tools/bake_landscape/terrain_synthesis/fixture/recipes/plateau-road-shoreline.json` erodes the analytic
1 × 1 km base (513² at 1.953125 m) into hill country with valleys draining to the sea, a 36 m plateau town
behind an 18 m escarpment, a bluff coast with a wave-cut platform and talus, a berm beach, foredunes, a
nearshore bar and a reef off the headland, and passes 19/19 checks (measured 2026-10-09 after the repose bound
of the depositing operators, see Operators):

| Check | Measured | Target |
| --- | --- | --- |
| determinism | identical hashes of the heights and all 26 layers on two runs | bit identical |
| plateau band (district 1) | p05 36.0 / p95 36.0 m, 99.98% flat | 35–37 m, ≥ 95% flat |
| plaza band (district 2) | p05 2.56 / p95 2.65 m | 2.3–3.3 m |
| roads | sustained 5.82%, short 5.86% | ≤ 6% sustained, ≤ 8% short |
| shoreline | 39.1 m at the 16 headland vertices (reported by the headland operator), the rest within tolerance | 10 m |
| beach arrival, bus stop, view corridor, swim zone, sea level, cover | pass | plan rules |
| relief | 13.8% of land above 10°, 3.7% above 20°, max 63.5°; incision p90 8.2 m; relief p90 16.1 m over 100 m | ≥ 12%, ≥ 3%, ≥ 60°, ≥ 1 m, ≥ 8 m |
| needles | 0 samples more than 2 m above all 8 neighbours (before the repose bound: 39, max 18.5 m, which also held the max slope at 81.5° and the incision p90 at 12.5 m) | 0 |
| geology invariant | max residual 1.9e-6 m | ≤ 1e-3 m |
| coastal zones | reef, bar, swash, berm, foredune, platform, bluff face present | required classes |
| interchange | EXR export re-imported with 0 differences | 0 |
| seams | standalone saved landscape (5 chunks, level 1) and validated geology candidate | seam free |

Timings on the native 513² grid in one Node process: the whole recipe 10.1 s (fluvial 150 iterations 5.6 s,
hydraulic 30,000 droplets 0.52 s, thermal 30 iterations 0.25 s, sediment 0.19 s, every other operator
≤ 0.7 s; the repose bound costs hydraulic, thermal, sediment and terraces about 0.15 s together); on the 1025² unit
fixtures fluvial takes 5–16 s, hydraulic 2.2 s per 200,000 droplets, thermal 1.7 s and sediment 0.9 s. Peak
tracked working set 32 MB.

Recipe lessons: the corridor descent (`constrain-points`) runs before the plaza re-imposition and the road
fit (a corridor blend after the roads broke the coast road at 9.6%; before the plaza it raised the plaza
p95 to 3.8 m); `sediment-deposit` takes 10% of the accumulated wear as supply (100% buried the channels in
lumps); the bluff talus is 10% of the cut volume (30% buried the 6–13 m face, leaving no face class);
broad ridged hills (500–60 m octaves, ±24 m) with fluvial incision at retainRate 0.003 read as eroded
ground, while fine octaves plus heavy diffusion read as a blurred plain.

Limitations carried forward: `inputs.plan.landCover` PNG decoding in `plan-inputs` is not implemented
(cover comes from the imported landscape or the base); the fixture landscape carries no planning
references or appearance, so it is reviewed through its maps, not in the game viewer; D4 adds the
city-scale recipe and the viewer captures.

## D3 finer authoritative resolution (2026-10-09)

Decision: **0.9765625 m native spacing** for synthesized terrain (the 4 km city as 4097², maxLevel 4, 341 nodes, 250 m
chunks; the 1 km fixtures as 1025²), recorded with the measurements below. 1.953125 m reads the designed coastal edges
5–10° too shallow (the 65° bluff face measures 53° at 1.953 m and 59–64° at 0.977 m), broadens the berm crest 2.7×
(radius 70.8 → 25.8 m) and widens gullies by about 10%, so the roadmap's 2–4 m features (rills, ledges, berms, crest
lines) need the finer grid; 0.48828125 m adds little beyond 0.977 m on the designed edges (the berm is identical, the
bluff face within 0–6°), costs 4× the data and 3.2–4.6× the synthesis time of 0.977 m per km², and over the 4 km city
(8193², 1365 nodes) its measured-hierarchy manifest is 1,762,795 bytes, above the 1 MiB limit every bounded reader
enforces, so it stays a fixture-only spacing until a smaller per-node record or a split index exists.

Synthesis of the D2 gate recipe at the three spacings (leaf `landscape/synthesis/resolution-study`; same seed, the same
world-anchored landforms, density-scaled hydraulic droplets; receipt `tests/artifacts/screens/landscape/ai596/d3/resolution/`,
composites `composite-{bluff,gully,rim,hillshade}.png`; MB = 1,048,576 bytes):

| Measure | 1.953125 m (513², L1, 5 nodes) | 0.9765625 m (1025², L2, 21 nodes) | 0.48828125 m (2049², L3, 85 nodes) |
| --- | --- | --- | --- |
| saved landscape (by manifest / on disk) | 1.60 MB / 1.60 MB (12 files) | 6.68 MB / 6.30 MB (38 files) | 26.99 MB / 24.28 MB (129 files) |
| synthesis seconds (one Node process) | 9.1 | 46.7 | 177.2 |
| peak tracked memory | 31.12 MB | 124.25 MB | 496.49 MB |
| ancestor max geometric error by level | L0 3.67 m | L0 5.73 m, L1 4.97 m | L0 6.30 m, L1 5.41 m, L2 3.90 m |
| natural slope above 10 / 20 / 30° | 13.77% / 3.73% / 2.50% | 12.79% / 3.43% / 2.62% | 11.90% / 3.32% / 2.72% |
| incision p50 / p90 / max | 4.57 / 8.25 / 16.74 | 4.61 / 10.33 / 16.73 | 4.13 / 11.52 / 16.61 |
| shared vertices within 0.5 / 1 / 3 m of the 1.953 m result | reference | 97.23% / 99.23% / 99.94% | 93.83% / 98.57% / 99.89% |
| needles (one-sample spikes > 2 m) | 0 / 0 | 0 / 0 | 0 / 0 |
| bluff face, tallest coastal steps (B-965 / B-55): mean slope of the ≥ 40° face | 52.8° / 53.4° (2.0 m runs) | 58.5° / 52.6° (1.5–1.75 m) | 58.9° / 59.2° (1.25–1.5 m) |
| B-965 steepest 1 m slope (designed face 65°) | 54.5° | 64.0° | 63.4° |
| berm crest radius T-300 / T-700 | 70.8 / 51.4 m | 25.8 / 22.8 m | 25.8 / 22.8 m |
| gully width 1 m above the floor, mean / median | 36.3 / 37.5 m | 33.4 / 34.5 m | 34.5 / 35.0 m |
| ridge crest radius R1..R6 (re-centred) | 50 / 58 / 78 / 65 / 50 / 127 m | 52 / 76 / 75 / 66 / 52 / 109 m | 57 / 86 / 77 / 71 / 55 / 120 m |

The 4 km pair at the coastal city's node counts (reduced recipe, no plan; exact JSON sizes from `.../d3/limits/`):

| Measure | 4 km, 1.953125 m (2049², L3, 85 nodes) | 4 km, 0.9765625 m (4097², L4, 341 nodes) |
| --- | --- | --- |
| saved landscape (by manifest / on disk) | 26.99 MB / 22.77 MB (105 files) | 108.25 MB / 90.11 MB (396 files) |
| synthesis seconds (reduced recipe, fluvial 40 iterations) | 60.5 | 253.6 |
| peak tracked memory | 348.37 MB | 1392.74 MB |
| ancestor max geometric error by level | L0 8.34 m, L1 5.95 m, L2 3.24 m | L0 6.20 m, L1 6.00 m, L2 4.30 m, L3 3.39 m |
| natural slope > 10 / > 20°, p90 / p99 / max | 12.16% / 0.81%, 10.55 / 18.51 / 66.3 deg | 11.98% / 0.67%, 10.50 / 17.74 / 71.1 deg |
| manifest.json (exact, measured-hierarchy, limit 1 MiB) | 114,074 B | 443,246 B (1365 nodes at 0.488 m: 1,762,795 B, over) |
| terrain-fields / geology sidecar manifests (exact; limit 1 MiB since D3, was 256 KiB) | 78,864 / 75,553 B | 246,836–293,636 / 283,435 B (1365 nodes: 899,938–1,126,866 / 1,116,668 B) |
| hierarchy preparation native reads | 448 | 2,304 (1365 nodes: 11,264) |

Browser measurements (harness `tests/headless/e2e/landscape_resolution.pwtest.js`, `LANDSCAPE_PERFORMANCE.md`
"Fixture resolution harness"; receipts `.../d3/browser/<fixture>/report.json`, `comparison.md`; shipped profile 512/448 MiB, surface cache on, 1920x1080 DPR 1 (drawing buffer 1920x1056), Chromium 151.0.7922.34, NVIDIA GeForce RTX 3060 through ANGLE/D3D11, AMD Ryzen 5 9600X 6-Core Processor; 30 warm-up + 120 sampled frames per stop; route overview from the sea, 30-frame approach to the bluff crest, gully close pose, top-down orthographic close view over the probe patch, return to the overview; all runs vsync-bound at 16.7 ms median frame interval):

| Fixture | Startup natives before the first frame / by settled | Peak controlled CPU / estimated GPU | Upload max per frame / route | GPU ms median / p95 | Max triangles (draws) | Settle ms bluff / gully / ortho | 1.5 px geometry target | Picking max error (level) | Queries exact |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1953 (513², L1, 5 nodes) | 0 / 0 of 4 | 33.6 / 189.8 MiB | 3.51 / 14.03 MiB | 2.85 / 3.65 ms | 534,702 (7) | 200 / 196 / 199 | met at every stop | 6e-14 m (L1) | 64/64 |
| 0977 (1025², L2, 21 nodes) | 0 / 0 of 16 | 113.7 / 242.4 MiB | 3.51 / 108.70 MiB | 3.81 / 5.90 ms | 2,132,142 (19) | 600 / 496 / 487 | met at every stop | 6e-14 m (L2) | 64/64 |
| 0488 (2049², L3, 85 nodes) | 0 / 0 of 64 | 279.6 / 351.1 MiB | 3.51 / 462.84 MiB | 5.53 / 6.85 ms | 5,327,022 (43) | 2501 / 5897 / 1998 | met at every stop | 6e-14 m (L3) | 64/64 |
| 4km-1953 (2049², L3, 85 nodes) | 0 / 0 of 64 | 275.6 / 351.2 MiB | 3.51 / 476.87 MiB | 5.66 / 6.49 ms | 4,528,302 (37) | 3000 / 5884 / 3492 | met at every stop | 6e-14 m (L3) | 64/64 |
| 4km-0977 (4097², L4, 341 nodes) | 0 / 0 of 256 | 424.2 / 445.8 MiB | 3.51 / 788.93 MiB | 4.33 / 6.48 ms | 6,924,462 (55) | 6901 / 12088 / 8396 | missed at approach-bluff (gpu-budget) | 8e-14 m (L4) | 64/64 |

Every fixture disposed to zero controlled CPU/GPU bytes; uploads never above 3.51 MiB per frame (cap 8); no native height payload was requested before the first covered frame on any fixture; 1953, 0977, 0488, 4km-1953 met the 1.5 px geometry target at every stop; 4km-0977 missed it at approach-bluff (gpu-budget). The fixtures carry no appearance or terrain-fields sidecars, so they render fallback soil colors (viewer error "[Landscape] appearance manifest HTTP 404") and PBR materials and generated surface detail are not measured; picking and query probes use the gully D patch at world x 430-471, z 135-166 m on every fixture, and the 4 km routes use the 1 km poses scaled onto their bounds.

Edit and query gate on the published 0.977 m and 0.488 m fixtures (copies under `.../d3/editing/<tag>/`, one batch =
grade with 6 m linear falloff + 7 m smooth at strength 0.5 + a sand soil override on a ~60 m hexagon straddling four
natives at (500, 500), through the Node authoring store): every changed native sample equals the independently
recomputed designed height (1,056,784 / 1,056,784 at 0.977 m, 4,227,136 / 4,227,136 at 0.488 m), every ancestor's
aligned samples equal the native float32 bits (330,245 and 1,387,029 samples) with conservative errors, all shared
borders identical (7,196 / 35,980 samples), apply 0.69 / 1.19 s and revert 0.14 / 0.54 s restore the pre-edit
manifest and channels bit for bit; `sampleLandscapeChunk` equals the stored float32 at 1,000 random native vertices
and the NW-SE triangle formula at 1,000 random cell centres on both.

Contracts extended (model, import, hierarchy, streaming, editing, query), all behaviour-preserving at 1.953125 m:
- `provenance.kind: procedural-synthesis` (`LANDSCAPE_MODEL.md`): `nativeResolutionMeters` must equal the grid spacing,
  `sourceSha256` is the recipe file's hash, and the `synthesis` block carries the recipe id, the identity, the statement
  "procedurally synthesized, not measured", `sourceSpacingMeters` (the spacing the operators ran at) and `upsampled`;
  upsampling never counts as source detail. `writeSynthesizedLandscape` emits it (`synthesis` option); the relief
  study, the fixture gate and the resolution study pass it. Older documents keep their kinds (`COASTAL_IMPORT.md`: the
  ZIP importer stays the 2049² v2 import; finer native data enters only through the synthesis writer).
- Hierarchy and streaming (`LANDSCAPE_HIERARCHY.md`, `LANDSCAPE_STREAMING.md`): a finer grid deepens the tree and
  changes nothing per tile (257² tiles, 330,245 decoded bytes, 1 MiB payload cap, 8 MiB per-frame upload); preparation
  reads 448 / 2,304 / 11,264 natives at maxLevel 3 / 4 / 5 with unchanged memory; the planner's per-frame cost is
  proportional to the node count; root-to-native refinement takes maxLevel sequential sibling tasks (each ≥ 4 upload
  frames + a 0.3 s morph); nothing native is fetched at startup at any depth; the prefetch margin is min(250 m, span/4).
- Editing (`LANDSCAPE_EDITING.md`, `LANDSCAPE_STREAMED_EDITING.md`): the smooth radius cap is 8 samples at ≥ 1.5 m
  spacing and 16 samples below it, so the physical reach stays 15.625 m at 0.977 m (7.8125 m at 0.488 m); a 257² work
  unit with the 16-sample halo reserves 2,464,867 bytes (8-sample: 2,387,011) under the 8 MiB allowance.
- Query (`LANDSCAPE_EDITING.md`, `LANDSCAPE_VIEWER.md`): the authoritative acquisition admits a circle everywhere only
  up to radius span/2 (250 m at 1.953 m, 125 m at 0.977 m, 62.5 m at 0.488 m); `landscapeQueryRadiusLimit(manifest)`
  derives it and the viewer's selection radius bound and hint follow the loaded manifest instead of a fixed 1000 m.
- Sidecars (`LANDSCAPE_TERRAIN_FIELDS.md`, geology section above): the terrain-fields and geology sidecar manifests may be
  1 MiB (256 KiB held only the 85-node coast; 341 nodes measure 246,836–293,636 and 283,435 bytes); the runtime decode
  credit is 3 MiB. The fields and geology bakes still assemble the full native grid (D4 prerequisite above).

Costs accepted with 0.977 m over the city (the 4 km fixtures measure them at the real node count): ≈ 108 MB per saved
revision (plus the terrain-fields and geology sidecars), synthesis ≈ 4.3 min for the reduced 4 km recipe and ≈ 10–12 min
projected for the full city recipe (150 fluvial iterations at 2.4× the 40-iteration cost), peak tracked synthesis memory
1392.74 MB in one process (above the fixture's 1 GiB working limit: the D4 recipe declares a larger limit or tiles the
erosion), the fields and geology bakes' full-grid assembly ≈ 1.5 GB (above their 768 / 512 MiB limits: streamed assembly
is a D4 prerequisite), hierarchy preparation 5–7 s (2,304 native reads), the appearance pages re-baked (the binding key
covers the grid), and the surface-detail recipe re-derived (the viewer's `50cm` / `25cm` modes count levels below a
1.953 m native grid; at 0.977 m the same spacings are one level fewer).

Limitations recorded: the fixture landscapes carry no appearance or terrain-fields sidecars (the viewer draws fallback
soil colours and reports the missing appearance; `capture.mjs --allow-missing-appearance on`), so the browser numbers
exclude PBR materials and surface detail; the 4 km fixtures run a reduced recipe without plan constraints (budget
evidence at the city's node count, not the v3 content); warm/reload runs were not measured; the updated authoring e2e
constants were smoke-tested in the browser, not run as Playwright. The engine defect the study exposed (one-sample
needle deposits of `sediment-deposit`, `terraces`, `hydraulic-erosion` and `thermal-weathering`, 39 → 162 → 577 per km²
with resolution and up to 135 m on the 4 km pair) is fixed by the repose bound (Operators) and gated by the fixture's
`needles` check; before the fix the ancestor errors (up to 141 m) forced native residency everywhere and the 4 km 0.977 m
fixture to its GPU ceiling.

## D4 coastal terrain v3 (2026-10-09)

Coastal terrain v3 is the landscape `coastal-city-v3` in `assets/public/landscape/coastal-city-v3/` (a new landscape id: the
model forbids reinterpreting an id under a new native grid; v2 stays immutable in `coastal-city/` and remains the viewer,
server and bake default directory for the existing suites), revision `synthesis-7045f619de9de74a367bc3a8`, immutable
snapshot `manifest.3846aed4c17a7125df21eab7f3b486eff82daa2e5e0f3fc0ab084dc02689e9ef.json`, 4097² at 0.9765625 m
(maxLevel 4, 341 nodes, 250 m chunks), provenance `procedural-synthesis` (recipe `tools/bake_landscape/terrain_synthesis/recipes/coastal-v3.json`,
seed 596400, identity `synthesis-da623d87a672561647b22b5b`, source spacing 0.9765625 m, v2 imported at 1.953125 m and
upsampled ×2 with Catmull-Rom, never counted as detail), the 29 v2 planning references copied with their identities,
terrain fields `terrain-fields-8ae5a126ff397de346c5aea3` (341 pages, recipe `terrain-fields-coastal-v3.json` with a
1,792 MiB working limit) and geology `geology-cf24152c9156cf1bc425da74` (341 pages, 8 field channels + 4 categories).
On disk 762.9 MiB in 1,828 files (fields 382.8 MB, geology 275.4 MB, terrain payloads 107.9 MB, references 32.9 MB).
Appearance: `node tools/bake.mjs --target landscape/appearance --set "landscape/appearance:directory=assets/public/landscape/coastal-city-v3" --set "landscape/appearance:multiscale=tools/bake_landscape/appearance/multiscale-v1-coastal-city-v3.json" --publish` published revision `appearance-b9c951722dd0824f9f25d8a9` in 6.1 s (54 bounded pages, 36 unique, 13.4 MB; 16 multiscale pages, 55.6 MB; 66.1 MiB in 57 files) bound to the v3 revision (binding key `30bb4ee6…`, alias file byte-equal); the headless viewer loads v3 with PBR materials and terrain fields (NW-13 check: ready 1.5 s, settled 17.6 s, LOD 1–4, 22 tiles, 0 appearance errors). The cache bundle verifies before and after the appearance bake (1,828 → 1,885 files, 762.9 → 829.0 MiB, 5 pointers including `geology/manifest.json`).

Generation: the leaf `landscape/synthesis/coastal-v3` runs the 34-operator recipe (variant B landforms: massif dome,
±42 m ridged hills, the west bluff cut 115 m landward of the design shoreline, the 80 m high city with a 25 m escarpment
at 60° over a 34° talus; strata; fluvial 150 iterations at retainRate 0.003, hydraulic, thermal, sediment, terraces;
coastal exposure, bluff retreat with the wave-cut platform (talus 4% of the cut), Dean equilibrium beach handing over to a
1.5–2.5° shelf, foredunes outside the corridor, nearshore bar, reef off the bluff sector; district re-imposition with
designed edges — 30° embankments with a 5 m blend on districts 1, 2, 3, 5, 6 and 7, the escarpment on 4, the corridor
descent before the plaza and the road fit; roads at 5.8% as one network with 40 m cut/fill shoulders; shoreline, runway,
90 m cap; geology channels; land cover derived from the geology), evaluates every column-B target and hard constraint
(`analysis/TargetsReport.mjs`, 44 rows, the leaf fails on any failing row) and publishes. Nine iterations on the 1.953 m
working grid (≈3.5 min each) preceded the native run: engine 863 s (fluvial 468, high-city plateau 217, hydraulic 30),
peak 1,985 MB tracked of a 3 GiB limit, landscape write 115 s (fields 103, hierarchy 6), geology 14 s, 1,028 s in all.

Land cover derivation (`derive-land-cover`, rules declared in the catalog): water below sea level; sand where the deposit
is beach or dune sand or the coastal zone is swash, berm, backshore or foredune; rock where the face mask ≥ 0.5, the slope
≥ 40°, talus ≥ 0.5 m or hard bedrock is exposed (mantle ≤ 0.05 m, slope ≥ 25°, hardness ≥ 0.6); grass on alluvial floors
≥ 0.3 m at ≤ 6°; otherwise the source class; planning classes 5–7 copied exactly. Of 16,785,409 samples 260,848 changed:
water −2,009 (beach sand raised above the sea), sand +34,966, rock +56,260 (faces 10,315, slopes 56,407, talus 46,306,
exposed bedrock 82,997 decided), forest −222,423, grass +133,206 (alluvial floors 60,547), planning 5/6/7 identical
(2,760,708 / 211,900 / 18,984); the full from→to matrix is in the receipt's engine report.

Measured natively (`tests/artifacts/screens/landscape/ai596/d4/v3/targets.md`; natural land = cover 1–4 above sea level):

| Row | Measured | Target (column B) | Result |
| --- | --- | --- | --- |
| natural slope share ≥ 10° | 0.177 | >= 0.1 | pass |
| share ≥ 20° | 0.033 | >= 0.03 | pass |
| share ≥ 30° | 0.023 | >= 0.01 | pass |
| steepest natural slope | 85.797 | >= 65 deg | pass |
| face mask beyond 65° | 10,320 of 10,320 samples | every natural sample at or beyond 65 deg carries face mask >= 0.5 | pass |
| local relief p90 over 100 m | 14.228 | >= 14 m | pass |
| local relief p90 over 500 m | 48.414 | >= 40 m | pass |
| high-city rim face height | 26.6 m | 20..30 m | pass |
| rim face slope | 59.1° | 55..65 deg | pass |
| rim talus slope | 33.0° | 30..35 deg | pass |
| west cliff face height | 11.6 m (14 of 14 transects) | 10..16 m | pass |
| west cliff face slope | 68.0° | 60..75 deg | pass |
| wave-cut platform width | 30 m | 20..40 m | pass |
| platform height | +0.64 m | +0.5..+1.5 m | pass |
| drainage lines with ≥ 3 m incision | 65 | >= 8 lines with >= 3 m incision | pass |
| incision p90 | 5.77 m | >= 2.5 m | pass |
| berm height | 1.80 m (13 of 13 transects) | 1.5..2 m | pass |
| berm distance from the waterline | 31.5 m | 25..40 m from the waterline | pass |
| foreshore slope | 2.81° | 1.9..3.8 deg | pass |
| foredune height | 3.27 m (11 of 13 transects) | 3..6 m where space permits | pass |
| foredune in the corridor or districts | 0 samples | no foredune sample inside the open-view corridor or a district | pass |
| Dean A | 0.137 m^(1/3) | 0.1..0.14 m^(1/3) | pass |
| −8 m reached | every transect, median 444 m | the profile reaches -8 m on every transect | pass |
| shelf slope −8 → −30 m | 1.98° | 1.5..2.5 deg from -8 m to -30 m | pass |
| bar crest depth | −2.21 m (13 of 13) | -3..-2 m | pass |
| bar crest distance | 111 m | 60..120 m seaward | pass |
| reef off the bluff sector | tops p05 −3.99 / p95 −1.81 m, none in the swim zone | reef off the bluff sector with tops -4..-1 m, none in the swim zone | pass |
| high city above the skyline from NW-08 | 3.69° | >= 3.5 deg | pass |
| from NW-01 | 1.35° | >= 1.3 deg | pass |
| from NW-09 | 1.704° | >= 1.7 deg | pass |
| roads sustained grade | 5.80% | <= 6% over 50 m | pass |
| roads short grade | 5.81% | <= 8% over 20 m | pass |
| district bands (hard) | all seven inside their bands (7 Beach arrival 2.43–2.77 m) | every district p05..p95 inside its design band | pass |
| districts flat ≤ 8° (hard) | ≥ 99.2% of urban samples | >= 0.95 of the urban samples below 8 deg | pass |
| district edges designed (hard) | embankment 30° on 1, 2, 3, 5, 6, 7; escarpment on 4; median edge width 0–4 m | every district edge a designed treatment (escarpment, embankment, retaining, ramp; never feather) at most 25 m wide unless an escarpment | pass |
| road topology (hard) | 41 of 41 roads on their alignments | 41 plan roads measured on their alignments | pass |
| shoreline (hard) | max 0.50 m, no headlands or coves | every design vertex within +/-10 m | pass |
| beach arrival (hard) | 2.51 m, slope 0.05° | flush at 2.6 m, no walls or boulders | pass |
| bus stop (hard) | 2.65 m ± 0.024 | kept at 2.6 m | pass |
| view corridor (hard) | sea visible from 1,164 m | sea visible from the upper end of the descent road | pass |
| swim zone (hard) | 0 disallowed samples, seabed p95 4.8° | clean sandy seabed and sand on land | pass |
| sea level (hard) | Y = 0 | Y = 0 | pass |
| planning cover 5–7 (hard) | 0 mismatches | planning classes 5-7 identical to the source cover | pass |

One needle remains (2.39 m at (672, 3587), −4.0 m in the sea off the bluff sector, reported, below the land gate).

Publication, pin and editing (workstream B): The city spec `src/app/city/specs/CoastalLandscapeCitySpec.js` pins `coastal-city-v3` (snapshot `manifest.3846aed4…json`, 459,703 B, revision `synthesis-7045f619de9de74a367bc3a8`; transform and extent unchanged); the cache availability probe, `landscape/cache-install` (destination `auto` = the bundle's own id directory, a foreign id is refused, the geology pointer is authenticated) and the city-binding suites resolve the directory from the binding's id; v2 stays the viewer, server and bake default (`LANDSCAPE_DEFAULT_DIRECTORY`) and the e2e suites keep it through `tests/shared/landscapeCacheTest.js` (`COASTAL_V2`). The viewer opens v3 with `?landscape=/assets/public/landscape/coastal-city-v3/manifest.json`, the server with `LANDSCAPE_DIRECTORY=assets/public/landscape/coastal-city-v3`.  Editing, reports and revert on a copy of v3 (`tests/artifacts/screens/landscape/ai596/d4/editing/edit-gate.md`, 13 of 13 checks): a grade (19.84 → 17.38 m) + 7 m smooth + sand batch on a ~60 m hexagon at the chunk corner (2500, 2250) applies in 2.87 s (4 natives, 5 ancestors at depth 4, 2,525 changed occurrences, 16,908,544 native samples equal to the independent recomputation, 5,614,165 aligned ancestor samples bit-equal with conservative errors, 159,340 border samples identical, working set 2,377,459 B of 8 MiB, manifest 464,515 B); the district-4 footprint report (3,645 probes, elevation 79.71–80.33 m, slope max 8.23°) and the high-city south ascent corridor report (max grade 5.82%, 100% ≤ 6%) run on the edited revision in 0.07 / 0.11 s; revert in 2.44 s restores every chunk bit for bit (22,522,709 samples, 611 payloads unchanged, tombstone retained); queries exact at 1,000 vertices and 1,000 cell centres. Explicit edits survive regeneration through `tools/landscape_authoring/BatchReplay.mjs` (`replayAcceptedBatches`; CLI `node tools/landscape_authoring/run.mjs replay --previous <dir> --directory <dir>`; the `replay-edits` option of the coastal-v3 leaf): the accepted batches of the previous landscape are re-applied in acceptance order through the bounded store with `replayedFrom` provenance per operation, idempotently; a batch outside the target bounds or whose smooth radius is invalid at the target spacing is skipped with a coded reason, never silently dropped. The documented evaluation order (`LANDSCAPE_EDITING.md`, "Regeneration and replay") is recipe → saved landscape → fields and geology sidecars → replay → appearance bake; edits are never baked into the recipe. Verified on the 1 km fixture (bit-identical channel hashes after replay, 3 of 3 unit tests).

Browser (workstream C; harness `tests/headless/e2e/landscape_resolution.pwtest.js` with `LANDSCAPE_RESOLUTION_ROUTE=natural-world` (NW-13 overview → flyover to NW-10 → NW-03 → NW-08 → NW-01 → orthographic probe patch on the high-city south flank → return), shipped profile 512/448 MiB with the surface cache on, 1920 × 1080 DPR 1, NVIDIA RTX 3060 through ANGLE/D3D11, Chromium 151, 30 warm-up + 120 sampled frames per stop, no bake running; receipt `tests/artifacts/screens/landscape/ai596/d4/browser/coastal-city-v3/report.json`, `comparison.md`):

| Measure | v2 (AI577 D7 standard, cold, historical) | v3 (natural-world route) |
| --- | ---: | ---: |
| Startup natives before the first frame / by settled | 0 | 0 / 4 of 256 |
| Coarse / settled startup ms (compile ms) | 810 / 9,623 | 878 / 12,106 (469) |
| Peak controlled CPU / estimated GPU MiB | 243.2 / 339.0 | 416.5 / 448.0 (GPU at the ceiling) |
| Upload max per frame MiB (cap 8) / route total | 5.59 | 7.77 / 1,037 |
| Frame ms median / p95 | 17.50 / 18.10 | 16.70 / 16.80 (vsync) |
| Synchronous CPU ms median / p95 | 0.70 / 1.60 | 2.00 / 3.70 |
| GPU ms median / p95 | 1.02 / 2.96 | 5.71 / 7.86 |
| Max triangles / draws | 1,333,422 / 15 | 4,577,966 / 39 |
| Settle ms | approach 4,222 | flyover 5,697, bluff toe 7,189, low city 8,295, beach 6,696, ortho 7,195, return 2,390 |
| 1.5 px geometry target | reached | met at the overview, orthographic and return stops; missed at the four ground stops (gpu-budget; appearance mask capacity, 17 slots) |
| Picking / queries | — | 64 of 64 hits, max error 1.1e-13 m at L4; 32 of 32 vertices and 32 of 32 cell centres exact |
| Disposal | zero | 0 B CPU / 0 B GPU |

Finding: with PBR appearance and 25 cm surface detail the shipped 512/448 MiB profile holds v3 only at a degraded level at the ground poses (achieved 2.7–80 px against the 1.5 px goal, appearance 48–96 MiB GPU, mask slots exhausted); the budgets must grow for v3 (`LANDSCAPE_STREAMING_BUDGETS`, `landscapeSurfaceCacheBudgets`, mask slots) and be re-measured — carried into D6 integrated acceptance. Frame time stays vsync-bound at 60 FPS.

Captures and composites: all 13 poses settled on v3 with PBR appearance (`tests/artifacts/screens/landscape/ai596/d4/poses/v3/`, 112 s; v3 ground at the eye-height poses re-resolved: NW-03 1.84 m, NW-04 15.13 m, NW-07 40.99 m); composites under `.../d4/composites/`: `pose-NW-01..13.png` [v2 before | v3 after], `v3-R03-NW-07.png`, `v3-R03-NW-05.png`, `v3-R04-hillshade.png`, `v3-R07-NW-11.png`, `v3-R07-NW-10.png`, `v3-R10-NW-03.png`, `v3-R10-NW-04.png`, `v3-plan-topographic.png`, `v3-plan-surface.png`, plus hillshade/slope/profile sheets and `contact-sheet-v3.png`; the review report is `tests/artifacts/screens/landscape/ai596/d4/REPORT.md`. The R10 reference image is not on disk (only R01–R07 are saved; R08–R10 were supplied in conversation), so its sheets carry a labelled placeholder in the reference slot.

Engine faults fixed while authoring v3 (unit-tested, D2 gate 19/19 after each): `EdgeProfiles` started the daylight march at
the escarpment's 12 m rim for embankment and retaining profiles (a trench around every pad); `applyPlateau` blended
samples beyond `daylightReachMeters` to the reach descent under `combine: blend` (a ring lowered by half the descent 200 m
out). Both paths now leave the ground alone.

Limitations recorded: The R10 reference image is not saved on disk (placeholder in its sheets); the v2 performance numbers are the historical AI577 D7 run, not re-measured; warm/reload runs were not measured; visual review points for the user: the high-city rim faces render as pale vertically stretched bands with sawtooth shading (heightfield faces, rock geometry is a later layer), the bluff reads as one dark rock band (talus and platform measured, not yet distinguishable by material), and the derived rock class peppers the forest with speckles (1.6% of forest). The cold-checkout cache test passes only once the commit carries the geology pointer (it clones HEAD); the appearance leaf writes its receipts to the fixed AI 576/577 paths (copies kept under `d4/appearance/`); the default landscape server's authoring API targets v2 unless `LANDSCAPE_DIRECTORY` points at v3; the browser e2e suites were not run (they keep their v2 constants). The v2 e2e suites keep their pinned constants on
`coastal-city`; the viewer's `50cm`/`25cm` surface-detail modes count levels below a 1.953 m grid (one level fewer at
0.977 m); the massif stays a smoothstep dome under the erosion; the fields and geology bakes still assemble the full
native grid (working limits raised and recorded in their recipes).

## D5 far-field surround (2026-10-10)

Data: the leaf `landscape/synthesis/surround` (`tools/bake_landscape/terrain_synthesis/surround/`, recipe `recipes/coastal-v3-surround.json`) imports v3 with the new `import-heights` placement `embed` (v3 decimated ×16 by a tent filter into its rectangle, the boundary continued outward with a smoothed fade to an 18 m plain — `fillMode: extend-edge`), then, masked to outside the extent with a 0–300 m blend: the far shoreline (the v3 design line continued as a C1 coast with 8 spur headlands — an anisotropic ridged `landform-hills` field stretched across the coast whose own contour displaces the shoreline 420–604 m seaward — and 2 coves written as footprint arcs; `surround/plan/author.mjs` rebuilds `far_shoreline.json` from the recipe and a test proves the committed file equals the rebuild), a shelf to −60 m, v3's own world-anchored hills octaves (same seed) plus 12/6/3/1.5 km ridged octaves max-composited into four massifs (crests 242–421 m, soft cap 500 m; from NW-11 they stand 0.3–0.9° above the far-edge line with 10–49° gaps), a few fluvial iterations, one sediment pass, `derive-land-cover`. Published 2026-10-10 as a standalone landscape document under `assets/public/landscape/coastal-city-v3/surround/` (id `coastal-city-v3-surround`, revision `synthesis-857ae85a2b611d24990fafdc`, snapshot `manifest.245cc763…json`, 2049² at 15.625 m, bounds −14000..18000, chunkIntervals 256, maxLevel 3, 85 nodes, 118 payload files, 26.99 MB by manifest, no references/appearance/fields/geology, provenance `procedural-synthesis` with `preparation.surround = {landscapeId, revision synthesis-7045f619…, manifestSha256 3846aed4…, extent 0..4000, boundaryHash 63828832…}` — the SHA-256 of v3's four native boundary rows/columns, so a stale surround is refused). Seam metrics of the receipt (`tests/artifacts/screens/landscape/ai596/d5/surround/surround.md`): 0 height mismatches inside the extent against an independent decimation, boundary steps to the first outside sample max/p90 north 3.99/0.48 m, south 4.51/0.30, west 2.51/2.38 (the shelf below v3's −30 m floor), east 0.39/0.25 (the inside neighbour steps are 2.5–3.1 m), far shoreline continuous at z = 0 and z = 4000 (within 1–5 m of the design endpoints), land/sea 53/47%, heights −60..429 m; engine 33.5 s, peak 497 MB. The cache bundle verifier authenticates the sidecar (pointer `surround/manifest.json`, payloads by the surround manifest's channel hashes, binding checked against the landscape manifest; v3 verifies at 2,003 files, 847.5 MiB); cache-install installs it in the documented pointer order.

Runtime (`src/graphics/engine3d/landscape/LandscapeSurround.js`, `LandscapeSurroundModel.js`, contract `landscape-surround-v1`): the viewer loads `surround/manifest.json` in the background after the authoritative streams (`landscapeSurround=auto|off|<url>`, panel button Surround, `setSurround` hook, `snapshot().surround` with status, binding, tiles by level, share bytes/peaks/denials, excluded and straddling ids, palette), validates it as a landscape document and refuses an unbound or stale binding; a second `LandscapeStreamer` renders it without appearance or surface cache (natural inference `overview`, 3 px target, one worker, the upload allowance the authoritative stream left) from a 128/96 MiB CPU/GPU share of the shared ledger (`kind: 'landscape-surround'`). Mesh exclusion (`LandscapeMeshBuffers.js`): tiles entirely inside the landscape extent are never reserved, fetched or built; straddling tiles take the authoritative overview samples on the boundary, lower every inside vertex by 1.5 m, drop cells without an outside corner and close the edge with a 4.5 m wall, and draw behind coincident authoritative tiles (`depthBehind`: render order 1, LessDepth, one polygon-offset unit — a 24-bit depth buffer resolves only ~10 m at 4 km). Picking and queries use only the authoritative stream's meshes (`pickPoint`), asserted in `tests/headless/e2e/landscape_surround.pwtest.js`. The water reference spans the surround bounds while a surround is active (`createLandscapeWaterReference({bounds})`, `snapshot().water.extent = 'surround'`). Soil palette (`LandscapeSoilPalette.js`): each cover class's far colour is the mean linear albedo of its soil's 32 px base-colour page through the terrain's corrected-albedo path, with the soil's natural-ground response and the mean roughness/AO of its ORM page, fed to the surround program as per-stream cells read by the no-appearance variant; the catalog palette applies only without appearance. The surround streamer also exposed a streamer fault, fixed: a budget denial force-pruned source-only prefetch records that were re-requested the same frame, so the stream never settled — prefetch is now skipped while budget-denied.

Budgets (old → new, measured; `LANDSCAPE_STREAMING.md` "Far-field surround", `LANDSCAPE_PERFORMANCE.md`): the shipped 512/256 MiB (cache profile 512/448) could not hold v3 with the surround — the authoritative stream at the 448 MiB GPU ceiling lost 15–20 leaves per ground stop and the surround share saturated — so the profiles grow by exactly the surround share: `LANDSCAPE_STREAMING_BUDGETS` 512/256 → 640/352 MiB, `LANDSCAPE_SURFACE_CACHE_BUDGETS` 512/448 → 640/544 (2560×1440 588 → 684, 3840×2160 950 → 1046), `streamReserveGpuBytes` 256 → 352 (cache ceiling 192 MiB unchanged), `LANDSCAPE_SURROUND.budgets` 128/96 MiB, appearance ceilings 320/176; the unit tests pin the policy (the share is accounted inside both profiles and the streams keep their pre-D5 512/256).

Measured on the natural-world route (resolution harness, 1920×1080, cache on, RTX 3060, `tests/artifacts/screens/landscape/ai596/d5/browser/`): surround off at 512/448 — peaks 416.5/448.0 MiB, GPU 5.71/7.86 ms median/p95, authoritative leaves at NW-10/NW-03/NW-08/NW-01 46/46/55/40; surround on at 512/448 (96/64 share) — 438.3/448.0 MiB, 6.59/8.55 ms, leaves 31/31/40/34 (cannot hold); surround on at 640/544 (128/96 share, the first published revision, byte-identical grid) — 19 surround tiles (L2 15, L3 4), 108.0/70.1 MiB resident (peak 128.0/80.6 at its share), ≈2.5 M surround triangles, view peaks 565.6/543.9 MiB, GPU 6.65/8.18 ms, CPU 2.20/3.40 ms, max 7.19 M triangles / 59 draws, uploads ≤ 7.3 MiB per frame, leaves 52/52/61/49, the 1.5 px goal also met at NW-08; surround off at 640/544 — 535.3/542.1 MiB, 6.20/8.71 ms, leaves 73/64/61/67. The surround costs ≈15 authoritative leaves per ground stop and +0.45–0.8 ms GPU at the same profile; frames stay vsync-bound at 16.7–17.5 ms; picking 64 of 64 hits (1e-13 m), queries exact, disposal to 0 bytes in every run. The refined revision was not re-timed (a Blender render from another session occupied the GPU during the re-run window); its geometry and node count equal the measured revision and the colour fix adds only uniforms and varyings.

Gate evidence on the published refined sidecar (`tests/artifacts/screens/landscape/ai596/d5/`): NW-10 and NW-11 with and without the surround (`poses/v3-on`, `poses/v3-off`, composites `NW-10-v3-on.png`, `NW-11-v3-on.png`) show land and sea continuing on every side; the flyover key frames (frames 0, 270, 300, 900, 1350, 1650, 1800, 1890, 2100 of the original route on v3, `flyover/auto`) pass the automated world-edge detector with 0 defects (one sampled pixel at frame 2100) against the control without the surround (`flyover/off`: 282–115,870 defect pixels, up to 22% at t = 55–70 s); the seam at 20 m above the east and north edges (`seam/v3-on/SE-01..04`) shows no gap or step looking out, and looking along the edge from under 300 m a scalloped colour boundary of the chord error between the 15.6 m samples (native relief between them max 3.4 m, p95 ≤ 0.7 m; rendered |step| p50 0.15–0.29 m, p95 1.2–1.6 m) that is sub-pixel beyond ~1 km. Colour continuity after the soil palette (`colour/boundary_colour.mjs`, 50 px bands either side of the extent boundary): NW-11 sRGB distance 59.3 → 17.6 (luminance ratio 1.71 → 1.10), NW-10 97.4 → 57.7 (the residual is aerial perspective between the 3 km beach and the 10–20 km horizon). e2e `landscape_surround.pwtest.js` passes on the published sidecar (binding, no excluded tile resident, straddling tiles flagged, water extent, share accounting, pick beyond the edge null, off/on/stale/absent, palette from the appearance, disposal to zero).

AI 597 interface (`LANDSCAPE_STREAMING.md` "Far-field surround"): the ocean surface must cover every surround sample below sea level out to the surround bounds and never intersect surround land; the surround's seabed continues the Dean/shelf profile to a −60 m floor; the water reference's extent is the surround's bounds while it is active; `preparation.surround` names the landscape revision the surround continues, and `boundaryHash` detects a stale surround after a terrain change.

Limitations and follow-ups: the near-boundary scalloped colour edge seen along the edge from under 300 m needs a finer boundary ring (for example the native boundary rows as a small sidecar); the surround carries no field pages, so macro variation, catena, rock exposure and wetting are not emulated beyond the per-soil palette; the refined sidecar's residency was not re-timed (see measurements); `landscape_cache_cold_checkout` passes only once the commit carries the verifier's surround pointer (it clones HEAD).

## D6 integrated acceptance (2026-10-11)

Regressions (`tests/artifacts/screens/landscape/ai596/d6/regressions/`): 23 browser suites × 2 surface-cache modes through `node tools/run_selected_test/run.mjs` (E2E_BASE_URL on port 8002; the v2-backed suites against the default landscape server, `landscape_resolution` with `LANDSCAPE_RESOLUTION_FIXTURES=coastal-city-v3 LANDSCAPE_RESOLUTION_ROUTE=natural-world LANDSCAPE_RESOLUTION_SURROUND=on` and `landscape_surround` self-served on v3): cache on 21 pass / 0 fail / 2 skipped, cache off 21 / 0 / 2 (`landscape_material_audit` and `landscape_surface_transition` skip without their opt-in environment). Two first-run failures were stale expectations and were updated: `landscape_acceptance` (4 of 4 cases) counted the viewer's `landscapeSurround=auto` probe of `coastal-city/surround/manifest.json` on v2 as an unexpected 404 — the probe is now in its expected-404 list beside the two PBR probes; `landscape_surface_cache` (2 of 6) pinned the pre-D5 budgets (a GPU override of 449 MiB as "above the shipped profile", the 3840 × 2160 display profile 950 MiB) — now derived from `LANDSCAPE_SURFACE_CACHE_BUDGETS` (545 and 1046). Node suites: 603 of 603 (`landscape_*`, `city_map_roundtrip`, `city_spec_artifacts`, `bake_framework`, including the new `landscape_camera_depth.test.js`), 61 s. Another session's headless Blender render held the GPU during the correctness pass (recorded per run; durations are contended wall-clock), and the near-plane change of 04:04:57 EDT landed mid-pass (suites that loaded the viewer after it ran with the new near plane; none failed on it).

Editing, reports and revert on v3 (`tests/artifacts/screens/landscape/ai596/d6/editing/edit-gate.md`): on a complete copy of the published v3 (2,120 files incl. surround, appearance, fields, geology) the D4 batch (grade + 7 m smooth + sand on four natives at (2500, 2250)) applies in 24.6 s and reverts in 13.3 s (contended by the suites; 2.9 / 2.4 s in D4) with 13 of 13 checks: every native sample equals the independent recomputation, 5 ancestors bit-equal with conservative errors, 159,340 border samples identical, manifest 464,533 B, district and road-corridor planning reports on the edited revision, revert bit-identical. Measured consequence for the handoff: an edit (and a revert) mints a new terrain revision, so the surround and appearance sidecars report `stale` (their `preparation.surround` / `preparedFromRevision` name the previous revision) and the cache bundle verifier lists exactly those two binding problems until the sidecars are re-published for the new revision — by design (LANDSCAPE_EDITING.md "Regeneration and replay"), now measured.



Performance (`tests/artifacts/screens/landscape/ai596/d6/performance/PERFORMANCE.md`, receipts per landscape and cache mode; `landscape_performance.pwtest.js` gained `LANDSCAPE_PERFORMANCE_SOURCE` for a non-default served directory — its settle predicate now also waits for the D5 surround, and for a non-default source the v2-only boot gates (overview-only residency at boot, cold/warm end-byte equality) are recorded as observations while the D3/D4 gate — no native height payload before the first covered frame — is asserted; the coastal default keeps every assertion verbatim). Conditions: current shipped profile (640/352 streaming, 640/544 with the surface cache on), 1920 × 1080 DPR 1, RTX 3060 through ANGLE/D3D11, Chromium 151, 30 warm-up + 120 sampled frames per stop over the 11-stop coastal route, cold = fresh context, warm = reload at home; the GPU was not strictly idle (the Codex desktop app's GPU process held 29–41%; no render or browser ran) so the rows are same-condition against each other, not idle measurements. Standard profile, cache on: v2 cold GPU 1.03 / 2.74 ms median / p95, synchronous CPU 0.90 / 2.00 ms, 135,342–1,333,422 triangles / 4–15 draws, controlled CPU 63.3 current / 245.2 MiB peak, estimated GPU 214.9 / 339.0 MiB, requested detail at 11 of 11 stops, 0 native payloads at startup, coarse / settled startup 785 / 12,407 ms, uploads 391.9 MiB; warm GPU 0.99 / 2.72 ms, startup 115 / 1,478 ms, cold and warm ends equal, disposal 0 / 0. v3 with the surround, cache on: cold GPU 5.01 / 6.83 ms, CPU 1.40 / 2.20 ms, 1,018,286–4,214,958 triangles / 11–35 draws, controlled CPU 241.0 / 549.1 MiB, estimated GPU 332.2 / 528.7 MiB, 22 leaves at boot (L1 1, L2 10, L3 7, L4 4), 0 native payloads before the first frame and 4 by the settled startup, coarse / settled 809 / 15,934 ms (the surround's background load included), uploads 1,073.6 MiB, requested detail at 8 of 11 stops (approach-a limited by surface-detail capacity, approach-b and perspective-in by appearance-mask capacity), surround active at every stop (19 tiles, 16 at two; share GPU peak 82.4 MiB); warm GPU 4.94 / 6.70 ms, startup 139 / 3,560 ms, cold and warm ends equal, disposal 0 / 0; reduced profiles 128/64 (peak 127.9 / 62.9 MiB) and 48/24 (42.0 / 22.8 MiB) complete. Cache off: v2 640/352 peaks 244.8 / 166.7 MiB (cold) and 245.3 / 166.7 (warm); v3 cache off is in the same table. Frame intervals are vsync-bound at 17.50 / 18.10 ms in every standard row. Historical AI577 D7 rows (2026-10-06, 512/448 and 512/256) are kept and labelled historical.

Flyover (`tests/artifacts/screens/landscape/ai596/d6/flyover/FLYOVER.md`): the original route (10 keyframes, 70 s, 30 fps virtual clock, 2,101 frames, 1920 × 1080, same HUD plus the surround tile count) re-rendered from the live viewer on v3 with the surround (`?landscape=…coastal-city-v3/manifest.json&landscapeSurround=auto`, surface cache on, shipped budgets): frame loop 214 s (9.8 fps wall), encoded as `landscape_flyover_v3.mp4` with the original's encoder settings (libx264 preset slow, crf 17, faststart; x264 options byte-identical; 59.8 MB at 6.83 Mb/s against the original's 42.7 MB — more detail at the same crf). Log comparison v2 → v3 over the route: resident tiles 10 / 19.7 / 28 → 43 / 60.5 / 70 (min / mean / max; the finer grid, LOD 2–4 instead of 1–3), frames with pending work 217 → 256, max pending 4 in both, over-water frames 613 → 607, height above ground within −8…+10 m of the original (mean +0.4 m), surround 19 tiles throughout, residency at the budget (587.8 / 544.0 MiB). Contact sheets [original v2 | v3 with surround] at frames 0, 270, 300, 900, 1350, 1650, 1800, 1890 and 2100 plus an overview sheet (`flyover/composites/`): v3 adds relief behind the beach line, the berm reads as a crest line, the bluff runs along the far shore, the plateau stands on the horizon with its faces, incised channels and cover patches replace the featureless plain, and from t = 55 s on the original's world edge (sea trapezoid ending in a hard line) is replaced by sea to the horizon and the coast curving into the surround.

World-edge detector (`flyover/edge_checks.json`, every frame, 518,400 samples per frame): the first render flagged 195 frames — 32 with 1–6 samples at the sea plane's silhouette and 163 in the final climb (540–1,048 m above sea level) where the transparent sea plane blended over rendered surround land 4–6 km away at a 10–13° grazing angle (worst frame 2089: 2,006 samples, 0.39% of the frame; all on land the vertical ray probe finds rendered): a 24-bit depth buffer with near 0.1 m and far 25,000 m resolves about 15 m per quantum at 5 km. The viewer now scales the perspective camera's near plane with the height above the ground under the camera (`LandscapeCameraDepth.js`: near = clamp(agl × 0.002, 0.1, 8) — 0.1 m up to 50 m, 2 m at 1 km, 8 m from 4 km; rebuilt when it changes by more than 10%; far stays 25,000; `LANDSCAPE_VIEWER.md` "Navigation"), which cuts the step at 5 km to 0.75 m. Frames 1700–2100 re-rendered: missing-land samples 0 in every frame (84 frames keep 1–6 samples at the sea silhouette and one at the city; worst 0.0012% of a frame; frame 2100 keeps its single silhouette sample), frame 2089 static probe 0 against 2,004 before. Ground-level captures NW-01 and NW-03 with the new near plane differ from the old code by at most 1–2 of 255 per channel on ≤ 0.33% of pixels — inside the old code's own run-to-run noise.

Not measured or open: idle-GPU performance (the Codex desktop app's GPU process ran at 29–41% during every timing run; re-run `d6/performance/run_chain.sh` with it closed for an idle set); the opt-in suites `landscape_material_audit` and `landscape_surface_transition`; v3 reaches the requested detail at 8 of 11 performance stops under the shipped profile (surface-detail and appearance-mask capacity at the close approaches: the next budget step belongs to the AI 598 surfaces work); an edit on v3 leaves the surround and appearance sidecars stale until re-published; the flyover's first 1,700 frames were not re-rendered after the near-plane change (they never had missing-land samples); the 0.9765625 m surface-detail mode names, the needle in the sea, the bluff as one material band, the forest rock speckle and the near-boundary seam ring remain as listed in the handoff.

## Status

- D1 relief study: delivered (engine D1 subset, analysis, review poses and captures, three variants).
  Gate decided 2026-10-09: variant B `relief-b-raised-80` (80 m high city, plan roads at ≤ 6%) with its
  declared targets (AI 596 prompt file, "Declared targets", column B).
- D2 terrain synthesis engine: delivered 2026-10-09 (31 operators, geology sidecar, interchange, overrides,
  94 unit tests, fixture gate 19/19 including the needle check added with the repose bound of the depositing
  operators).
- D3 finer authoritative resolution: delivered 2026-10-09 (0.9765625 m chosen; resolution study, browser harness,
  contracts, edit gate; 548 landscape unit tests).
- D4 coastal terrain v3: delivered 2026-10-09 (`coastal-city-v3`, 44/44 targets and constraints, pinned by the city
  spec; appearance, fields and geology published).
- D5 far-field surround: delivered 2026-10-10 (render-only surround sidecar `coastal-city-v3/surround/` bound to v3, second render-only streamer with the appearance-derived soil palette, budgets raised 512/256 → 640/352 MiB (cache profile 640/544) with the 128/96 MiB surround share accounted; NW-10, NW-11 and the flyover key frames show no world edge).
- D6 integrated acceptance: delivered 2026-10-11 (all landscape Node and browser suites pass in both surface-cache modes, edit/report/revert verified on v3, the flyover re-rendered on v3 with the surround shows no world edge, same-condition performance tables recorded against v2, specs and the AI 596 handoff written).
