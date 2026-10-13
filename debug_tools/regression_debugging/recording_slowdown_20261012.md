# Recording slowdown investigation — 2026-10-12

## Finding

The main reproduced cause of the repeated slow/release pattern is blocking GPU
uploads of the moving 3D grass instance buffers. The engine's 50 ms timestep cap
then turns long frames into actual simulation slow motion. Higher late-route
rendering cost makes both effects worse. This was an investigation: no production
source, graphics setting, asset, bake, or validation gate was changed.

## Supplied evidence

Input preserved at `tests/artifacts/screens/recording_slowdown_20261012/route.busrec`.
SHA-256: `fc3d1f6aa64696c74b6570f7a168a0197de236e399da8114c6686b066856ca21`.
The original attachment was not modified.

- Capture starts 2026-10-13 01:37:34.812 UTC (October 12, 21:37:34.812 EDT).
- 1,498 contiguous frames, 0x714–0xCED, 45.336 seconds.
- Chrome 154, Three r183, NVIDIA RTX 3060 / ANGLE D3D11.
- Drawing buffer 3814 × 1672, DPR 2; MSAA 8, high GTAO every frame,
  single/high shadows, and custom lighting.
- All frames rendered, visible, unpaused; no view holds or GPU disjoints.
  Every input frame has a matched GPU sample.
- One settings event and one stable fallback state throughout: baked shadows and
  indirect illumination reject `city_map_not_current`; static visibility rejects
  `city_config_hash_mismatch`. These are persistent missing optimizations, not
  repeated bake activation events.

| Recording interval | Effective FPS | GPU median | Frame-interval p95 | Simulation time / wall time |
| --- | ---: | ---: | ---: | ---: |
| 0–5 s | 36.8 | 25.45 ms | 50.0 ms | 100.0% |
| 20–25 s | 38.7 | 24.44 ms | 50.0 ms | 100.0% |
| 30–35 s | 27.4 | 33.57 ms | 83.3 ms | 89.3% |
| 35–40 s | 24.7 | 37.88 ms | 83.4 ms | 83.9% |
| 40–45 s | 24.2 | 38.93 ms | 83.4 ms | 82.0% |

Late CPU bursts typically contain 70–90 ms frames and recur roughly every 0.5 s.
The longest recorded interval is 116.7 ms at 0xC74, preceded by a 111.2 ms CPU
update at 0xC73. Normal CPU submission frames interleave with these stalls.
CPU and GPU measurements overlap and must not be summed.

Draw calls rise from a median 361 at 20–25 s to 2,447 at 35–40 s (peak 2,854).
Triangles rise from about 5 million to 9–10.5 million per recorded renderer scope.
Shader count stays at 75. After 32.69 s, texture/geometry counts stay fixed at
126/2,721. Existing buffer uploads do not change those resource counts.
Recorder sampling itself is at most 0.2 ms. Heap drops do not consistently align
with the stalls; they are not evidence that GC is the main cause.

## Simulation-time amplification

`src/app/core/GameEngine.js:1604` clamps each RAF interval to 0.05 seconds before
passing it to gameplay. `GameLoop.update` passes that value into physics. The
excess never enters the physics accumulator. An 83.4 ms frame therefore advances
only 50 ms of simulation; the next quick frames resume normal speed without
recovering that discarded time.

Replaying the input intervals through the actual `PhysicsLoop`, with the engine
clamp and the normal 1/60 s fixed step / ten-substep limit, yields:

- Sum of raw frame intervals: 45.287100 s.
- Time delivered to physics: 42.816600 s.
- Fixed steps performed: 42.800000 s; remaining accumulator: 0.016600 s.
- Discarded elapsed time: **2.470500 s**, including 1.734300 s after recording 35 s.

The small difference between summed RAF intervals and recorder duration is due
to different sampling boundaries. `timeMs` is sampled after the engine update;
`dtMs` is the interval between RAF timestamps. A long update usually appears in
the next row's interval, not the same row.

## Reproduction and isolation

The standard `gameplay_recording_replay.pwtest.js` assumes active baked lighting
and current/recorded default settings; its readiness assertion rejects this
recording's authentic fallback mode. Task-local `repro*.mjs` scripts therefore
use its camera application order and pose semantics with explicit saved custom
settings and fallback readiness. They live only in the gitignored artifact folder.

Each run uses a fresh private Chrome profile, matching resolution and all fields
currently captured by `captureRecordingSettings`. Physics is paused, the recorded
bus pose is applied before the world update, and the recorded camera is applied
at GameplayState's camera step. Full-route runs warm the first pose for 120 frames,
then apply one recorded pose per rendered frame. Their speed is determined by the
test machine, not the original wall-clock pacing. Stationary controls hold 0xC50.
No user browser or Blender process was closed or modified.

| Run | Intervention | Result |
| --- | --- | --- |
| `stationary-*` | Headless stationary pose, phase timers | 480 measured frames; CPU p95 17 ms, interval max 44.2 ms. No recurring long stalls. Frozen timer-method wrapping in this initial diagnostic did not attach; its missing timer scopes are unavailable, not zero. |
| `route-headed-*` | Normal desktop presentation, full route twice, lightweight phase timers | Repeated stalls on both laps. Late CPU p95 63.4 / 63.3 ms; interval p95 64.0 / 63.8 ms. Timer wrapper corrected with a private proxy over the immutable API. |
| `stationary-headed-gl-*` | Stationary pose with desktop presentation, GL wrappers and CPU profiler | 480 frames; CPU p95 19.5 ms, max 26.1 ms. Movement-dependent uploads are absent. |
| `route-gl-*` | Full moving route, GL wrappers and CPU profiler | Stalls attributed to `bufferSubData`. About 20.87 s inside those calls, corroborated by 20.82 s of sampled native `bufferSubData` time. All 62 late frames with CPU >60 ms have >30 ms of buffer-upload time. |
| `route-owners-*` | Moving route, map upload arrays to scene attributes | Blocking uploads belong to GameplayGrass `instanceMatrix` attributes, primarily ground, LOD5 interior and blend, and LOD4 blend batches. |

The two ordinary route laps have 25 late bursts above 50 ms each; median gap
between starts is 396 / 385 ms at their faster replay pacing. Thus the exact
half-second period is not a fixed timer established by these results.

Late ordinary replay GPU median is 30.58 / 30.70 ms, less than the user's 38–39 ms.
This is not a timing-identical recreation, but the moving-route stall mechanism
persists after a full warm lap. GPU timer begin/end/poll each stays below 0.2 ms;
nearby asset preparation stays below 0.8 ms and sun-bloom below 3.1 ms in that run.
Phase scopes overlap, so their totals must not be added.

GL wrappers and CPU profiling are diagnostic interventions and their absolute
numbers must not be mixed with ordinary benchmark measurements. GPU samples are
matched by submission; missing final replay samples remain null.

A browser-only source override changed grass matrix/edge usage from
DynamicDrawUsage to StreamDrawUsage, with no on-disk production edit. Two laps
still had late CPU p95 59 / 60 ms and 33 / 37 frames above 50 ms. This modest
variation does not establish a fix; the repeating stalls remain. Artifacts:
`route-stream-diagnostic-*` and `stream-diagnostic-comparison.json`.

## Source attribution

- `GameplayGrassRenderer.update` recalculates grass selection as the camera moves,
  with 16 m anchor shifts and selection movement/interval thresholds. A stationary
  camera skips those selection updates.
- `GrassDebugV2TransitionFields.rebuild` (the membership loop around
  lines 378–403) repacks matrices when membership changes, calls
  `instanceMatrix.needsUpdate = true`, and does not set upload ranges.
- Batches allocate up to 16,384 matrices: **1 MiB per full matrix array**, or
  256 KiB for smaller variant batches. The active instance count can be far lower
  than the allocated capacity. The owner diagnostic's `count` values are snapshots
  from owner registration, not synchronized counts for every later upload.
- Three's `WebGLObjects.update → WebGLAttributes.updateBuffer → bufferSubData`
  executes these uploads while rendering. The CPU profiler attributes the stalls
  to the native upload call, not the JavaScript membership loop.
- Existing `DynamicDrawUsage` does not prevent these waits on this driver. Buffer
  synchronization/reuse under GPU load is the likely driver mechanism; a browser
  CPU trace alone does not expose its internal scheduling implementation.

## Limits and host context

The recording has no source revision or per-pass CPU profile. Attribution comes
from current-source reproductions; not every original outlier is individually
proven to share the same cause. Key served engine, physics and grass sources were
compared byte-for-byte (normalizing CRLF) with this checkout and hashed in
`source-verification.json`. Chrome version matches the recording.

A separate headless Blender process (PID 51136) was observed during initial host
inspection. Its creation time, October 12 at 21:38:02 EDT, overlaps the original
capture from about second 27.2 onward. It finished independently before ordinary
route confirmation. This makes competing GPU work a plausible contributor to the
higher original late GPU times, but no synchronized per-process GPU history was
captured, so its share of the original slowdown is not proven. An existing GUI
Blender session was left untouched. No production bake was attempted.

The recorder's settings schema omits grass configuration; the reproduced active
GameplayGrass objects establish its state in these runs, not an exact historical
grass-settings assertion. First-use resource history also differs in fresh
browsers. Current assets and the supplied recording's world poses were used.

## Artifacts and next work

Everything generated is under `tests/artifacts/screens/recording_slowdown_20261012/`:
input/decoded JSON, `summary.json`, `physics-clamp-check.json`, `timing.png` and
`timing.svg`, replay scripts and per-frame JSON, CPU profiles, `buffer-owners.json`,
`gl-attribution.json`, `replay-comparison.json`, and `source-verification.json`.

Next fix should target grass upload scheduling and buffer reuse without changing
visible grass: test bounded active update ranges or buffer
rotation/orphaning as appropriate. Confirm repeated moving-route pacing and exact
membership/rendered appearance. Separately address elapsed-time handling without
removing the physics catch-up budget. Restore current visibility/lighting bakes
through `node tools/bake.mjs` and the registered hierarchy, preserving all
compatibility and publication gates; never bypass stale-data checks.
