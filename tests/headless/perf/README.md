# Performance budgets

This suite measures deterministic performance metrics in a headless browser using the harness (`window.__testHooks.measurePerformance`) and enforces budgets.

## Layout

- Specs: `tests/headless/perf/specs/`
- Budgets (committed): `tests/headless/perf/budgets/`
- Results/artifacts (gitignored): `tests/artifacts/headless/perf/`

## Running

Prereqs:
- `npm i`
- `npx playwright install --with-deps chromium`

Commands:
- `npm run test:perf`
- Update baselines (explicit): `npm run test:perf:update`

Profiles:
- Quick (default): short measure window
- Nightly: `PERF_PROFILE=nightly npm run test:perf`

## Grass card hardware experiment

The opt-in `specs/grass_plant_cards_100k.pwtest.js` compares 100,000 twenty-leaf
tufts using three or four cards, first adjacent and then overlapped into half
the field area. It requires a hardware GPU with elapsed timer queries and does
not run as part of the default software-rendered budget suite.

The live plant study provides four and six inclined LOD3 cards (two or three per
side). The current four-card option has inclined upper panels.
These historical comparison benchmarks continue to use the detached three-card
baseline (`cards.joined.mesh`) and reconstruct the historical four-card geometry through
`helpers/grass_legacy_split_geometry.js`, reusing the live source's atlas and
material. This helper is not loaded by the study page. Existing reports remain
historical: rerunning uses the current source shape and does not reproduce an
older shape's exact timings. The plant-study E2E test checks the reconstruction's
eight triangles and matching alpha coverage against the historical three-card
baseline. These benchmarks do not measure the current inclined four-card or
six-card layouts.

Set `GRASS_TUFT_BENCHMARK=1`, `PERF_BASE_URL` to the project server, and
`PLAYWRIGHT_EXECUTABLE_PATH` to a hardware-accelerated Chrome. Select this spec
in `tests/.selected_test` and use `node tools/run_selected_test/run.mjs`.
The optional `GRASS_TUFT_SCHEDULE=paired` measures all three cases within each
animation frame instead of separate blocks; compare its results separately.

Reports, raw samples, GPU telemetry and captures are gitignored under
`tests/artifacts/screens/grass_debug_v2/tuft_benchmark_100k/`.

For density comparisons with fixed full-screen field coverage, select
`tests/headless/perf/specs/grass_plant_cards_controlled_100k.pwtest.js` instead.
Use the same environment variables and standardized runner. This spec always
interleaves OFF and all four density/card combinations in every measured frame;
`GRASS_TUFT_SCHEDULE` does not apply. Three interior cameras keep field boundaries
outside the screen, with untimed coverage checks before measurement. Six rounds
provide 720 GPU samples per case/view. All four instance buffers remain static.

This experiment reports visible leaf coverage separately from card footprint
coverage. It measures density cost under fixed framing, including overlap and
depth rejection, rather than fragment-shader invocations alone. Its steeper
camera angles and five-pass load differ from the exterior experiment; compare
cases within each experiment. Reports, raw samples, coverage checks and captures
are gitignored under
`tests/artifacts/screens/grass_debug_v2/tuft_benchmark_controlled_100k/`.

To isolate overlap while keeping the same geometry in frame, select
`tests/headless/perf/specs/grass_pair_overlap.pwtest.js`, with the same opt-in
environment. It tests two large tufts and 100,000 small tufts, all fully inside
a fixed orthographic camera. Within each count/view/card comparison, only the
second member of each pair moves horizontally; size, depth and material stay
fixed. Partial/full overlap and both pair submission orders are measured.
Integer-pixel translations and untimed raster diagnostics verify unchanged
total projected card and alpha-tested area. Empty screen regions are intentional.
Reports and captures are gitignored under
`tests/artifacts/screens/grass_debug_v2/pair_overlap/`.

To measure the cost of retaining completely hidden tufts, select
`tests/headless/perf/specs/grass_hidden_tufts.pwtest.js`. It adds visible-only to
the fully aligned pair comparison, physically omitting every rear instance:
2 tufts become 1; 100,000 become 50,000. Exact front transforms are retained.
Raw image differences and raster coverage are checked before timing. OFF,
adjacent, both overlap submission orders and visible-only are interleaved;
results include mean/P99, cost above OFF and paired savings with uncertainty.
This measures rendering savings with precomputed visibility, not the cost of
a runtime culling algorithm. Reports and captures are gitignored under
`tests/artifacts/screens/grass_debug_v2/hidden_tufts/`.

Set `GRASS_HIDDEN_LAYERS=10` on that same hidden-tuft spec to compare one visible
tuft with one or nine hidden copies. It interleaves fresh OFF, one-, two- and
ten-layer cases, with both submission orders. The large case uses 100,000 tufts
in 10,000 stacks and removes 90,000 hidden instances for visible-only. Each
stack has fixed projected size and 4 mm depth spacing; image and raster checks
must pass before timing. Results include the OFF-subtracted multiplier relative
to one layer, plus absolute savings and uncertainty. This run is kept separate
under `tests/artifacts/screens/grass_debug_v2/hidden_tufts_10/`.

## Grass correction comparison: 50,000 leaves

Select `specs/grass_corrections_50k.pwtest.js` with the standardized runner.
Set `GRASS_CORRECTIONS_BENCHMARK=1`, `PERF_BASE_URL` to the checkout server,
and `PLAYWRIGHT_EXECUTABLE_PATH` to hardware Chrome. This uses the live
LOD3 · 24 layout, not the historical card baselines: 2,500 twenty-leaf
tufts, 60,000 cards and 120,000 triangles in one draw.

Both Normal facing and Alpha coverage are enabled or disabled together.
Ordinary alpha testing and alpha-to-coverage stay on in both states.
Top (90°), oblique (45°) and grazing (8°) perspective poses frame the entire
fixed field, with identical framing and static transforms between feature
states. Projected coverage varies by pose and is reported separately.

At 1920 × 1080, RGBA16F with 4× MSAA, each of eight rounds collects 120
samples per case/pose, following 30 warmup frames. Empty, disabled and enabled
passes are interleaved in balanced rotating/reversed order. Reports preserve
all samples, query diagnostics, draw counts, camera bounds and GPU telemetry;
shader compilation and baking are excluded. The experiment measures combined
practical overhead, including additional leaf coverage, not individual feature
costs or full-game performance.

Artifacts are under `tests/artifacts/screens/grass_debug_v2/corrections_50k/`.
Set `GRASS_CORRECTIONS_CAPTURE_ONLY=1` to regenerate the six display captures
and validate setup without replacing the timing report.

## Grass card width comparison: 50,000 leaves

Select `tests/headless/perf/specs/grass_card_width_50k.pwtest.js` with
`node tools/run_selected_test/run.mjs --set <path>`. Set
`GRASS_CARD_WIDTH_BENCHMARK=1`, `PERF_BASE_URL` to the checkout server,
and `PLAYWRIGHT_EXECUTABLE_PATH` to hardware Chrome, then run the selected
test. Software rendering is rejected.

The live LOD3 · 24 profile is instanced as 2,500 current-width groups
(20 leaves/group; 60,000 cards; 120,000 triangles) or 625 four-times-wider
groups (80 leaves/group; 15,000 cards; 30,000 triangles). Each uses one draw.
Both Normal facing and Alpha coverage remain enabled. The exact same
2048-square PBR tile and coverage mips repeat four times across each wider
card, preserving texel density. This tests grouping, not a larger unique atlas.

The same 50,000 leaf positions occupy a 28.52 × 15.58 m field. Source-point
checks cover every leaf, field bounds match, and image/alpha diagnostics must
pass before timing. Top (90°), oblique (45°) and grazing (8°) perspective
cameras each contain the whole field; their framing is identical between cases.
Field rows contain 64 current-width groups, except for the final row of four,
so four-way grouping never wraps across a row boundary.

Eight interleaved rounds yield 960 valid GPU samples per case/pose at
1920 × 1080, RGBA16F, depth and 4× MSAA. Empty/current/wide submission
positions are balanced. Draw/triangle counts, static matrices, program counts
and timer diagnostics are checked. Timing includes clear/resolve and excludes
baking, uploads, shadows, terrain and postprocessing.

Reports, raw samples, validation and six captures are gitignored under
`tests/artifacts/screens/grass_debug_v2/card_width_50k/`.
`GRASS_CARD_WIDTH_CAPTURE_ONLY=1` repeats setup validation and captures
without replacing the timing report.

## Grass LOD comparison: 50,000 leaves, 24 versus 6 cards

Select `tests/headless/perf/specs/grass_lod24_vs_lod6_50k.pwtest.js` with
the standardized runner. Set `GRASS_LOD_COMPARISON_BENCHMARK=1`,
`PERF_BASE_URL` to the checkout server, and `PLAYWRIGHT_EXECUTABLE_PATH`
to hardware Chrome, then run `node tools/run_selected_test/run.mjs`.

Both live production LODs represent the same 2,500 twenty-leaf tufts, with
bit-identical instance matrices, original atlas, shared material, and both
Normal facing and Alpha coverage enabled. LOD3 · 24 submits 60,000 cards /
120,000 triangles; LOD3 · 6 submits 15,000 cards / 30,000 triangles. Each
uses one draw call. Card width and source-leaf spacing do not change.

Top (90°), oblique (45°) and grazing (8°) cameras fit the union of both
geometries and frame every tuft at identical positions between cases.
Eight interleaved rounds yield 960 GPU samples/case/pose, using balanced
empty/LOD24/LOD6 ordering at 1920 × 1080, RGBA16F, depth and 4× MSAA.
Compilation, uploads, terrain and shadows are excluded. Clear/resolve are
included and measured separately by the empty pass.

This measures the practical geometry LOD switch, including changes in
silhouette and sampling. It does not require identical final images:
projected alpha coverage and image differences are recorded separately.
Final alpha coverage does not measure total fragment overdraw.

Artifacts are under `tests/artifacts/screens/grass_debug_v2/lod24_vs_lod6_50k/`.
Successful runs also preserve a UTC timestamped snapshot under the sibling
`benchmark_archive/` directory. `GRASS_LOD_COMPARISON_CAPTURE_ONLY=1`
validates setup and captures without replacing timing results.

## Grass controlled three-way comparison: 50,000 leaves

Select `tests/headless/perf/specs/grass_three_way_50k.pwtest.js`, set
`GRASS_THREE_WAY_BENCHMARK=1`, `PERF_BASE_URL` and
`PLAYWRIGHT_EXECUTABLE_PATH` to hardware Chrome, then use the standard runner.

Compare regular LOD3 · 24, four-times-wide LOD3 · 24, and regular LOD3 · 6
under the same textures, lighting, leaf placements and cameras. All three use
the same repeat-wrapped 2048-square first-page PBR tile and coverage mip chain,
with both grazing corrections enabled. The wide case repeats four times in U;
the narrow cases repeat once. Every case represents 50,000 leaves.

Eight rounds interleave empty plus three grass cases with balanced submission
positions, giving 960 valid GPU samples/case/pose. The top, oblique and grazing
poses each contain the whole field. Resolution is 1920 × 1080, RGBA16F, depth,
4× MSAA. Clear/resolve are included; shadows, terrain and postprocessing are
excluded. Shader compilation, uploads and baking happen outside timing.

Validation checks source positions, wide-image similarity, source counts,
static matrices, submitted triangles, timer queries and GPU telemetry.
CPU diagnostics sum projected triangle perimeter/area and aspect ratios;
these are geometry measurements, not fragment-invocation counters.

Artifacts: `tests/artifacts/screens/grass_debug_v2/three_way_50k/`.
Successful runs preserve timestamped copies in the sibling `benchmark_archive/`.
`GRASS_THREE_WAY_CAPTURE_ONLY=1` validates setup and captures without timing.

## Grass LOD comparison: 500,000 leaves, 24 versus 12 versus 6 cards

Select `tests/headless/perf/specs/grass_lods_500k.pwtest.js`, set
`GRASS_LODS_500K_BENCHMARK=1`, `PERF_BASE_URL` to the checkout server,
and `PLAYWRIGHT_EXECUTABLE_PATH` to hardware Chrome, then use the standard runner.

The three production LODs represent the same 25,000 twenty-leaf tufts, with
bit-identical instance matrices and original shared PBR atlas and material.
Normal facing and Alpha coverage remain enabled. LOD3 · 24/12/6 submit
600,000/300,000/150,000 cards and 1,200,000/600,000/300,000 triangles,
respectively, each in one draw call.

Tuft spacing is unchanged in a 200 × 125 grid, approximately 89 × 49 m.
The top (90°), oblique (45°) and grazing (8°) cameras pull back to frame
the entire field. Each pose's camera is identical across LODs. The increased
leaf count therefore does not preserve the earlier 50K scene's screen scale.

Eight rounds interleave empty/LOD24/LOD12/LOD6 in balanced order, giving
960 valid GPU samples/case/pose after warmup at 1920 × 1080, RGBA16F,
depth and 4× MSAA. Compilation, uploads, baking, terrain, shadows and
postprocessing are excluded; clear/resolve are included and measured by empty.
Coverage/image differences are recorded separately; identical total alpha
coverage is not required for distinct geometry LODs.

Artifacts: `tests/artifacts/screens/grass_debug_v2/lods_500k/`.
Successful runs preserve dated copies in the sibling `benchmark_archive/`.
`GRASS_LODS_500K_CAPTURE_ONLY=1` validates setup and captures without timing.
