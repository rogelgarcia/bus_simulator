# DONE — AI 572: Budgeted nearby GPU resource preparation

Completed September 17, 2026. Implementation, repeated verification, image evidence,
costs and remaining limitations are recorded below. No lighting/shadow quality
settings or baked assets changed.

# Problem

The game occasionally freezes when previously unseen buildings enter visibility.
The latest investigation identified repeatable first-use texture uploads and
geometry initialization. They disappear on subsequent route laps. Preparing all
resources synchronously at startup would move the freeze instead of resolving it.

The user accepts the remaining lighting parity differences (approximately 2% and
6%). Keep the calibrated lighting and shadow quality unchanged.

# Request

Prepare nearby textures and geometry gradually before they become visible, with
a per-frame work budget. Implement and validate this in normal gameplay, so the
first drive benefits without needing a prior benchmark lap.

Tasks:
- Prepare the actual GPU resources, including necessary first-use setup, rather
  than stopping at network fetch or image decoding.
- Prioritize resources likely to become visible soon using scene proximity and
  camera/movement information. Preserve existing visibility and culling behavior.
- Bound preparation time, queued work, upload volume, and extra resident memory.
  Respect available frame headroom and report missed deadlines or overruns.
- Preserve all lighting, shadows, materials, texture resolution/mips, geometry,
  LOD quality, exposure, tone mapping, baked data, and rendered scene content.
- Validate the same route in cold and warm conditions, retain image evidence,
  and provide measured before/after performance and memory results.

## Evidence and starting point

Read `debug_tools/regression_debugging/occasional_hitches.md` first. It contains the
durable findings, attribution limits, and artifact references. Investigation began
at `6a619a2`, after AI 571's finer facade lightmaps were installed. The subsequent
diagnostic changes do not modify production rendering.

Three fresh private Chrome processes, each replaying three 2,518-frame laps,
produced 22,662 measured frames. Conditions: RTX 3060 / ANGLE D3D11, 3520x1540
drawing buffer, device scale 2, current authored defaults, physics paused, exact
recorded visual camera/bus poses. Baked lighting stayed active with a constant
generation. No page errors or GPU disjoint events occurred in the valid runs.

| Source frame (hex) | New geometries | New textures | Ordinary first-lap GPU range |
|---|---:|---:|---:|
| 2E5 | 2 | 3 | 60.22–82.62 ms |
| 30B | 60 | 3 | 68.94–79.74 ms |
| 36E | 376 | 0 | 72.34–86.89 ms |
| 42C | 188 | 0 | 37.66–42.74 ms |

All four events recur at exactly these frames in all three cold laps and disappear
on warm laps. There is no new shader-program count at these events. Shadow-stream
work is absent except for one overlapping 0.4 ms upload, insufficient to explain
the stalls. This is distinct from continuous baked-light cost or bake reactivation.

A separate instrumented run timed texture upload calls at 51.90 ms and 42.80 ms
CPU at 2E5 and 30B. At 36E it observed 2,108 bufferData calls / 21,331,748 bytes;
at 42C, 1,054 calls / 13,506,200 bytes. The bufferData JavaScript time alone was
only 3.2/2.2 ms: geometry/attribute setup, drawing, and driver work also matter.
Do not attribute the whole renderer stall to those GL calls. Image-source upload
bytes were not measured accurately; typed-array byte counts do not cover DOM images.

Ordinary cold GPU maxima were 72.34/86.89/82.62 ms. A separate stationary control
held source pose 0x300 for 3,332 frames: GPU medians 18.87–19.03 ms and maxima
24.08–25.48 ms. Instrumented results include overhead and must remain separate
from ordinary benchmark distributions.

Two warm outliers remain unproven: fresh-05 lap 3 has GPU 56.28 ms at 0x321 without
resource growth, and CPU 95.70 ms at a different frame, 0x488 (54.8 ms receiver
validation, GPU 29.40 ms). Do not claim resource preparation fixes these. Preserve
validation correctness and profile further only if needed to explain residuals.
Two diagnostic startups hit the existing 90-second lighting preparation deadline;
they are excluded from timings. Do not weaken readiness gates or raise production
timeouts to conceal startup regressions.

## Implementation plan

- [x] Establish a repeatable before measurement with the current diagnostic tools.
  Inspect resource ownership, upload/first-draw paths, visibility/PVS inputs, and
  city lifecycle. Confirm which resources account for the four events.
- [x] Implement a deduplicated, prioritized preparation queue that works for any
  route, including turning and reversing. Keep GPU lifecycle work in the graphics
  layer and follow `ai_rules/PROJECT_CODING_RULES.md`. Do not hardcode these frames,
  buildings, or saved poses as production priorities.
- [x] Enforce explicit per-frame scheduling and memory limits. A single texture
  upload already blocks for tens of milliseconds: merely scheduling that same
  operation in a later animation frame is insufficient. Investigate smaller
  preparation units or staging where required while preserving final pixels and
  mip behavior. Measure CPU submission and deferred GPU cost. Document unavoidable
  non-preemptible operations rather than claiming an unverified hard time limit.
- [x] Handle shared resources, disposal, city changes, cancellation, context loss,
  and stale queued work safely. Avoid repeated uploads, duplicate allocations,
  resource-reference leaks, and unbounded resident growth. Do not dispose resources
  still owned by visible objects or other users. A visible preparation miss must
  render correctly; no hidden objects, placeholder materials, or delayed pop-in.
- [x] Keep preparation incremental through startup, driving, fast turns and
  teleports. Do not synchronously warm the whole city, move the hitch into loading,
  or allow an unbounded asynchronous backlog. Coordinate with existing background
  work rather than treating each system's budget as the entire frame budget.
- [x] Add lightweight diagnostics for preparation CPU time, submitted work/bytes,
  queue depth, resource readiness/misses, overruns, and extra residency. Extend the
  existing replay tooling when needed; expensive GL profiling stays opt-in.
- [x] Add focused behavioral tests for budgeting, deduplication, cancellation,
  resource ownership and visible misses. Update relevant specs/tool documentation
  and append findings, decisions, changed file paths and evidence to this prompt.
- [x] Run the validation below and resolve regressions before marking complete.

## Reproduction and validation

Use `tools/gameplay_recording/README.md`,
`tests/headless/e2e/gameplay_recording_replay.pwtest.js`, and
`tools/gameplay_recording/analyze_replay.mjs`. Use the standardized selected-test
runner. The input is `tests/artifacts/screens/baked_activation_stutter/route.busrec`,
source frames 0x120–0xAF5. Use `REPLAY_SETTINGS=current-defaults` explicitly and
retain both recorded and actual settings. If the ignored recording is unavailable,
report that limitation; do not present another route as the same reproduction.

Existing ordinary evidence lives under
`tests/artifacts/screens/recorded_slowdown/hitches-20260914-fresh-03/`, `fresh-04/`
and `fresh-05/` (each name has the full `hitches-20260914-` prefix).
Combined analysis is `hitches-20260914-analysis-03/`; separate resource profiling
and stationary controls are `hitches-20260914-resources-03/` and
`hitches-20260914-diagnostic-analysis/`, under the same recorded_slowdown directory.

Save new screenshots, raw samples, traces, manifests and generated reports under
`tests/artifacts/screens/ai572_nearby_resource_preparation/` and keep them gitignored.
If the existing replay tool's fixed output path needs extension, preserve its
artifact-root restriction. Track only code, specs and concise findings in Git.

- Repeat before and after sequentially with three fresh private Chrome processes
  and three laps per process. Match hardware, resolution, settings, startup
  readiness, source poses and sample counts. Record warm-up precisely; do not
  pre-drive the cold route or introduce test-only prewarming. Fresh processes reset
  their own resource state, not OS/driver caches. Do not close user applications or
  run competing GPU benchmarks.
- Analyze the entire route plus neighborhoods of 2E5, 30B, 36E and 42C to detect
  hitches moved earlier. Report CPU and submission-matched GPU median, p99, maximum,
  slowest 1% mean, actual frame intervals/FPS, and counts of large excursions.
  Include calls, triangles, textures, geometries, programs, preparation overhead,
  peak estimated extra GPU memory, and startup/activation time. Distinguish logical
  memory estimates from measured driver residency. FPS comes from elapsed frame
  intervals, not the inverse of GPU pass time.
- Verify baked mode/generation stability, visible-page status, GPU sample coverage
  and disjoint validity. Failed startup runs remain reported separately. Resource
  profiling must be a separate diagnostic pass, not pooled into benchmark timings.
- Require reproducible reduction of the four first-use spikes without material
  warm-route, startup, memory, or whole-route tail regressions. Set documented
  budgets from measured headroom; investigate moved stalls and report residual
  outliers honestly. Do not infer success solely from an improved average.
- Compare before/after fixed-pose images around the four events and the stationary
  control; inspect fast-turn, reverse and teleport misses. Confirm lighting,
  shadows, textures, scene geometry and visibility remain visually equivalent.
  No new bake or Blender render is needed for this resource scheduling change.

## Additional recording: left turn, September 14/15

The user supplied a second recording after commit `0873f2b` and described a subtle
slow/release pattern just after starting to drive and turning left. The trace
confirms distinct first-use stalls; three fresh-browser replays of the new turn,
three laps each, reproduced all four events at exactly the same source frames.
They disappear on warm laps. Update this task rather than creating duplicate
tickets for each resource-upload frame.

Input: `tests/artifacts/screens/recording_left_turn_20260914/route.busrec`.
Original attachment: `C:/Users/rogel/.codex/attachments/ef8e0f13-8b94-4060-ad12-cdd66662c408/pasted-text.txt`.
SHA-256: `47e1ca96c62f5b4f92088cec745f2f97b301834fde3ef9d8c60cf923fa316ae6`.
The 9,836-frame capture spans 0x132–0x279D and 214.216 seconds. First sustained
throttle is at 109.376 seconds; timestamps below are from recording start.

| Frame | Time (s) | Original CPU / GPU (ms) | New Geo / Tex / Progs | Three fresh cold CPU / GPU ranges (ms) |
|---|---:|---:|---:|---:|
| 1326 | 112.851 | 78.30 / 68.99 | 3 / 3 / 0 | 73.4–76.0 / 66.13–75.37 |
| 133F | 113.444 | 78.90 / 58.43 | 12 / 3 / 0 | 63.3–64.6 / 63.31–65.39 |
| 136E | 114.412 | 104.40 / 70.31 | 384 / 0 / 0 | 85.2–87.5 / 51.78–58.67 |
| 145B | 119.335 | 46.20 / 29.03 | 188 / 0 / 0 | 50.7–53.3 / 26.43–34.17 |

New replay range: `REPLAY_FIRST=0x12AB`, `REPLAY_LAST=0x14A0`,
`REPLAY_LAPS=3`, `REPLAY_SETTINGS=recorded`. Conditions: RTX 3060 / D3D11,
3390x1540, device scale 2, exact recorded defaults, 90 stationary warm-up frames
without pre-driving the turn. All 4,518 measured frames retain baked mode and
generation 2, with valid GPU samples and no hidden-page or disjoint event.
Artifacts: `tests/artifacts/screens/recorded_slowdown/left-turn-20260915-fresh-01/`,
`left-turn-20260915-fresh-02/` and `left-turn-20260915-fresh-03/`.

The expensive frames spend 43–80 ms in the rendering phase. No new shader programs
appear at those four points. Sun bloom is irrelevant and emits zero draws there;
shadow-stream upload cost is zero except individual 0.3/0.4 ms overlaps. This
supports the existing first-use resource attribution rather than a new shadow
filter or bake-reactivation issue. Warm event CPU times are approximately
19–30 ms and GPU times 15–22 ms; removing these spikes alone will not guarantee
60 FPS. AI 575 covers the remaining recurring cost.

Also retain these new investigation cases within the resource-preparation work:

- First visible baked frame 0x1224 initializes 702 geometries and three textures
  in the original capture (256.1 ms CPU, 612.98 ms GPU). The following frames
  include another two textures and a separate 524.5 ms CPU stall. Coordinate
  first-visible resource readiness with AI 574, which owns the long loading hold;
  do not solve this by moving an unbounded upload burst into startup.
- At 0x25CE (200.095 s), the original capture adds one geometry, 13 textures and
  10 shader programs, with 96.6 ms CPU / 30.30 ms GPU. Identify the owning pass
  before attributing it to buildings; resource counts alone cannot distinguish
  scene assets from effect targets/programs. Track bounded preparation of its
  actual dependencies if it shares the first-use cause. Keep that isolated spike
  separate from the sustained heavier view before and after it (AI 575).
  Three fresh replays starting at 0x25B0 did NOT reproduce this particular
  0x25CE allocation/program event: CPU was 33.4–36.1 ms on cold laps, with no
  new resources or bloom draws at that frame. Starting near the destination
  changes preparation and prior route history, so this does not disprove the
  original event. Reproduce its preceding route before assigning a cause.
- Frame 0x19F2 (147.002 s) adds 95 geometries and reaches 40.9 ms CPU / 31.63 ms
  GPU in the original trace. It is an additional route coverage point, not yet
  independently replayed in this follow-up.

The later short replay, 0x25B0–0x26C0, also exposes cold-only first-use costs at
0x25B6 (+6 geometries, +3 textures), 0x25C1 (+164 geometries) and 0x25C5
(+192 geometries). Across three fresh processes their CPU costs were
64.0–65.1, 57.7–58.4 and 69.3–78.1 ms; warm laps remove those resource increments
and costs fall to 20.1–24.5, 29.2–33.1 and 32.9–36.8 ms respectively. These are
additional preparation coverage for this task, not reproduced original-recording
stalls: the short replay has a different resource history from driving the full
route. Programs stay at 135 and bloom emits zero draws throughout the late replay.

Full interpretation, limitations and later-view replay findings are maintained
in `debug_tools/regression_debugging/recording_left_turn_20260914.md`.
The previously documented route remains required; the new turn supplements it.

## Additional recording: confirmed 0x98F sun-bloom initialization, September 16

The user identified slowdowns around hexadecimal 9xx in a new capture. Read
`debug_tools/regression_debugging/recording_9xx_20260916.md` for the complete
experiment, numerical projection check, limitations and artifact inventory.
Input: `tests/artifacts/screens/recording_9xx_20260916/route.busrec`.
Original attachment:
`C:/Users/rogel/.codex/attachments/41e3b4fd-9626-431b-886c-69ec1c5ad95d/pasted-text.txt`.
SHA-256: `258a60fc29c1a76c15281e5c367841901497842666b12c2f345b15ca72d874c4`.
Replay full range 0x302-0xC50, recorded settings, 3390x1540/DPR2, two laps in each
of three fresh private Chrome processes. All 14,298 frames pass the validity gates.

**A replay-order defect previously masked this event.** Normal gameplay updates
world visuals before the camera; the old test applied the camera first. The
replayer now defaults to `REPLAY_CAMERA_STAGE=state`, applying the recorded camera
through GameplayState's normal camera update point. `before-world` remains a
diagnostic control. First/last and requested poses are asserted exactly; use
`REPLAY_PROBE_FRAMES=0x98E,0x98F,0x990` to retain sun/bloom snapshots too.
Three earlier fresh processes/nine laps using the old order failed to reproduce
98F; preserve them as controls, not evidence against the user's recording.

| 0x98F timing | Original | Fresh1 | Fresh2 | Fresh3 |
|---|---:|---:|---:|---:|
| Cold CPU / GPU (ms) | 75.8 / 65.91 | 72.2 / 64.42 | 72.9 / 55.17 | 83.5 / 52.46 |
| Warm CPU / GPU (ms) | Not captured | 12.6 / 17.41 | 12.9 / 18.62 | 12.5 / 17.51 |

This event recurs at exactly 0x98F in every fresh process, adding 11 programs,
13 textures and 3 geometries. The sun-bloom CPU phase costs 55.5-65.5ms cold versus
1.8-2.2ms warm; both visits issue 40 bloom draws. A separate GL diagnostic confirms
22 compileShader, 11 linkProgram, 12 texImage2D and 14 bufferData calls at that frame.
The renderer texture increment is 13; these are different counters. Raw API
submission time does not account for all deferred driver/first-draw cost.

The responsible activation trigger is identified: `GameLoop.update` calls
`City.updateVisuals` and `SunBloomRig.update` using the previous camera, then
GameplayState updates the camera. `SunBloomOcclusionFilter._projectMeshBounds`
projects the stale billboard through the new camera. At 98F its corners span view
depth -1.152542 to +2.109684, crossing near 0.5. The conservative branch expands the
effect to the entire viewport, retaining 105 occluders and issuing 40 bloom draws
/84,576 triangles even though the sun is offscreen. Updating that same billboard
with the final camera keeps every corner at depth 0.620153 and entirely offscreen
in NDC. Numerical reconstruction matches the runtime diagnostics.

Additional requirements from that investigation (now implemented):

- [x] Fix stale sun-emitter/camera ordering, preserving correct clipping for
  genuinely visible and near-plane cases. Do not disable bloom, reduce its
  configured size/quality, or arbitrarily discard conservative bounds. Keep
  emitter/camera synchronization within the rendering lifecycle and cover both
  ordinary driving and restored/locked poses.
- [x] Cover actual first-use bloom shader/target dependencies with measured,
  bounded preparation for legitimate onscreen activation. Avoid simply moving
  the hitch to the next real sun appearance. Coordinate with resource ownership,
  resize, cancellation and disposal; distinguish CPU submission from GPU cost.
- [x] Validate this route in three fresh processes with cold/warm laps after the
  fix, plus visible/partially occluded sun, fast turns, large discs, teleports and
  resize. Save image evidence and preserve lighting/shadow quality. Revisit the
  older 0x25CE full approach with corrected replay order; similar resource counts
  alone do not establish that it has the same cause.

Two other events on this recording recur in all three cold runs and disappear
on warm laps: 0x672 adds 2 geometries/3 textures (CPU 69.5-73.4ms; GPU 55.63-73.93ms),
and 0x689 adds 39 geometries/3 textures (CPU 60.8-64.1ms; GPU 56.42-60.85ms). Neither
adds programs or bloom draws. Trace their asset ownership under this task's
existing budgeted resource preparation requirements. Baked mode/generation 2
stays stable; this is not evidence of a repeated baked-light activation.

At the end of that investigation, no production fix had been implemented. The
harness, its README and frame-recording spec were corrected, and all ordinary confirmations
plus the separate resource diagnostic passed. Artifacts use the
`9xx-20260916-ordered-01` through `03` and `ordered-diag-01` directories under
`tests/artifacts/screens/recorded_slowdown/`.

## Implementation journal — September 16/17

Chronological implementation notes follow. Pilot failures and superseded
measurements are retained; final acceptance uses only the final cohorts below.

- Added the final-camera emitter update in `src/app/core/GameEngine.js`.
  The new `tests/headless/e2e/nearby_gpu_preparation.pwtest.js` failed before the
  one-line fix and passes afterward, including restored poses and a visible sun.
- Added `src/graphics/visuals/preparation/PreparationQueue.js`,
  `NearbyGpuPreparation.js`, `StagedImageTexture.js`, and
  `BloomResourcePreparation.js`, initially awaiting whole-route measurement.
  The queue deduplicates resources, prioritizes proximity/view direction, and
  budgets inspection, submissions, bytes, pending work and estimated residency.
  Texture rows use a private staging allocation; only a complete image is copied
  into the renderer-managed source texture. A visibility miss uses the normal
  complete upload. Original geometry/materials/texture ownership is preserved.
- Initial behavioral validation passes: three scheduler tests and four browser
  tests covering shared geometry, ordinary draw counters, cancellation/disposal,
  stale textures, visible misses, sRGB/linear/flip-Y/alpha/mips, bloom dependencies,
  resize, and camera synchronization. ImageBitmap alpha conversion differs by
  at most one 8-bit channel unit in synthetic translucent cases; retain this
  explicit tolerance and inspect actual scene image differences separately.
- Single driver operations (allocation, copy/mip generation, buffer upload,
  program linking/first draw) cannot be interrupted. Scheduling uses measured
  CPU deadlines between units, byte/step limits, and overrun counters; it is not
  a guarantee that every GPU command finishes within 1 ms.
- Extended `tests/headless/e2e/gameplay_recording_replay.pwtest.js` with isolated
  source snapshots, restricted artifact roots, preparation diagnostics,
  optional ownership traces and post-measurement fixed-pose captures.
- New artifacts are under `tests/artifacts/screens/ai572_nearby_resource_preparation/`.
  `before-src/` contains the `7eb31f8` GameEngine used for baseline requests.
  `run_cohort.ps1` runs fresh private browsers. Before-original-01 and -02 pass
  the replay correctness gates (three laps each). A competing background Blender
  render was detected before launching the third run; -02 is suspect and must
  not enter the final clean timing comparison. Later clean confirmation replaces it.

### Pilot findings and corrections

- The first implementation pilot is rejected: `pilot-original-01` moved work
  into repeated main-thread image crop stalls (preparation p99 17.3 ms) and
  overprepared shared texture clones. `diagnostic-original-01` attributes
  4,458.8 ms across 369 crop requests, max 18.6 ms, to `createImageBitmap` on
  DOM images. GPU strip submission itself was at most 0.4 ms. These are separate
  instrumented results, not ordinary before/after distributions.
- Replaced DOM crop loops with `TextureRowDecoder.js` and `TextureRowWorker.js`:
  one worker decodes each source once and supplies bounded 256 KiB pixel strips.
  Cancellation closes the source and city/context teardown terminates the worker.
  Pixel tests include actual rustic-stone JPEG/ARM/normal images, not just a test pattern.
- Added `TextureResidency.js` to recognize Three r183's shared source + sampler
  allocations. Material clones no longer repeatedly stage the same GPU texture
  or inflate the extra-residency estimate. `pilot-shared-original-01` prepares
  9 textures instead of 72 and peaks near 106 MiB extra estimated residency.
  Preparation CPU median/p99 is 0.1/0.5 ms; a single nonpreemptible step reached
  9 ms. These are pilots, not completion evidence.
- Ownership is now traced: 2E5 loads building_27's `rustic_stone_wall_02`
  basecolor, ARM and normal maps; 30B loads building_7's `whitewashed_brick`
  equivalents. At 36E, building_49_c/d and building_48_c/d each introduce roughly
  5 MB across 79–81 geometries; 42C introduces building_48 and building_47_d,
  roughly 5 MB each, plus tree buffers. This also revealed 2.2 MB merged facade
  geometries that require a larger bounded upload unit than the initial 512 KiB cap.
- Current limits allow 3 MiB submitted buffer/image data per frame, up to 16 small
  units, a 1 ms CPU scheduling target, 256 queued jobs and 256 MiB extra resource
  residency plus one <=32 MiB staging image. Large indivisible operations remain
  measured overruns, not hard timing guarantees. Work yields when CPU already
  exceeds 24 ms or the last asynchronous GPU sample reaches 33 ms.
- Remaining pilot misses motivated texture-first queue admission and a 380 m
  forward lookahead (220 m in other directions), independent of any saved route.
  The final validation below establishes that this finishes the first rustic-stone
  set before 2E5 and addresses the farther merged facade groups.
- Clean baseline processes `before-original-03` onward monitor background Blender
  processes throughout each run. The user has paused the competing rendering task.

### Repeated verification, not just the best pilot

- `before-original-03`, `04`, `05` are the clean baseline (3 fresh processes,
  3 laps each). All pass the correctness gates. Cold 2E5 CPU is 72.3–74.2 ms;
  30B is 63.9–65.8 ms. Cold geometry events are smaller than the historical
  September 14 baseline: 36E is 32.9–37.7 ms and 42C is 26.2–34.6 ms.
- `after-original-01` removes the texture stalls (17.4/21.4 ms at 2E5/30B),
  with no cold CPU/GPU frame over 40 ms. The next fresh run is not as good:
  `after-original-02` has a 24.9 ms preparation step at 23F and one remaining
  texture miss at 2E5 (48.2 ms CPU). Do not use only the best run as final proof.
- The 23F cost occurs when opening a generated 256x256 **canvas**, before the
  worker upload step. Canvas `toBlob` can synchronously read back its GPU backing
  store. Worker-decoded file images do not incur this main-thread extraction.
  Canvas preparation also delays the higher-value file texture queue. Exclude
  canvases from proactive eligibility; ordinary rendering remains their fallback.
  Add a regression for this eligibility contract and rerun the final cohort.
- Pipelining one next pixel strip immediately after an upload avoids a spare
  animation-frame round trip while keeping only one strip in flight. The focused
  test caught an initial small-budget regression; corrected strip sizing passes
  all five browser tests, including 1 KiB budgets and actual PBR pixels.
- Fixed-pose image inspection around all four events plus 300 shows no visible
  lighting/shadow/material degradation. Before/after maximum mean RGB error is
  0.021 on a 0–255 scale, with at most 0.106% of pixels differing by more than two
  units. Separate baseline-repeat captures also vary slightly. Preserve these
  tolerances and artifacts rather than claiming bit-identical whole-game images.
- `after-original-04` through `06` validate the canvas exclusion. The first two
  runs have preparation maxima of 1.1/1.0 ms during the cold route, with the two
  texture events reduced in both. These are retained as intermediate evidence.
- A focused geometry-mutation test then exposed renderer bookkeeping: restoring
  `renderer.info.render.frame` after a private draw rewinds Three's attribute
  update epoch. An edited mesh can miss its next buffer update. The test rendered
  black instead of the expected red plane. The two preparation draw wrappers now
  restore workload counters but keep the internal frame index monotonic; the
  regression passes. Final performance cohorts use the `final-*` prefix after
  this last lifecycle correction, with production source frozen during the runs.
- Added `tests/headless/e2e/nearby_gpu_preparation_images.pwtest.js`. Prepared and
  ordinary sun effects are pixel-identical for visible/partially cutout-occluded
  sun, the maximum 6-degree disc, turning away, teleporting and resizing. The
  isolated activation measured 58 ms CPU ordinary versus 0.7 ms prepared, with
  13 targets and 11 programs initialized gradually. This is a separate diagnostic,
  not a replacement for the three-process route timing comparison. Alpha-cutout
  occluders may still require a small material variant on first appearance.
- Final focused validation passes: four Node scheduler tests, six preparation
  browser tests, the five-state pixel comparison, and all five existing sun-bloom
  filtering tests. Adjacent legacy failures are explicitly retained: the foliage
  sampling test reads zero luminance, and the visibility gameplay tests wait for
  a missing Graphics button / expect a shadow pass while none ran. All three
  assertions also fail with the untouched `7eb31f8` GameEngine snapshot. The
  visibility baseline control uses a 5-second locator timeout to avoid repeating
  its 180-second missing-button wait; production timeouts are unchanged.
  Logs: `foliage-baseline.log` and `visibility-baseline.log` in the artifact root.

### Final original-route measurements

Source frozen in `final-source-hashes.json`; before is `7eb31f8`, using the
page-local `before-src/` snapshot. Clean runs are `before-original-03` through
`05` and `final-original-01` through `03`: three fresh private Chrome processes
per side, three 2,518-frame laps each (22,662 frames per side). Hardware is
RTX 3060 / ANGLE D3D11, 3520x1540 drawing buffer, DPR 2, current authored defaults,
90 stationary warm-up frames, no pre-drive. Physics is paused and recorded visual
poses are restored at the normal camera stage. Baked mode/generation 2 remains
constant; GPU sample coverage is 100%, with no hidden-page, disjoint or page-error
events. Background Blender monitoring found no competing render in these runs.

Cold means the first lap of each process (7,554 frames); warm means laps two and
three (15,108 frames). Fresh processes do not flush OS/driver caches. Values below
are pooled distributions in milliseconds, not averages of per-run percentiles.

| Metric | Before cold | Final cold | Before warm | Final warm |
|---|---:|---:|---:|---:|
| CPU median | 18.2 | 18.5 | 18.1 | 18.6 |
| CPU p99 | 25.5 | 27.6 | 28.3 | 26.6 |
| CPU maximum | 74.2 | 45.9 | 46.2 | 45.6 |
| CPU slowest 1% mean | 31.42 | 30.36 | 31.57 | 30.06 |
| CPU frames >40 / >60 ms | 6 / 6 | 2 / 0 | 10 / 0 | 3 / 0 |
| GPU median | 18.27 | 18.49 | 18.23 | 18.38 |
| GPU p99 | 24.81 | 25.89 | 29.17 | 26.64 |
| GPU maximum | 72.62 | 29.59 | 47.00 | 33.60 |
| GPU slowest 1% mean | 28.89 | 26.86 | 32.92 | 27.88 |
| GPU frames >40 / >60 ms | 5 / 5 | 0 / 0 | 14 / 0 | 0 / 0 |
| Frame interval median | 18.8 | 19.1 | 18.8 | 19.2 |
| Frame interval p99 | 26.2 | 28.3 | 29.8 | 27.2 |
| Frame interval maximum | 74.8 | 46.6 | 47.5 | 46.2 |
| Frame interval slowest 1% mean | 32.35 | 31.46 | 33.60 | 30.77 |
| Actual FPS | 52.63 | 51.69 | 52.19 | 51.48 |

There is a small steady cost: approximately 1.8% lower cold FPS and 1.4% lower
warm FPS in this cohort. Cold p99 does not improve, although the large first-use
spikes and worst tails do. Do not present this as a free average-FPS improvement.
Preparation CPU during the route is median/p99/max 0.1/0.7/1.4 ms cold and
0.1/0.3/0.7 ms warm. Startup can still contain a nonpreemptible initial helper
compile; the scheduler's deadline is not a hard driver-operation guarantee.

| Event | Before CPU median (range) | Final CPU median (range) | Before GPU median | Final GPU median |
|---|---:|---:|---:|---:|
| 2E5, rustic stone textures | 73.3 (72.3–74.2) | 18.9 (17.8–20.3) | 65.95 | 18.72 |
| 30B, whitewashed brick textures | 64.7 (63.9–65.8) | 22.8 (20.9–24.4) | 62.33 | 19.76 |
| 36E, merged facades/tree buffers | 34.8 (32.9–37.7) | 31.7 (30.1–34.1) | 36.07 | 26.71 |
| 42C, merged facades/tree buffers | 28.8 (26.2–34.6) | 31.8 (23.4–33.1) | 27.84 | 20.35 |

The geometry events improve GPU cost, but 42C CPU does not improve consistently.
Preparing buffers with a neutral material cannot remove every original-material
VAO/first-draw cost. Remaining >40 ms CPU samples have zero preparation work and
overlapping ordinary render/receiver-validation cost; they are not claimed fixed.

Visible calls median/max are 736/1,117 and triangles 734,598/1,022,730 on both
sides. Named event counts match. Small per-frame visibility-boundary differences
also occur between baseline repetitions, so counts are not bit-identical on every
frame. Texture count median/max rises 109/110 to 110/111 cold and 110/110 to
111/111 warm; programs rise 93 to 94 (preparation helper). Geometry count rises
2517/3021 to 3665/3775 cold and 3021/3021 to 3685/3775 warm because nearby borrowed
geometry is resident earlier. No geometry is added to the visible scene.

Peak estimated extra GPU residency is 204.2–207.9 MiB across the three final
original-route runs; warm extra is 70.5–74.2 MiB. One staging allocation is separate
and bounded at 32 MiB; route image staging peaks around 5.33 MiB. Per-process
driver residency is **not measured**: available NVIDIA telemetry is whole-desktop
usage and cannot isolate this module. Worker encoded/decoded CPU images are also
separate from GPU estimates. No extra persistent assets or bake data are produced.

Navigation-to-readiness/instrumentation marker: before median 36.340 s
(35.968–36.348), final median 37.128 s (34.812–38.801). This is **not** an isolated
bake-activation duration; it includes startup/instrumentation timing. Existing
bake readiness gates and timeouts are unchanged. Total replay process durations
are 188.1–190.9 s before and 188.8–198.4 s final, including loading/captures.
Machine-readable results: `final-original-report.json`, per-run `frames.json`,
`environment.json`, `gpu-telemetry.json`, and `ledger.jsonl` under the artifact root.

### Final image and full-approach checks

All five original-route comparison pairs were inspected: `final-comparison-2e5.jpg`,
`final-comparison-300.jpg`, `final-comparison-30b.jpg`, `final-comparison-36e.jpg`,
`final-comparison-42c.jpg`. Full-resolution originals remain in each run directory.
Across all three final runs, maximum mean RGB error is 0.01898 on a 0–255 scale;
at most 0.1046% of pixels differ by more than two channel units. Baseline repeats
also vary (maximum mean error 0.01247, 0.0711% above two units). No visible material,
lighting, shadow, geometry or visibility degradation was found. Raw metrics are
in `final-image-comparison.json`; previews are not used for pixel measurements.

The final focused bloom test has five exactly matching image states. Its latest
isolated first-visible sample is 57.7 ms CPU / 2.06 ms GPU ordinary versus 0.9 ms
CPU / 11.86 ms GPU prepared, with zero newly compiled programs on prepared first
visibility. This demonstrates CPU preparation, **not** a GPU speedup. Eleven
programs and thirteen targets were prepared; the cutout variant still adds one
program (2.4 ms CPU in the prepared case). The sample is a diagnostic, not a
statistical performance comparison; see `effects/measurements.json`.

The complete older left-turn approach now reproduces 25CE on the current baseline.
`before-leftturn-01` and `final-leftturn-01` each replay all 9,836 frames
0x132–0x279D, one fresh process per side, recorded settings, 3390x1540/DPR 2,
90 stationary warm-up frames. Both pass exact-pose, baked generation, page and GPU
validity gates. This full approach must not be confused with the earlier short
25B0 replay that missed the event.

| Full-route event | Before CPU / GPU ms | Final CPU / GPU ms |
|---|---:|---:|
| 1326 textures | 71.3 / 70.37 | 18.5 / 18.57 |
| 133F textures | 61.3 / 58.72 | 20.1 / 19.29 |
| 136E geometry | 36.1 / 31.26 | 30.5 / 26.20 |
| 145B geometry | 29.3 / 19.45 | 29.9 / 18.93 |
| 19F2 geometry | 31.3 / 30.49 | 33.6 / 24.31 |
| 25CE false bloom | 101.7 / 95.81 | 34.5 / 19.94 |

At 25CE the baseline's stale emitter crosses the near plane: a conservative
full-screen effect rectangle at depth 1.0712 retains twelve occluders, issues
24 bloom draws and first-creates ten programs/thirteen textures. The corrected
same camera/sun has no relevant emitter and zero bloom draws. Neighboring probes
25CD/25CF remain irrelevant. This is direct lifecycle/projection evidence, not
attribution from resource counts alone.

Full-route raw before/final FPS is 50.48/46.73; CPU median/p99/max is
18.9/32.6/101.7 versus 21.0/34.4/58.7 ms; GPU is 17.91/24.60/95.81 versus
19.40/27.14/41.51 ms. CPU >40 ms counts are 16/20; GPU >40 counts 3/1.
The remaining final GPU maximum is at 26E4, with zero preparation CPU and ordinary
render/validation cost. Do not claim this single pair establishes the average
overhead: current-condition baseline repeats of the 9xx route are retained below
to distinguish system drift from the main three-process overhead measurement.
Peak extra residency in this full approach is 210.0 MiB; preparation median/p99/max
is 0.1/0.6/1.4 ms. Startup marker is 41.54 s final; process durations are
241.8/264.7 s before/final, including startup and captures.

### Final 9xx repeated confirmation

`final-9xx-01` through `03` pass three fresh processes with two 2,383-frame laps
each, 0x302–0xC50, recorded settings, 3390x1540/DPR 2, 90 stationary warm-up frames.
Because the earlier baseline block had faster ordinary frame times, repeat the
baseline under current conditions: `before-9xx-01` through `03` use the same
immutable `7eb31f8` snapshot and also all pass. No production source changed.
Each side has 14,298 frames, split equally cold/warm. GPU coverage is 100%, baked
mode/generation 2 stable, no page errors, hidden frames, disjoint events or competing
Blender renders. `final-additional-report.json` retains both the older historical
baseline and the current-condition baseline; do not cherry-pick between them.

| Metric | Current before cold | Final cold | Current before warm | Final warm |
|---|---:|---:|---:|---:|
| CPU median / p99 / max ms | 19.6 / 28.8 / 81.4 | 19.6 / 30.4 / 47.3 | 19.8 / 28.6 / 44.0 | 18.6 / 26.2 / 50.6 |
| CPU slowest 1% mean ms | 37.84 | 34.62 | 30.78 | 29.71 |
| CPU >40 / >60 ms | 15 / 9 | 7 / 0 | 2 / 0 | 5 / 0 |
| GPU median / p99 / max ms | 19.20 / 26.04 / 74.99 | 19.18 / 26.62 / 31.04 | 19.24 / 26.08 / 32.44 | 18.10 / 25.76 / 32.69 |
| GPU slowest 1% mean ms | 32.56 | 27.76 | 27.04 | 27.00 |
| GPU >40 / >60 ms | 10 / 9 | 0 / 0 | 0 / 0 | 0 / 0 |
| Frame interval median / p99 / max ms | 20.1 / 29.7 / 83.7 | 20.1 / 31.2 / 48.1 | 20.3 / 29.4 / 44.7 | 19.1 / 26.9 / 51.5 |
| Frame interval slowest 1% mean ms | 39.84 | 35.68 | 31.74 | 30.60 |
| Actual FPS | 49.72 | 49.12 | 49.61 | 51.71 |

Current cold FPS is 1.2% lower; warm FPS is 4.2% higher. The earlier historical
baseline was 52.68/53.34 FPS cold/warm, illustrating host/run variation. Do not
interpret either the single full-leftturn 7.4% decrease or this warm 4.2% increase
as an isolated causal overhead estimate. The repeatable finding is removal of
the large first-use spikes; original-route repeated steady cost was about 1–2%.

| 9xx cold event | Current before CPU range ms | Final CPU range ms | Current before GPU range ms | Final GPU range ms |
|---|---:|---:|---:|---:|
| 672 | 70.6–78.3 | 16.7–18.0 | 61.47–72.87 | 17.33–19.14 |
| 689 | 62.2–68.4 | 20.2–46.8 | 62.28–72.14 | 17.79–19.52 |
| 98F | 79.0–81.4 | 12.0–13.0 | 65.62–74.99 | 15.49–16.73 |

689 retains one 46.8 ms CPU outlier: validation is 10.4 ms, ordinary render 33.9 ms,
preparation CPU zero, GPU 19.52 ms; the other two cold runs are 20.2/21.4 ms CPU.
Do not describe this as zero CPU hitches. 98F no longer adds eleven programs and
thirteen targets or issues forty false bloom draws. Calls/triangles at 672/689
are unchanged; at 98F only the erroneous effect work disappears.

Overall calls median/max remain 865/1,113 and triangles 835,355/1,037,737.
Cold textures median/max change 109/123 to 110/111; warm 123/123 to 111/111.
Programs change 93/104 cold and 104/104 warm to 94/94 both. Geometry counts are
2381/3012 cold and 3013/3013 warm before, versus 3725/4011 and 3773/4011 final.
Extra residency peaks 202.4–216.8 MiB final; warm extra is 73.2–87.6 MiB.
Preparation CPU median/p99/max is 0.1/0.9/1.2 ms cold and 0.1/0.2/1.0 ms warm.
Startup marker is 37.78–39.55 s before and 34.67–39.59 s final; process durations
140.96–146.16 s before and 134.70–148.49 s final. Readiness gates are unchanged.

### Ownership confirmation and completed changes

A final separate instrumented baseline, `before-9xx-90`, passes and identifies
672 as building_27's three 1024-square rustic-stone maps, with 2 geometries /
23,616 bytes. At 689, building_7 uses the three whitewashed-brick maps and adds
35 geometries / 1,561,812 bytes; tree groups 061/075/098/116 each add one geometry
of roughly 1.6 MB. This is the same texture ownership found on the original route,
confirmed by actual first-draw/material source observations. Shared map slots are
not counted as independent native textures. Instrumented image uploads total
57.4 ms CPU at 672 and 42.6 ms at 689; these timings remain separate from ordinary
cohorts. Summary: `final-9xx-ownership.json`; raw events: `before-9xx-90/frames.json`.

- `src/app/core/GameEngine.js`: synchronize the sun to the final camera; integrate
  preparation after rendering and cancel it with city/engine lifecycle changes.
- `src/graphics/visuals/preparation/PreparationQueue.js`: resumable priority queue
  with capacity, submission/time limits, cancellation and overrun diagnostics.
- `NearbyGpuPreparation.js` in that directory: incremental city inspection,
  resource selection, borrowed-geometry preparation and residency accounting.
- `StagedImageTexture.js`, `TextureRowDecoder.js`, `TextureRowWorker.js`: decode
  file images in one worker, transfer/upload bounded strips and publish complete
  original-resolution textures; unsupported sources use ordinary rendering.
- `TextureResidency.js`: deduplicate current Three r183 source/sampler allocations.
- `BloomResourcePreparation.js`: prepare existing targets and real programs before
  legitimate sun visibility; preserve effect pixels through lifecycle transitions.
- `tests/node/unit/nearby_preparation_queue.test.js`,
  `tests/headless/e2e/nearby_gpu_preparation.pwtest.js`, and
  `tests/headless/e2e/nearby_gpu_preparation_images.pwtest.js`: scheduling, pixel,
  geometry mutation, ownership, shared sources and effect regression coverage.
- `tests/headless/e2e/gameplay_recording_replay.pwtest.js`: isolated source snapshots,
  exact post-measurement captures, preparation limits and opt-in ownership traces.
- `specs/graphics/nearby_gpu_preparation.md` and `tools/gameplay_recording/README.md`:
  architecture, limitations and repeatable verification documentation.

Final ordinary verification totals fourteen clean processes, thirty-two laps and
93,592 measured frames across the original, 9xx and full-leftturn comparisons.
All targeted tests pass; three adjacent legacy assertions still fail on the
baseline too, as documented above. Production hashes remained unchanged throughout
the final cohorts, and the selected-test file was restored after execution.
Generated screenshots, traces, scripts, snapshots and reports remain gitignored.

Remaining limitations: individual GL operations are not preemptible; generated
canvases/oversize resources retain ordinary first use; geometry VAO/material setup
is not entirely eliminated; intermittent ordinary-render/validation CPU spikes
remain. The 1 ms target is not a hard worst-case promise. This implementation
preserves quality while substantially reducing the identified cold GPU/CPU stalls.

## Completion handoff requirements (fulfilled)

- Mark the document `DONE` in the first line and rename it to
  `prompts/AI_DONE_graphics_572_CITY_budgeted_nearby_gpu_resource_preparation_DONE.md`.
- Keep it in `prompts/`; archive only when explicitly requested.
- Add a high-level one-line summary per completed change and relevant file paths.
- Include a same-condition before/after performance table with frame time/FPS,
  CPU/GPU statistics, workload counters, memory and startup costs. Identify hardware,
  resolution, graphics settings, route/cameras, warm-up, sample counts and statistics.
  Mark unavailable metrics `not measured` with reasons; projections are not final
  results. Summarize remaining hitches and any limitations separately.
- Confirm unchanged lighting/shadow quality with the saved image evidence.
