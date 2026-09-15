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
