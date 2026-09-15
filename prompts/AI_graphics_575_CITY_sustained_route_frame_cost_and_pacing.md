# Problem

The user describes a subtle slow/release pattern after moving and turning left.
Part of this is the first-use resource work already tracked in AI 572, but
substantial recurring cost remains after resources are warm. The final part of
the recording also becomes consistently slower as the visible workload grows.

Recorded source frames are hexadecimal; times are seconds from capture start:

| Interval | Frames | CPU / GPU median (ms) | FPS from frame intervals | Calls / triangles median |
|---|---|---:|---:|---:|
| 110–112 s, starting to drive | 12AB–1307 | 20.20 / 20.20 | 46.88 | 913 / 835,387 |
| 142–150 s, heavier view | 1924–1A67 | 23.40 / 22.42 | 40.58 | 1,175 / 657,028 |
| 154–182 s, lighter view | 1B2F–21B2 | 14.50 / 15.75 | 59.53 | 491 / 538,700 |
| 200–214 s, later heavy view | 25CE–2795 | 29.00 / 20.25 | 32.57 | 1,577 / 1,195,654 |

These are different camera/workload intervals, not a before/after performance
claim. The later sustained cost begins before the isolated 0x25CE resource event.
Lighting stays baked at generation 2 throughout driving; there is no recorded
visibility loss, GPU disjoint event or repeated baked reactivation. Missing a
16.7 ms frame budget is consistent with uneven 60/30 FPS presentation intervals,
but the trace alone does not prove a periodic throttle/release algorithm or leak.

Current-code replays at `0873f2b`, three fresh private Chrome processes with three
laps each per route segment, confirm the residual cost on warm laps:

| Segment | Measured poses per lap | Warm CPU / GPU median ranges (ms) | Warm FPS range | Validation / render phase median ranges (ms) |
|---|---:|---:|---:|---:|
| 12AB–14A0, left turn | 502 | 21.15–22.05 / 21.09–21.56 | 43.68–46.05 | 6.0–6.3 / 13.55–14.0 |
| 25B0–26C0, later view | 273 | 31.9–33.7 / 20.55–21.51 | 29.62–30.92 | 6.2–6.4 / 24.0–25.8 |

The render phase is CPU-side wall time and may include driver waits; it is not
an isolated GPU pass. Do not sum overlapping phases or add CPU and GPU timings.
Late-view draw calls peak near 1,960 and triangles near 1.56 million. Even warm
left-turn GPU time exceeds a 60 FPS budget at the captured resolution, so reducing
CPU validation alone cannot promise 60 FPS. All 6,975 replay samples have valid,
submission-matched GPU timing, stable baked generation and visible-page status.
Sun bloom emits zero draws in both segments; streamed-shadow upload bursts do
not account for the recurring cost.

# Request

Find and reduce avoidable recurring CPU/render work causing route-dependent
slowness, while retaining current lighting, shadows, visibility and image quality.
Distinguish ordinary workload variation from an actual scheduling or validation
defect; do not invent a periodic mechanism from the user's description.

Tasks:
- [ ] Reproduce both segments and stationary controls at 0x1326 and 0x2600 with
  the recorded settings, resolution, bus and camera transforms. Compare the
  shorter replay with the full preceding route so resource/visibility history
  does not silently change the workload. Cover the 142–150 s interval too.
- [ ] Profile CPU rendering/submission and baked receiver validation separately
  from ordinary timing runs. Attribute expensive draw lists, object/material
  traversal, repeated validation and synchronous driver waits before editing.
  Correlate costs with calls, triangles, visibility changes and frame intervals.
- [ ] Inspect the remaining cost in `ReceiverLightmapRuntime.validateFrame`,
  `EnhancedReceiverFreshness` and their callers. AI 548 already removed per-frame
  JSON/profile rebuilding: do not propose that completed fix again. Use existing
  watch statistics/profiling to identify what still costs roughly 6 ms per frame.
- [ ] Implement only the measured avoidable work. Preserve complete detection
  of relevant scene, geometry, material, texture and lighting changes. Any
  incremental/versioned validation must retain prompt incompatible-bake rejection
  and correct behavior for edits, imports, swaps, disposal and context loss.
- [ ] If render submission dominates, identify the responsible passes/objects
  and eliminate redundant work without dropping required geometry, weakening
  culling correctness or hiding legitimate shadows. Respect existing resource
  preparation ownership from AI 572; keep cold spikes separate from warm costs.
- [ ] Use a separate trace to investigate remaining isolated CPU spikes only
  when needed. Heap drops near 0x1317, 0x1580 and 0x265E are correlations, not proof
  of GC as the cause or of a leak. Do not create a speculative GC fix.
- [ ] Keep resolution, DPR, maps, shadow filtering, lighting calibration,
  materials and postprocessing settings unchanged. No frame cap, adaptive quality
  reduction or delayed compatibility check may masquerade as an optimization.
- [ ] Add focused correctness tests for the demonstrated cause, update relevant
  specs and record changed paths and findings incrementally in this document.
- [ ] Measure before/after in three fresh private browser processes with three
  laps each, plus stationary controls. Keep diagnostic profiling out of ordinary
  measurements. Verify startup and the rest of the route do not regress.
- [ ] Compare fixed-pose before/after images and visibility/pass counts. Record
  asynchronous workload differences rather than assuming equal camera poses
  imply equal draws. Preserve the existing game/Cycles lighting parity.

## Inputs and verification

Read `debug_tools/regression_debugging/recording_left_turn_20260914.md` and AI 572.
AI 574 owns loading/first-visible stalls; this task starts after lighting is ready.
The older AI 497 covers a different shadow/cascade optimization scope; do not
attribute this baked-mode workload to CSM without evidence. AI 548 is completed
history, not an open ticket to silently reopen.

Input: `tests/artifacts/screens/recording_left_turn_20260914/route.busrec`.
Original attachment:
`C:/Users/rogel/.codex/attachments/ef8e0f13-8b94-4060-ad12-cdd66662c408/pasted-text.txt`.
SHA-256: `47e1ca96c62f5b4f92088cec745f2f97b301834fde3ef9d8c60cf923fa316ae6`.
Metadata includes the full defaults snapshot, one configuration event, viewport
and camera projection. Recorded build/source fingerprints are unavailable.

Use `tests/headless/e2e/gameplay_recording_replay.pwtest.js` through
`node tools/run_selected_test/run.mjs`. Set `REPLAY_INPUT` to the recording,
`REPLAY_SETTINGS=recorded`, `REPLAY_LAPS=3`, and the source ranges above.
`REPLAY_HOLD_FRAME`, `REPLAY_DIAGNOSTICS` and `REPLAY_PROFILE_RESOURCES` support
separate controls/diagnostics. The existing harness warms the first stationary
pose for 90 frames, applies exact visual poses and pauses physics. It does not
recreate the original interaction timing, startup or complete streaming history.

Existing artifacts are under `tests/artifacts/screens/recorded_slowdown/`, named
`left-turn-20260915-fresh-01` through `03` and `late-view-20260915-fresh-01` through
`03`. New evidence belongs under `tests/artifacts/screens/ai575_route_frame_cost/`
(gitignored); retain reusable tools, tests, specs and concise findings in Git.

Conditions: RTX 3060, ANGLE/D3D11, Chrome 151, Three r183, 3390x1540, DPR 2.
Run GPU benchmarks sequentially. Restart only owned test browsers, without
closing user applications or purging unrelated system memory. Fresh processes
reset their own resources, not all OS/driver caches.

Report CPU, matched GPU and actual frame-interval median, p99, maximum and slowest
1% mean, FPS from elapsed intervals, hitch counts, validation/render phases,
calls, triangles, resources, startup cost and measured/estimated memory separately.
Check GPU sample coverage/disjoint status, page visibility, lighting generation
and effective settings. Keep per-run numbers and cold/warm results distinct.

## Progress

- Investigation prompt created from measured recurring cost; no fix implemented.
- Three fresh-process repeats per segment already confirm that warm-lap cost
  persists after the first-use resource stalls disappear. Root-cause profiling
  and the optimization remain open.

## On completion

- Mark DONE in the first line and rename to
  `prompts/AI_DONE_graphics_575_CITY_sustained_route_frame_cost_and_pacing_DONE.md`.
- Keep it in `prompts/`; archive only when explicitly requested.
- Summarize each completed change, proven cause, checks and evidence.
- Include a same-condition before/after performance table with frame time/FPS,
  CPU/GPU phases, workload and memory; identify hardware, resolution, settings,
  route, warm-up, sample counts and statistics. Mark unavailable metrics
  `not measured` with reasons. Projections are not completion evidence.
- State remaining workload limits and unexplained outliers honestly.
