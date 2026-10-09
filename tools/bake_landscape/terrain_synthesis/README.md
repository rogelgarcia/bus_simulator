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
node tools/bake.mjs --target landscape/synthesis/fixture
node tools/bake_landscape/terrain_synthesis/fixture/run.mjs
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
| `operators/Erosion.mjs` | `fluvial-erosion` (Braun & Willett 2013 implicit stream power over Priority-Flood routing with Quinn multiple-flow contributing areas, explicit hillslope diffusion, retain-target or constant uplift, hardness-scaled erodibility, drainage classes), `hydraulic-erosion` (Beyer 2015 droplets with a radius brush and a reported mass balance), `thermal-weathering` (Musgrave 1989 weathering, repose settling into talus and colluvium), `sediment-deposit` (transport-limited routing with ponds, fans and valley floors); every one moves the surface through the geology ledger `height = bedrock + regolith + depositThickness` |
| `operators/Strata.mjs` | `strata` (dipping layered stack → `lithology` index and `hardness`), `terraces` (benches on hard strata above a slope threshold, with talus) |
| `operators/Coastal.mjs` | `landform-headland`, `landform-cove`, `coastal-exposure` (open-fetch wave exposure), `coastal-bluff` (retreat, declared face slope, wave-cut platform, talus wedge, face mask), `coastal-beach` (Dean 1991 equilibrium profile, 1:N foreshore, berm, backshore, sand veneer), `coastal-foredune`, `coastal-nearshore` (bar and trough), `coastal-reef`; plan protection keeps districts, roads, beach points and the optional swim zone |
| `SynthesisAnalysis.mjs` (+ `analysis/`) | Measurements: slope histogram, local relief, curvature, drainage incision, beach transects, rim profiles, subtended angles, the A–B route and the plan constraint report; `diagnoseRelief` composes them |
| `SynthesisReview.mjs` (+ `review/`) | Hillshade, slope, relief, elevation and cover maps, profile and histogram plots, labeled sheets (dependency-free PNG) |
| `SynthesisLandscape.mjs` | Writes a synthesized grid as a complete saved landscape (native chunks, overview, hierarchy, copied planning references and appearance, re-baked terrain fields) |
| `interchange/` | `PngCodec` (8/16-bit PNG for review images and maps), `RawCodec` (float32 little-endian `.raw`/`.r32`), `ExrCodec` (OpenEXR scanline: writes one uncompressed FLOAT channel with the metadata attribute, reads NO_COMPRESSION/ZIPS/ZIP FLOAT or HALF channels), `Interchange` (maps with the authenticated `<file>.meta.json` sidecar: export, import, adoption of external maps) |
| `operators/Imports.mjs`, `operators/Overrides.mjs` | `import-map` and `export-map` (run-level import cache, hashes recorded in the identity, tent decimation onto a coarse working grid); override evaluation after the operator loop (import, region, operator re-run, exclude protection) |
| `geology/GeologyPages.mjs`, `GeologyPreparation.mjs`, `operators/GeologyChannels.mjs` | Geology sidecar pages (field and categorical), candidate preparation, validation and manifest-last publication; the `geology-channels` finalizing operator (contract in `src/app/landscape/LandscapeGeology.js`) |
| `relief_study/` | The D1 leaf: `ReliefStudy.mjs` (diagnosis, variants, summaries), `ReliefStudyJob.mjs`, `recipes/*.json` |
| `fixture/` | The D2 gate leaf: `FixtureBase.mjs` (analytic 1 × 1 km base: seabed, sand ramp, coastal terrace, rising land), `plan/` (districts, roads, shoreline, beach points in the v2 plan formats), `recipes/plateau-road-shoreline.json`, `SynthesisFixture.mjs` (declared gate targets, checks, receipt, review maps), `FixtureJob.mjs` |

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

## D2 fixture gate

`node tools/bake.mjs --target landscape/synthesis/fixture` runs `recipes/plateau-road-shoreline.json` on the
analytic base (513² at 1.953125 m, sea to the west, a 36 m plateau town, a beach plaza, a coast road, a
5.8% ascent, a headland with a reef) through every operator family, twice (bit-identical hashes of the
heights and all layers), then measures the result with the same analysis as the relief study and checks
the declared targets of `FIXTURE_GATE`: plateau and plaza bands, road grades, shoreline tolerance (the
headland vertices excepted by the headland operator's report), beach arrival, bus stop, view corridor,
swim zone, sea level and cover rules, relief (slope fractions, incision, local relief), the geology
invariant, the required coastal zone classes, the EXR export re-imported with zero differences, and the
seams of the result written as a standalone saved landscape plus a validated geology candidate. The leaf
fails when any check fails. It writes `tests/artifacts/screens/landscape/ai596/d2/fixture/`:
`fixture-gate.json` and `.md` (receipt), `engine-report.json`, `diagnosis.json` and `.md`, hillshades,
slope, elevation, coastal-zone, deposit and drainage maps, beach and ascent profiles, `operators.png`
and `operators/NN-<id>.png` (a hillshade after every operator), `exports/` (the EXR and its sidecar),
`landscape/` and `geology-candidate/` (regenerated every run).

The recipe order matters: the corridor descent (`constrain-points`) runs before the plaza re-imposition
and before the road fit, so the plaza wins over the corridor blend and the roads are fitted to the
corridor surface; `sediment-deposit` takes 10% of the accumulated wear as supply (the full wear layer
buries the channels under lumps); the bluff talus is 10% of the cut volume (30% buries a 6–13 m face).

## Tests

`tests/node/unit/landscape_synthesis_recipe.test.js`, `landscape_synthesis_graph.test.js`,
`landscape_synthesis_analysis.test.js`, `landscape_synthesis_review.test.js`,
`landscape_synthesis_png.test.js`, `landscape_synthesis_interchange.test.js`, `landscape_synthesis_landscape.test.js`,
`landscape_synthesis_geology.test.js`, `landscape_synthesis_erosion.test.js` (mass balance, invariant,
talus-angle convergence, determinism), `landscape_synthesis_coastal.test.js` and
`landscape_synthesis_framework.test.js` (leaf registration); run them together with
`node --test tests/node/unit/landscape_synthesis_*.test.js tests/node/unit/landscape_review_poses.test.js`.
