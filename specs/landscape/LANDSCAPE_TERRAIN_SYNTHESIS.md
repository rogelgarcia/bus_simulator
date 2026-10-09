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

## Operators

| Family | Operators (D1 subset in bold) |
| --- | --- |
| Inputs | **`import-heights`** (landscape directory or interchange file), **`plan-inputs`** (districts, roads, shoreline, beach points, land cover → masks and distance fields) |
| Landforms | **`landform-plateau`** (district/polygon target with an edge profile: escarpment, embankment, retaining slope, ramp), **`landform-hills`** (bounded ridged multi-scale relief), **`landform-valley`**, `landform-headland`, `landform-cove` |
| Warps and noise | **`warp`**, **`noise`** (world-anchored, bit-exact `LandscapeSurfaceNoise` octaves) |
| Erosion | `fluvial-erosion` (stream power over a Priority-Flood/D8 drainage network, implicit), `hydraulic-erosion` (seeded droplet detail erosion), `thermal-weathering` (angle of repose per lithology, talus deposits), `sediment-deposit` |
| Geology | `strata` (dipping layer stack with hardness), `terraces` |
| Coastal | `coastal-bluff` (bluff retreat with a wave-cut platform), `coastal-beach` (equilibrium profile, berm, swash zone, foreshore slope), `coastal-foredune`, `coastal-nearshore` (bars), `coastal-reef` |
| Constraints | **`constrain-districts`**, **`constrain-roads`** (grade-limited centerline profile, designed cut/fill shoulders), **`constrain-shoreline`**, **`constrain-points`** (beach arrival, bus stop, view corridor, swim zone), **`constrain-runway`**, **`height-cap`** |
| Output | **`resample`**, `geology-channels`, `export` |

Each operator reads and writes named layers: `height`, `cover`, the plan layers (`districtId`, `landMask`,
`roadDistance`, `roadHeight`, `roadWidth`, `roadIndex`, `shoreSigned`, `corridorMask`, `runwayMask`,
`apronMask`) and, from D2, `bedrock`, `regolith`, `depositType`, `depositThickness`, `lithology`, `wear`,
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

Bedrock surface (m), regolith depth (m), deposit type (none, talus, colluvium, alluvium, beach sand, dune sand)
and thickness (m), lithology/strata index, wear, deposition, flow and drainage class, face mask, coastal zone
class (offshore, reef, bar, surf, swash, berm, backshore, foredune, platform, bluff toe, bluff face, bluff
crown, inland), wave exposure. Encoded like the terrain fields (mask-aligned RGBA8 layers with the two-sample
halo, content-addressed pages, `geology/manifest.json`) with exact JavaScript samplers and a GLSL decode mirror.

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

## Status

- D1 relief study: delivered (engine D1 subset, analysis, review poses and captures, three variants); the
  user gate (variant choice and targets) is pending.
