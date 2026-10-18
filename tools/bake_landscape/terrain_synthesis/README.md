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
node tools/bake.mjs --target landscape/synthesis/coastal-v3 --set "landscape/synthesis/coastal-v3:working=1953" --set "landscape/synthesis/coastal-v3:fields=none" --set "landscape/synthesis/coastal-v3:geology=none"
node tools/bake.mjs --target landscape/synthesis/coastal-v3 --publish
node tools/bake_landscape/terrain_synthesis/coastal_v3/run.mjs --publish
node tools/bake.mjs --target landscape/synthesis/surround
node tools/bake.mjs --target landscape/synthesis/surround --publish
node tools/bake_landscape/terrain_synthesis/surround/run.mjs --publish --set "landscape/synthesis/surround:landscape=assets/public/landscape/coastal-city-v3"
node tools/bake_landscape/terrain_synthesis/surround/plan/author.mjs
```

Every leaf is Node only (`configurationPaths: []`), excluded from production `all` and from the
`landscape` import parent, and reads the gitignored
[local landscape cache](../README.md#local-landscape-cache). Nothing here writes into the canonical
`assets/public/landscape/coastal-city/` directory.

## Modules

| Module | Role |
| --- | --- |
| `src/app/landscape/LandscapeSynthesisRecipe.js`, `LandscapeSynthesisOperators.js` | Pure recipe model: operator, selector and layer catalogs with typed parameters (units, ranges, defaults), strict validation, canonical JSON, identity hashing and per-operator seeds |
| `SynthesisGraph.mjs`, `SynthesisWorkingGrid.mjs` | Executor: ordered operators over named float layers on the working grid, tracked memory, progress and cancellation, decimation to a coarser working grid, the upsampling and embedded placements of a source landscape (`embedPlacement`, `embedHeights`, `embedCover`) and the final resample |
| `operators/` | `Inputs` (import-heights: the source landscape on the recipe grid, or coarser by an integer factor and upsampled with the `resample` filter (Catmull-Rom with linearly continued edges, bilinear or nearest; the cover takes the nearest source label; reported as `importResample`), or, with `placement: embed` (D5), a landscape whose bounds are an aligned sub-rectangle of the recipe grid at its spacing or finer by an integer factor: decimated with the `filter` into that rectangle (the cover by the aligned label) while the grid outside is filled (`fillMode` `extend-edge` continues the nearest boundary sample outward, blurred along the boundary by `fillSmoothingMeters` and faded over `fillFadeMeters` toward `fillHeightMeters`, or `constant`; the cover outside is `fillCoverClass`; reported as `importPlacement`); plan-inputs, which accepts a plan without districts or roads (the road distance stays infinite)), `Landforms` (plateau with designed edges, hills, valley), `Warps` (warp, noise), `Constraints` (districts, roads, shoreline, points, runway, height cap), `EdgeProfiles`, `RoadProfiles` (network grade limiting), `Selectors`, `Distance` (exact EDT, polylines), `Polygons`, `Plan` |
| `operators/LandCover.mjs` | `derive-land-cover` (output family, after `geology-channels`, requires `outputs.coverPolicy: 'derive'`): the natural cover of every sample from the final geology in a fixed precedence (planning classes copied exactly; water below sea level; sand where the deposit is beach or dune sand or the coastal zone is swash/berm/backshore/foredune; rock where the face mask, the slope, a thick talus or exposed hard bedrock on a steep slope say so; grass and scrub on alluvium valley floors; otherwise the source class, the forest/grass partition kept where the geology is neutral; an emerged-land class where the source held water), with the from→to transition matrix, per-class totals and the count each rule decided; a coarse working grid publishes it nearest-upsampled with the planning classes restored from the native cover |
| `operators/Erosion.mjs` | `fluvial-erosion` (Braun & Willett 2013 implicit stream power over Priority-Flood routing with Quinn multiple-flow contributing areas, explicit hillslope diffusion, retain-target or constant uplift, hardness-scaled erodibility, drainage classes), `hydraulic-erosion` (Beyer 2015 droplets with a radius brush and a reported mass balance), `thermal-weathering` (Musgrave 1989 weathering, repose settling into talus and colluvium), `sediment-deposit` (transport-limited routing with ponds, fans and valley floors); every one moves the surface through the geology ledger `height = bedrock + regolith + depositThickness` |
| `operators/Strata.mjs` | `strata` (dipping layered stack → `lithology` index and `hardness`), `terraces` (benches on hard strata above a slope threshold, with talus) |
| `operators/Coastal.mjs` | `landform-headland`, `landform-cove`, `coastal-exposure` (open-fetch wave exposure), `coastal-bluff` (retreat, declared face slope, wave-cut platform, talus wedge, face mask), `coastal-beach` (Dean 1991 equilibrium profile, 1:N foreshore, berm, backshore, sand veneer; since D4 `offshoreMode` cut or replace, and `deanDepthMeters` hands the Dean curve over to a planar shelf at `shelfSlopeDegrees` flattening at `shelfFloorDepthMeters`), `coastal-foredune`, `coastal-nearshore` (bar and trough), `coastal-reef`; plan protection keeps districts, roads, beach points and the optional swim zone |
| `SynthesisAnalysis.mjs` (+ `analysis/`) | Measurements: slope histogram, local relief, curvature, drainage incision (with the lines of ≥ N m incision since D4), beach transects, rim profiles, subtended angles, the A–B route and the plan constraint report; `diagnoseRelief` composes them. `analysis/TargetMeasures.mjs` (D4): shore-normal transects, the least-squares Dean fit with the −8 m reach and the shelf slope, the nearshore bar crest, the west-cliff face and wave-cut platform, the rim face and talus, foredune heights and placement, the reef off the bluff sector, the face mask beyond the steepest slope. `analysis/TargetsReport.mjs` (D4): the declared column-B targets and hard constraints as data (`COASTAL_V3_TARGETS`), `measureCoastalV3`, `evaluateCoastalV3` (one `{id, kind, measured, target, passed, note}` row per target and constraint) and its Markdown |
| `SynthesisReview.mjs` (+ `review/`) | Hillshade, slope, relief, elevation and cover maps, profile and histogram plots, labeled sheets (dependency-free PNG) |
| `SynthesisLandscape.mjs` | Writes a synthesized grid as a complete saved landscape (native chunks, overview, hierarchy, copied planning references and appearance, re-baked terrain fields) |
| `interchange/` | `PngCodec` (8/16-bit PNG for review images and maps), `RawCodec` (float32 little-endian `.raw`/`.r32`), `ExrCodec` (OpenEXR scanline: writes one uncompressed FLOAT channel with the metadata attribute, reads NO_COMPRESSION/ZIPS/ZIP FLOAT or HALF channels), `Interchange` (maps with the authenticated `<file>.meta.json` sidecar: export, import, adoption of external maps) |
| `operators/Imports.mjs`, `operators/Overrides.mjs` | `import-map` and `export-map` (run-level import cache, hashes recorded in the identity, tent decimation onto a coarse working grid); override evaluation after the operator loop (import, region, operator re-run, exclude protection) |
| `geology/GeologyPages.mjs`, `GeologyPreparation.mjs`, `operators/GeologyChannels.mjs` | Geology sidecar pages (field and categorical), candidate preparation, validation and manifest-last publication; the `geology-channels` finalizing operator (contract in `src/app/landscape/LandscapeGeology.js`) |
| `relief_study/` | The D1 leaf: `ReliefStudy.mjs` (diagnosis, variants, summaries), `ReliefStudyJob.mjs`, `recipes/*.json` |
| `fixture/` | The D2 gate leaf: `FixtureBase.mjs` (analytic base: seabed, sand ramp, coastal terrace, rising land, generated at any fixture spacing over 1 km or the 4 km city extent), `plan/` (districts, roads, shoreline, beach points in the v2 plan formats), `recipes/plateau-road-shoreline.json` (D2, 1.953125 m) plus the D3 derivations `-0977.json`, `-0488.json` and the reduced `city-extent-1953.json`, `city-extent-0977.json`, `SynthesisFixture.mjs` (declared gate targets, checks, receipt, review maps; the shared plan, measurement sets and constraint options), `FixtureJob.mjs` |
| `resolution_study/` | The D3 leaf: `ResolutionMeasures.mjs` (bluff face run and crest curvature, berm crest width, gully width at a contributing-area class, ridge crest radius from a quadratic fit, landform agreement on shared vertices, fixed windows and points), `ResolutionStudy.mjs` (the three spacings, the standalone landscapes, bytes by kind, composites, the optional city-extent pair, receipt and Markdown), `ResolutionStudyJob.mjs` |
| `recipes/` | Production recipes: `coastal-v3.json` (the D4 coastal terrain v3), `terrain-fields-coastal-v3.json` (the v1 terrain-fields recipe with `workingLimitBytes` raised to 1792 MiB for the 4097² grid: the fields bake peaks at about 380 MiB of tracked arrays at 2049², four times that at 4097², under the 2 GiB ceiling the recipe reader allows) and `coastal-v3-surround.json` (the D5 far-field surround: v3 embedded into the 32 km grid at 15.625 m) |
| `coastal_v3/` | The D4 leaf: `CoastalV3.mjs` (the run, the targets and constraints evaluation, review images and profiles, the landscape write with references, fields and geology, the optional edit replay, receipt and Markdown), `CoastalV3Job.mjs`, `run.mjs` |
| `surround/` | The D5 leaf: `Surround.mjs` (the run, the independent reference decimation and boundary hash of the v3 natives, the seam metrics, the 32 km maps with the extent outlined, the promontory and seam crops, the surround document under `<landscape>/surround/` with the `surround` provenance block, receipt and Markdown), `SurroundJob.mjs`, `run.mjs`, `plan/` (the surround plan: `far_shoreline.json` authored by `author.mjs` from the recipe's spur field and coves, empty `districts.json`, `roads.json` and `beach_points.json`) |

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

## D4 coastal terrain v3

`node tools/bake.mjs --target landscape/synthesis/coastal-v3 --publish` runs `recipes/coastal-v3.json` on the 4097² grid at
0.9765625 m (the v2 base `assets/public/landscape/coastal-city` at its pinned revision, upsampled 2× with Catmull-Rom at import;
the cover takes the nearest v2 label) through 34 operators: plan inputs, the variant-B landforms (a 40 m massif dome under the
high city, ±42 m ridged hills at 700–44 m octaves kept 150–400 m off the shore, 40–200 m off the low districts and 120–400 m off
the plateau, the west bluff cut 115 m landward of the design shoreline, a 0–6 m hummocky crown band 112–200 m behind it, the 80 m
plateau with a 25 m escarpment at 60° over a 34° talus on an extrapolated base), strata, fluvial erosion (150 iterations, retain
rate 0.003), density-scaled hydraulic erosion, thermal weathering, sediment (supply 0.1), terraces, the coastal chain (exposure;
the bluff retreat with a 70° face, a +0.8 m wave-cut platform 35 m wide and a 4% talus wedge on the bluff sector; the equilibrium
beach with Dean A 0.14 to −8 m, a 2° shelf to −30 m, a 1:20 foreshore and a 1.8 m berm at 30 m in `offshoreMode: replace`;
foredunes where the backshore has 40 m, never west of the open-view corridor; a 1 m bar on the −3.2 m contour; a reef 150–450 m off
the bluff sector between −4 and −1 m), then the constraints (plateau re-imposed at 80 m with the escarpment replaced through its
run; the low districts 1, 2, 3, 5, 6 and 7 with designed edges: a 30° engineered embankment (`profile: embankment`, combine
`blend` over 5 m) where the pad stands above the ground and, because the engine's profiles only descend, a 5 m retaining cut
where the ground stands above the pad, the ramps where roads climb into them coming from the road fit; the corridor descent
before the plaza and the 5.8% network road fit with 40 m cut/fill shoulders, shoreline, runway, cap 90 m), the height export,
`geology-channels` and `derive-land-cover`. The targets report carries a `district-edges` constraint row: the recipe profile of
every district (never `feather`) and the measured edge outside its boundary (rays along the outward normal every 10 m: the median
slope of the first 20 m, the width until the surface flattens below 5° for 6 m, the step), failing on a feather, an un-re-imposed
district or a median edge wider than 25 m unless it is an escarpment. With
`working=1953` the same recipe iterates on the 1.953125 m working grid in about 3.5 minutes (the final bicubic resample writes
the 4097² landscape; the targets are then measured on the working grid, so faces and berms are judged where the layers exist, and
the geology sidecar is skipped because its layers live on the working grid).

Recipe lessons from the nine working-grid iterations (`tests/artifacts/screens/landscape/ai596/d4/iterations/`): the plateau
re-imposition needs `heightOverrideMeters: 80` (the plan target is 49 m); the surrounding ground decides the escarpment, so the
massif dome had to drop from 60 to 40 m and the hills off the plateau's apron (120–400 m) for a 25 m face and a measurable 34°
talus, and the re-imposition must `replace` through its run (with `max`, the thermal apron and the 20 m rounded toe read 22°);
erosion within 140 m of the shore lowered the bluff crown, and the 10% talus wedge buried the lower third of the face (7 m
measured), so the crown is kept from erosion, a crown band adds 0–6 m and the wedge is 4%; a 0.6 m bar 60 m wide is invisible on
the Dean slope (prominence 0.06 m), a 1 m bar 40 m wide on the −3.2 m contour reads −2.2 m at 112 m; the foredune belt must be
masked out of the beach west of the open-view corridor or it blocks the sightline; a reef noise octave of 25 m leaves one-sample
needles at 1.953 m, 30 m does not; the slope shares needed the hills at ±42 m with the short octaves weighted (±14 m gave
5%, ±22 m 6%, ±28 m 7%, ±36 m 11% above 10°); and the first embankment pass cut a 12 m trench around every pad (the plaza's down
to −57 m in the swim zone) because the daylight march started at the escarpment's default rim, an engine fault fixed in
`operators/EdgeProfiles.mjs` (the rim applies to escarpments only), and the same pass lowered a ring 200 m out by half the descent
because samples beyond the daylight reach were blended with the descent at the reach, fixed in `operators/Landforms.mjs` (they keep
their ground; `max` and `replace` are unchanged there).

Measured on the native run of 2026-10-09 (`node tools/bake.mjs --target landscape/synthesis/coastal-v3 --publish`, recipe sha
`51f2dfa97a83…`, 4097² at 0.9765625 m, measured on the output grid; receipt and maps under
`tests/artifacts/screens/landscape/ai596/d4/v3/`, targets in `targets.md`): all 44 rows pass (32 targets, 12 constraints),
one needle (2.39 m at x 672 / z 3587, −4.0 m, in the sea off the bluff sector; the leaf reports needles, it does not gate on them).

| Row (column B) | Measured | Target |
| --- | --- | --- |
| Slope shares of natural land ≥ 10° / 20° / 30° | 17.7 % / 3.3 % / 2.3 % | ≥ 10 % / 3 % / 1 % |
| Steepest natural slope, face mask beyond 65° | 85.8°, every sample masked | ≥ 65° |
| Local relief p90 at 100 m / 500 m | 14.23 m / 48.41 m | ≥ 14 m / ≥ 40 m |
| High-city rim face height / slope, talus slope | 26.6 m at 59.1°, talus 33.0° | 20–30 m at 55–65°, 30–35° |
| West cliff face height / slope | 11.6 m at 68.0° | 10–16 m at 60–75° |
| Wave-cut platform width / height | 30 m at +0.64 m | 20–40 m at +0.5–1.5 m |
| Drainage lines (≥ 3 m incision over ≥ 50 m), incision p90 | 65 lines, 5.77 m | ≥ 8 lines, ≥ 2.5 m |
| Berm height / distance, foreshore slope | 1.80 m at 31.5 m, 2.81° | 1.5–2 m at 25–40 m, 1.9–3.8° |
| Foredune height, samples in the corridor or a district | 3.27 m, 0 | 3–6 m, 0 |
| Dean A, −8 m reach, shelf slope to −30 m | 0.137, 444 m, 1.98° | 0.1–0.14, every transect, 1.5–2.5° |
| Bar crest depth / distance | −2.21 m at 111 m | −3 to −2 m at 60–120 m |
| Reef tops p05 / p50 / p95 | −3.99 / −3.11 / −1.81 m | −4 to −1 m, none in the swim zone |
| Subtended angle NW-08 / NW-01 / NW-09 | 3.69° / 1.35° / 1.70° | ≥ 3.5° / 1.3° / 1.7° |
| Road grades sustained (50 m) / short (20 m), 41 plan roads | 5.80 % / 5.81 % | ≤ 6 % / ≤ 8 % |
| District bands p05–p95 (1 … 7) | 25.8–26.2, 19.7–20.3, 17.5–18.5, 79.8–80.2, 10.8–13.3, 6.3–7.8, 2.43–2.77 m | inside the design bands |
| District flat fractions (< 8°), lowest | 0.992 (district 5) | ≥ 0.95 |
| District edges: profile, band slope, median / p90 width | 1 embankment 2.4° 0 / 8 m; 2 embankment 0.8° 4 / 6 m; 3 embankment 0.2° 2 / 5 m; 4 escarpment; 5 embankment 1.9° 2 / 5 m; 6 embankment 1.0° 0 / 5 m; 7 embankment 1.1° 4 / 62 m (rays crossing the beach band) | never feather, median ≤ 25 m |
| Shoreline, beach arrival, bus stop, corridor, swim zone, sea level, planning cover | 0.50 m, 2.51 m flush, 2.65 m ± 0.02, sea visible, 0 land samples and seabed p95 4.8°, Y = 0, 0 differences | hard constraints |

The thin margins are NW-09 (1.704° against 1.7°) and the 100 m relief (14.23 m against 14 m); everything else clears its bound by
more than 5 % of the bound. `derive-land-cover` changed 260,848 of 16,785,409 samples: water 4,447,457 (−2,009, beach sand now
above the sea), sand 405,956 (+34,966), rock 645,862 (+56,260: faces 10,315, slopes 56,407, talus 46,306, exposed bedrock
82,997), forest 8,039,340 (−222,423), grass 255,202 (+133,206, alluvium floors 60,547), planning classes 5–7 identical
(2,760,708 / 211,900 / 18,984). Engine 863 s (fluvial 468 s, high-city plateau 217 s, hydraulic 30 s, the two district re-impositions
22 + 20 s, thermal 16 s, geology 13 s, sediment 12 s), peak 1,985 MB tracked during sediment against the 3 GiB limit; diagnosis
21 s, render 14 s, landscape 115 s (fields 103 s, deterministic), geology 14 s; 1,028 s in all. The working-grid iteration of the
same recipe takes 193 s of engine time at a 513 MB peak. Published: `assets/public/landscape/coastal-city-v3/` revision
`synthesis-7045f619de9de74a367bc3a8` (content `synthesis-4906c5b22705a281084b301c`, snapshot
`manifest.3846aed4c17a7125df21eab7f3b486eff82daa2e5e0f3fc0ab084dc02689e9ef.json`, 1,146 files, 341 nodes, 29 copied
references, no appearance), fields `terrain-fields-8ae5a126ff397de346c5aea3` (341 pages), geology
`geology-cf24152c9156cf1bc425da74` (682 files, 341 pages, determinism verified); 799,934,843 bytes on disk in 1,828 files
(fields 382.8 MB, geology 275.4 MB, payloads 107.9 MB, source 32.9 MB, root 0.9 MB).

## D5 far-field surround

`node tools/bake.mjs --target landscape/synthesis/surround --publish` runs `recipes/coastal-v3-surround.json` on the 2049² grid at
15.625 m over −14,000..18,000 m on both axes (32 × 32 km centred on the 4 km city extent, chunkIntervals 256, maxLevel 3, 85
nodes) and installs the render-only surround document `coastal-city-v3-surround` under `assets/public/landscape/coastal-city-v3/surround/`
(manifest-last, immutable content-addressed payloads, no references, appearance, fields or geology); without `--publish` the
document is written under the output directory. `landscape=<directory>` names the v3 directory it continues (the canonical v2
directory is refused), `recipe=` and `output=` the recipe and the evidence root (`tests/artifacts/screens/landscape/ai596/d5/surround/`).

The recipe: `import-heights` with `placement: embed` reads v3 at its pinned revision `synthesis-7045f619de9de74a367bc3a8` (a stale
or foreign v3 is refused at the import and, re-read, at publication), decimates its 4097² natives ×16 with the tent filter into
columns 896..1152 / rows 896..1152 and fills the 4,132,352 samples outside: `extend-edge` continues the nearest boundary sample
outward, blurred along the boundary by a Gaussian whose sigma reaches 150 m at the 300 m fade distance (so the continuation blurs
instead of streaking), and faded toward the 18 m plain base (v3's land along its north and south edges is 12–25 m); the cover outside
is forest (3). `plan-inputs` rasterizes the surround plan: no districts, no roads, and the far shoreline
`surround/plan/far_shoreline.json`, which is the v3 design shoreline verbatim between (880, 4000) and (1048, 0) continued north and
south to 100 m beyond the bounds by a C1 cubic Hermite base coast (gentle ±150–250 m meander through the knots in `plan/author.mjs`,
starting in the design line's own end directions, the sea to the west). The headlands are spurs of the continued relief, not drawn
domes: the recipe's `spurs` operator (an anisotropic ridged `landform-hills` field, 2/1/0.5 km octaves stretched 2.5× across the
coast at bearing 270, ±320 m signed and `combine: max`, so its ridges rise from the plain and run into the sea; masked 60–200 m
from the far shoreline, fading out 2.5–4 km inland and fading in 2–4.5 km from the city extent) is sampled on the base coast by
`author.mjs` with the engine's own seed and resolved parameters, and where the field is high the coast is displaced seaward (a
smoothstep of the relief over its amplitude from 0 to 0.2 reaching 1,000 m, blurred along the coast with a 180 m sigma and fading in
over the same 2–4.5 km from the design line's ends), so every ridge of the field ends on a rounded promontory whose outline is the
field's own contour; the recipe's two coves are written in as the arcs of their elliptical footprints traced to their crossings with
that coast (a 2.5 %-of-width wobble vanishing at the crossings), on stretches the spurs leave undisplaced, so the shoreline constraint,
the beach profile, the spurs and the coves agree on one coastline. Every operator that moves the surface is masked outside the extent
with a 0–300 m smoothstep blend (a `polygon` selector on the 4 km rectangle, `edge` 0 → −300: exactly 0 on the extent and its
boundary): the shelf (`coastal-beach`, `offshoreMode: replace`, the v3 Dean A 0.14 and 2° shelf continued to a −60 m floor, a 240 m
beach band — the v3 berm 1.8 m at 30 m, a flat backshore — blending into the 18 m plain over 180 m (5°; v3's own coast rises 12 m
within 200 m), reach 20 km; a 30 m blend because the seabed differs from v3's −30 m floor by at most 4.5 m), the v3 `hills` (the same
recipe seed 596400 and operator id, the same octaves except the 44 m one below the 15.6 m grid, amplitude 37.5 so every kept octave
keeps its meters; 60 → 500 m from the far shoreline, so the spur noses carry the hill texture), the `spurs`, the `ranges` (ridged
12/6/3/1.5 km octaves weighted 1 / 0.45 / 0.2 / 0.08, ±1,800 m signed and `combine: max`, stretched 1.8× along bearing 160, so a few
massifs rise from the plain with valleys between them; east of x ≈ 9,500 m and north-east of (5,500, 13,500) with a 5 km fade,
300–1,500 m from the shore), the two coves (scoops 10–12 m), 24 fluvial iterations (retain-target 0.003) and one sediment pass
(alluvium → grass), `constrain-shoreline` (land ≥ 0.3 m, sea ≤ −0.3 m against the far shoreline: 1,049 raised / 0 lowered samples,
max 1.8 m), the 500 m cap with a 150 m soft shoulder, `geology-channels`, `derive-land-cover` (rock from 28° at this spacing, emerged
land sand) and the no-op resample. The leaf recomputes the ×16 tent decimation from the v3 natives independently and fails when any
embedded sample differs; the other metrics are reported, among them the NW-11 silhouette check: the skyline of the surface from 800 m
above (−400, 2000) over compass azimuths 20–160° against the angle of the grid's far edge, with the massifs (runs ≥ 0.25° above that
edge), their peaks, distances and the gaps between them (`skyline-nw11.png`). Re-authoring the far shoreline after changing the spur
field or a cove: `node tools/bake_landscape/terrain_synthesis/surround/plan/author.mjs` (reports a cove center off the coast rule and
the spur headlands it produced).

Measured 2026-10-10 on the published run (`surround.json`, `surround.md`; recipe sha `b809a4ced3f7…`, identity
`synthesis-0ce24bcface8d1e704fc79e3`): the sidecar under `assets/public/landscape/coastal-city-v3/surround/` is revision
`synthesis-857ae85a2b611d24990fafdc` (snapshot `manifest.245cc76309c269195cca5a51c1ccaf51494daa09cb8ca20f8768ba0abfc951fb.json`,
published 2026-10-10, replacing the earlier dome-promontory revision `synthesis-3034994a218a819ca042438f` installed on
2026-10-09; the D5 runtime timings in `LANDSCAPE_PERFORMANCE.md` were taken on that earlier revision, which has the same grid
and node count, and the D6 tables re-time the published one):

| Measure | Value |
| --- | --- |
| Engine / peak tracked | 40.6 s (fluvial 24.4, geology 4.4, sediment 3.9, plan 1.2, spurs 1.1, ranges 1.1, hills 0.9) / 497 MB of 2 GiB (sediment); reference 0.8 s, render 8.9 s, document 2.6 s; 53.1 s in all |
| Inside the extent vs v3 decimated | 66,049 samples, 0 height mismatches (max 0 m); cover 168 forest → rock (28° slope rule on the decimated escarpments) |
| Step to the first outside sample, max / p90 / p50 (inside neighbour step max / p90) | north 3.99 / 0.48 / 0.11 m (3.11 / 1.66); south 4.51 / 0.30 / 0.08 (2.52 / 1.57); west 2.51 / 2.38 / 0.19 (0.46 / 0.45: the shelf below v3's −30 m floor); east 0.39 / 0.25 / 0.14 (2.71 / 1.54) |
| Far shoreline at z 4000 / z 0 | crossing inside 880.8 / 1,047.0 m (design 880 / 1,048), first outside row 876.7 / 1,048.9 m, polyline 875.8 / 1,053.4 m |
| Spur headlands (coast displaced ≥ 300 m) | 8: z 16,340 (604 m seaward), −13,300 (600), 8,020 (526), 11,500 (502), −8,920 (499), −10,540 (469), 12,920 (448), −3,400 (420); none within 2 km of the design line's ends |
| NW-11 skyline (800 m over (−400, 2000), azimuth 20–160°) | 4 massifs: 33–33.5° (242 m at 18.4 km, +0.27°), 44–49° (385 m at 21.6 km, +0.67°), 60.5–80° (421 m at 16.9 km, +0.88°), 129–130.75° (387 m at 22.1 km, +0.32°); gaps 10.5°, 11.5°, 49°; skyline max −0.92°, far edge max −0.93° |
| Land / sea | whole grid 53.2 % / 46.8 %; inside 73.4 % / 26.6 %; outside 52.9 % / 47.1 % |
| Heights, needles | −60.0..428.6 m; 32 one-sample spikes > 2 m (max 7.2 m, within the 30° repose plane of a 15.6 m cell) |
| Land cover (whole grid) | water 1,963,867, sand 20,250, grass 68,682 (alluvial floors 66,154), forest 2,130,768, rock 3,132 (slope 2,367), planning 5/6/7 unchanged 10,798 / 818 / 86 |
| Document | 85 nodes (64 native), 118 files, 26.99 MB by manifest (native 20.16 MB, ancestors 6.61 MB, manifest 116,087 B), 18.5 MiB on disk; ancestor errors L0 101.3 m, L1 102.4 m, L2 97.2 m (the massifs at 125 / 62.5 / 31.25 m strides) |
| `provenance.preparation.surround` | `{ landscapeId: 'coastal-city-v3', revision: 'synthesis-7045f619de9de74a367bc3a8', manifestSha256: '3846aed4c17a7125df21eab7f3b486eff82daa2e5e0f3fc0ab084dc02689e9ef', extent: { minX: 0, maxX: 4000, minZ: 0, maxZ: 4000 }, boundaryHash: '638288327f66421a4b4e4e9c598b5c7b2b665a63e4ec7a643b1c085d74d78508' }` (the boundary hash is the SHA-256 of the v3 native heights along the north row west → east, the south row west → east, the west column north → south and the east column north → south, float32 little-endian) |

Review points left open: the spur noses are smooth ridge surfaces (the spur field's 500 m smallest octave; the hill texture reaches
them from 60 m inland); the coast between spurs is the gently meandering base coast with a 16 m rise from the beach into the plain
over 180 m; re-publishing leaves the previous surround payloads in `surround/payloads/` (content addressed, manifest-last) unless the
directory is removed first.

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
derived and city-extent recipes, the leaf options, the sharpness measurements on synthetic terrain),
`landscape_synthesis_upsample.test.js` (the upsampling import: filters, cover labels, the engine paths and the unchanged
same-grid and decimation paths), `landscape_synthesis_landcover.test.js` (every `derive-land-cover` rule on synthetic layers, the
transition matrix, the `derive` cover policy and the recipe rules), `landscape_synthesis_targets.test.js` (the target measures
on synthetic profiles, the declared-targets evaluator and the `coastal-beach` shelf/replace extension),
`landscape_synthesis_embed.test.js` (the embedded placement: a 5² source in a 13² grid reproduced exactly and faded to the fill, the
smoothed continuation, the ×2 decimation, the misalignment errors, the engine path on the output and a coarse working grid, the recipe
rules and the plan without districts or roads) and
`landscape_synthesis_framework.test.js` (leaf registration, the coastal-v3 recipe, the v3 fields recipe and the surround recipe with its
committed far shoreline rebuilt from the recipe's promontories); run them together with
`node --test tests/node/unit/landscape_synthesis_*.test.js tests/node/unit/landscape_review_poses.test.js`.
