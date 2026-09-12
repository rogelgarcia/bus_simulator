# Regression Research Log — baked activation and recorded frame stalls

Date: 2026-09-11

Owner: Codex

Request: startup freeze and repeated slowdown in the supplied BUSREC1 capture.

## 0) Summary

The recording contains 2,518 frames (0x120–0xaf5, 71.33 seconds). It uses the
authored defaults and a 3520×1540 drawing buffer on an RTX 3060. It has one
baked-mode transition at 0x223; the generation stays constant afterward. The
subsequent slow periods are not repeated bake reloads.

The capture has several 1–2.45 second gaps during loading and a 5,567 ms frame
interval just after activation. Frame intervals include asynchronous work between
updates; the recorded CPU column measures only the update call. Do not attribute
that entire gap to the preceding recorded CPU sample.

## 1) Deterministic repro

Target: `tests/headless/e2e/gameplay_recording_replay.pwtest.js`, through
`node tools/run_selected_test/run.mjs`. Set `REPLAY_INPUT` to the artifact copy
`tests/artifacts/screens/baked_activation_stutter/route.busrec`, first/last to
`0x120`/`0xaf5`, `REPLAY_LAPS=3`, `REPLAY_PROFILE_STARTUP=1`, and a unique
`REPLAY_NAME`. Use installed Chrome and hardware rendering. Each run creates a
fresh private browser; the user's browser is neither closed nor cleared.

The test checks exact drawing-buffer dimensions, resolved settings, GPU identity,
constant baked generation, page errors and GPU sample coverage. It replays visual
camera/bus transforms in order, without restoring physics/other-actor history or
the original wall-clock pace. CPU profiling adds overhead. These cold test-browser
loads are not estimates of a returning user's cached load time.

## 2) Instrumentation and isolation

Startup CPU profiles and long-task observations locate main-thread work. Phase
changes distinguish package loading, receiver installation and shader readiness.
Replay frames record CPU phases and streaming requests/uploads/evictions; GPU
query samples are joined to the originating submission. Existing quality,
publication, sampling and memory-budget settings remain unchanged.

## 3) Experiment log

All run directories below are under `tests/artifacts/screens/recorded_slowdown/`.

| Run | Change | Outcome |
|---|---|---|
| activation-before-01 | Original code, three laps and startup profile | PASS reproduction. Source validation 7.58 s, decode/validation 6.69 s; receiver installation caused a 5.81 s long task. GPU timer error queries consumed ~13.3 s of sampled startup CPU time. |
| activation-after-01 | Receiver worker, cooperative geometry, GPU timer query fix | PASS three laps. Receiver-installation multi-second task removed. Profile then exposed ~10.6 s in repeated PerfBar GPU identity queries. Cold final-view preparation still ~85 s. |
| activation-after-02 | PerfBar caching, source-hash and shadow-package workers | PASS three laps. Remaining source geometry extraction had a ~1.7 s task. Cold view preparation ~82 s. |
| activation-after-03 | Cooperative identity extraction and perimeter-only guard iteration | Startup trace saved. Three-lap replay exceeded its old 180 s timeout; no complete route result. Increased replay timeout to 300 s, total test to 600 s. |
| activation-after-04 | Readiness checks current shader programs, final production changes | PASS three laps. Cold final-view preparation 81.76 s; receiver upload 261 ms. Initial city construction still ~5.91 s, separately from bake activation. |
| activation-after-05 | Diagnostic uniform-bounded shadow loops, identical sample counts | PASS three laps and isolated parent/detail pixel parity. Cold preparation 80.43 s: no established improvement; experiment reverted. |
| activation-diagnostic-no-analytic | Test-only removal of analytic bus AO branch | PASS startup and three single-pose samples. Preparation 67.76 s, still expensive; diagnostic override removed. AO stays enabled in production. |
| activation-flush-06 | One explicit GL flush after compile | PASS startup and three single-pose samples. Preparation 86.51 s; no benefit demonstrated, change reverted. |

## 4) Confirmed causes and fixes

- Package inflation, byte validation and canonical source hashing performed
  substantial main-thread work. Cancellable workers now run the original
  algorithms, transfer exclusive byte storage, and terminate on every outcome.
- Receiver geometry preparation previously ran as one blocking operation.
  Cooperative preparation now builds private geometry before committing bindings;
  cancellation restores/disposes private state. Runtime source extraction also
  yields between geometry hashes.
- Guard checking iterated every interior texel merely to skip it. It now checks
  the same complete perimeter directly; package hashes still cover all bytes.
- GPU timing queried GL errors repeatedly every frame, introducing driver waits.
  Validation occurs on initial submission/sample; context loss, query availability,
  disjoint state, exceptions and submission matching remain checked.
- PerfBar reset its renderer every frame, repeating GPU vendor/renderer queries.
  It now refreshes identity on renderer replacement or explicit reassignment.
- UI reported active before the prepared view could appear. It now remains
  Loading / preparing shaders until presentation is ready. Readiness polls current
  programs, following the pinned Three renderer's compileAsync behavior, instead
  of waiting on every retained historical material program.

No illumination textures were rebaked, and no quality/default setting was reduced.

## 5) Repeated route results and limitations

Each lap contains 2,518 samples. GPU times are milliseconds; p99 describes the
slow tail and is not the average of the slowest one percent.

| Run / lap | CPU median | GPU median | GPU p99 | GPU frames above 30 ms |
|---|---:|---:|---:|---:|
| before-01 / 1 | 19.60 | 19.11 | 36.69 | 87 |
| before-01 / 2 | 19.20 | 19.02 | 35.90 | 46 |
| before-01 / 3 | 19.40 | 18.76 | 38.36 | 127 |
| after-04 / 1 | 18.70 | 18.28 | 26.28 | 4 |
| after-04 / 2 | 18.20 | 18.04 | 25.73 | 0 |
| after-04 / 3 | 18.30 | 18.65 | 51.68 | 483 |

Typical frame cost is slightly lower, but the third after lap has substantial
unresolved variability. Slow intervals do not reliably recur at the same route
frames, including across intermediate fresh-process repeats. This is not evidence
that the recurring slowdown is completely fixed. Streaming uploads are brief
(generally ~0.4–0.5 ms CPU on upload frames) and do not explain the large periodic
bursts. No conclusion about external application interference is established.

Cold complete-city shader preparation still takes roughly 80 seconds in these
private-browser runs. It is asynchronous, but presentation remains held while
waiting and CPU load remains high. The worker changes remove specific CPU stalls;
they do not solve this remaining shader/presentation delay. Initial city assembly
and a smaller main-thread texture upload also remain. These are explicit remaining
issues, not claimed improvements.

## 6) Regression coverage

- 127 Node package, lifecycle, tile-integrity, GPU timer and PerfBar checks pass.
- `receiver_background_preparation.pwtest.js`: authenticated ownership transfer,
  corrupt packages, exact hashes, abort/termination and atomic geometry commit.
- `lighting_view_preparation.pwtest.js`: target restoration, cancellation,
  historical-program exclusion, superseded generations and honest status.
- Existing receiver surface/directional and static-sun adapter browser tests
  verify rendering and shader ownership after these changes.

## 7) Artifact index and follow-ups

Original recording, decoded data, profiler summaries and logs:
`tests/artifacts/screens/baked_activation_stutter/`.
Fresh-process profiles, phases and route samples:
`tests/artifacts/screens/recorded_slowdown/activation-*/`.
These generated files remain gitignored.

- [ ] Reduce cold final-city shader preparation without first-use drawing stalls.
- [ ] Isolate the remaining intermittent GPU tail with route-independent controls.
- [x] Preserve exact source/publication validation and current shadow quality.
- [x] Remove diagnostic shader alterations that did not establish an improvement.
- [x] Document reproducibility limits and remaining work.
