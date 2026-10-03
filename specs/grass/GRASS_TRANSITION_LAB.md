# Grass distance-transition lab

Entry point: `debug_tools/grass_transition_scene.html`. This separate lab reuses
the authored field's grass, litter, lighting and 1K LOD4 canopy maps. The existing
single-field lab links to it and retains its manual LOD comparisons.

## Scene and selection

Four 32 × 32 m fields form a 2 × 2 layout, separated by 1 m soil paths. The total
planted area is 4,096 m². Every field contains 1 m selection cells; the same
four source quadrants from a 2 × 2 m grass template are instanced across them.
LOD0 uses the current smart geometric LOD0, not the older full reference mesh.
LOD3 uses the current compact geometric leaves. LOD4 uses the paired opaque
canopy albedo, normal and roughness maps at 1024².

The user-confirmed starting bands are:

| Level | Full distances | Half distances |
|---|---|---|
| LOD0 | 0–1 m | 0–0.5 m |
| LOD1 | 1–3 m | 0.5–1.5 m |
| LOD2 | 3–6 m | 1.5–3 m |
| LOD3 | 6–25 m | 3–12.5 m |
| LOD4 | ≥25 m | ≥12.5 m |

Distances are horizontal, from the camera's ground projection to each cell's
center. This lets the 4.5 m-high gameplay bus camera exercise near bands.
At an exact threshold the cell selects the more distant level. A 1 m cell
introduces up to approximately 0.71 m of spatial quantization. Switching is
abrupt: no opacity fade, dither or overlapping LOD draws are used.

The bus front, rear and field-border presets use the same gameplay height,
pitch and 55° vertical field of view. An overhead preset exposes the assignment
layout. WASD moves along the horizontal plane using the camera heading,
independent of its tilt; Q/E lowers/raises the camera. Middle-mouse drag looks
around. R restores bus height (4.5 m), bus downward tilt and zero roll while
preserving horizontal position and heading. It does not trigger while editing
controls. Reset view still returns to the entire selected preset. Speed and
forward driving help inspect moving borders.

## CPU and draw-call policy

Selection compares squared distances and reuses typed arrays. With the default
settings, it scans only after at least 0.25 m of horizontal movement and at
least 100 ms since the last scan. Stationary and rotation-only frames perform
no cell scan. Editing limits or choosing a preset forces an immediate refresh.
Both gates can be edited, including zero for a per-moving-frame comparison.

Per-field, per-LOD and per-template instancing uses 80 original main batches,
plus four flat interior LOD4 batches (one per field). Instance buffers upload
only when batch membership changes. Whole-field
batch bounds support normal frustum culling; this first version does not cull
individual instances on the CPU each frame. Snapshots expose selection scan
time, skips, visited cells, changes, instance uploads and application time.

LOD0–3 cells use one merged litter/soil ground layer. LOD4 replaces that ground
with its opaque canopy. Soil-only mode replaces all field surfaces with soil;
paths and surroundings have holes under the fields, avoiding a second floor.
Field bevels and LOD2 fringe leaves occur only at actual field perimeters.
An exposed LOD4 edge next to a geometric LOD slopes down over 5 cm to meet
the litter floor, closing the otherwise visible gap beneath the raised canopy.
Adjacent LOD4 cells stay flat and continuous; no duplicate fringe grass or
opacity transition is added at internal cell borders.
World-space UVs preserve the canopy pair's phase across instance boundaries.

LOD4 side/fringe leaves are omitted when their selection cell's horizontal
distance exceeds 35 m. The separate `LOD4 sides (m)` control adjusts this
absolute cutoff; full/half presets do not scale it, and zero hides all side
leaves. Visibility is classified in the same cached distance scan as the LOD,
including updates that cross only the side-leaf cutoff. Hidden fringe instances
are removed from draw batches, while the canopy surface and cached shadows
remain unchanged. LOD0–3 leaves are unaffected.

The scene caches an 8192² directional shadow map from LOD2 geometry. Distance
selection changes reuse it. Switching to/from soil-only regenerates the cache
outside benchmark samples. LOD4 uses its baked tile self-shadow visibility,
using a compile-time baked-only shadow path because this lab has no external
occluders. It eliminates the white external-visibility lookup and unused live
shadow branch after baking. The shared canopy material defaults to the general
path, preserving external shadows in the single-field lab. Any future external
occluder in this lab must opt out of `GRASS_CANOPY_BAKED_SHADOW_ONLY` and provide
the matching external-visibility cache.
Canopy self-shadow maps remain separate. This lab
does not include the single-field lab's shade-screen object.

## Helpers and measurement

Colored cell overlays, field outlines and labeled distance rings show the
selected LOD areas. The legend lists cell counts. Helpers can be hidden and
are disabled for all timing samples. The HUD's GPU number is explicitly the
total scene cost; the benchmark report subtracts a matched soil-only baseline.
The bottom status also shows actual submitted triangles and draw calls from
the renderer's accumulated frame counters, including postprocessing and any
enabled helpers. Frustum-culled batches are excluded; these counts differ
from the field snapshot's total assigned geometry. Reading the counters adds
no extra render or per-mesh traversal.

The `Configuration` selector also offers `LOD4 only · flat, no sides`, linked
by `?configuration=lod4-flat`. It forces all 4,096 cells to LOD4, replaces each
canopy grid with a two-triangle horizontal quad at the existing canopy height,
and omits the bevel, side leaves, and all LOD0–3 geometry. Soil is not drawn
below the canopy. Distance controls are disabled but retain their values.
Returning to `Distance LODs` restores normal selection and beveled geometry.
Flat mode performs no distance scans or instance uploads while moving; helpers
can still display cell colors/outlines, but distance rings are hidden.
The shadow cache in flat mode contains no hidden LOD2 casters. Switching
configurations refreshes it once; tile self-shadow visibility remains baked.
Each LOD control stacks its label, full-distance input and half-distance readout
in one column. Equal-width full/half preset buttons align with those two rows.

Run the focused E2E through `node tools/run_selected_test/run.mjs` with
`tests/headless/e2e/grass_debug_v2_transition_scene.pwtest.js` selected.
Pure selector behavior is covered by
`tests/node/unit/grass_debug_v2_transition_selection.test.js`.

The scene E2E validates every cell's selected level and single ground surface,
stationary/rotation reuse, movement gates and the three gameplay camera poses.
GPU probes check world-continuous soil/canopy UVs and the internal edge height.
The half-range capture checks the former dark gap, while the compiled shader
check verifies the baked-shadow branch and white external visibility texture.

For hardware timing, select
`tests/headless/perf/specs/grass_transition_lab.pwtest.js` and set
`GRASS_TRANSITION_BENCHMARK=1`. The benchmark uses 1920 × 1080 at DPR 1,
three fixed bus poses and one matched moving path. Soil-only, full distances
and half distances first receive an untimed 120-frame startup soak at every
fixed pose, then rotate order across six rounds. Each block has 30 warmup
frames and 60 measured GPU queries. Preparation and shadow regeneration are
outside measured blocks. Invalid/disjoint or software-GPU timings fail.

The report presents total scene GPU time and paired **grass scene minus soil
scene** time, with intervals calculated from the six round means. CPU frame
submission, selection scans and buffer application are reported separately.
The difference includes litter and canopy work, not just leaf triangles.
Artifacts, captures and raw samples live in the gitignored directory
`tests/artifacts/screens/grass_debug_v2/transition_lab/`.

The 2 m source repeats intentionally so this lab isolates LOD behavior. It is
not a new procedural field-distribution system. Abrupt silhouette and texture
changes remain visible at cell boundaries and are subjects for the next tuning
pass; the scene intentionally does not conceal those differences with fading.

## Initial hardware measurements

Measured before the side-leaf cutoff optimization on 2026-10-02 using Chrome/ANGLE Direct3D11 on an NVIDIA GeForce
RTX 3060, at 1920 × 1080 and DPR 1. These are paired mean GPU milliseconds
**above the matching soil-only scene**, including litter, canopy and leaves:

| View | Full distances | Half distances |
|---|---:|---:|
| Bus front | 3.286 ms | 2.647 ms |
| Bus rear | 3.376 ms | 2.690 ms |
| Field border | 3.545 ms | 2.192 ms |
| Moving border | 3.952 ms | 2.049 ms |

The three stationary views average 3.402 ms versus 2.510 ms of additional
GPU cost (about 26% less at half distances). The full ranges remain the default
because the half preset brings the visible flat-canopy boundary to 12.5 m.
The report contains all individual samples, total costs and confidence
intervals; desktop GPU workload and clocks were not locked.

Stationary and rotation-only frames need no repeated selection scans. The
moving benchmark averages 9–10 scans per 60 rendered frames. Selector plus
instance-update CPU cost averages 0.201 ms/frame at full distances and
0.126 ms/frame at half distances, versus 0.629 and 0.386 ms when recalculating
each moving frame. This is approximately a 68% / 67% reduction in that CPU
work, not in total frame time.

An earlier complete run showed startup timing variation and is retained under
`transition_lab/post_fix_initial/`; the final complete repeat adds the startup
soak described above. Neither run filters individual samples or outliers.
An initial implementation's pre-repair measurements are separately retained
under `transition_lab/before_fix/` and are not the final reported strategy.

## Almost-all-LOD4 cost audit

The screenshot configuration (0.1 / 0.2 / 0.3 / 0.4 m, half preset,
5 m side-leaf cutoff) is reproduced by the opt-in hardware test
`tests/headless/perf/specs/grass_transition_lod4_cost.pwtest.js`, using
`GRASS_TRANSITION_BENCHMARK=1` through the standard runner.
Artifacts and the readable report are under `transition_lab/lod4_cost/`.

The 2026-10-02 audit checked one ground surface per cell, opaque depth-writing
canopy materials (no alpha test or blending), and zero shadow-map submissions
on steady frames. The front view submits 131,095 triangles / 19 calls versus
8,247 / 7 for soil. Its 4,095 visible canopy instances each submit 32 triangles;
the one LOD0 cell and the near side-leaf batches are outside the camera frustum.
The grid supports perimeter and exposed-LOD boundary ramps, but still uses
that same grid in flat interiors. There is no extra soil beneath the canopy.

At 1920 × 1080, DPR 1, on the RTX 3060, six rotated timing rounds produced:

| Bus view | LOD4 above soil | Single texture scale above soil | Soil shader on canopy geometry above soil |
|---|---:|---:|---:|
| Front | 2.543 ms | 2.555 ms | 0.494 ms |
| Rear | 2.315 ms | 2.290 ms | 0.215 ms |
| Border | 2.009 ms | 2.017 ms | 0.265 ms |

Both diagnostic substitutions retain instance and triangle counts. The soil
material does not apply the canopy's vertex bevel, so it is not a pure
geometry-only measurement. Its large saving points to canopy shading as the
main overhead; reducing only the distance-scale blend gave no measurable
benefit in these views. The full material includes normal/roughness and baked
visibility sampling, separate grass/litter lighting, view coverage, and the
near/far radiance blend. These diagnostics do not change production visuals.

The raw report retains all samples, confidence intervals, and three poses of
each case. GPU clocks and other desktop activity were not locked; front-view
rounds varied noticeably. Optimize the material first, then consider simple
interior quads with separate edge geometry, validating appearance and timing.

## Flat-only decomposition

Select `tests/headless/perf/specs/grass_transition_lod4_decomposition.pwtest.js`
with `GRASS_TRANSITION_BENCHMARK=1`. The test uses the flat-only configuration,
with 8,192 field triangles and no side geometry. It compares each independent
shader ablation with full LOD4 and soil within the same animation cycle,
rotating submission order. Six rounds per bus pose contain 6 warmup and 30
measured triplets, after a 60-frame startup soak per case. Pre-uploaded copies
of the existing soil batches avoid per-sample instance uploads or shadow
regeneration. Each render receives a separate GPU timer query. Helpers are off.

The initial unpaired experiment varied several-fold under desktop GPU load
and was stopped; its completed front-view data is retained under
`transition_lab/lod4_decomposition/noisy_unpaired/`. The final report uses the
paired method, all samples, and confidence intervals across six round means.
Its full-versus-full control is consistent with zero difference. Individual
feature removals affect shared calculations and compiler dead-code elimination;
their measured savings must not be added as an exact component-time breakdown.

Measured on 2026-10-02 at 1920 × 1080, DPR 1, RTX 3060:

| Experiment | Front | Rear | Border |
|---|---:|---:|---:|
| Full flat LOD4 above soil | 0.850 ms | 0.850 ms | 0.680 ms |
| Extra cost of 32-triangle flat cells vs 2-triangle cells | 0.832 ms | 0.652 ms | 0.454 ms |
| Saving from 8× to 4× anisotropic filtering | 0.404 ms | 0.464 ms | 0.293 ms |
| Saving from removing all shadow visibility | 0.633 ms | 0.550 ms | 0.583 ms |
| Saving from removing HDR environment lighting | 0.261 ms | 0.216 ms | 0.191 ms |

The normal-detail, angular-color, view-coverage, standard-direct-lighting,
specular-only and single-texture-scale removals did not show a reliable saving
across these views. Normal RGB and roughness G share textures with grass
coverage/litter RGB; the flat-normal experiment retains the alpha sample and
does not claim to eliminate the normal-map fetch. Unlit-albedo and constant
color cases provide lower bounds, with visible loss of lighting fidelity.

A follow-up (`GRASS_LOD4_VISIBILITY_FOLLOWUP=1`) kept baked tile shadows and
removed only the white external lookup and live-shadow branch. It saved
0.680 / 0.550 / 0.515 ms for front/rear/border, leaving
0.216 / 0.299 / 0.178 ms above matched soil. All three captured scene regions
(1,286,400 pixels each, excluding UI/telemetry) matched full LOD4 exactly.
This identifies overhead in the general shadow path; discarding self-shadows
is not required for that saving. The fast path is now enabled for transition
canopy materials after baking. Scenes with external occluders retain the general
path. Filtering and geometry changes remain isolated experiments.

Raw samples, three poses per experiment, the interactive report, the follow-up
and pixel-equivalence measurements are under
`tests/artifacts/screens/grass_debug_v2/transition_lab/lod4_decomposition/`.
The scene E2E checks preset switching, flat geometry, zero fringe instances,
retained distance settings, and no per-movement scans/uploads/shadow rebuilds.

## Elevation, fringe and shadow factors

The Configuration selector additionally exposes `lod4-ground` (two-triangle
cells at ground level), `lod4-elevated` (the existing 10 cm canopy and 5 cm
perimeter ramp), and `lod4-elevated-sides` (that canopy plus side grass).
All force 4,096 LOD4 cells without a ground layer underneath. The side-grass
preset has its own cutoff input, sharing the retained 35 m setting. It uses
the cached movement/interval gate and classifies only true perimeter cells.
The other forced presets do no moving-camera selection scans. Distance ranges
remain disabled and preserved while any forced LOD4 preset is selected.

The Shadows checkbox disables renderer shadow mapping, including LOD4's
baked visibility multiplication. Authored texture color and ambient occlusion
remain. Re-enabling refreshes the cache once, outside steady-frame timings.

The opt-in `tests/headless/perf/specs/grass_transition_lod4_factors.pwtest.js`
compares 13 cases in front/rear/border bus poses. A same-geometry height change
isolates elevation; a flat 32-triangle grid isolates tessellation; enabling the
vertex ramp isolates bevel deformation; 35 m and 200 m side-leaf cutoffs then
isolate fringe geometry. Shadow probes separately remove tile visibility,
scene shadow receiving, or all shadow mapping. The previous general shader is
retained only on benchmark clones for paired performance and pixel equivalence.

Each animation cycle submits the variant, its named reference, and each one's
matched soil baseline in rotating order. All receive separate hardware GPU
queries. Six rounds use six warmup and 30 measured quartets after program/texture
warmup. Prebuilt empty and grass shadow caches and pre-uploaded soil/fringe
batches avoid shadow rendering, instance uploads and LOD scans during sampling.
Disabling scene shadows still retains the baked canopy visibility; disabling
all shadows compiles out shadow mapping. Shadow toggle setup is outside the
reported CPU submission timer. CPU numbers describe render submission, not
interactive checkbox changes. Confidence intervals use the six round means;
all samples are retained. Independent ablations are not additive stage timers.

Artifacts, raw timings, draw audits, pixel-equivalence checks and the interactive
three-pose comparison are under `transition_lab/lod4_factors/` within the usual
`tests/artifacts/screens/grass_debug_v2/` root.

The 2026-10-02 run (RTX 3060, 1920 × 1080, DPR 1) measured these GPU milliseconds
above each configuration's matched soil baseline:

| Configuration | Front | Rear | Border |
|---|---:|---:|---:|
| Optimized raised quad, no sides | 0.299 | 0.292 | 0.355 |
| Elevation + bevel, no leaves | 0.722 | 0.732 | 0.594 |
| Elevation + side grass within 35 m | 0.746 | 1.072 | 0.829 |
| Same elevation + side grass, all shadows off | 0.678 | 0.871 | 0.586 |

Paired comparisons showed a 0.512 / 0.627 / 0.526 ms saving from the production
shadow fast path. Adding the flat 32-triangle grid cost 0.459 / 0.391 / 0.548 ms;
adding side grass within 35 m cost 0.050 / 0.384 / 0.259 ms. Grid cost is separate
from elevation: height alone and bevel deformation did not show a consistent
significant penalty across all views (height in the border pose added 0.091 ms).
Removing every shadow from the side-grass case saved 0.191 / 0.190 / 0.306 ms
of raw scene GPU time, but also made the grass visibly brighter. Disabling
only scene-shadow receiving did not produce a reliable saving across views.
All steady-frame shadow-map draw counts were zero.

The report preserves confidence intervals and raw totals: desktop GPU clocks
were not locked, so absolute costs from different blocks should not be
subtracted. The equivalent-shader recheck differed by at most one RGB level
in 14 / 17 / 12 of 2,073,600 pixels. The initial strict bit-exact assertion
failed on 12 one-level pixels in the border view; timings had completed and
were retained. A capture-only replay completed the visual checks and cleanup
using the documented one-level tolerance. This replay is available with
`GRASS_LOD4_FACTORS_CAPTURE_ONLY=1`; it never replaces timing samples.

`grass_debug_v2_canopy_external_shadow.pwtest.js` separately verifies the
single-field lab retains the general material and a nonconstant 2048² external
visibility cache. Replacing that cache with white brightened 9,670 probe pixels;
the transition optimization did not remove the shade-screen shadow.

## Interior quads and retained rendering versions

The default `LOD4 version` is `Interior quads + shadow fix` (`optimized`).
An LOD4 cell uses a two-triangle quad if it is away from the true field
perimeter and all four orthogonal neighbors are also LOD4. Other LOD4 cells
retain the original 32-triangle grid, its field bevel and its exposed-LOD
boundary ramp. World-space texture coordinates preserve the phase when a
cell changes batch. Classification runs during changed assignment rebuilds,
not every frame. Side grass retains its independent distance cutoff.

The selector also provides `Shadow fix only` (`shadow`) and
`Original · before both fixes` (`original`). The latter restores both the
general shadow shader and the grid for every LOD4 cell; it reconstructs the
rendering strategy before the two optimizations within the same current scene.
All versions share camera, distances, assets and texture memory. URL parameter
`optimization=original|shadow` retains the comparison choice. Version changes
do not regenerate shadows. The four new instance buffers require 256 KiB;
retained original materials share textures and shader uniform state.

With all 4,096 cells in LOD4, 3,600 interior cells use quads and 496 edge cells
retain grids. Canopy triangles fall from 131,072 to 23,072 (82.4% fewer), before
fringe leaves, culling and scene/postprocessing geometry. Up to four extra
visible draws trade a small submission overhead for much less tessellation.
The explicit ground/flat diagnostic presets remain two-triangle cells in all
versions because those configurations intentionally have no bevel.

The opt-in `tests/headless/perf/specs/grass_transition_lod4_versions.pwtest.js`
compares all three versions against soil in six rotated/reversed paired rounds
of 30 same-animation-cycle quartets. Every camera/version gets 45 startup
frames and each round gets six warmup quartets. Frozen copies of production
batches preserve instance-specific edge flags while sharing materials and
textures. Shadows are enabled, cached, and never regenerated in timed frames.
It also captures all versions in three poses for forced LOD4, full distances
and half distances, followed by three real 60-frame moving-camera checks per
version. Earlier factor/shadows-disabled reports remain available unchanged.

2026-10-02, RTX 3060, 1920 × 1080, DPR 1; GPU milliseconds above matched soil:

| Configuration / view | Original | Shadow fix only | Interior quads + shadow fix |
|---|---:|---:|---:|
| LOD4 + sides / front | 1.454 | 1.032 | 0.649 |
| LOD4 + sides / rear | 1.466 | 0.861 | 0.671 |
| LOD4 + sides / border | 1.088 | 0.522 | 0.290 |
| Full distances / front | 2.280 | 2.059 | 1.920 |
| Full distances / rear | 2.101 | 2.043 | 1.844 |
| Full distances / border | 2.180 | 2.177 | 2.031 |
| Half distances / front | 1.755 | 1.399 | 1.097 |
| Half distances / rear | 1.494 | 1.190 | 0.905 |
| Half distances / border | 1.409 | 1.109 | 0.933 |

Desktop GPU clocks and load were not locked. In particular, the LOD4 front
and rear absolute estimates have wide confidence intervals. Paired savings
against the original are consistently positive in all nine configurations.
The geometry-only saving versus shadow-fix-only crosses zero at 95% confidence
for LOD4 rear and full-distance front; do not claim a proven improvement in
each individual view. No samples are filtered. The report retains round means,
confidence intervals and raw samples under `transition_lab/lod4_interior_quads/`.

Across the nine image comparisons, optimized-versus-original mean RGB error
is at most 0.056 of 255 and the 99th-percentile pixel error is one RGB level.
The images are visually equivalent but not bit-identical: the largest isolated
channel difference is 37, with at most 93 of 2,073,600 pixels differing by more
than eight. The scene E2E additionally checks one surface per cell, interior
classification, exposed edge flags, world UV continuity and all three versions.
There are no GL/browser errors or steady-frame shadow submissions.

Each 3 m camera drive required eight selection scans over 60 frames. Mean
selection plus batch-update cost was 0.129 / 0.120 / 0.118 ms per rendered frame
for original / shadow-only / optimized, respectively. These CPU measurements
are a cache/regression check, not evidence of a CPU speedup.
