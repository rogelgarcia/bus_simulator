# Gameplay frame recording

## Debug workflow

Launch gameplay with `debug=true`. A second 24 px row below the performance
stats shows an incremental hexadecimal engine frame counter, camera world
position/orientation and bus anchor world position/orientation. Each transform
shows `XYZ` position and `Y/P/R°` (yaw, pitch, roll in degrees, YXZ Euler order).
Positions are rounded to two decimals and angles to one decimal; the recording
retains full-precision positions and quaternions. The counter increments
for each engine update requesting a render, including frames held during shader
preparation. It continues across game states until the page reloads. Updates
with `render:false` neither increment it nor emit recording samples.

**Record**, immediately left of **Copy camera position**, starts capture and
minimizes the Gameplay Debug panel. A compact widget above the dock displays
elapsed time, frame count and **Stop**. Detailed panel telemetry is suspended
while minimized, but input collection continues. Recording is independent of
whether the panel is restored or the stats bar is hidden. Closing the panel
during recording minimizes it instead of discarding the capture.

**Stop** waits up to one second for outstanding GPU samples, compresses the
capture in a module worker, and copies `BUSREC1:` text to the clipboard. The
result remains available through **Copy again** and **Download**; clipboard
denial does not lose it. Download produces a `.busrec` text file. Dismiss or a
new recording releases the previous result. Leaving gameplay stops sampling,
removes subscriptions, and terminates any compression worker.

Capture automatically stops at 36,000 frames (about ten minutes at 60 FPS).
Storage uses fixed 1,024-frame typed-array chunks, with no per-frame JSON
serialization. At the limit the raw numeric payload is about 7.8 MiB; final
compression size depends on movement and timing variability. No new GPU queries
are issued by the recorder: it reuses the existing asynchronous frame timer.

## Recorded data and timing

Each row contains:

| Group | Fields |
| --- | --- |
| Identity | Engine frame counter, milliseconds from recording start |
| Placement | Bus and camera world position XYZ and quaternion XYZW |
| Camera | FOV in degrees, zoom, near/far clipping planes, aspect ratio |
| Timing | Unclamped frame interval, engine CPU wall time, matched GPU elapsed time, recorder CPU wall time |
| Rendering | Draw calls, triangles, geometries, textures, shader programs, drawing-buffer width/height |
| Input | Steering, throttle, brake, handbrake, headlights flag |
| State | Paused/hidden/rendered/held/baked flags, bake generation |
| Diagnostics | GPU submission sequence, GPU disjoint count, optional JS heap MiB |

CPU time measures `GameEngine.updateFrame` through rendering and pipeline
cleanup, before frame listeners. It includes game updates and driver submission
wall time; it is not hardware CPU utilization. DOM frame listeners, browser
compositing and presentation are outside that measurement. The recorder's own
sampling and GPU-joining time is recorded separately. The unclamped frame
interval exposes stalls that these narrower measurements cannot capture.

GPU query results are delayed. Match them by submission sequence to the row
that issued that query, never to the row where the result arrives. A skipped
query has submission sequence zero. Unsupported, dropped, disjoint, or still
pending GPU values are `NaN`, never zero or the previous frame's value. The
decoder's expanded JSON represents nonfinite measurements as `null`.

`flags` uses rendered=1, paused=2, pageHidden=4, baked=8, viewHeld=16,
headlights=32. Held frames retain the most recently available world matrices;
their flags distinguish them from newly rendered gameplay frames. Renderer
counts use the engine's existing `renderer.info` scope, also used by the stats
bar. They are not separately instrumented per-pass totals.

## Configuration and reproducibility

Metadata includes city/model IDs, capture start time, browser/GPU identity,
Three.js revision, device pixel ratio, initial GPU timer diagnostics, timing
definitions, stop reason and duration. Each configuration event records the
actual sun direction/intensity/color and environment asset identity.

`usesDefaultValues` means the resolved settings equal the current authored
defaults. It describes values, not whether the user pressed **Use defaults** or
saved identical overrides. The defaults snapshot is stored once with a SHA-256
fingerprint, so a recording remains interpretable after default files change.
When any values differ, that event includes the full resolved Options
configuration: lighting, shadows, AA, AO, bloom, sun bloom, color grading,
atmosphere, building windows, asphalt, sun flare, static visibility, baked
lighting, and vehicle-motion debug settings. Options previews, saves and cancel
restorations emit additional configuration events while recording.
Each event's `sampleIndex` is the first recorded row using that configuration;
its `frame` is the engine counter at the time of the settings change. This
distinguishes changes between frames from settings used by the preceding row.

Bake mode/generation changes include channel status and available publication
identities, profile ID, shadow package and bus probe hashes. Static visibility
state changes are recorded as events. Bulk snapshots are taken on changes,
instead of traversing scene resources on every frame.

The capture is a visual/performance trace, not a complete physics save. It does
not contain solver history or transforms of every other actor. Extracted poses
use the existing version-1 gameplay-pose format and lock/pause the view. A full
replayer must additionally apply the configuration active at that frame, match
render dimensions, and restore recorded camera zoom/clip/aspect values if they
differ from the ordinary game defaults. The CLI does not automatically change
game settings or start playback.

## Binary format, version 1

The clipboard envelope is `BUSREC1:` followed by base64 gzip data. The
decompressed stream consists of:

1. Four ASCII magic bytes `BSR1`.
2. A little-endian uint32 metadata byte count.
3. A little-endian uint32 frame count.
4. One UTF-8 JSON metadata block.
5. Column-major little-endian numeric fields in `FRAME_FIELDS` order from
   `src/app/gameplay/recording/FrameRecording.js`.

Frame IDs, sample times, positions and quaternions use float64. Metrics, camera
projection values and analog controls use float32. Counts/flags use uint32.
Transforms are not quantized or delta-rounded. Column ordering makes repetitive
values compress efficiently while retaining exact pose doubles.

The decoder validates the envelope, binary version, exact payload length,
maximum frame count and bounded decompressed size. Gzip validates corruption.
Decoding treats the input as data and never evaluates scripts.

## Tools and checks

See `tools/gameplay_recording/README.md` for summary, JSON expansion and hex-frame
pose extraction commands. Keep generated captures, poses and screenshots under
the gitignored `tests/artifacts/screens/<topic>/` directory.

- `tests/node/unit/frame_recording.test.js`: multi-chunk round trip, exact pose
  doubles, missing measurements and malformed/truncated inputs.
- `tests/headless/e2e/gameplay_recording.pwtest.js`: docking, delayed/skipped GPU
  attribution, defaults/custom settings, clipboard denial/retry, repeated
  recording, narrow layout and cleanup; real-game contiguous capture, matching
  HUD counter and sampling cost.
- `tests/headless/e2e/gameplay_recording_replay.pwtest.js`: opt-in repeated hardware
  replay, exact bus/camera transforms, render-size/config matching and GPU sample
  provenance. See the tool README for limits and environment arguments.
