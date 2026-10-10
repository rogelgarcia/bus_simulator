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
node tools/bake.mjs --target landscape/synthesis/resolution-study
node tools/bake.mjs --target landscape/synthesis/resolution-study --publish
node tools/bake.mjs --target landscape/synthesis/resolution-study --publish --set "landscape/synthesis/resolution-study:city-extent=true"
node tools/bake_landscape/terrain_synthesis/resolution_study/run.mjs
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
| `fixture/` | The D2 gate leaf: `FixtureBase.mjs` (analytic base: seabed, sand ramp, coastal terrace, rising land, generated at any fixture spacing over 1 km or the 4 km city extent), `plan/` (districts, roads, shoreline, beach points in the v2 plan formats), `recipes/plateau-road-shoreline.json` (D2, 1.953125 m) plus the D3 derivations `-0977.json`, `-0488.json` and the reduced `city-extent-1953.json`, `city-extent-0977.json`, `SynthesisFixture.mjs` (declared gate targets, checks, receipt, review maps; the shared plan, measurement sets and constraint options), `FixtureJob.mjs` |
| `resolution_study/` | The D3 leaf: `ResolutionMeasures.mjs` (bluff face run and crest curvature, berm crest width, gully width at a contributing-area class, ridge crest radius from a quadratic fit, landform agreement on shared vertices, fixed windows and points), `ResolutionStudy.mjs` (the three spacings, the standalone landscapes, bytes by kind, composites, the optional city-extent pair, receipt and Markdown), `ResolutionStudyJob.mjs` |

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

Every deposit is bounded by the repose plane of the receiving sample's neighbours (`reposeCeiling` in
`operators/Erosion.mjs`: a deposit never raises a sample above `h_j + d_ij · tan(reposeDegrees)` for any
8-neighbour, a neighbour beyond the landscape edge continuing the local slope), with the material's angle:
`hydraulic-erosion` `colluviumReposeDegrees` 34° / `alluviumReposeDegrees` 30°, `sediment-deposit`
`alluviumReposeDegrees` 30°, `terraces` `talusReposeDegrees` 34°, and `thermal-weathering` caps the inflow
of a sample at repose against its highest neighbour after that neighbour sheds. A heightfield cannot hold
a one-sample spike, so this is what keeps a finer spacing from multiplying needles. The refused remainder
never vanishes: it stays in the droplet's load (at the end of life: the corners, then the brush footprint,
then rolling downhill, then export), continues in the downstream flux (ponds still fill flat from the
floor up to the spill), rolls on to the lowest neighbour for at most 512 hops before export (terraces) or
stays at the thermal donors; the mass balance and `height = bedrock + regolith + depositThickness` stay
exact and every operator reports `reposeLimitedSamples` with the deferred, held or exported volume. The
fixture gate's `needles` check (no sample more than 2 m above all 8 neighbours; `needleStatistics` in
`analysis/ReliefMeasures.mjs`, shared with the resolution study) pins it.

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
swim zone, sea level and cover rules, relief (slope fractions, incision, local relief), no needles (a
sample more than 2 m above all 8 neighbours is an operator artifact), the geology
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

## D3 resolution study

`node tools/bake.mjs --target landscape/synthesis/resolution-study` synthesizes the D2 gate recipe at the three
fixture spacings (`recipes/plateau-road-shoreline.json` at 1.953125 m unchanged; `-0977.json` and `-0488.json`
derived from it with the grid, the `import-heights` dimensions, `droplets: null` + `dropletsPerSquareKilometer:
30000` (the D2 count per km²), the hydraulic brush at the same 9.77 m physical radius (10 samples at 0.977 m; 16 at
0.488 m, the catalog cap, so 7.8 m there) and per-tag `export-map` files; fluvial, thermal and sediment parameters
are physical and unchanged), writes each result as a standalone saved landscape `ai596-d3-fixture-<tag>` (under
`tests/artifacts/screens/landscape/ai596/d3/resolution/landscapes/<tag>/`, or with `--publish` under
`assets/public/landscape/`) and records per spacing: grid, hierarchy depth and node count, bytes by kind (native
and ancestor height/cover channels, manifest), synthesis seconds per operator, peak tracked memory, landscape write
seconds (chunks, hierarchy, verification), the relief statistics of the fixture measurement sets, the height
agreement with the coarsest result on the shared vertices, and feature-sharpness measurements on fixed world
geometry derived from the coarsest result: bluff face run, rise and crest/toe curvature on T-300/T-500/T-700 and
on the three transects through the coast's tallest 5 m steps, berm crest width and curvature, gully width at 0.5
and 1 m above the floor for the 10,000–50,000 m² contributing-area class, ridge crest radius from a quadratic fit
within 6 m (at the fixed point and re-centered on each result's summit within 15 m), and the needles (one-sample
spikes) each result carries. Three 125 m windows (the bluff coast around (300, 300), the deepest gully of the
coarse result, the plateau rim around (640, 560)) are rendered as 512 px hillshade crops and composed as
`[1.953 | 0.977 | 0.488]` sheets (`composite-bluff.png`, `composite-gully.png`, `composite-rim.png`,
`composite-hillshade.png`). Receipt: `resolution-study.json` (`landscape-resolution-study` v1) and
`resolution-study.md`.

`--set "landscape/synthesis/resolution-study:city-extent=true"` adds the 4 × 4 km pair for the browser
measurements at the coastal city's node counts: `recipes/city-extent-1953.json` (2049², maxLevel 3, 85 nodes) and
`city-extent-0977.json` (4097², maxLevel 4, 341 nodes) run the analytic base over 4 km through a reduced recipe
(no plan: import, hills, strata, fluvial 40 iterations, density-scaled hydraulic, thermal, sediment, terraces, cap
160 m, geology, output; the plan masks become `height` selectors, 1.4–10 m for the hills and 1.4–7 m for the
erosion, which is where the base's beach and terrace put the 40–160 m shore distances) and are written as
`ai596-d3-fixture-4km-<tag>` with size and cost in the receipt's `cityExtent` block. `city-extent=only` re-runs
that pair alone and merges it into the receipt of the last full run (the published copies of the 1 km fixtures
are read back as a cross-check), so the 4 km fixtures can be re-published without touching the 1 km ones. All
fixture landscapes carry the `procedural-synthesis` provenance (recipe id, identity, file hash, the spacing the
operators ran at).

Measured 2026-10-09 after the repose bound of the depositing operators (`resolution-study.json`; MB = 1,048,576
bytes; bytes by the manifest, the content-addressed store deduplicates identical cover chunks on disk):

| Spacing | Grid, nodes | Saved landscape (by manifest / on disk) | Synthesis s | Peak | Ancestor error by level | Slope > 20° | Incision p90 | Needles |
| --- | --- | --- | ---: | ---: | --- | ---: | ---: | ---: |
| 1.953125 m | 513², 5 | 1.60 MB / 1.60 MB (12 files) | 9.1 | 31.12 MB | L0 3.67 m | 3.73% | 8.25 m | 0 |
| 0.9765625 m | 1025², 21 | 6.68 MB / 6.30 MB (38 files) | 46.7 | 124.25 MB | L0 5.73 m, L1 4.97 m | 3.43% | 10.33 m | 0 |
| 0.48828125 m | 2049², 85 | 26.99 MB / 24.28 MB (129 files) | 177.2 | 496.49 MB | L0 6.30 m, L1 5.41 m, L2 3.90 m | 3.32% | 11.52 m | 0 |
| 4 km, 1.953125 m | 2049², 85 | 26.99 MB / 22.77 MB (105 files) | 60.5 | 348.37 MB | L0 8.34 m, L1 5.95 m, L2 3.24 m | 0.81% | n/a | 0 |
| 4 km, 0.9765625 m | 4097², 341 | 108.25 MB / 90.11 MB (396 files) | 253.6 | 1392.74 MB | L0 6.20 m, L1 6.00 m, L2 4.30 m, L3 3.39 m | 0.67% | n/a | 0 |

Data and synthesis cost both grow about 4× per halving (fluvial erosion dominates), hierarchy preparation stays below
2 s for 85 nodes and 6 s for 341, and the three results are one landform (p50 |dh| 0.035 / 0.057 m on the shared
vertices; the largest differences are channels the erosion relocates). What the finer spacing buys on this fixture:
the coast's tallest steps resolve from a 2.0 m run at 52.8° to 1.5 m at 58.5–58.9° (B-965 steepest 1 m slope 54.5° →
64.0° → 63.4° against the declared 65° face); the berm crest radius drops from 70.8 / 51.4 m (T-300 / T-700) to
25.8 / 22.8 m at 0.977 m and stays there at 0.488 m; the gully cross-sections 1 m above the floor narrow from 36.3 m
mean to 33.4 / 34.5 m; the ridge crests are 50–190 m radius features that 1.953 m already resolves. Before the repose
bound the study counted one-sample needles (39 → 162 → 577 per km², up to 135 m on the 4 km pair) that set the
ancestors' geometric errors to 19–141 m; with it every fixture carries 0 and the ancestor errors are 3–8 m. The
hydraulic brush at 0.488 m is the catalog cap, 16 samples = 7.8 m instead of 9.8 m. The decision (0.9765625 m) and the
browser, editing and contract measurements are recorded in the spec's D3 section.

## Tests

`tests/node/unit/landscape_synthesis_recipe.test.js`, `landscape_synthesis_graph.test.js`,
`landscape_synthesis_analysis.test.js`, `landscape_synthesis_review.test.js`,
`landscape_synthesis_png.test.js`, `landscape_synthesis_interchange.test.js`, `landscape_synthesis_landscape.test.js`,
`landscape_synthesis_geology.test.js`, `landscape_synthesis_erosion.test.js` (mass balance, invariant,
talus-angle convergence, determinism), `landscape_synthesis_repose.test.js` (the repose bound of every
depositing operator on a loaded channel into a flat pond, talus routes dead-ending in a hollow, droplets
dying on a funnel floor and a pit under a thick mantle: no needle, exact balance, invariant, determinism),
`landscape_synthesis_coastal.test.js`,
`landscape_synthesis_resolution.test.js` (fixture grids per spacing, coincident-vertex equality of the bases, the
derived and city-extent recipes, the leaf options, the sharpness measurements on synthetic terrain) and
`landscape_synthesis_framework.test.js` (leaf registration); run them together with
`node --test tests/node/unit/landscape_synthesis_*.test.js tests/node/unit/landscape_review_poses.test.js`.
