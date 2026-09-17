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

- [ ] Establish a repeatable before measurement with the current diagnostic tools.
  Inspect resource ownership, upload/first-draw paths, visibility/PVS inputs, and
  city lifecycle. Confirm which resources account for the four events.
- [ ] Implement a deduplicated, prioritized preparation queue that works for any
  route, including turning and reversing. Keep GPU lifecycle work in the graphics
  layer and follow `ai_rules/PROJECT_CODING_RULES.md`. Do not hardcode these frames,
  buildings, or saved poses as production priorities.
- [ ] Enforce explicit per-frame scheduling and memory limits. A single texture
  upload already blocks for tens of milliseconds: merely scheduling that same
  operation in a later animation frame is insufficient. Investigate smaller
  preparation units or staging where required while preserving final pixels and
  mip behavior. Measure CPU submission and deferred GPU cost. Document unavoidable
  non-preemptible operations rather than claiming an unverified hard time limit.
- [ ] Handle shared resources, disposal, city changes, cancellation, context loss,
  and stale queued work safely. Avoid repeated uploads, duplicate allocations,
  resource-reference leaks, and unbounded resident growth. Do not dispose resources
  still owned by visible objects or other users. A visible preparation miss must
  render correctly; no hidden objects, placeholder materials, or delayed pop-in.
- [ ] Keep preparation incremental through startup, driving, fast turns and
  teleports. Do not synchronously warm the whole city, move the hitch into loading,
  or allow an unbounded asynchronous backlog. Coordinate with existing background
  work rather than treating each system's budget as the entire frame budget.
- [ ] Add lightweight diagnostics for preparation CPU time, submitted work/bytes,
  queue depth, resource readiness/misses, overruns, and extra residency. Extend the
  existing replay tooling when needed; expensive GL profiling stays opt-in.
- [ ] Add focused behavioral tests for budgeting, deduplication, cancellation,
  resource ownership and visible misses. Update relevant specs/tool documentation
  and append findings, decisions, changed file paths and evidence to this prompt.
- [ ] Run the validation below and resolve regressions before marking complete.

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

Add these pending requirements to the existing preparation work:

- [ ] Fix stale sun-emitter/camera ordering, preserving correct clipping for
  genuinely visible and near-plane cases. Do not disable bloom, reduce its
  configured size/quality, or arbitrarily discard conservative bounds. Keep
  emitter/camera synchronization within the rendering lifecycle and cover both
  ordinary driving and restored/locked poses.
- [ ] Cover actual first-use bloom shader/target dependencies with measured,
  bounded preparation for legitimate onscreen activation. Avoid simply moving
  the hitch to the next real sun appearance. Coordinate with resource ownership,
  resize, cancellation and disposal; distinguish CPU submission from GPU cost.
- [ ] Validate this route in three fresh processes with cold/warm laps after the
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

No production fix has been implemented in this follow-up. The harness, its
README and frame-recording spec were corrected, and all ordinary confirmations
plus the separate resource diagnostic passed. Artifacts use the
`9xx-20260916-ordered-01` through `03` and `ordered-diag-01` directories under
`tests/artifacts/screens/recorded_slowdown/`.

## On completion

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
