# Calibrated gameplay performance investigation

Date: 2026-09-10

The reported symptom is repeated fast/slow periods after the lighting calibration.
The starting revision is `851309d`; preceding work was committed before investigating.

## Reproduction

Select `tests/headless/e2e/calibrated_performance_cycle.pwtest.js` in
`tests/.selected_test`, then run `node tools/run_selected_test/run.mjs`.
The capture uses the `civic_center_curve_front` pose, 1280×720, current defaults,
and waits for both baked channels and the prepared game view. Video and tracing
are disabled. `PERF_CAPTURE_NAME` names the artifact directory, `PERF_SECONDS`
controls its duration (default 45), and `PERF_LIVE=1` resumes simulation.
`PERF_POSE` optionally reads a copied gameplay-pose JSON file; `PERF_ROUTE=1`
repeats a scripted 16-second approach through the low-rise district. The route
does not require an external pose file. `PERF_WIDTH` / `PERF_HEIGHT` set the
viewport. CPU profiling is opt-in (`PERF_PROFILE=1`); leave it off for timing
comparisons. It changes the workload and must not be mixed with unprofiled runs.

Artifacts are under `tests/artifacts/screens/calibrated_performance/` and ignored.
Each capture records raw frame time, CPU phase timings, unique GPU timer samples,
heap, draw/program counts, bake generation, resolved graphics settings and render
dimensions. Optional CPU profiles are saved separately. Route GPU samples are
joined to the submitting frame by submission sequence, then grouped by lap and
one-metre Z-progress in `route-buckets.json`. A delayed HUD reading is not used
to assign a GPU spike to a position.

For independent memory resets, invoke the runner separately for each capture
name. Each invocation launches and closes its own browser process/profile;
reloading a page or clearing only browser storage is not equivalent. Keep GPU
runs sequential. Exclude the first second and route wrap when comparing spots,
and distinguish first-lap shader warm-up from warmed passes.

## Experiments

| Capture | Conditions | Result |
| --- | --- | --- |
| `before` | 45 seconds, paused simulation and fixed camera | Bake generation stayed 2; 591 draws and 137 programs throughout. After startup, about 50–56 frames/sec, 17.5–19.5 ms CPU and 7–9 ms GPU. No repeating large slowdown reproduced. |
| `live-before` | 180 seconds, simulation running and fixed camera | Approximately 50 FPS, drops into the low 30s at seconds 13–15 and 25–51, then recovery. Bake generation/program count stayed fixed. CPU costs increased across phases during the slow periods; source validation still accounted for about 30% of frame CPU time. |
| `typed-fields-trial` | Store validation snapshots by property instead of a mixed array; 45 seconds live | Warm validation remained about 5.3 ms; no meaningful improvement. Reverted. |
| `bounds-after` | 180 seconds live, reusable rigid shadow bounds | Shadow preparation median 0.4 ms (previous warmed median 1.6 ms). Bake/program counts stable; no page errors. Whole-frame CPU median 22 ms and 38–46 FPS, so this run does **not** demonstrate a whole-game FPS improvement. Other unchanged phases also ran slower. |
| `route` | Six stationary low-rise poses; separate GPU queries for each render pass | Main render dominates (roughly 7.8–13.1 ms mean GPU), dynamic AO depth 1.2–2.2 ms, dynamic sun shadow about 0.05 ms. Bloom is skipped in these views. Shadow draw counts in this initial artifact are invalid due to `renderer.info.autoReset`; the recorder was corrected. GPU timings are unaffected. |
| `lowrise-full` | 35 seconds, stationary low-rise pose, CPU profiler enabled | About 12 ms GPU after warm-up; no recurring large burst. Validation around 6 ms CPU remains a cost. |
| `lowrise-moving` | Four scripted passes at 1280×720, CPU profiler enabled | Larger slow periods occur at different positions on different laps. CPU costs across unchanged phases rise together. This does not isolate a location-specific rendering fault. |
| `lowrise-schema-trial` | Group freshness readers by full object shape/prototype | Validation 5.9 ms versus 6.1 ms; other unchanged phases also improve. No convincing isolated benefit. Reverted. |
| `lowrise-video-resolution` | Fresh Chrome; three passes at 1900×883; no profiler | CPU median 23.5 ms, p95 25.9 ms. Repeatable GPU view cost increases toward the end, but no one-second bucket exceeds 20 ms after startup. This initial capture used delayed latest GPU values; following captures use unique submitted-frame samples. |
| `lowrise-fresh-02` | Another fresh Chrome; same three passes and viewport | Per-lap GPU medians 12.86 / 12.66 / 11.20 ms, p95 15.81 / 15.70 / 14.18 ms (excluding wrap/start). No one-metre bucket has a median above 20 ms. |
| `lowrise-fresh-03` | Another fresh Chrome; same three passes and viewport | Per-lap GPU medians 11.40 / 11.40 / 11.32 ms, p95 14.43 / 14.83 / 14.67 ms. No one-metre bucket has a median above 20 ms. |
| `lowrise-fresh-04` | Final recorder validation, another fresh Chrome; same three passes, profiler off | First-lap GPU median 16.13 ms / p95 24.09 ms; later laps 12.07 / 11.67 ms median and 16.56 / 15.17 ms p95. First-lap slow areas do not repeat on the following laps. CPU validation and main rendering both slow in the transient period. Resolved MSAA, AO, lighting and bloom settings are captured; actual render buffer is 1900×859 (24 px HUD). |

The source freshness check alone costs approximately 5.2–5.9 ms per warmed frame
(8–9 ms initially). It watches 465,798 captured fields, 12,075 shapes and 8,598
arrays. This is a measured bottleneck, not yet evidence that it causes the
reported recurring slowdown. CPU profiling also identifies precise dynamic
caster vertex bounds and synchronous GPU error checks as substantial work.
The 45-second CPU profile contains only approximately 194 ms of garbage
collection, so GC alone does not explain that capture's frame rate.

## Open questions

- User supplied a driving video: the reproducible area is the right turn toward
  the small buildings around seconds 27–30, not a stationary-only scenario.
- Do slow frames correlate with CPU phases, GPU time, resource churn or camera visibility?

## Driving video evidence

The supplied `2026-09-10 22-28-22.mp4` is 1920×1080, duration 55.25 seconds.
Quarter-second HUD samples from seconds 20–35 are preserved under the ignored
`video/` artifact subdirectory. Around 26 seconds the GPU reading reaches
28.2–29.2 ms, drops to 18.2–19.7 ms at 27–27.25 seconds, then repeatedly rises
into 25–29 ms. Program count stays 156, texture count 116 and geometry count
3468. Draw calls rise from about 500 before the turn to 1200 around it.
The video therefore confirms view-dependent load plus shorter GPU fluctuations;
it does not show shader/material resource churn. Per-pass GPU profiling and a
repeatable pose are needed to distinguish scene work from measurement stalls.

The scripted route uses the same identifiable district as the video (large
glazed building on the left, low-rise cluster ahead, narrow tower at the road
end). It is an approximate reconstruction, not an exact replay of the user's
bus/camera transforms or saved options. The user was asked for a copied pose.
Differences in settings, camera angle and motion mean these timings cannot
disprove the original report.

Twelve passes were completed across four separate fresh browser processes at
the video-sized viewport. The view cost typically rises from about 11 ms early
in the approach to 13–15 ms later. The fourth fresh run also contains a sustained
slow first lap (roughly 22–25 ms late in the route) that disappears on both
following passes. It also has a short early-second-lap slowdown elsewhere.
Baked mode and generation remain stable; after one additional shader is
encountered on the first lap, the program count stays fixed at 141. The transient
is real but does not repeat at the same position. This is not evidence of a
completed stutter fix or enough evidence to attribute it to one subsystem.

`fresh-pass-comparison.svg` / `.json` compare the nine passes with GPU submission
provenance from the final three sessions (4 m median bins, wrap/start excluded).
The graph makes the non-repeating first-lap slowdown in `lowrise-fresh-04`
visible alongside the six more stable passes. After teardown, no Playwright
Chrome browser remained. The host had approximately 20 GB of physical memory
free; the user's normal browser remained untouched.

During the earlier moving capture, NVIDIA telemetry recorded steady 1935 MHz
graphics / 7501 MHz memory clocks in P0, approximately 59–62°C and 5.8 GB of
12 GB VRAM. Clocks dropped only after the isolated browser closed. GPU clock
cycling or exhausting VRAM was not observed in that capture. Normal user Chrome
sessions were neither closed nor cleared.

## Shadow fitting regression

The CPU profiles identify a full scan of all dynamic caster vertices every frame
in `DynamicSunShadowLayer.render`, including rigid meshes whose local geometry
never changes. The small `dynamic_shadow_bounds.pwtest.js` regression failed with
25,740 vertex reads over twelve transforms where cached local bounds suffice.

The fix reuses rigid local bounds, rebuilds on position-attribute/version changes,
and transforms them by the current world matrix. Deforming/instanced/nested cases
retain their existing detailed path. The regression now passes, including vertex
coverage after movement, edited geometry and an active morph target. No bake
validation gate or lighting parameter is removed. A matching long capture checks
the actual frame-time effect; this removes confirmed excess work, but the traces
alone do not establish that it is the sole cause of every reported slow period.

## Verification and remaining uncertainty

- Seven projection/composition/ownership Node checks pass.
- The new rigid-bounds browser regression and all three existing shared-shadow
  browser checks pass, including actual shadow pixel samples.
- Three-minute gameplay captures before and after retain baked lighting with no
  page errors, reload cycles or shader-program churn.
- OS sampling after test teardown found several busy Chrome processes in an
  existing normal browser session. Their process ancestry/profile flags confirm
  they are not leftover Playwright browsers. They were left running. This is a
  source of benchmark contention, not proof of the user's original root cause.
- The source freshness scan remains a substantial separate CPU cost. Its
  experimental rewrite was reverted because it did not improve the measurement.
- The recurring whole-game slowdown is not established as fixed. Reproducing
  the user's exact stationary/driving conditions and timing remains necessary;
  the connected browser tool exposes no tab for their existing Chrome session.

## BUSREC1 route supplied September 11

The user supplied 3,095 exact bus/camera frames, `443–1059` hex, spanning
70.045 seconds. Evidence is under `tests/artifacts/screens/recorded_slowdown/`.
The recording uses the current authored defaults, calibrated 55-degree sun,
ACES with grading off, **3520×1540 drawing buffer and 8× MSAA**. This is over
three times the pixels of the earlier approximate route tests. Baked mode stays
active at generation 2 throughout; all GPU samples have submission provenance.

| Original frame range | GPU median | GPU p95 | GPU maximum | Frame intervals over 25 ms |
| --- | ---: | ---: | ---: | ---: |
| B00–BFF | 19.12 ms | 19.87 ms | 21.78 ms | 50 / 256 |
| D00–DFF | 19.03 ms | 27.61 ms | 32.64 ms | 61 / 256 |
| 700–7FF | 24.29 ms | 28.17 ms | 31.12 ms | 141 / 256 |
| F00–FFF | 23.69 ms | 28.12 ms | 31.81 ms | 147 / 256 |

`Bxx` misses display deadlines despite relatively steady work. `D98–DAB` has
a sharper workload increase: main-scene draws reach approximately 1,200 and
total frame draws approximately 1,260, then drop toward 660. Six exact visual
passes across two separate hardware Chrome processes reproduce the costly
section. The first process has Dxx GPU p95 of 28.90 / 28.32 / 29.24 ms. The
second has 28.92 / 36.76 / 33.62 ms and also exhibits transient slow periods
elsewhere. These are actual RTX 3060 results; an initial software-renderer
attempt was stopped and excluded. The user's normal browser was untouched.

A separate diagnostic pass attributes the extra draws to the main city render,
including low-rise roots `building_47_c/d`, `building_48/c/d` and `building_49_*`.
The dynamic AO scene pass stays at 25 draws; sun bloom reports `irrelevant` and
does not render its occlusion/bloom passes. Main render CPU rises from roughly
7–8 ms to 16.5 ms. The unchanged bake-source validation costs approximately
5.5–6 ms per frame. GL error polling costs about 0.8–1 ms in this diagnostic.
The diagnostic's first scene-pass draw delta predates a counter-reset fix and
must not be used; its main city draw counts are valid.

Other isolated hitches remain distinct: `6AB` records 79 ms CPU / 69 ms GPU
with three newly observed textures; `8FF` records 78 ms CPU with ten new shader
programs and thirteen textures. These correlations warrant first-use upload/
compilation investigation, not an assertion that all hitches share one cause.

### Visibility retention defect

`StaticVisibilityRuntime` copied its previous **output** into a global grace
mask and restarted the 250 ms timer on every cell/yaw-key change. Successive
boundaries therefore prolonged roots absent from multiple successive raw masks.
A deterministic regression failed: a root that departed at 100 ms remained
visible past its 350 ms deadline after unrelated transitions at 200/300 ms.

Retention now has a deadline per root. Only departure from the raw PVS mask
starts grace; unrelated transitions cannot renew it. Reappearance is immediate
and the next departure gets a fresh 250 ms. Fallback, settings and payload
changes clear history. All eleven Node visibility tests pass, including the
new regression and shadow/auxiliary-camera visibility isolation.

Replaying the original timestamps through old/new runtimes identifies 63
affected frames in eight short sections. `DA2–DAB` retains up to eleven excess
roots before the fix, including three expensive low-rise buildings. This fix
addresses unnecessary retention; it does not remove legitimate visible-scene
load, the bake-validation CPU cost or the separate first-use hitches.

Paired full-resolution captures using the original timestamp-derived visibility
flags confirm the reduction without changing pixels:

| Frame | Draw calls before | Draw calls after | Changed RGB pixels |
| --- | ---: | ---: | ---: |
| DA4 | 1263 | 981 | 0 |
| DA7 | 1257 | 972 | 0 |
| DAB | 1244 | 959 | 0 |

This is approximately 23% fewer calls at these frames with the same materials,
lighting, AA and geometry. PNG pairs and `visibility-comparison.json` are under
`bounded-grace-01/`. Its three replay passes pass the config/pixel/bake checks,
but two have substantial unrelated timing fluctuations (including unchanged
B/C ranges). They cannot establish a whole-game FPS improvement. The final
pass returns to Dxx GPU median 18.40 ms / p95 26.57 ms. Report the draw reduction
as confirmed and the remaining timing variability separately.

The second fresh process after the fix (`bounded-grace-02`) completes three more
passes: Dxx GPU p95 **28.35 / 25.97 / 26.61 ms**, medians 18.84 / 18.31 / 18.31 ms.
Thus twelve full selected-range passes ran across four fresh browser processes
(six before, six after), plus one short draw-diagnostic pass. All retained baked
mode and generation, had no page errors, and matched the recording's configuration
and resolution. The production visibility payload validation also passes.
This supports the bounded retention fix and a small improvement in the cleaner
Dxx runs; it does not establish that the intermittent whole-game slowdown is
fully resolved. No graphics quality or lighting setting was reduced.
