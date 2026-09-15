# Occasional frame hitches after facade refinement

Date: 2026-09-14. Starting revision: `6a619a2`.

Scope: occasional CPU/GPU/frame-interval spikes only. The user accepts the
remaining lighting parity differences; do not change illumination or materials.

## Reproduction plan

- Inspect the isolated 34.17 ms pose 02 GPU sample from AI571.
- Replay the saved 2,518-frame route three laps per fresh Chrome process, three
  processes sequentially. Use current defaults explicitly, with the recorded
  3520x1540 drawing buffer and exact camera/bus poses. Archive recorded settings
  alongside current settings rather than claiming historical configuration parity.
- Record submission-matched GPU samples, CPU phases, actual update intervals,
  long tasks, streamed shadow requests/uploads/evictions and resource counters.
- Compare source-frame locations across laps/processes and inspect CPU vs GPU
  correlations. A replay preserves visual pose order, not original wall-clock
  pacing, physics history or other actors.
- Use a stationary pose control to distinguish route-specific work from unrelated
  intermittent stalls. Add targeted instrumentation only if the first runs justify it.

The replay owns fresh private browser processes and does not close user applications
or clear their memory. Other application GPU load is a possible confounder, not an
established cause. No Blender or rendering bake is required.

Artifacts: `tests/artifacts/screens/recorded_slowdown/hitches-20260914-*`.
Initial stationary evidence:
`tests/artifacts/screens/ai562_acesfilmic_reference_matching/ai571_performance_20260914_01/`.

## Findings

Sandbox attempts `fresh-01`/`fresh-02` failed before gameplay because asset requests
were denied; they contain no valid benchmark. Subsequent private-browser runs use
the approved normal desktop permissions. The user's Chrome remains untouched.

`fresh-03` and `fresh-04` pass all three laps at the original resolution. First-lap
stalls repeat exactly at 0x2E5, 0x30B, 0x36E and 0x42C, and disappear on warm laps.
The first two coincide with three new renderer textures each. All four have zero
shadow-stream upload/request deltas and no new shader-program count that frame.
The renderer phase accounts for most of the extra CPU time. GPU maxima are
72.34/86.89 ms on the cold laps versus 32.65–35.70 ms on warm laps.

## Completed results

All three ordinary fresh-browser sessions (`fresh-03`, `fresh-04`, `fresh-05`)
passed three full laps: **22,662 measured frames**, including 15,108 warm-route
frames. Current defaults, RTX 3060 / D3D11, 3520x1540, physics paused, recorded
visual pose order. No bake generation changes, baked-mode loss, hidden-page
samples, invalid GPU disjoint events or page errors. The shader/frame controls
and world lighting were not changed.

| Session | Cold GPU median / p99 / max ms | Warm lap 2 GPU median / p99 / max | Warm lap 3 GPU median / p99 / max |
|---|---:|---:|---:|
| fresh-03 | 19.67 / 28.64 / 72.34 | 21.65 / 29.03 / 33.12 | 20.76 / 27.94 / 32.65 |
| fresh-04 | 23.62 / 30.35 / 86.89 | 22.50 / 31.10 / 34.21 | 23.72 / 31.24 / 35.70 |
| fresh-05 | 21.73 / 28.96 / 82.62 | 23.41 / 32.03 / 42.05 | 23.97 / 35.20 / 56.28 |

The four first-use stalls repeat at exactly the same source frames in **all three
cold laps** and disappear on their warm laps. Renderer resource increments:

| Frame | Newly resident geometries | New textures | Ordinary cold GPU range ms |
|---|---:|---:|---:|
| 2E5 | 2 | 3 | 60.22–82.62 |
| 30B | 60 | 3 | 68.94–79.74 |
| 36E | 376 | 0 | 72.34–86.89 |
| 42C | 188 | 0 | 37.66–42.74 |

`resources-03` adds a separate timed-WebGL diagnostic (833 moving frames followed
by 3,332 stationary frames at source pose 0x300). It passed in 3.6 minutes.
Its startup completed normally: `preparationRetry=null`. Diagnostic instrumentation
adds overhead, so do not merge its distributions with ordinary benchmark results.

| Frame | Engine CPU / GPU ms | Timed resource work |
|---|---:|---|
| 2E5 | 74.10 / 75.43 | Texture upload calls consumed 51.90 ms CPU; 3 mip generations |
| 30B | 67.70 / 37.63 | Texture upload calls consumed 42.80 ms CPU; 342 bufferData calls, 10,427,700 bytes |
| 36E | 87.30 / 78.30 | 2,108 bufferData calls, 21,331,748 bytes; 376 geometries initialized |
| 42C | 57.60 / 34.34 | 1,054 bufferData calls, 13,506,200 bytes; 188 geometries initialized |

For the latter geometry events, bufferData JavaScript wall time alone is only
3.2/2.2 ms. The full cost includes first-use geometry/attribute setup and drawing;
do not claim all 80/50 ms of renderer CPU was spent inside bufferData. There were
no shader compilation/link events in these frames. Driver timing queries cost
approximately zero at the recorded clock precision. Shadow upload time is zero
on almost all repeated stalls; one 42C pass overlaps a 0.4 ms shadow upload, far
too small to explain the event.

The stationary control's four blocks have GPU medians 18.87–19.03 ms, p99
22.72–23.37 ms and maxima 24.08–25.48 ms. CPU maxima are 27.4–34.6 ms and interval
maxima 28.0–35.3 ms. Thus the old AI571 34.17 ms stationary GPU event did not recur
in this control. This is a different pose/resolution, not proof that the original
single event is eliminated. It separates route initialization from an unmoving view.

## Remaining intermittent events and limits

- The last warm route lap in fresh-05 contains a 56.28 ms GPU event at 0x321
  without resource growth, and a **different** 95.70 ms CPU event at 0x488 (GPU
  29.40 ms). The latter spends 54.8 ms in receiver validation. Other CPU phases
  also vary with system conditions. These are not reproduced consistently at the
  same frame; no GC, driver, scheduling or external-process cause is established.
- `resources-01` and `resources-02` hit the existing 90-second lighting shader
  preparation deadline before measurement. Their startup failures are retained;
  they are excluded from timings. The successful retry run did not need the new
  explicit one-retry diagnostic option. Cold shader preparation remains a separate
  issue; this work did not raise the game's deadline or weaken readiness gates.
- Fresh browsers release their own CPU/GPU state; they do not purge OS/driver
  caches or close other user applications. Small median shifts across sessions
  must not be presented as a causal performance change.

## Conclusion and next implementation

The repeatable large route hitches come from **deferred first-use texture upload
and geometry initialization/drawing** when new buildings enter visibility. This
is distinct from continuous fine-lightmap cost or repeated bake activation.
Texture upload blocking is directly timed; geometry first-use attribution is
supported by exact three-process recurrence, upload counters and warm controls.

Recommended next fix: prepare nearby texture and geometry resources in bounded
background batches before first visibility, then rerun this same cold/warm route.
Preserve materials, illumination, shadow resolution, visibility rules and resource
budgets. Prewarming the entire city synchronously would simply move the freeze to
startup. Separately profile any remaining receiver-validation outlier before
changing its correctness checks.

This request was to **check** the occasional hitches. Production rendering is
unchanged; the additions are diagnostic replay options, analysis, and this log.
Syntax/diff checks and all three ordinary hardware replays plus the diagnostic
control passed. Lighting parity differences remain accepted and untouched.

## Evidence

- `hitches-20260914-analysis-03/{analysis.json,summary.md}`: nine ordinary laps,
  exact-frame excursions, long tasks, and recurrence bins.
- `hitches-20260914-diagnostic-analysis/`: resource diagnostic and stationary
  distributions. Stationary source-frame bins must not be mistaken for route
  recurrence; the camera is intentionally fixed.
- `hitches-20260914-resources-03/{frames.json,environment.json}`: timed WebGL events,
  full settings snapshots, provenance and successful startup without retry.
