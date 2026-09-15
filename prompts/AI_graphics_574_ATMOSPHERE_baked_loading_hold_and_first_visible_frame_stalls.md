# Problem

A new user recording contains a long held view during baked activation, CPU
stalls during preparation and a large hitch when the completed view first renders.
This is distinct from the brief first-use hitches while driving (AI 572).

Recorded evidence, elapsed from capture start:

| Frames | Observation |
|---|---|
| 132–270, 0.024–17.774 s | Current lighting still rendering while baked data loads; irregular frame intervals, up to 583.4 ms |
| 271–1223, 18.524–105.526 s | 4,019 frames flagged baked + viewHeld, not newly rendered gameplay: approximately 87 seconds of held view |
| 271, 18.524 s | Engine CPU 652.4 ms; next interval 750.1 ms |
| 492 / 4FC / 500 | Held-frame CPU stalls of 263.2 / 275.7 / 354.0 ms |
| 1224, 105.792 s | First visible baked frame: CPU 256.1 ms, GPU 612.98 ms, +702 geometries, +3 textures |
| 1226–1227, 106.344–106.382 s | Separate 524.5 ms CPU update followed by a 533.5 ms interval |

The recording has only one baked activation, generation 2. Its metadata does
not include the source revision, shader hashes, preparation revisions or a CPU
profile, so it does not prove the entire 87 seconds was shader compilation or
that the latest shader fix regressed. Four viewport-width changes occurred
during the hold at 89.88, 95.13, 97.03 and 100.10 seconds.

Commit `0873f2b` specialized Final shaders and removed ANGLE X3595/X4000 warnings.
Three fresh replays on that revision, starting near the first driving pose,
report view preparation of 29.77–30.45 seconds and loading-to-activation of
27.24–27.64 seconds. These are separate diagnostic timers, not a measured complete
garage-to-first-frame duration or proof of exclusively shader work. The later
pose's three fresh runs report 29.30–30.58 and 27.22–28.00 seconds respectively.
These differ from the recorded interactive startup. Preserve
the verified improvement and investigate the remaining difference rather than
assuming the warning/compiler problem is unchanged.

# Request

Identify and remove avoidable work blocking baked activation and its first
visible frame, preserving lighting quality, bake compatibility and the existing
garage/gameplay transition behavior. Maintain responsive loading and atomic
presentation of prepared lighting; do not mask the problem by extending a black
screen, weakening readiness checks or shifting all work into the first draw.

Tasks:
- [ ] Reproduce ordinary garage-to-game startup with the recording's initial
  pose, exact settings and resolution, using the current source. Capture loaded
  source/build fingerprints so stale browser code can be distinguished from an
  actual regression. Keep no-resize and recorded-resize cases separate.
- [ ] Instrument loading, validation, decode, receiver binding, texture/geometry
  preparation, program submission/readiness and first visible rendering. Record
  every preparation request/revision, cause, cancellation and completion.
  Measure total wait from the first request as well as the last successful pass.
- [ ] Attribute the held-frame CPU stalls and the distinct first-visible GPU
  and CPU stalls with a separate startup profile and targeted resource tracing.
  Do not infer GC, repeated compilation or resource ownership from counters alone.
- [ ] Fix the demonstrated avoidable blocking or repeated work. Coordinate
  resource readiness with AI 572's budgeted preparation; preserve cancellation,
  ownership, city changes, context loss and restoration of the last valid view.
- [ ] Prevent stale preparation completions from releasing a newer view. Ensure
  ordinary resize or equivalent settings do not cause unnecessary preparation
  cycles, if that is demonstrated to occur.
- [ ] Preserve authored settings, maps, resolution, sun/sky calibration, samples,
  filtering, indirect light and materials. Preserve source-only Final shader
  specialization and absence of the fixed ANGLE warnings.
- [ ] Add focused regression tests for the confirmed cause, update relevant
  specifications and append investigation findings/changed paths here.
- [ ] Repeat startup before/after three times in fresh private browsers, with
  and without the recorded resize sequence. Include a warm repeat separately.
  Report measured phase durations, longest CPU tasks, first-visible CPU/GPU cost,
  frame intervals/FPS, resource counts and memory. Keep diagnostics out of ordinary
  benchmark numbers. Do not close the user's browser or purge unrelated memory.

## Inputs and workflow

Read `debug_tools/regression_debugging/recording_left_turn_20260914.md` and
`debug_tools/regression_debugging/baked_shader_loading.md`.

Recording: `tests/artifacts/screens/recording_left_turn_20260914/route.busrec`.
Original attachment: `C:/Users/rogel/.codex/attachments/ef8e0f13-8b94-4060-ad12-cdd66662c408/pasted-text.txt`.
SHA-256: `47e1ca96c62f5b4f92088cec745f2f97b301834fde3ef9d8c60cf923fa316ae6`.
Extract 0x132 with `tools/gameplay_recording/decode.mjs`; the saved artifact is
`tests/artifacts/screens/recording_left_turn_20260914/startup-pose.json`.
Recording metadata contains the complete defaults snapshot and timing semantics.
Hardware: RTX 3060 / ANGLE D3D11, Chrome 151, Three r183, device scale 2,
3390x1540 initially, alternating with 2506x1540 during the four resizes.

Inspect `BakedLightingRuntime.js`, `LightingViewPreparation.js`, receiver/source
loading and `GameEngine` presentation hooks. Use the existing replay's startup
profiler as a starting point, but do not use its wait-for-ready/90-frame warm-up
as evidence that the first visible frame is hitch-free: that work precedes the
ordinary measured replay range. Replay has no interactive resize reproduction yet.

Save generated inputs, profiles, logs, screenshots and reports under
`tests/artifacts/screens/ai574_baked_startup/` (gitignored). Keep reusable scripts,
tests, specifications and concise findings tracked. Use the standardized selected
test runner. This is a runtime preparation task; no rebake is required unless an
independent asset defect is proven. Maintain the canonical bake framework if needed.

## Progress

- Task created from measured user-recording stalls; causes remain to be profiled.
- AI 572 owns first-use resource preparation. AI 575 owns recurring frame cost
  after lighting is already active. Keep their scopes and measurements distinct.

## On completion

- Mark DONE in the first line and rename to
  `prompts/AI_DONE_graphics_574_ATMOSPHERE_baked_loading_hold_and_first_visible_frame_stalls_DONE.md`.
- Keep the file in `prompts/`; archive only when explicitly requested.
- Summarize each completed change, proven cause, regression checks and evidence.
- Include a same-condition before/after table with frame time/FPS, phase timings,
  CPU/GPU metrics, workload and memory, hardware/resolution/settings, warm-up,
  sample counts and statistics. Mark unavailable metrics `not measured` with a
  reason. State residual stalls honestly; projected savings are not final results.
