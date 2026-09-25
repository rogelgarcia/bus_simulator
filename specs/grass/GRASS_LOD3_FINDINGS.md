# Grass LOD3 findings and design direction

Recorded 2026-09-24. This document preserves benchmark conclusions and the next
authoring direction. A raised-tip LOD0 candidate has since been implemented as
described below; visual approval, a redesigned LOD transition and runtime
visibility detection remain pending. See
[Grass Debug v2](GRASS_DEBUG_V2.md) for the current scene and experiment contracts.

## Saved benchmark index

The tables and methodology below retain the measured conclusions in project
documentation. Dated local snapshots preserve the corresponding reports,
raw GPU samples, telemetry, validation data and captures independently of
future benchmark reruns. Snapshot timestamps are UTC.

| Benchmark | Summary in this document | Archived report |
| --- | --- | --- |
| 50K leaves: Normal facing + Alpha coverage on/off | [Feature overhead](#normal-facing--alpha-coverage-50000-leaf-benchmark) | [2026-09-25 03:16 UTC](../../tests/artifacts/screens/grass_debug_v2/benchmark_archive/2026-09-25_031623Z_corrections_50k/report.md) |
| 50K leaves: current versus 4× card width | [Card width comparison](#wider-cards-fixed-50000-leaf-benchmark) | [2026-09-25 03:31 UTC](../../tests/artifacts/screens/grass_debug_v2/benchmark_archive/2026-09-25_033153Z_card_width_50k/report.md) |
| 50K leaves: LOD3 · 24 versus LOD3 · 6 | [LOD comparison](#lod3-24-versus-lod3-6-fixed-50000-leaf-benchmark) | [2026-09-25 03:48 UTC](../../tests/artifacts/screens/grass_debug_v2/benchmark_archive/20260925T034841Z_lod24_vs_lod6_50k/report.md) |
| 50K leaves: regular LOD24, wide LOD24, LOD6 together | [Controlled three-way comparison](#controlled-three-way-test-width-versus-curve-subdivisions) | [2026-09-25 03:59 UTC](../../tests/artifacts/screens/grass_debug_v2/benchmark_archive/20260925T035916Z_three_way_50k/report.md) |
| 500K leaves: LOD3 · 24 versus · 12 versus · 6 | [500K LOD comparison](#500000-leaves-lod3-24-versus-12-versus-6) | [2026-09-25 04:08 UTC](../../tests/artifacts/screens/grass_debug_v2/benchmark_archive/20260925T040851Z_lods_500k/report.md) |

Each archived report has its matching `results.json`, `preflight.json` and
images in the same folder. Artifact snapshots are local and gitignored;
the numerical summaries below remain available without those files.

## Card shape and shadow continuity

The authoring study now fits cards to the upper contour of the blade margins
at matching world-Z slices, instead of the blade centerline. This preserves
more of the crosswise curved volume near the root without adding cards or a
separate shadow mesh. Simply increasing centerline subdivisions, or adding the
omitted collar samples alone, did not solve the missing volume.

With the current game sun and twenty-leaf row, the 24-card variant's relative
shadow-darkening error dropped from 11.19% to 5.39% overall and 29.39% to 7.60%
within 35 mm of the root line. Lower-card variants improve less. The source,
atlas and triangle counts stay fixed; this is a silhouette result, not a timing
result. Some mismatch remains because flat cards cannot reproduce the whole
cross-section. See the shadow-fit contract and retained captures in
[Grass Debug v2](GRASS_DEBUG_V2.md). The paired root connections remain intact.

## Grazing-angle shading and coverage

The study now has independently reversible Normal facing and Alpha coverage
options. The proxy triangle's facing alone is insufficient when a curved source
is projected onto a flat strip. The initial per-texel facing correction also
created bright underside stripes: fine shading normals could select opposite
sides within the same blade. A controlled corrugated-normal reproduction
measured up to 85/255 green-channel error (about 31/255 mean) above and below.

The corrected side decision uses the source geometric centerline normal,
shared across each width station and packed into unused roughness red/blue
channels. Detailed normals still provide curvature and vein shading. This
reuses both existing texture samples, adds no texture or triangles, and
matches the reproduction's reference lighting with zero measured pixel error.
The regression is `grass_debug_v2_facing_ridge.pwtest.js`; its metrics and
underside captures are under `tests/artifacts/screens/grass_debug_v2/facing_ridge/`.

The structural reference initially used a hard front/back threshold, producing
a visible lighting seam along curved leaves. It now blends over about ±5.7°
around grazing. Direct diffuse and transmission mix the two source-side
responses; specular and environment lighting use a unit normal blended through
the view tangent. Rotating the normal alone was rejected because it created a
dark midpoint. No additional texture samples, triangles or shadow deformation
are needed; this adds shader arithmetic and remains an approximation near
grazing.

A quarter-degree camera sweep reduced the largest green-channel jump from
72/255 (orthographic) and 36/255 (perspective) to 3/255 for both. Both endpoint
levels and the existing underside-ridge regression remain unchanged.
`grass_debug_v2_facing_transition.pwtest.js` also checks for a dark dip, with
captures under `tests/artifacts/screens/grass_debug_v2/facing_transition/`.

Initial testing of strict per-mip alpha-cutoff matching made the grazing strips
less visible: reducing alpha toward the 0.15 cutoff interacts poorly with
anisotropic filtering and the original one-sided MSAA transition. The retained
version never attenuates mip alpha, compensates coverage loss when quantization
permits, and centers the MSAA transition on the cutoff. Empty texels stay empty,
and the original atlas/filtering remains available with the checkbox off.
Rendered on/off comparisons and numerical checks live under
`tests/artifacts/screens/grass_debug_v2/grazing/`.

The controlled 750 x 500, 4x MSAA grazing render measures 954.37 pixel-equivalents
with coverage off and 1299.11 with it on (+36.1%); switching off restores 954.37.
This is projected coverage, not recovered LOD0 geometry or a GPU speed result.
In isolated overhead lighting, the underside source green channel is 36/255;
the corrected card matches 36/255 versus 109.01/255 with proxy-facing lighting.
The current texture also passes the shadow-fit regression (5.39% overall error
and 7.60% near roots), and all four card variants pass the existing study suite.
These changes add no triangles or texture lookups. They do not recover the
transverse shape missing from the cards, and improved coverage may increase
fragment cost. No GPU timing claim is established by these visual checks.

## What the overlap experiments established

- Compressing a field changes density and potentially screen coverage and the
  number of visible tufts. Those comparisons do not isolate the cost of hiding
  the same geometry behind other geometry.
- The fixed-camera pair experiment kept the same tufts in view. Overlap alone
  did not consistently increase total GPU time compared with adjacent placement.
- Removing already-known hidden instances did save rendering time. This differs
  from submitting all instances and relying on depth testing to reject hidden
  fragments. The experiments do not identify the cost of each GPU stage.
- Hidden geometry is visually redundant in the controlled case, but its time
  cost is not necessarily 1:1 with visible geometry or linear in layer count.

These measurements precede the raised-tip LOD0 revision; they are not timings
of its regenerated cards. The strongest controlled result used 10,000 independent
stacks, each containing
one visible tuft and nine aligned rear copies: 100,000 submitted tufts versus
10,000 after removal. Every tuft contains the same twenty source leaves.

| View and layout | One layer, GPU ms above OFF | Ten layers, GPU ms above OFF | Saving from removing nine layers |
| --- | ---: | ---: | ---: |
| Top, 3 cards | 0.362 | 2.265-2.291 | 84% |
| Top, 4 cards | 0.401 | 2.279-2.319 | 82-83% |
| Inclined, 3 cards | 0.805 | 5.055-5.073 | 84% |
| Inclined, 4 cards | 0.620 | 4.143-4.146 | 85% |

Ranges cover near-first and far-first submission orders. These are mean GPU
times minus the matching OFF mean, not whole-scene savings; P99 values are not
subtracted. Camera, projected scale, front instance, material and lighting were
unchanged. The large comparison changed at most 12 of 2,073,600 image pixels;
single-stack images were identical in the tested poses.

Measurements used an RTX 3060 through Chrome 153/ANGLE D3D11, a 1920 x 1080
RGBA16F target with 4x MSAA, and 960 GPU samples per case over eight rounds.
Every case occupied every submission slot equally often. OFF measures target
clear/resolve. Terrain, bus, sky, shadows, wind and postprocessing were excluded.
The GPU was shared with other desktop workloads. Small OFF-subtracted costs can
have noisy ratios; use paired absolute differences and retained round intervals.

This is a controlled limit with aligned copies and visibility known in advance.
It does not establish an 82-85% saving for a natural grass field, include runtime
visibility detection costs, or validate the sub-1 ms bus-view objective. The
100,000-tuft cases have small projected tufts and differ from the earlier pair
experiment; absolute times must not be pooled across runs.

## Direction for LOD3 generation

Prioritize fewer redundant layers while retaining the visible impression of
grass. Prefer combining source leaves into useful baked surfaces and simplifying
hidden interiors during asset generation. Preserve coverage, gaps exposing soil,
blade tips, height and the patch silhouette. Small visual differences are
acceptable only after checking them at the intended LOD distance and in motion.

A leaf hidden from one direction may contribute from another direction, through
alpha holes, during motion or to shadows. Do not permanently delete it based on
one camera alone. Runtime visibility work should initially operate on spatial
blocks and distance; any finer method must demonstrate a net saving including
its own CPU/GPU cost. Reducing transparent card area is useful to investigate,
but area reductions do not imply proportional timing savings.

## Preserve raised tips instead of flattening the source

The user identified a visual concern: flattening grass to simplify its LOD3 and
ground-texture transition can remove the projecting tips that make it read as
grass. Preserve this concern as a criterion for the next shape review.

Two effects need separate evaluation. Low source leaves can lose their distinct
silhouette when viewed near the ground. At the time of the benchmarks, LOD3 mapped the upper
region onto a horizontal plane at about 6.06 cm, or 78% of the source maximum
height. Its documented centerline height error reaches 17.39 mm; this planar
proxy is a layout experiment, not an approved match to LOD0.

Authoring direction: retain a low, gently curved body but give the distal portion
enough elevation and continuous slope to expose individual ends in the bus and
low views. Avoid a sudden upright hook or a common horizontal top. A visible tip
does not require a needle-like endpoint: the previously reviewed rounded taper
can remain. Start with the existing deterministic leaf pair to isolate shape
changes before considering additional variation.

Use the reviewed LOD0 silhouette to guide the derived cards. Compare inclined or
lightly bent upper surfaces, and consider a small number of extra tip surfaces
only if needed and measured. Alpha can preserve a contour within a card, but
cannot restore height or parallax absent from that card's geometry. Transition
to a ground texture at a distance where the remaining height and tips contribute
little at the actual screen resolution; do not flatten LOD0 simply to force an
earlier transition. The card-layout redesign remains a proposal.

### Initial raised-tip source candidate

Implemented on 2026-09-24 in the shared detailed-blade sampler and therefore the
paired plant and twenty-leaf row. The new curve keeps the buried root and initial
tangent, raises the body-to-tip join smoothly and maintains a rising terminal
tangent. Paired leaf tips are about 9.82 cm and 10.23 cm high, with terminal
inclinations of about 20.6° and 24.1°. Rounded width profiles, materials, colors,
placement and triangle counts are unchanged.

The study test passes, including continuous upper slopes, grounded soil at the
roots, all twenty leaves in the atlas, and valid three/four-card rendering.
Three-quarter, side and elevated LOD0 captures are under
`tests/artifacts/screens/grass_debug_v2/row_cards/raised_tips/`.
This candidate was reviewed as too straight and is superseded by the curvature
revision below. Its cards regenerated with a horizontal
top at 7.98 cm and a 34.14 mm maximum centerline deviation; they still need the
planned silhouette redesign. Earlier benchmark results remain historical.

### Curvature revision

The user found that raising the tips had left the blade almost straight. The
shared source now uses one continuous cubic arch: a more inclined emergence,
a fuller middle and a gradually relaxing end. Root burial, endpoint positions,
rounded taper, materials, colors, placement and triangle counts are retained.
The paired tips remain 9.82 cm and 10.23 cm high; their terminal inclinations
are now about 5.1° and 6.7°, with no downward turn in the paired plant.

The body now bows 16.3-16.7 mm above its lower-body-to-tip chord, compared with
2.3-2.4 mm previously. A focused curvature assertion failed on the former shape
and passes on this revision, alongside the existing study checks. Same-camera
captures and measurements are under
`tests/artifacts/screens/grass_debug_v2/row_cards/curved_blades/`;
`before-curve.json` retains the failed shape's measurements.
At this stage the derived planar cards still used a 7.98 cm flat top and had
22.51 mm maximum centerline deviation. The subsequent six-card revision below
replaces that layout. Field appearance, the bus-view transition and performance
remain unvalidated for the revised source and six-card layout.

## Next validation

After reviewing the 1,000-leaf patch, the user identified a need for some
pointier, more upright source blades to give the patch a stronger projecting
silhouette. The plastic appearance remains a concern but material work is
deferred. The current step restores the inline authoring row; new pointed/upright
blade shapes have not been implemented. The random patch and its softer-surface
comparison remain saved in `spike_experiment_1k/` under the grass screenshot artifacts.

The three- and four-card variants had nearly identical visible coverage, with
neither consistently faster across the measured workloads. Four cards were
faster in some inclined views, while three were slightly cheaper in some top
views. The live study retains four cards alongside six for continued comparison;
three remains only an off-scene benchmark baseline. The historical four-card
layout's flat upper planes are now replaced by inclined planes in the live study.
Its two cards per side are fitted to the source, with shared positions and UVs at
the join, all using the full first atlas page. From root outward, negative-Z
angles are 43.41° / 19.74° and positive-Z angles are 36.09° / 15.63°. The layout
still has eight triangles. Maximum sampled centerline error drops from 22.51 mm
to 7.52 mm, with the same tip heights as the six-card layout. Captures are under
`tests/artifacts/screens/grass_debug_v2/row_cards/four_inclined_cards/`.

The six-card option uses three connected inclined planes per side,
fitted to the curved twenty-leaf source. None is horizontal. Sampled centerline
error is 3.86 mm versus 22.51 mm for the old three-card flat-top layout; this is
a geometric fit measurement, not a silhouette or transition guarantee. The live
mesh has twelve triangles and one material/draw. Its geometric area is about
0.1109 m² versus 0.1511 m² for the three-card reference, but GPU cost cannot be
inferred from area alone. The old three-card mesh is retained off-scene solely
for historical benchmark comparisons. The tests verify six inclined cards,
continuous joins, centerline fit, shadows and matching-camera captures. No new
hardware performance result is claimed for either inclined layout. Existing
timings predate the current LOD0 source and four-card inclination changes; the
benchmark helpers continue to construct the historical flat-top variants.

- Compare the same source and derived LOD from top, side, low oblique and bus
  views, then move the camera through the transition and around the patch.
- Check tip visibility, projected coverage, apparent height, soil gaps, lighting
  and temporal popping. A top-view match alone is insufficient.
- Measure grass-on against matching OFF at the same camera, resolution, AA,
  lighting and hardware, including any visibility overhead. Retain mean and P99.
- Keep the objective of less than 1 ms incremental GPU cost at the bus view;
  accuracy-first authoring geometry is not the runtime budget.

## Reproduction and evidence

Run the existing hidden-tuft spec with `GRASS_HIDDEN_LAYERS=10` through the
standardized runner; the opt-in environment and procedure are documented in
[the performance README](../../tests/headless/perf/README.md). The reusable spec
is `tests/headless/perf/specs/grass_hidden_tufts.pwtest.js`.

Local, gitignored evidence is under
`tests/artifacts/screens/grass_debug_v2/hidden_tufts_10/`: `analysis.md`,
`report.md`, `results.json` and per-view captures. Only the corrected balanced-order
run supports the table above; `initial-unbalanced-order.json` is excluded.
Earlier pair and removal evidence is under the sibling `pair_overlap/` and
`hidden_tufts/` directories. This document retains the conclusions even when
local artifacts are unavailable.

Background reference: NVIDIA's
[Rendering Countless Blades of Waving Grass](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-7-rendering-countless-blades-waving-grass)
describes grouping blades within textures to avoid large transparent areas and
maintaining density from different viewing directions. It is a conceptual
reference, not performance evidence for this implementation.

## Normal facing + alpha coverage: 50,000-leaf benchmark

Measured the current LOD3 · 24 on an RTX 3060 / Chrome 154, with 2,500
twenty-leaf tufts: 60,000 cards, 120,000 triangles, one draw. The fixed field
is 22.28 × 19.48 m and remains fully inside three perspective cameras. Each
enabled/disabled pair has identical camera, matrices, geometry and lighting.
The poses have different projected footprints; this is not a fixed-screen-area
comparison between poses.

Both corrections were toggled together, while ordinary alpha testing and MSAA
alpha-to-coverage remained active. The grass-only pass used game sunlight and
environment, a 1920 × 1080 RGBA16F target and 4× MSAA, without ground, shadows,
sky, bus, wind or postprocessing. Clear/resolve are included; the empty pass
measures that baseline. Eight interleaved rounds yielded 960 valid GPU samples
per case/pose, with balanced submission positions and no disjoint or missing
queries. Static transforms and precompiled shaders were checked.

| Pose | Both disabled, mean / P99 ms | Both enabled, mean / P99 ms | Added mean | Empty mean ms |
| --- | ---: | ---: | ---: | ---: |
| Top, 90° | 1.764 / 4.263 | 1.919 / 4.641 | +0.155 ms (+8.8%) | 0.540 |
| Oblique, 45° | 1.699 / 4.111 | 1.800 / 4.383 | +0.101 ms (+6.0%) | 0.530 |
| Grazing, 8° | 1.507 / 3.921 | 1.603 / 3.866 | +0.096 ms (+6.4%) | 0.559 |

Mean grass cost above the empty pass was 1.223 → 1.378 ms (top),
1.169 → 1.271 ms (oblique) and 0.948 → 1.044 ms (grazing).
P99 values are absolute and were not baseline-subtracted. Approximate 95%
intervals from eight paired round deltas were 0.099–0.211 ms, 0.037–0.165 ms
and 0.053–0.139 ms respectively. Round-end GPU clocks varied from 682 to
1807 MHz; these absolute times and tails reflect that desktop operating state,
not fixed peak-clock performance. The slightly lower enabled grazing P99 does
not establish a tail-latency improvement.

Coverage correction also increased leaf alpha pixel-equivalents from
19.87% to 34.59% of the screen (top), 15.33% to 27.87% (oblique) and
5.49% to 7.70% (grazing). The added cost therefore includes extra covered
samples, not shader arithmetic alone. This two-state comparison does not
attribute cost separately to Normal facing and Alpha coverage; baking time
and the extra coverage texture memory are excluded.

Reproduce with `tests/headless/perf/specs/grass_corrections_50k.pwtest.js`
as documented in `tests/headless/perf/README.md`.
Report, raw samples, bounds, six captures and GPU telemetry:
`tests/artifacts/screens/grass_debug_v2/corrections_50k/`.

## Wider cards: fixed 50,000-leaf benchmark

Compared the current LOD3 · 24 geometry with cards four times wider on
RTX 3060 / Chrome 154. Both Normal facing and Alpha coverage stayed enabled.
Four adjacent groups became one larger group, with unchanged leaf positions,
leaf size, bends, heights, texture detail, lighting and per-pose camera.

| Layout | Card width | Leaves per 24-card group | Groups | Cards | Triangles | Draws |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Current | 0.445629 m | 20 | 2,500 | 60,000 | 120,000 | 1 |
| Four times wider | 1.782518 m | 80 | 625 | 15,000 | 30,000 | 1 |

Each narrow card contains portions of ten leaves on one side of the pair row;
each wide card contains portions of forty. Twenty/eighty counts whole leaves
across both sides, not complete leaves per longitudinal card segment.

Both layouts use the same repeat-wrapped 2048-square PBR tile and coverage mip
chain; the wider geometry spans four repeats. Thus this isolates geometry
grouping without introducing a larger unique atlas or changing texel density.
A total of 100,000 source-point checks covered every leaf's root and tip.
Maximum placement error was 0.824 micrometers from Float32 rounding; bounds
agreed within 0.522 micrometers. Total alpha pixel-equivalents differed by
less than 0.0031% in every pose. Small raster differences remain at edges.

All 50,000 leaves remain inside all three cameras in a 28.52 × 15.58 m field:
39 rows of 64 narrow groups plus four groups in the final row. The grazing
view consequently has substantial empty screen space. Compare the two layouts
within each pose; different poses have different projected footprints.

Eight balanced, interleaved rounds yielded 960 valid GPU samples/case/pose.
The grass-only pass used game sunlight and environment, 1920 × 1080 RGBA16F,
depth and 4× MSAA. Clear/resolve are included; empty measures that baseline.
Ground, sky, bus, shadows, wind, postprocessing, baking, uploads and shader
compilation are excluded. Draw counts, static transforms and timer queries
passed validation.

| Pose | Current mean / P99 ms | Wide mean / P99 ms | Mean saving | Empty mean ms |
| --- | ---: | ---: | ---: | ---: |
| Top, 90° | 1.793 / 4.274 | 1.744 / 4.140 | 0.049 ms (2.7%) | 0.431 |
| Oblique, 45° | 1.623 / 4.095 | 1.561 / 3.983 | 0.062 ms (3.8%) | 0.544 |
| Grazing, 8° | 1.627 / 4.013 | 1.560 / 4.029 | 0.066 ms (4.1%) | 0.627 |

Mean cost above empty was 1.362 → 1.313 ms (top), 1.079 → 1.017 ms
(oblique), and 1.000 → 0.933 ms (grazing), corresponding to 3.6%, 5.7%
and 6.7% savings after baseline subtraction. P99 is never baseline-subtracted.

Approximate 95% intervals for wide minus current, from eight paired round
differences, were -0.110 to +0.012 ms (top), -0.107 to -0.017 ms
(oblique), and -0.122 to -0.011 ms (grazing). The top result is inconclusive;
oblique and grazing show modest savings within this run. Round-end GPU clocks
varied from 727 to 1807 MHz. The small grazing P99 increase does not establish
a tail-latency regression. These are desktop operating-state measurements,
not fixed peak-clock performance or cross-run comparisons.

The 75% reduction in cards and triangles produced a much smaller time saving.
Pixel coverage and material work remain almost unchanged, and draw count was
already one in both cases. This is consistent with geometry being only part
of the cost, rather than evidence that wider cards alone solve the grass
budget. No runtime visibility or culling benefit/cost is measured here.

Reproduce with `tests/headless/perf/specs/grass_card_width_50k.pwtest.js`,
as documented in `tests/headless/perf/README.md`. Report, samples, telemetry,
camera/placement proofs and captures:
`tests/artifacts/screens/grass_debug_v2/card_width_50k/`.

## LOD3 24 versus LOD3 6: fixed 50,000-leaf benchmark

Measured 2026-09-25T03:48:41.778Z on RTX 3060 / Chrome 154. The same 2,500
twenty-leaf tufts use bit-identical instance matrices, the original shared
4096 × 2048 PBR atlas and material, with Normal facing and Alpha coverage on.
The live production 24-card and 6-card geometries are used without modification.

| LOD | Leaves | Tufts | Total cards | Total triangles | Draws |
| --- | ---: | ---: | ---: | ---: | ---: |
| LOD3 · 24 | 50,000 | 2,500 | 60,000 | 120,000 | 1 |
| LOD3 · 6 | 50,000 | 2,500 | 15,000 | 30,000 | 1 |

All 50,000 represented leaves remain within every camera. Both LODs share
the same 28.52 × 15.58 m field and per-pose framing; the grazing pose contains
substantial empty screen space. Each of eight balanced interleaved rounds
collects 120 samples/case/pose after 30 warmup frames: 960 valid GPU samples.
The grass-only pass uses 1920 × 1080 RGBA16F, depth, 4× MSAA and game sun /
environment. It includes clear/resolve, measured separately by an empty pass,
and excludes terrain, sky, bus, shadows, wind, postprocessing, compilation,
baking and uploads. Counts, static transforms and query validity passed checks.

| Pose | LOD24 mean / P99 ms | LOD6 mean / P99 ms | Mean saving | Empty mean ms |
| --- | ---: | ---: | ---: | ---: |
| Top, 90° | 2.395 / 4.881 | 1.499 / 3.503 | 0.896 ms (37.4%) | 0.529 |
| Oblique, 45° | 1.862 / 4.323 | 1.225 / 3.363 | 0.636 ms (34.2%) | 0.536 |
| Grazing, 8° | 1.584 / 3.955 | 0.989 / 3.132 | 0.595 ms (37.6%) | 0.607 |

| Pose | LOD24 / LOD6 mean above empty ms | Saving above empty | Approximate 95% interval, LOD6 minus LOD24 ms | Alpha coverage change |
| --- | ---: | ---: | ---: | ---: |
| Top, 90° | 1.866 / 0.970 | 48.0% | -1.111 to -0.681 | 0.083% |
| Oblique, 45° | 1.326 / 0.689 | 48.0% | -0.743 to -0.530 | 0.487% |
| Grazing, 8° | 0.977 / 0.382 | 60.9% | -0.757 to -0.433 | -0.360% |

Every paired round favored LOD3 · 6. The approximate intervals use eight paired
round means (Student t, seven degrees of freedom). P99 is absolute and never
baseline-subtracted. GPU clocks at round boundaries were 1935–1950 MHz, with
reported device utilization ranging from 10% to 99%. The desktop GPU was not
isolated or clock-locked; absolute timings include its operating conditions.
Do not compare absolute totals to older benchmark runs.

Card/triangle counts drop by 75%; average pass time drops by 34–38%.
Total final alpha coverage changes by less than 0.5%, so the faster LOD does
not achieve its gain by omitting most of the represented grass. Card surface
area per tuft is 0.199923 m² versus 0.199037 m². Individual silhouettes and
shading still differ: matching total alpha does not imply matching images or
unchanged fragment overdraw. This experiment measures the practical LOD
switch, not isolated triangle throughput or full-game performance.

Reproduce with `tests/headless/perf/specs/grass_lod24_vs_lod6_50k.pwtest.js`,
using the instructions in `tests/headless/perf/README.md`.
[Archived report](../../tests/artifacts/screens/grass_debug_v2/benchmark_archive/20260925T034841Z_lod24_vs_lod6_50k/report.md),
[raw data](../../tests/artifacts/screens/grass_debug_v2/benchmark_archive/20260925T034841Z_lod24_vs_lod6_50k/results.json) and
[three-pose comparison](../../tests/artifacts/screens/grass_debug_v2/benchmark_archive/20260925T034841Z_lod24_vs_lod6_50k/comparison.jpg).

An earlier diagnostic run at 03:45 UTC is retained separately, but its GPU
clock query used an invalid field name. The table above uses only the corrected
03:48 UTC run; samples from the two runs are not pooled.

## Controlled three-way test: width versus curve subdivisions

Measured 2026-09-25T03:59:16.393Z on RTX 3060 / Chrome 154. This directly
compares regular LOD3 · 24, four-times-wide LOD3 · 24, and regular LOD3 · 6
within the same interleaved run. It controls the texture-layout and desktop
operating-state differences between the earlier separate experiments.

Every case represents the same 50,000 leaves. The 24-card and 6-card narrow
versions share 2,500 identical transforms and twenty leaves per tuft; the wide
version merges four adjacent groups into 625 eighty-leaf groups without
moving leaves. All share the same 2048-square repeating first-page PBR tile,
coverage mip chain, texel density, material, lighting and per-pose camera.
Normal facing and Alpha coverage are enabled. Width reprojection checks cover
100,000 source points with less than one micrometer of Float32 position error.

| Case | Groups | Total cards | Total triangles | Draws |
| --- | ---: | ---: | ---: | ---: |
| LOD3 · 24 | 2,500 | 60,000 | 120,000 | 1 |
| LOD3 · 24, 4× width | 625 | 15,000 | 30,000 | 1 |
| LOD3 · 6 | 2,500 | 15,000 | 30,000 | 1 |

All leaves remain inside all three cameras. Eight balanced, interleaved rounds
yield 960 valid GPU samples/case/pose, with empty plus three grass cases in
every frame. Timing uses 1920 × 1080 RGBA16F, depth and 4× MSAA with game
sunlight/environment. Clear/resolve are included; terrain, shadows, sky, bus,
wind, postprocessing, compilation, uploads and baking are excluded.

| Pose | LOD24 mean / P99 ms | Wide LOD24 mean / P99 ms | LOD6 mean / P99 ms | Empty mean ms |
| --- | ---: | ---: | ---: | ---: |
| Top, 90° | 1.614 / 4.169 | 1.542 / 3.897 | 1.079 / 3.380 | 0.398 |
| Oblique, 45° | 1.491 / 3.867 | 1.423 / 4.326 | 1.070 / 3.624 | 0.496 |
| Grazing, 8° | 1.316 / 4.514 | 1.254 / 4.128 | 0.952 / 3.694 | 0.585 |

| Pose | Wide versus LOD24 mean saving | LOD6 versus LOD24 mean saving | LOD6 versus wide mean saving |
| --- | ---: | ---: | ---: |
| Top, 90° | 0.072 ms (4.5%) | 0.536 ms (33.2%) | 0.463 ms (30.0%) |
| Oblique, 45° | 0.068 ms (4.6%) | 0.421 ms (28.2%) | 0.353 ms (24.8%) |
| Grazing, 8° | 0.062 ms (4.7%) | 0.364 ms (27.6%) | 0.302 ms (24.1%) |

All approximate 95% paired-round intervals favor the candidate for all three
comparisons and poses; complete intervals and raw samples are in the report.
Round-end GPU clocks ranged from 922 to 1770 MHz and device utilization from
24% to 32%. The desktop GPU was not isolated or clock-locked. Use this paired
comparison to compare methods rather than comparing absolute totals across runs.

The larger LOD6 benefit persists under shared textures and sampling: wider
cards save about 4.5–4.7% of the measured pass, while fewer curve subdivisions
save about 27.6–33.2%. LOD6 is 24–30% faster than wide LOD24 even though both
submit 15,000 cards and 30,000 triangles. LOD6 uses more instances (2,500
versus 625), so the result cannot be explained simply by fewer instances or
draw calls.

### Evidence for a triangle-shape explanation

Widening a thin strip makes it longer while retaining its narrow dimension
and all twelve longitudinal segments per side. LOD6 reduces that segmentation
to three strips per side, making them deeper and removing many long triangle
boundaries.

| Pose | Wide reduction in total projected triangle perimeter | LOD6 reduction in total projected triangle perimeter |
| --- | ---: | ---: |
| Top, 90° | 1.42% | 73.47% |
| Oblique, 45° | 1.14% | 73.80% |
| Grazing, 8° | 0.84% | 74.14% |

In the top view, mean longest-edge/altitude ratios are 36.1 (regular LOD24),
143.5 (wide LOD24) and 11.3 (LOD6). Both optimizations remove 75% of triangles,
but the wide cards retain almost all triangle-edge length, whereas LOD6 removes
roughly three quarters. These measurements sum projected triangle boundaries,
including shared edges separately for each triangle and transparent areas.

This supports quad overshading as an explanation: fragment shading works in
small pixel groups, and triangles spanning only part of a group can spend work
on lanes that do not contribute to the image. Triangle shape and boundary
density therefore matter in addition to count. See Arm's primary explanation
of [partial fragment-quad coverage](https://developer.arm.com/community/arm-community-blogs/b/mobile-graphics-and-gaming-blog/posts/mali-bifrost-family-performance-counters).
This is a supported hypothesis for the RTX measurements, not a hardware-counter
measurement or proof that it is the sole cause; texture derivatives, rasterization
and the changed proxy shape can also contribute.

Wide-card alpha coverage differs by less than 0.0031% from regular LOD24.
LOD6 differs by approximately +0.077% (top), +0.502% (oblique) and -0.394%
(grazing). Thus the large performance gap is not explained by a comparable
loss of final grass coverage. Final alpha does not measure intermediate
overdraw, shader invocations or fine image similarity.

The useful authoring implication is to prioritize fewer longitudinal segments
where the silhouette permits. Wider grouping is an additional, smaller saving
in these tested views; triangle count alone cannot predict either saving.

Reproduce with `tests/headless/perf/specs/grass_three_way_50k.pwtest.js`;
see `tests/headless/perf/README.md`.
[Archived report](../../tests/artifacts/screens/grass_debug_v2/benchmark_archive/20260925T035916Z_three_way_50k/report.md),
[raw data](../../tests/artifacts/screens/grass_debug_v2/benchmark_archive/20260925T035916Z_three_way_50k/results.json) and
[three-way captures](../../tests/artifacts/screens/grass_debug_v2/benchmark_archive/20260925T035916Z_three_way_50k/comparison.jpg).

## 500,000 leaves: LOD3 24 versus 12 versus 6

Measured 2026-09-25T04:08:51.127Z on RTX 3060 / Chrome 154. All three live
production LODs share 25,000 bit-identical instance transforms, the original
PBR atlas and material, with Normal facing and Alpha coverage enabled.
Each tuft represents twenty source leaves.

| LOD | Leaves | Tufts | Total cards | Total triangles | Draws |
| --- | ---: | ---: | ---: | ---: | ---: |
| LOD3 · 24 | 500,000 | 25,000 | 600,000 | 1,200,000 | 1 |
| LOD3 · 12 | 500,000 | 25,000 | 300,000 | 600,000 | 1 |
| LOD3 · 6 | 500,000 | 25,000 | 150,000 | 300,000 | 1 |

The unchanged tuft spacing fills a 200 × 125 grid, 89.126 × 48.690 m.
All 500,000 represented leaves remain inside every camera. The cameras pull
back to frame this larger field, so individual leaves occupy fewer pixels
than in the 50K tests; absolute timings are not a tenfold same-camera scaling
comparison. Framing is identical among the three LODs within each pose.

Eight balanced interleaved rounds collect 960 valid GPU samples/case/pose.
Each frame includes empty, LOD24, LOD12 and LOD6; pose order rotates.
The grass-only pass uses 1920 × 1080 RGBA16F, depth, 4× MSAA and game
sunlight/environment. Clear/resolve are included, measured by empty.
Ground, sky, bus, shadows, wind, postprocessing, compilation, uploads and
baking are excluded. Static matrices, submitted counts, program counts
and query validity pass checks.

| Pose | LOD24 mean / P99 ms | LOD12 mean / P99 ms | LOD6 mean / P99 ms | Empty mean ms |
| --- | ---: | ---: | ---: | ---: |
| Top, 90° | 2.371 / 4.792 | 1.774 / 4.051 | 1.374 / 3.674 | 0.332 |
| Oblique, 45° | 1.696 / 4.147 | 1.334 / 3.540 | 1.105 / 3.276 | 0.368 |
| Grazing, 8° | 1.437 / 3.584 | 1.325 / 3.754 | 1.124 / 3.541 | 0.454 |

| Pose | LOD12 saving vs LOD24 | LOD6 saving vs LOD24 | LOD6 saving vs LOD12 |
| --- | ---: | ---: | ---: |
| Top, 90° | 0.598 ms (25.2%) | 0.997 ms (42.0%) | 0.399 ms (22.5%) |
| Oblique, 45° | 0.361 ms (21.3%) | 0.591 ms (34.8%) | 0.229 ms (17.2%) |
| Grazing, 8° | 0.112 ms (7.8%) | 0.313 ms (21.8%) | 0.201 ms (15.1%) |

| Pose | LOD24 / LOD12 / LOD6 mean above empty ms | LOD12 alpha change vs LOD24 | LOD6 alpha change vs LOD24 |
| --- | ---: | ---: | ---: |
| Top, 90° | 2.039 / 1.442 / 1.042 | 0.004% | 0.065% |
| Oblique, 45° | 1.328 / 0.967 / 0.737 | 0.019% | -0.057% |
| Grazing, 8° | 0.983 / 0.871 / 0.670 | -0.087% | -0.401% |

Every paired round favors the lower-card candidate for all three comparisons.
Approximate 95% paired-round intervals exclude zero for each comparison/pose;
full intervals are retained in the report. P99 is absolute and never
baseline-subtracted. The higher LOD12 grazing P99 does not establish a
tail-latency regression from this single run.

Round-end GPU clocks range from 967 to 1942 MHz and utilization from 25% to
38%. The desktop GPU is not isolated or clock-locked. Compare paired cases;
do not treat these as fixed peak-clock or full-game timings.

LOD3 · 6 is the fastest option in each pose; LOD3 · 12 is intermediate.
Relative to LOD24, LOD12 saves 7.8–25.2% of mean pass time, and LOD6 saves
21.8–42.0%. LOD6 saves a further 15.1–22.5% compared with LOD12.
Total alpha coverage differs by less than 0.41% in all poses, while fine
silhouette and shading differences remain possible. Final alpha does not
measure intermediate fragment overdraw.

Reproduce with `tests/headless/perf/specs/grass_lods_500k.pwtest.js`;
see `tests/headless/perf/README.md`.
[Archived report](../../tests/artifacts/screens/grass_debug_v2/benchmark_archive/20260925T040851Z_lods_500k/report.md),
[raw samples](../../tests/artifacts/screens/grass_debug_v2/benchmark_archive/20260925T040851Z_lods_500k/results.json), and full-resolution
[top](../../tests/artifacts/screens/grass_debug_v2/benchmark_archive/20260925T040851Z_lods_500k/top-comparison.png),
[oblique](../../tests/artifacts/screens/grass_debug_v2/benchmark_archive/20260925T040851Z_lods_500k/oblique-comparison.png), and
[grazing](../../tests/artifacts/screens/grass_debug_v2/benchmark_archive/20260925T040851Z_lods_500k/grazing-comparison.png) comparisons.
Each comparison places LOD24, LOD12 and LOD6 left to right.
