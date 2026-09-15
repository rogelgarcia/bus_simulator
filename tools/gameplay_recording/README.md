# Gameplay frame recordings

In `debug=true`, choose **Record**, drive the route, then **Stop** above the
minimized debug panel. Paste the `BUSREC1:` clipboard text into a report or save
it as a `.busrec` text file. Clipboard failures retain **Copy again** and **Download**.

Every saved frame includes triangle count (`triangles`), draw calls (`calls`),
textures (`textures` / Tex), geometries (`geometries` / Geo), and shader programs
(`programs` / Progs), alongside poses and CPU/GPU timings. These are per-frame
samples, not only recording-wide totals. Textures, geometries and programs count
renderer resources; triangles and calls describe that frame's rendering work.

Read the summary:

```powershell
node tools/gameplay_recording/decode.mjs tests/artifacts/screens/repro/route.busrec
```

Extract the exact hexadecimal HUD frame as a normal gameplay pose:

```powershell
node tools/gameplay_recording/decode.mjs tests/artifacts/screens/repro/route.busrec --frame 0x000001AB --out tests/artifacts/screens/repro/pose.json
```

Use `--out` without `--frame` to expand all columns and metadata for analysis.
Missing GPU values become `null` in JSON. Full replay tooling can import
`decodeFrameRecording` and `recordingFramePose` from
`src/app/gameplay/recording/FrameRecording.js`. Pose extraction reproduces camera
and bus placement; use recorded configurations and render dimensions too. This
does not restore physics solver history or move other actors.

See `specs/gameplay/frame_recording.md` for the versioned schema and timing scope.
Generated recordings, expanded JSON and screenshots belong under the gitignored
`tests/artifacts/screens/<topic>/` tree. The decoder never executes capture text.

## Hardware route replay

Use the opt-in browser test to repeat an exact recorded route, matching the
render buffer and checking the resolved configuration before measurement:

```powershell
Set-Content tests/.selected_test 'tests/headless/e2e/gameplay_recording_replay.pwtest.js'
$env:PLAYWRIGHT_EXECUTABLE_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
$env:REPLAY_INPUT='tests/artifacts/screens/repro/route.busrec'
$env:REPLAY_FIRST='0xA80'
$env:REPLAY_LAST='0xE20'
$env:REPLAY_LAPS='3'
$env:REPLAY_NAME='fresh-01'
node tools/run_selected_test/run.mjs
```

Run again with a new `REPLAY_NAME` for a fresh isolated browser process. This does
not clear or close the user's browser. Outputs are under
`tests/artifacts/screens/recorded_slowdown/<REPLAY_NAME>/`: GPU identity/config,
per-frame CPU phases and GPU samples joined by submission, and region summaries.
`REPLAY_DIAGNOSTICS=1` additionally records scene-pass draw lists grouped by static
root and visibility cell/yaw key. Use this separately from benchmark runs because
collecting render lists adds work.

`REPLAY_PROFILE_STARTUP=1` writes `startup.cpuprofile` and `startup.json`, containing
main-thread long tasks, changes in activation/preparation phase, and final channel
diagnostics. Use the CPU profile to attribute pauses between game frames: the
recorded CPU column measures the game update call, whereas the frame interval also
includes asynchronous work before that call. Startup profiling adds overhead and
must be identified when comparing timing results.

Per-frame replay output also includes streaming update CPU time, cumulative page
requests/uploads/evictions, and shader/resource counts. GPU samples are joined to
their originating submission; missing samples stay null. Region summaries use
the hexadecimal frame ranges present in the input rather than fixed route labels.

The replay supports this debug HUD's 48 px height at device scale 2. Its default
`REPLAY_SETTINGS=recorded` requires equality with the recording's settings.
`REPLAY_SETTINGS=current-defaults` explicitly checks today's authored defaults
instead, retaining both settings snapshots in `environment.json`. Use that mode
to investigate a historical route after defaults change; it is not a historical
before/after configuration match. `REPLAY_HOLD_FRAME=0x700` holds that recorded
pose for every sample as a stationary control while retaining the requested lap
and frame counts. Neither option modifies the game defaults.

`REPLAY_STATIONARY_AFTER_FIRST=0x300` runs the route once, then holds that
previously visited pose for subsequent laps. `REPLAY_PROFILE_RESOURCES=1` adds
timed WebGL texture/buffer upload, mip generation, shader compilation/linking and
driver-query events. This is a diagnostic intervention; keep its timings separate
from the ordinary benchmark. All wrappers are restored when replay finishes.
For a diagnostic blocked by the existing shader deadline,
`REPLAY_RETRY_PREPARATION=1` permits one retry of already-submitted programs via
the runtime's existing preparation request. `environment.json` records whether
it happened. This does not change the production timeout, and a retried run is
not evidence of successful first-attempt startup.

`REPLAY_SHADER_LOGS=1` saves shader/program logs and available source translations
after startup readiness; `REPLAY_ASSERT_SHADER_LOGS=1` rejects ANGLE X3595/X4000.
These diagnostic driver queries run outside the replay measurement. Startup
fallback/error states fail with saved diagnostics instead of waiting for the route.
`REPLAY_CAPTURE_FINAL=1` saves the rendered canvas after the measured frames.
The baked-loading investigation's `REPLAY_SHADER_BASELINE=1` serves the explicitly
saved source files listed in `tests/artifacts/screens/baked_shader_loading/before-src/files.json`
from that directory, preserving paths relative to the repository. It does not
modify the checkout. The environment records whether that snapshot was used;
see `debug_tools/regression_debugging/baked_shader_loading.md` for its revision.

Each result includes actual update intervals, main-thread long tasks, page
visibility and initial/final GPU disjoint diagnostics. Compare repeated runs:

```powershell
node tools/gameplay_recording/analyze_replay.mjs tests/artifacts/screens/recorded_slowdown/analysis tests/artifacts/screens/recorded_slowdown/fresh-01/frames.json tests/artifacts/screens/recorded_slowdown/fresh-02/frames.json
```

The analyzer reports distributions and excursions exceeding both 1.75 times the
local median and that median plus 10 ms. Its centred window contains up to 61
frames within the same lap. Recurrence uses 32-source-frame bins; inspect the
individual events before concluding that a location causes a stall. CPU phases
overlap and must not be summed. `frameMs` measures start-to-start update intervals;
the frame after an expensive update will expose that delay.

The test pauses the physics solver and
applies one recorded visual bus/camera transform per rendered frame. It preserves
pose order, not original wall-clock pacing; temporal grace can therefore expire
at a different frame on faster/slower runs. It does not restore wheel/other-actor
history or reproduce first-use costs before the selected range. Use the E2E
runner: the `perf` runner forces a software renderer, which this test rejects.
