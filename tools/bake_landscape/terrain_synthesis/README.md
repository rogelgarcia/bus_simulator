# Terrain synthesis (AI 596)

The in-repository terrain synthesis engine: a deterministic operator graph driven by a versioned recipe
that turns plan constraints and landform primitives into terrain, measures the result against the plan
and publishes it as a saved landscape. The contract is
[LANDSCAPE_TERRAIN_SYNTHESIS.md](../../../specs/landscape/LANDSCAPE_TERRAIN_SYNTHESIS.md); the relief
roadmap is [LANDSCAPE_NATURAL_WORLD_ROADMAP.md](../../../specs/landscape/LANDSCAPE_NATURAL_WORLD_ROADMAP.md).

```sh
node tools/bake.mjs --target landscape/synthesis/relief-study --dry-run
node tools/bake.mjs --target landscape/synthesis/relief-study
node tools/bake.mjs --target landscape/synthesis/relief-study --publish
node tools/bake_landscape/terrain_synthesis/relief_study/run.mjs --publish
```

Every leaf is Node only (`configurationPaths: []`), excluded from production `all` and from the
`landscape` import parent, and reads the gitignored
[local landscape cache](../README.md#local-landscape-cache). Nothing here writes into the canonical
`assets/public/landscape/coastal-city/` directory.

## Modules

| Module | Role |
| --- | --- |
| `src/app/landscape/LandscapeSynthesisRecipe.js`, `LandscapeSynthesisOperators.js` | Pure recipe model: operator, selector and layer catalogs with typed parameters (units, ranges, defaults), strict validation, canonical JSON, identity hashing and per-operator seeds |
| `SynthesisGraph.mjs`, `SynthesisWorkingGrid.mjs` | Executor: ordered operators over named float layers on the working grid, tracked memory, progress and cancellation, decimation to a coarser working grid and the final resample |
| `operators/` | `Inputs` (import-heights, plan-inputs), `Landforms` (plateau with designed edges, hills, valley), `Warps` (warp, noise), `Constraints` (districts, roads, shoreline, points, runway, height cap), `EdgeProfiles`, `RoadProfiles` (network grade limiting), `Selectors`, `Distance` (exact EDT, polylines), `Polygons`, `Plan` |
| `SynthesisAnalysis.mjs` (+ `analysis/`) | Measurements: slope histogram, local relief, curvature, drainage incision, beach transects, rim profiles, subtended angles, the A–B route and the plan constraint report; `diagnoseRelief` composes them |
| `SynthesisReview.mjs` (+ `review/`) | Hillshade, slope, relief, elevation and cover maps, profile and histogram plots, labeled sheets (dependency-free PNG) |
| `SynthesisLandscape.mjs` | Writes a synthesized grid as a complete saved landscape (native chunks, overview, hierarchy, copied planning references and appearance, re-baked terrain fields) |
| `interchange/PngCodec.mjs` | 8/16-bit PNG encode/decode for review images and imports |
| `relief_study/` | The D1 leaf: `ReliefStudy.mjs` (diagnosis, variants, summaries), `ReliefStudyJob.mjs`, `recipes/*.json` |

## Recipes

A recipe (`landscape-synthesis-recipe` v1) binds a landscape directory and the plan files, declares the
output grid (and optionally a coarser working spacing for fast studies), then lists operators in order.
Every parameter is declared in the operator catalog with its unit, range and default; the recipe
validator rejects unknown operators or parameters, out-of-range values, bad masks and broken data flow
(an operator may only read layers an earlier operator wrote). The identity `synthesis-<24 hex>` hashes the
canonical recipe together with the input hashes, so two runs with the same identity are bit identical.

Masks are selector expressions evaluated on the current layers: `slope`, `curvature`, `height`, `flow`,
`distance` (road or shoreline), `cover`, `polygon`, `district` with smoothstep edges, combined by
`min`, `max` and `multiply`.

Edge profiles (plateaus and district constraints): `escarpment` (rim, rock face, talus), `embankment`,
`retaining`, `ramp` and `feather`, with a base mode that decides where the profile meets the ground:
`daylight` (march until the descent meets the ground), `probe` (ground at a probe distance; cuts an old
feather), `extrapolate` (continue the natural slope measured beyond the probe distance back under the old
feather, without a bench), `sample-ground` and `explicit`. `insideMode: keep` leaves the interior
untouched and starts the edge from the boundary ground (the coastal bluff cut along a terrace).

Roads are profiled as one network: stations of different roads within `couplingMeters` share one node
(junctions and merging corridors), district interiors and the level end sections are anchored, and the
grade-limited fit is relaxed over the whole graph before the carriageway and cut/fill shoulders are built.

## D1 relief study

`recipes/relief-a-v2-sharpened.json` (v2 heights with sharpened transitions, 50 m cap),
`recipes/relief-b-raised-80.json` (high city at 80 m) and `recipes/relief-c-dramatic-160.json` (160 m
crest of the original concept) share one pipeline: import v2 on the native 1.953125 m grid (a coarser working grid is supported for faster studies but aliases steep faces), plan inputs,
an optional massif dome, ridged hills and fine noise on natural land away from districts and the shore,
the coastal bluff cut 115 m landward of the design shoreline (polygon derived from `shoreline.json`),
the high-city plateau with an escarpment on an extrapolated base, district re-imposition, network road
grading (5.8%; the dramatic variant 7.8% as a reported exception), shoreline, beach points and runway
constraints and the height cap (the resample is a no-op on the native grid).

The leaf writes `tests/artifacts/screens/landscape/ai596/d1/diagnosis/` (the retained v2 terrain) and
`variants/<name>/` (recipe copy, engine report, diagnosis JSON and Markdown, hillshades, slope, relief,
elevation and cover maps, beach, route and rim profiles, slope histogram) plus `relief-study.json`.
With `--publish` each variant is also written as `assets/public/landscape/coastal-city-ai596-<name>/`
(same grid and id, so the canonical appearance binds; fields re-baked) for the review captures of
`tools/landscape_review`.

## Tests

`tests/node/unit/landscape_synthesis_recipe.test.js`, `landscape_synthesis_graph.test.js`,
`landscape_synthesis_analysis.test.js`, `landscape_synthesis_review.test.js`,
`landscape_synthesis_png.test.js`, `landscape_synthesis_landscape.test.js` and
`landscape_synthesis_framework.test.js`.
