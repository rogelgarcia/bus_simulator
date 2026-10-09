# Landscape terrain synthesis (AI 596)

Status: in progress (AI 596). D1 relief study scaffolding. This page is the contract for the in-repository
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
| Inputs | **`import-heights`** (landscape directory or interchange file), **`plan-inputs`** (districts, roads, shoreline, beach points, land cover → masks and distance fields), `import-map` (declared interchange map combined into a float layer under the mask) |
| Landforms | **`landform-plateau`** (district/polygon target with an edge profile: escarpment, embankment, retaining slope, ramp), **`landform-hills`** (bounded ridged multi-scale relief), **`landform-valley`**, `landform-headland`, `landform-cove` |
| Warps and noise | **`warp`**, **`noise`** (world-anchored, bit-exact `LandscapeSurfaceNoise` octaves) |
| Erosion | `fluvial-erosion` (stream power over a Priority-Flood/D8 drainage network, implicit), `hydraulic-erosion` (seeded droplet detail erosion), `thermal-weathering` (angle of repose per lithology, talus deposits), `sediment-deposit` |
| Geology | `strata` (dipping layer stack with hardness), `terraces` |
| Coastal | `coastal-bluff` (bluff retreat with a wave-cut platform), `coastal-beach` (equilibrium profile, berm, swash zone, foreshore slope), `coastal-foredune`, `coastal-nearshore` (bars), `coastal-reef` |
| Constraints | **`constrain-districts`**, **`constrain-roads`** (grade-limited centerline profile, designed cut/fill shoulders), **`constrain-shoreline`**, **`constrain-points`** (beach arrival, bus stop, view corridor, swim zone), **`constrain-runway`**, **`height-cap`** |
| Output | **`resample`**, `geology-channels`, `export-map` (working-grid layer → interchange map with the recipe identity as provenance) |

Each operator reads and writes named layers: `height`, `cover`, the plan layers (`districtId`, `landMask`,
`roadDistance`, `roadHeight`, `roadWidth`, `roadIndex`, `shoreSigned`, `corridorMask`, `runwayMask`,
`apronMask`) and, from D2, `bedrock`, `regolith`, `depositType`, `depositThickness`, `lithology`, `hardness`
(the strata erodibility reduction, engine-internal), `wear`,
`deposition`, `flow`, `drainage`, `faceMask`, `coastalZone`, `waveExposure`. Operators report progress and honor
an `AbortSignal`; every full-grid array goes through the tracked `TerrainFieldMemory` ledger with the recipe's
declared working limit, and the recipe validator checks the data flow (an operator reads only layers an
earlier enabled operator wrote).

### Designed edges

A plateau (`landform-plateau`, `constrain-districts`) carries its target outward from the polygon boundary
with a profile: `escarpment` (flat rim, rock face at `faceSlopeDegrees` for `faceDropMeters`, talus apron at
`talusSlopeDegrees`), `embankment`, `retaining` (bounded by the steepest slope a heightfield holds), `ramp` or
`feather` (the v2 smoothstep, kept for comparison). The base the profile descends to is measured along the
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
consumer renders geology). The `geology-channels` operator runs once, last: it derives `faceMask`, recomputes
`flow` and `drainage` on the final surface, normalizes `wear`/`deposition` from meters to 0..1 and fills missing
layers with their neutral values (recorded as defaulted). Publication (`geology/GeologyPreparation.mjs`) follows
the fields pattern: candidate pages, byte-level validation, manifest-last switch under the authoring lock.

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
| `landscape/synthesis/coastal-v3` | D4: generate, validate and publish coastal terrain v3 with its geology channels |

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
nearshore bar and a reef off the headland, and passes 18/18 checks:

| Check | Measured | Target |
| --- | --- | --- |
| determinism | identical hashes of the heights and all 26 layers on two runs | bit identical |
| plateau band (district 1) | p05 36.0 / p95 36.0 m, 99.98% flat | 35–37 m, ≥ 95% flat |
| plaza band (district 2) | p05 2.56 / p95 2.65 m | 2.3–3.3 m |
| roads | sustained 5.82%, short 5.86% | ≤ 6% sustained, ≤ 8% short |
| shoreline | 39.1 m at the 16 headland vertices (reported by the headland operator), the rest within tolerance | 10 m |
| beach arrival, bus stop, view corridor, swim zone, sea level, cover | pass | plan rules |
| relief | 14.0% of land above 10°, 4.1% above 20°, max 81.5°; incision p90 12.5 m; relief p90 18.2 m over 100 m | ≥ 12%, ≥ 3%, ≥ 60°, ≥ 1 m, ≥ 8 m |
| geology invariant | max residual 1.9e-6 m | ≤ 1e-3 m |
| coastal zones | reef, bar, swash, berm, foredune, platform, bluff face present | required classes |
| interchange | EXR export re-imported with 0 differences | 0 |
| seams | standalone saved landscape (5 chunks, level 1) and validated geology candidate | seam free |

Timings on the native 513² grid in one Node process: the whole recipe 9.6 s (fluvial 150 iterations 5.4 s,
hydraulic 30,000 droplets 0.44 s, thermal 30 iterations 0.21 s, sediment 0.17 s, every other operator
≤ 0.7 s); on the 1025² unit fixtures fluvial takes 5–16 s, hydraulic 2.2 s per 200,000 droplets, thermal
1.7 s and sediment 0.9 s. Peak tracked working set 32 MB.

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

## Status

- D1 relief study: delivered (engine D1 subset, analysis, review poses and captures, three variants).
  Gate decided 2026-10-09: variant B `relief-b-raised-80` (80 m high city, plan roads at ≤ 6%) with its
  declared targets (AI 596 prompt file, "Declared targets", column B).
- D2 terrain synthesis engine: delivered 2026-10-09 (31 operators, geology sidecar, interchange, overrides,
  84 unit tests, fixture gate 18/18).
- D3 finer authoritative resolution: next.
