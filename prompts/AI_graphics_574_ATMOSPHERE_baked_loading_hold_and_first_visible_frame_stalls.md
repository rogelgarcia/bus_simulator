# In progress — Step 6 diagnostics implemented; attribution/sign-off open

Steps 1–5 retain their verified startup improvement and historical evidence.
Step 6 added host telemetry, separate GPU-pass/GL/CPU diagnostics and query
regression coverage. Eleven new unprofiled cold startups, six warm activations,
three separate diagnostic captures and four new harness tests pass. Across three
counterbalanced resize/warm pairs, original/current medians are 64.25/39.43 s
Enter-to-baked, 21.9/21.6 ms settled CPU, and 22.52/22.21 ms settled GPU.
Images, lighting settings and baked-map residency are unchanged. The older
Step-5 penalty did not reproduce; no responsible version interval or external
cause has been established. Its slower captures are retained, and tail/memory
variance still exists. No speculative production fix was made in Step 6.
Latest post-reboot continuation: three more matched pairs and two lifecycle
diagnostics pass; 61.95 to 38.08 s startup, effectively unchanged settled cost,
no progressive resource growth in four repeated activations, +26.04 MiB retained
main-renderer heap/backing storage after diagnostic GC. Full continuation below.
AI574 remains open until the remaining attribution/sign-off item is resolved.
Do not mark DONE or claim zero performance overhead from these reruns.

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
- [x] Reproduce ordinary garage-to-game startup with the recording's initial
  pose, exact settings and resolution, using the current source. Capture loaded
  source/build fingerprints so stale browser code can be distinguished from an
  actual regression. Keep no-resize and recorded-resize cases separate.
- [x] Instrument loading, validation, decode, receiver binding, texture/geometry
  preparation, program submission/readiness and first visible rendering. Record
  every preparation request/revision, cause, cancellation and completion.
  Measure total wait from the first request as well as the last successful pass.
- [x] Attribute the held-frame CPU stalls and the distinct first-visible GPU
  and CPU stalls with a separate startup profile and targeted resource tracing.
  Do not infer GC, repeated compilation or resource ownership from counters alone.
- [x] Fix the demonstrated avoidable blocking or repeated work. Coordinate
  resource readiness with AI 572's budgeted preparation; preserve cancellation,
  ownership, city changes, context loss and restoration of the last valid view.
- [x] Prevent stale preparation completions from releasing a newer view. Ensure
  ordinary resize or equivalent settings do not cause unnecessary preparation
  cycles, if that is demonstrated to occur.
- [x] Preserve authored settings, maps, resolution, sun/sky calibration, samples,
  filtering, indirect light and materials. Preserve source-only Final shader
  specialization and absence of the fixed ANGLE warnings.
- [x] Add focused regression tests for the confirmed cause, update relevant
  specifications and append investigation findings/changed paths here.
- [x] Repeat startup before/after three times in fresh private browsers, with
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

- Baseline committed in `f99367f`; runtime baseline is identical to `0873f2b`.
- AI 572 owns first-use resource preparation. AI 575 owns recurring frame cost
  after lighting is already active. Keep their scopes and measurements distinct.

### Completed changes and evidence

- `LightingViewPreparation.js`: cooperative program submission, all object variants,
  asynchronous readiness, uniform/attribute reflection and AO material snapshots.
- `LightingViewResources.js`: prepare visible buffers/textures before presentation.
- `LightingViewRasterPreparation.js`: actual-resolution offscreen draw plus an
  asynchronously polled fence. A tiny draw did not remove the GPU hitch.
- `ReceiverTexturePreparation.js` / `EnhancedReceiverResources.js`: bounded atlas
  and coordinate row uploads without repeated synchronous GPU-state queries;
  keep all HDR layers/mips and invalidate partial uploads after cancellation.
- `ReceiverCoplanarOwnership.js`, `EnhancedReceiverCoplanarGeometry.js` and
  `EnhancedReceiverMaterialAdapter.js`: yield within large private geometry repairs;
  maintain coverage and dispose cancelled preparation without replacing live geometry.
- `BakedLightingRuntime.js`, `GameEngine.js`, `ReceiverLightmapRuntime.js` and
  `StaticSunDepthPipeline.js`: bounded request/revision/phase history and wait timing.
- Added `baked_startup_profile.pwtest.js` and `receiver_texture_preparation.pwtest.js`;
  extended readiness/coplanar regressions. Seventeen focused tests pass. Updated
  `specs/graphics/illumination_runtime_modes.md` and `receiver_lightmaps.md`.

Full research log, rejected experiments, per-condition statistics and memory:
`debug_tools/regression_debugging/ai574_baked_startup.md`.

Three fresh before/after runs per condition, RTX 3060 / ANGLE D3D11 / Chrome 151,
3390×1540, DPR 2, exact recording defaults; values are median of three runs:

| Measurement | Before, no resize | After, no resize | Before, resize | After, resize |
|---|---:|---:|---:|---:|
| Enter → first baked view, s | 60.80 | 61.44 | 60.63 | 61.37 |
| First-frame CPU, ms | 199.4 | 21.5 | 195.7 | 21.2 |
| First-frame GPU, ms | 182.20 | 23.01 | 218.76 | 23.07 |
| Steady CPU median / p99, ms | 20.00 / 24.36 | 18.50 / 22.55 | 20.20 / 23.79 | 17.80 / 21.16 |
| Steady GPU median / p99, ms | 19.70 / 24.63 | 19.03 / 22.24 | 20.35 / 24.86 | 18.32 / 21.60 |
| Steady elapsed-time FPS | 47.44 | 51.09 | 46.57 | 52.83 |

Steady sample: visible baked frames 11–180, 170/run. Actual interval p99 is
33.40→35.53 ms without resize and 33.40→35.36 ms with resize. No claim of driving
route speedup; that remains AI 575. Calls/triangles/geometries/programs remain
915 / 849361 / 1677 / 145. Resident map subtotal stays 1345.8125 MiB; one additional
lazy texture is initialized. Its exact driver bytes and total process VRAM are
not measured (WebGL counters do not expose allocation bytes). No extra full-size
scene target or atlas is added to the game's postprocessing path.

Resize order/gaps match the recording but are aligned early in preparation;
they are not the original absolute 89–100 s timing. Both versions made just two
real preparation passes (Current and baked), so no repeated-resize compile bug
was found. A separate later baseline startup took 55.92 s, illustrating remaining
driver/compiler variability; see the log rather than treating medians as exact.

Warm Current→Auto: first frame 63.8/103.89 ms CPU/GPU → 21.6/22.86 ms; request wait
952.5→1254.8 ms. It is one warm sample per version. Clean-image RGB MAE across six
comparisons is 0.000241–0.000651 /255, with no visible quality change. All settings,
authenticated maps and shader sources are unchanged; no X3595/X4000 warnings.

Remaining startup work within AI 574: initial city construction (~5.5–6 s), large
owned static-shadow WebCrypto hashing (~0.7 s task), initial live-shadow shader
reflection (~0.6 s), source texture canonicalization/readback (~0.35 s) and
activation (~0.29 s) still have indivisible main-thread work. Those checks were
not weakened. Larger ownership/worker changes and live-shadow precompilation are
pending work in this prompt. AI 572 covers nearby driving resources; AI 575 covers recurring
freshness/render cost, including generated watch functions observed in these profiles.

## Pending cold-start improvements

The goal is to shorten Enter-to-first-Current and Enter-to-first-baked durations
as well as reduce freezes. Smaller batches alone are not evidence of faster
loading. The measured final preparation starts around 36 seconds and lasts
about 25 seconds; that includes readiness, bindings, resources and raster work,
not exclusively shader compilation. Phase durations overlap and must not be
added as predicted savings. The following are investigation/implementation
candidates, not proven causes or guaranteed time reductions.

### Step 1 — Overlap preparation dependencies (complete)

- [x] Start preparation of exact baked shader variants earlier, overlapping
  asset loading and validation where dependencies permit. Preserve atomic
  activation, source authentication, cancellation and the last valid live view.
  Do not activate unvalidated maps or introduce extra repeated compilation.
- [x] Step 1a: remove unnecessary serialization of independent shadow loading
  and receiver source/resource preparation. Keep receiver material/geometry
  installation behind the verified shadow preparation boundary. Measure whether
  this advances submission of the unchanged final shader variants.
- [x] Step 1b: investigate submitting exact final variants during remaining
  resource preparation, using isolated ownership. Do not compile an expensive
  temporary receiver-plus-CSM variant or make speculative materials visible.
- [x] Step 1c: validate cancellation, fallback, unchanged images and three-run
  startup timing before accepting each scheduling change. Keep shader complexity,
  offline precomputation and hashing redesign for the following steps.

Step 1a result (2026-09-15): shadow loading and receiver source/map preparation
now overlap; receiver uniform/material/geometry installation still waits for
verified shadow preparation in the current generation. Changed
`BakedLightingRuntime.js`, `ReceiverLightmapRuntime.js`, and
`EnhancedReceiverLightmapRuntime.js`; updated `illumination_runtime_modes.md`.
Three enhanced-runtime overlap cases and 16 related regressions pass. The old
transaction fixture needed its missing existing streamed-detail method stub.

Three alternating fresh-process before/after pairs, RTX 3060 / ANGLE D3D11,
Chrome 151, 3390×1540, DPR 2, exact recording defaults, no resize or profiler:

| Median measurement | Before Step 1a | After Step 1a |
|---|---:|---:|
| Enter → live Current, s | 19.76 | 17.57 |
| Enter → first baked frame, s | 70.95 | 62.56 |
| Loading → internal activation, s | 31.92 | 27.24 |
| Enter → final shader submission, s | 41.08 | 36.35 |
| First baked CPU / GPU, ms | 25.30 / 23.33 | 26.50 / 23.75 |
| Steady CPU / GPU median, ms | 20.60 / 21.50 | 20.60 / 21.57 |
| Steady frame interval p99, ms | 33.40 | 33.40 |
| Steady elapsed-time FPS | 46.15 | 44.93 |
| Largest post-construction main-thread task, ms | 738 | 804 |

Steady sample: 170 rendered frames/run, frames 11–180. Calls/triangles remain
915/849361; geometries/textures/programs remain 1677/107/145; resident map GPU
subtotal remains 1345.8125 MiB. Whole-process peak memory is not measured;
overlapped staging changes transient lifetimes. No lighting/shadow setting or
shader source changed. Images have no visible difference (RGB MAE at most
0.000669 /255); no shader warnings or GPU disjoint events occurred.

Total times vary: before 70.945/66.274/71.508 s; after 62.556/62.156/71.950 s.
The last after run includes a 9.586 s city-construction task. Do not discard it
or attribute all 8.39 s of median total improvement to this patch. The more
consistent loading→activation reduction is 31.61–32.07 s before versus
26.28–28.87 s after. Large CPU stalls remain, and the short stationary frame
sample does not establish a driving performance gain or penalty.

At the end of Step 1a, Step 1 remained open. Step 1b needed to isolate exact baked shader recipes/cache keys,
receiver coverage hooks and the final light inventory without changing live
objects. At that point code installed them at activation, so Step 1a advanced
their submission through earlier input readiness; it did not yet compile the
final variants during map loading. Details, rejected approaches and all measured
data: `debug_tools/regression_debugging/ai574_baked_startup.md` and ignored
`tests/artifacts/screens/ai574_baked_startup/step1-comparison.json`.

Step 1a's additional resize/warm check passed: 60.94 s Enter→baked with the
recorded resize sequence; warm Current→Auto 1.383 s, first CPU/GPU
25.10/25.29 ms. These are single functional samples. Full repeated resized
comparisons remain Step 5; Step 1c also applies again to any future Step 1b change.

### Step 1b result — exact shaders during map preparation (2026-09-15)

The authenticated root mapping now starts an isolated city shader stage while
remaining receiver packages and uploads continue. It uses the actual verified
shadow binding, exact receiver coverage, authored material defines/accessors and
patches, final sun/CSM inventory and dynamic AO recipe. All 35 staged city programs
were acquired by the final view in all three final runs. No temporary material or
geometry is displayed. Failed packages, source changes and superseded requests
cannot publish those bindings; staged owners are released on cancellation or
final handoff. Historical receiver representations retain final preparation.

Three fresh-process before/after pairs using the same recorded defaults, RTX
3060 / ANGLE D3D11, Chrome 151, Three r183, 3390×1540 at DPR 2, no resize, no CPU
profiler. Baseline is the preserved post-Step-1a source (`step1b-before-src/`).
A fresh browser does not guarantee empty OS/driver caches. Pairs ran separately;
no simultaneous benchmark browser was started. Steady samples are rendered baked
frames 11–180, 170 per run. Values below are medians of run statistics.

| Measurement | Before Step 1b | After Step 1b |
|---|---:|---:|
| Enter → live Current, s | 18.24 | 17.73 |
| Enter → first baked frame, s | 65.19 | 56.95 |
| Loading → internal activation, s | 27.70 | 36.28 |
| Final view preparation, s | 28.03 | 12.01 |
| First baked CPU / GPU, ms | 25.20 / 24.10 | 25.50 / 23.40 |
| Steady CPU / GPU, ms | 21.50 / 21.95 | 21.20 / 21.80 |
| Steady CPU / GPU p99, ms | 31.55 / 25.79 | 30.86 / 25.60 |
| Steady frame interval p99, ms | 33.40 | 33.40 |
| Steady elapsed-time FPS | 43.40 | 43.77 |
| Largest post-construction task, ms | 773 | 979 |
| Resident map GPU subtotal, MiB | 1345.8125 | 1345.8125 |
| Observed peak geometry / texture / program counts | 1677 / 112 / 146 | 1677 / 112 / 146 |

All total times: before **70.892 / 65.191 / 57.540 s**, after **60.271 / 56.592 /
56.947 s**. Median improvement is 8.24 s (12.6%), but variable construction,
system/driver conditions and the small third-pair difference mean this is not a
guaranteed 8-second saving. Overlap makes loading-to-internal-activation longer
because compilation competes with uploads/validation; it cuts the later held
preparation more. Phase durations overlap and must not be added as savings.

The largest post-construction task did not improve: before 1377 / 773 / 696 ms,
after 1177 / 979 / 743 ms. Maximum staged submission batches were 1116.8 / 432.7 /
553.9 ms despite yielding between batches; a driver call cannot be preempted by
a 4 ms JavaScript budget. Step 2 must address compiler work; Steps 3–4 retain
construction/hash/canonicalization ownership costs. One after run has a 40.31 ms
first GPU frame, and another a 41.78 ms steady GPU p99. Keep these outliers; this
short stationary sample does not establish hitch-free driving or a route gain.

Final workload is unchanged: 915 calls, 849361 triangles, 1677 geometries, 107
textures and 145 programs. Whole-process peak CPU/GPU bytes are **not measured**;
counts sampled at frame boundaries can miss transients. The stage borrows existing
texture/geometry storage and preserves the resident map budget. Exact shader
sources, authored material appearance, lighting, shadows, exposure and quality
settings are unchanged.

Images were visually inspected: RGB MAE 0.000254–0.000641 /255, with at most four
of 5,220,600 pixels differing by more than four levels, isolated maximum 25.
No visible difference; not bit-identical. All six runs have zero captured shader
warnings and zero GPU disjoint events. Evidence: ignored `step1b-before-01..03/`,
`step1b-after-01..03/` and `step1b-comparison.json` under the existing artifact root.

Focused validation: 38 checks passed (3 exact-stage ownership/CSM/cancellation,
7 coordinator/publication boundaries including a changed source, 3 real page-shard
authentication cases, 5 view preparation, 4 receiver background, 4 atomic
transactions, 3 gameplay loading, 1 texture upload, 8 material-hook registry).
The new success-path test fixture initially omitted `mappingTexture.image.data`;
its metadata was corrected, without changing production diagnostics.

Changed runtime files in this pass: `BakedShaderStage.js` (new),
`LightingProgramPreparation.js` (new), `LightingViewPreparation.js`,
`BakedLightingRuntime.js`, `BakedShadowRuntime.js`, `StaticSunDepthPipeline.js`,
`EnhancedReceiverShaderBinding.js` (new), `EnhancedReceiverMaterialAdapter.js`,
`EnhancedReceiverResources.js`, `ReceiverLightmapRuntime.js`,
`MaterialShaderHookRegistry.js`, `City.js`, and `DynamicAoRuntime.js`.
Changed/new tests: `baked_shader_staging.pwtest.js`, `baked_startup_overlap.pwtest.js`,
`receiver_page_shards.pwtest.js`, `baked_startup_profile.pwtest.js`.
Specs: `illumination_runtime_modes.md`, `shader_layout.md`. Investigation and
rejected experiments are in `debug_tools/regression_debugging/ai574_baked_startup.md`.
The prior AI 574 and Step 1a work remains separate in this history; do not attribute
all uncommitted changes to this pass. No commit requested.

Additional resize/warm functional check passed (`step1b-after-resize-warm/`):
65.69 s Enter-to-baked; first CPU/GPU 33.60/21.84 ms; 35/35 staged programs reused.
Warm Current-to-Auto took 2165.6 ms; first CPU/GPU 29.20/61.81 ms, 217 resident
programs, no GPU disjoint event. Warm/initial image MAE is 0.000026 /255 (only two
pixels differ by >4). The single warm GPU outlier remains evidence, not discarded;
this functional sample is not a repeated warm performance comparison. Full
resized/warm comparisons remain Step 5. The warm report exposed stale prior-load
`shaderOverlap` diagnostics when cached maps skipped loading; refresh now clears
that field, verified by the mode-change test. This last diagnostics-only edit
does not alter the measured scheduling or renderer workload.

Step 1b and its Step 1c checks are complete; Step 1 is complete. AI 574 remains
open at Step 2. Restored `tests/.selected_test` to
`tests/node/unit/frame_recording.test.js`; `git diff --check` passes. Generated
snapshots, JSON and PNG evidence remain ignored. No commit made.

### Step 2 — Reduce compiler work (implemented and measured)

- [x] Identify the expensive shader variants and reduce unnecessary variants
  or compiler work while preserving rendered output and steady-state GPU cost.
  Include the initial live-shadow path. Measure submission, readiness and
  first-use costs separately; program count alone does not establish compile cost.

Step 2 investigation (2026-09-15, implementation/verification in progress):

- Preserved the post-Step-1b runtime in ignored `step2-before-src/` under this
  prompt's existing artifact directory. This is the immediate before baseline;
  do not overwrite it or confuse it with the earlier original/Step-1 snapshots.
- Opt-in `BakedShaderProfile.js` records shader source at submission, program
  linkage, readiness polling, reflection and first use. Its output is ignored;
  it is disabled for performance comparisons. These wall-clock readiness
  intervals include queueing/other work and are not isolated compiler CPU time.
- `City._activateCascadedShadows` synchronously submitted 32 default-framebuffer
  tone-mapped programs, then final preparation submitted the actual scene-color
  variants. The former programs were never used in the diagnostic run. Route
  activation through the existing readiness coordinator; retain immediate CSM
  uniform padding and standalone-host compilation behavior.
- Final preparation included hidden city meshes but dynamic AO only patched
  visible meshes. Twelve unused no-AO variants were submitted, including two
  textured material-variation shaders whose readiness took about 12 seconds.
  Hidden receivers now acquire their eventual AO recipe during preparation,
  respecting exclusions. Their visibility and resource residency do not change.
- The revised diagnostic retained all 35 staged programs and reduced resident
  program count from 145 to 101. No lighting, shadow shader, map, filter,
  exposure or material value is changed. Repeat unprofiled runs and pixel checks
  before claiming timing/quality acceptance. Source files: `City.js`,
  `GameEngine.js`, `DynamicAoRuntime.js`; regression coverage:
  `lighting_shader_variants.pwtest.js` plus existing preparation/ownership tests.
- The first profiler attributed whole-scene compile duration to every visited
  material. Those per-material totals are invalid and must not be summed or
  used as cost evidence. Corrected instrumentation records each compile call
  once; GL API counts/timings and link/readiness/first-use timestamps were
  unaffected. Do not infer a per-object deduplication benefit from those totals.

Step 2 verification update (2026-09-16): six unprofiled runs per version now
exist, split into three original 180-frame checks and three 900-frame checks.
The latter analyze settled frames 300–899 (600 per run). Their medians are:
Enter-to-baked 61.84→50.58 s, final preparation 13.52→4.19 s; settled CPU
22.60→25.60 ms, GPU 22.81→23.48 ms, FPS 41.38→37.19. Therefore a performance-free
acceptance claim is not yet justified. Captured shader sources actually used
for drawing agree and image differences are tiny, but those facts do not prove
CPU scheduling is unchanged. `step2-cpu-before/after` profiles are investigating
the settled CPU difference. Preserve all existing timing samples, including
first-visible GPU outliers of 88 ms before and 77 ms after. Twenty focused
regressions pass; one warm reactivation succeeds in 1.47 s (CPU/GPU first frame
50.50/26.14 ms). Keep this step pending until the additional investigation is
resolved; do not claim the full AI is complete.

Settled CPU profiles narrow the observed difference to WebGL uniform upload:
`uniform4fv` self samples total 67 ms before versus 1338 ms after over roughly
600 frames. Source validation is similar (4.02/4.17 s inclusive), and AO's
receiver walk is slightly lower after (440/408 ms self). Do not rewrite source
validation or the AO walk based on this profile. Added opt-in named uniform
upload counts/length/timings in `BakedUniformProfile.js`; the before/after
`step2-uniforms-*` diagnostics distinguish more submitted data from slower driver
calls. Neither CPU-sampled nor GL-instrumented runs belong in performance medians.

### Step 2 outcome — 2026-09-16

Two confirmed redundant compilation paths are fixed. Step 2 is implemented;
AI 574 remains open for Steps 3–5. Tests preserve CSM safety, receiver ownership,
source validation and rendered output. No lighting/shadow quality was reduced.

Twelve unprofiled startups (six per version), alternating before/after in fresh
private Chrome processes, used the recording's exact defaults and first pose.
Three pairs retained the original 180-frame capture; three additional pairs
captured 900 frames and analyze frames 300–899 for settled performance. Chrome
151 / Three r183, RTX 3060, ANGLE D3D11, 3390×1540, DPR 2, no resize.
Browser contexts were fresh, but OS/driver caches were not forcibly cleared.
No simultaneous benchmark/render jobs; user applications were not terminated.

| Startup metric, median of six runs/version | Before Step 2 | After |
|---|---:|---:|
| Enter → first visible baked frame | 61.38 s | 51.01 s |
| Final view preparation | 13.14 s | 4.18 s |
| Loading → installation/activation (overlaps preparation) | 36.52 s | 37.03 s |
| Enter → first Current frame | 19.91 s | 18.82 s |
| First baked CPU | 29.05 ms | 29.90 ms |
| First baked GPU | 26.06 ms | 24.89 ms |
| Resident shader programs | 145 | 101 |
| Sampled peak shader programs | 146 | 102 |

The total startup reduction is 10.37 s / 16.9%; phase medians do not add because
work overlaps. All 35 early-stage programs were reused in every run.
Counts remain 915 calls, 849,361 triangles, 1,677 geometries and 107 textures.
Sampled peak geometry/texture counts remain 1,677/112. Baked-map residency is
1,345.8125 MiB in both versions. Whole-process peak CPU/GPU bytes and shader binary
bytes are not measured; WebGL counters do not expose them. Do not claim a
proportional VRAM saving from program count.

Settled results (600 frames per run, 1,800 per version):

| Pair | CPU before → after | GPU before → after | FPS before → after |
|---|---:|---:|---:|
| 1 | 22.60 → 25.90 ms | 22.81 → 24.31 ms | 41.38 → 37.19 |
| 2 | 22.30 → 21.20 ms | 22.41 → 21.93 ms | 42.25 → 41.52 |
| 3 | 27.20 → 25.60 ms | 23.44 → 23.48 ms | 35.12 → 36.84 |

The median within-pair difference is CPU −1.10 ms / GPU +0.04 ms. Two pairs are
faster on CPU, so the previously reported separate medians (22.60→25.60 CPU,
22.81→23.48 GPU) are not evidence of a consistent added per-frame cost.
Keep those separate medians and the raw runs; do not replace them with a blanket
zero-overhead claim. Separate median CPU p99 is 29.70→33.80 ms; GPU p99 is
28.49→41.56 ms; frame-interval p99 is 33.50 ms in both. Occasional GPU spikes
remain, including first-visible samples of 88 ms before and 77 ms after.
The broader counterbalanced/resized/warm checks remain Step 5.

CPU-profile follow-up found samples attributed to `uniform4fv`, not added AO
walk work. Direct named-upload instrumentation then measured exactly 1,152 calls
and 110,592 floats per frame in both versions: 576 uploads each of the 96-float
`receiverIndirectScale[0]` and `receiverIndirectBias[0]` arrays. Actual measured
upload CPU duration was 0.283→0.292 ms/frame, maximum individual call 0.1 ms in
both. No additional upload volume was introduced; the earlier sampled driver
stall was not reproduced in this direct measurement. Do not remove validation,
change AO policy or introduce an unproven uniform cache to mask timing variance.

Visual inspection and RGB comparisons show no visible change. Original captures
have MAE 0.000278–0.000662 /255; settled captures 0.000261–0.000288 /255.
At most three of 5,220,600 pixels differ by more than four levels; isolated max
73. Captured shader sources actually drawn agree before/after. These results
are near-identical, not bit-identical. All startup runs had zero captured
X3595/X4000/shader errors and zero GPU disjoint events.

Twenty focused checks passed: 2 new shader-variant/CSM tests, 5 view-preparation,
3 staged-shader ownership/cancellation, 7 loading/publication boundaries,
1 AO source contract, 1 AO interactions and 1 contact/visibility. One additional
warm Current→Auto check passed in 1.47 s, first CPU/GPU 50.50/26.14 ms and
123 resident programs. It is a functional sample, not a repeated warm benchmark.

Evidence under ignored `tests/artifacts/screens/ai574_baked_startup/`:
`step2-before-01..03`, `step2-after-01..03`, `step2-settled-before/after-01..03`,
`step2-comparison.json`, `step2-settled-comparison.json`,
`step2-combined-startup.json`, `step2-profile-before/after`,
`step2-cpu-before/after`, and `step2-uniforms-before/after`.
Instrumented runs are excluded from performance medians. The original profiler
attribution mistake and exclusion-fixture correction remain documented above.

Files changed in this step:
- `src/graphics/visuals/city/City.js`
- `src/app/core/GameEngine.js`
- `src/graphics/visuals/postprocessing/DynamicAoRuntime.js`
- `tests/headless/e2e/lighting_shader_variants.pwtest.js` (new)
- `tests/headless/e2e/baked_startup_profile.pwtest.js`
- `tests/headless/harness/BakedShaderProfile.js` (new)
- `tests/headless/harness/BakedUniformProfile.js` (new)
- `specs/graphics/illumination_runtime_modes.md`, this prompt and the research log.

The earlier uncommitted AI 574 changes are preserved and are not all Step 2 work.
Remaining: multi-second city construction, source/ownership preparation and
readback/validation stalls; genuinely required complex shaders still take time.
Next is Step 3, precomputing reusable inputs through the canonical bake framework.
No commit requested.

### Step 3 — Precompute reusable inputs (implemented, 2026-09-16)

- [x] Investigate precomputing reusable city geometry and validation inputs
  offline to reduce runtime construction, canonicalization and texture readback.
  Preserve exact resolved-scene behavior and independently verified freshness;
  exported source assertions must not authorize their own compatibility. Any
  new bake process must use the canonical bake framework and publication gates.

Implemented exact-input reuse for the two measured pure geometry costs:
city-wide slab planning and receiver coplanar ownership. Kept source
canonicalization/material/texture validation live; caching exported freshness
assertions would not independently verify current assets. Further reduction of
their copies/readback cost belongs to Step 4.

Run `node tools/bake.mjs --target lighting/city-inputs --publish`. The explicit
leaf uses the shared local browser configuration, captures actual inputs in a
fresh game, independently recalculates every plan in Node, then validates the
candidate in a second fresh game. It requires matching live source hashes,
identical final city geometry and complete reuse before switching the index
last. It never rebakes/replaces the lighting or shadow packages. It is outside
the default full bake tree because it validates against the currently installed
compatible baked view.

- 1 slab plan + 1,589 unique ownership plans; 1,906 actual ownership lookups,
  all hits in the candidate and all three startup runs.
- 2,746 final city geometry records matched exactly, including source hashes,
  attributes/indices/groups/draw ranges and transforms.
- Runtime lookup checks real float32 corners and eligibility/material groups
  in triangle order. The loader independently hashes installed planner code and
  its algorithm dependencies. Corrupt/missing/stale plans use the original
  calculation; rejected data is diagnosed. Plans are cloned before consumption.
- The existing live bake validation, shader staging, private geometry
  reconstruction, cancellation cleanup and atomic activation remain unchanged.
- Installed cache: 1,110,361 bytes gzip (1.059 MiB), expanding to 11,637,303 bytes
  (11.098 MiB JSON). Decompression is bounded. No GPU resource is allocated for
  this CPU cache. Additional retained JS object memory and whole-process peak
  memory were not measured; expanded JSON bytes are not a JS heap estimate.
- Preload/verification/decompression median: 587 ms during welcome/garage setup,
  before the Enter timer. Account for that prefetch cost in full-launch claims.
  Slab compute in the first uncached validation took 4,012.5 ms versus 0.6 ms
  cached retrieval. This is a component measurement, not total startup.

**Before/after benchmark**

Six unprofiled fresh Chrome processes, three/version; recorded default setup,
3390×1540, DPR 2, RTX 3060 / ANGLE D3D11, Chrome 151, no resize. The pre-Step-3
843-file source snapshot is preserved as `step3-before-src/`. Run order:
before-01, after-01, after-02, before-02, before-03, after-03 (both pair orders
represented, 2:1). OS/driver caches were not forcibly cleared. No benchmark or
bake browser ran simultaneously. Each run retained 900 baked frames; settled
metrics use frames 300–899, 600/run, 1,800/version.

| Enter → fully baked view | Before | After |
| --- | ---: | ---: |
| Pair 1 | 47.029 s | 38.430 s |
| Pair 2 (after first) | 47.548 s | 38.012 s |
| Pair 3 | 50.307 s | 41.370 s |
| Median | 47.548 s | 38.430 s |

Median reduction: 9.118 s / 19.2%; median within-pair delta: −8.937 s.
The earlier Step-2 median of 51 s is from an earlier experiment; use the
same-session 47.548 s baseline to attribute this step.

| Metric (median across runs) | Before | After |
| --- | ---: | ---: |
| Enter → visible Current view | 17.425 s | 13.510 s |
| Largest main-thread task (city construction) | 5,949 ms | 1,928 ms |
| Loading → installation/activation | 34.890 s | 27.538 s |
| Final view preparation | 3.660 s | 6.394 s |
| First visible CPU / GPU | 26.60 / 23.03 ms | 24.60 / 28.19 ms |
| Settled CPU / GPU median | 20.90 / 21.56 ms | 20.80 / 21.63 ms |
| Settled CPU / GPU p99 | 25.90 / 25.94 ms | 31.50 / 34.51 ms |
| Frame interval p99 | 33.40 ms | 33.40 ms |
| Average FPS | 45.62 | 44.88 |
| Calls / triangles | 915 / 849,361 | 915 / 849,361 |
| Geometries / textures / programs | 1,677 / 107 / 101 | 1,677 / 107 / 101 |
| Sampled peak geometries / textures / programs | 1,677 / 112 / 102 | 1,677 / 112 / 102 |
| Logical resident baked-map allocation | 1,345.813 MiB | 1,345.813 MiB |

Final preparation starts earlier after cached bindings finish and overlaps the
remaining shader readiness wait; its larger phase duration is not extra shader
work. All 35 staged programs are reused in all six runs. There are no shader
warnings or disjoint timer events.

Preserve the timing caveat: paired median CPU/GPU deltas are −0.10/+0.082 ms,
but paired CPU/GPU p99 deltas are +4.103/+0.731 ms. Pair 2 GPU p99 rose by
8.565 ms. Third-pair CPU was ~27 ms in both variants versus ~20–21 ms in the
other pairs. The cache adds no per-frame algorithm/GPU work, but these runs
do not establish a tail-latency improvement or zero overhead. No settled sample
exceeded 50 ms; occasional startup driver/source stalls remain. Step 5 must
retain and recheck this evidence, including first-frame GPU timings.

Before/after images inspected visually: no visible change. Image MAE
0.000633–0.000663 on 0–255 RGB; 1–3 pixels of 5,220,600 exceeded 4 levels.
Not bit-identical images (isolated maximum 73), despite exact city geometry.
Fifteen focused checks passed: cache/input/code/integrity/decompression (7),
cached reconstruction and cancellation (1), existing coplanar ownership (3),
receiver background preparation/authentication/cleanup (4), plus the six
startup benchmark runs and two independent full-city publication validations.

**Evidence and changed files**

- `tests/artifacts/screens/ai574_baked_startup/step3-{before,after}-01..03/`,
  `step3-comparison.json`, `step3-summary.json`, `step3-cache-validation.json`.
- Canonical compressed bake/validation run:
  `tests/artifacts/screens/ai556_bake_framework/run-1789534595924-10880-07541273/`;
  137.4 s to capture, recompute, compare and publish. Initial uncompressed pilot:
  `run-1789534207164-17228-a3f3a441/`, 146.8 s, preserved only as evidence.
- `src/app/city/precomputed/{CityInputPlans,CityInputLoader}.js` and its
  `bakes/bigcity2.index.json` + content-addressed `.json.gz` payload (new).
- `src/main.js`, `src/graphics/visuals/city/City.js`,
  `src/graphics/assets3d/generators/buildings/BuildingSlabGenerator.js`.
- `src/graphics/illumination/receiver_lightmaps/EnhancedReceiverCoplanarGeometry.js`,
  `EnhancedReceiverMaterialAdapter.js`, `EnhancedReceiverLightmapRuntime.js`.
- `tools/bake_lighting/city_inputs/{job,Capture}.mjs`, `README.md` (new),
  lighting job registry, framework README/spec and `PROJECT_TOOLS.md`.
- `tests/node/unit/city_input_plans.test.js`,
  `tests/headless/e2e/city_input_plans.pwtest.js` (new);
  startup profile fixture adds cache diagnostics.
- Receiver lightmap spec, this prompt, and the existing research log.

Earlier uncommitted AI574 work is preserved. No commit requested. Next is Step 4;
Step 5 remains required before the entire AI is marked complete.

### Step 4 — Improve validation data ownership (implemented)

- [x] Improve ownership and transfer of validation data to reduce large
  main-thread copies and hashing stalls. Preserve full integrity checks and
  borrowed-buffer lifetimes; transferring a shared package buffer must not
  detach other consumers. Measure elapsed validation time and peak memory as
  well as longest main-thread tasks. Moving work to a worker alone is not a
  demonstrated reduction in total loading time.

### Step 4 implementation and evidence — 2026-09-16

Step 4 reduces validation copies and hashing work; it does not eliminate every
cold-start stall. No material, illumination, shadow, atlas-resolution or shader
settings changed. No rebake or publication change was needed.

**Confirmed causes and changes**

- The V1 parser hashed each uncompressed chunk twice (stored and decoded).
  Its authenticated chunk table already requires compression `none`, identical
  lengths and identical stored/decoded hashes. It now computes that digest once.
  Manifest/table, padding, payload, aggregate, channel output, capability,
  source/profile and canonical floating-value checks remain mandatory.
- Encoding validation made a full copy of each parser-owned chunk and discarded
  it. The parser/builder now use a synchronous owned-view validator. The public
  validator retains its independent-copy contract.
- Domain-separated source hashing copied input bytes and then copied them into
  the framed message. Framing now provides that private snapshot directly.
  Raw WebCrypto hashing no longer adds a JavaScript snapshot before the native
  API's synchronous BufferSource snapshot. Shared-memory inputs still get an
  explicit private copy. Exact offsets, lengths and hash bytes are unchanged.
- Receiver coordinate/page staging copied whole large views on the main thread.
  It now copies at most 1 MiB per operation and yields after 8 MiB or 4 ms of copy
  work. Cancellation is checked after yielding. Mapping-ready notification waits
  for complete coordinates; installation remains atomic.
- No new buffer transfer or verification-result cache was introduced. Borrowed
  views remain attached, other chunks remain usable, and mutation/integrity
  checks retain their original boundaries.
- The profiler still found approximately 262 ms of native digest submission in
  the coalesced shadow resource hash and 242 ms cumulatively across tile-layer
  hashes. Those full checks remain. Removing a second hash of identical owned
  bytes is safe; skipping independent assembled/layer/guard checks is not.

**Isolated package validation**

`validation_buffer_benchmark.pwtest.js` loads the same installed 441,787,888-byte
receiver package in six fresh browser contexts/module workers, in
B1,A1,A2,B2,B3,A3 order. No scene construction/shader workload overlaps.
Test-only worker instrumentation counts native digest input and JavaScript
slice bytes. The same aggregate hash was authenticated in all six runs.

| Median / deterministic count | Before | After |
|---|---:|---:|
| Validation elapsed | 1,002.7 ms | 741.7 ms |
| Fetch/inflate/validate/return elapsed | 1,613.7 ms | 1,350.5 ms |
| Digest calls | 28 | 18 |
| Bytes submitted to native digest | 1,759,799,807 | 1,321,691,647 |
| JavaScript slice bytes | 438,116,132 | 32 |
| Largest individual JavaScript slice | 64 MiB | 32 bytes |

This is a measured 26% validation reduction. The 32-byte copy saves/restores the
aggregate header field. Native WebCrypto still snapshots its inputs: the largest
native submission remains about 220 ms in this worker. Allocation turnover is
reduced; this is not proof of a comparable whole-process peak-memory reduction.

**Full game: three fresh Chrome processes per version**

Preserved post-Step-3 source: `step4-before-src/` (845 files). Context-level
routing covers worker imports as well as page modules. Captured source hashes
verify the baseline versions. Same recorded route/defaults, no resize,
3390 x 1540 framebuffer, DPR 2, Chrome 151 / ANGLE D3D11 / RTX 3060.
900 visible baked frames per run; settled statistics use frames 300–899,
1,800 samples/version. All six runs use the same 250 ms CDP main-renderer
heap/backing-storage sampler. No CPU/shader profiler in these timings.
OS filesystem and driver caches were not cleared. Run order B1,A1,A2,B2,B3,A3;
an earlier hash-only A1 pilot was retained separately and excluded.

| Pair | Before Enter-to-baked | After | Difference |
|---|---:|---:|---:|
| 1 | 35.729 s | 34.549 s | -1.180 s |
| 2 | 35.867 s | 35.869 s | +0.002 s |
| 3 | 38.154 s | 34.542 s | -3.612 s |

| Median across runs | Before | After |
|---|---:|---:|
| Enter to visible baked lighting | 35.867 s | 34.549 s |
| Enter to visible Current lighting | 12.289 s | 12.906 s |
| Receiver package worker validation (all shards) | 4.799 s | 4.293 s |
| Live source validation | 8.122 s | 7.865 s |
| Loading to activation | 25.196 s | 23.531 s |
| Final view preparation | 6.267 s | 6.404 s |
| Largest main-thread task | 1,636 ms | 1,616 ms |
| Largest task after city construction | 697 ms | 708 ms |
| First visible baked frame CPU / GPU | 25.20 / 24.46 ms | 23.20 / 24.21 ms |
| Settled CPU / GPU median | 18.80 / 18.82 ms | 18.30 / 17.37 ms |
| Settled CPU / GPU P99 | 20.30 / 23.35 ms | 21.91 / 23.36 ms |
| Frame interval P99 | 36.1 ms | 36.1 ms |
| FPS | 50.98 | 51.85 |
| Sampled main heap + backing-storage peak | 2,972.42 MiB | 2,965.57 MiB |
| Sampled main backing-storage peak | 2,687.01 MiB | 2,687.00 MiB |
| Resident baked GPU maps | 1,345.8125 MiB | 1,345.8125 MiB |

Median startup improves 1.318 s (3.7%); median within-pair improvement is 1.180 s.
Source validation improves in all three pairs. Concurrent package times vary
substantially with other startup work (one before run reached 8.924 s), which is
why the isolated measurement is also retained. Do not add overlapping phases.
The earlier Current image is slightly later, not faster; presentation still
waits for its required prepared view.

The main-thread peak is essentially unchanged. CDP samples the main renderer's
JS heap/backing storage, not worker heaps, native crypto allocations, the entire
Chrome process or physical GPU memory. Peak process RAM / VRAM is **not measured**;
these counters cannot establish it. The median within-pair main peak change is
only -1.14 MiB. Report allocation churn savings separately from memory peaks.

Resource counts match in every run: 915 calls, 849,361 triangles, 1,677 geometries,
107 textures, 101 programs. Sampled peaks are 1,677 geometries, 112 textures,
102 programs. All 35 staged programs are reused, with zero shader warnings or
GPU disjoint events. Bounded assembly copies 941,424,640 bytes in 898 operations;
maximum operation durations are 1.5 / 1.1 / 1.8 ms, with 100.3 / 103.2 / 105.5 ms
total copy CPU work. GPU texture layout/storage remains unchanged.

Tail caveat: the median of CPU P99 values increases 1.60 ms, while median paired
CPU P99 changes -0.60 ms; pair 3 worsens 2.10 ms. GPU P99 is effectively unchanged.
No settled CPU, GPU or interval sample exceeds 50 ms in either version.
No per-frame code was added, but do not claim a proven steady-state speedup or
zero tail risk from these six runs. Step 5 retains the paired-tail, resize and
warm-activation checks and comparisons with earlier AI574 implementations.

**Image and regression checks**

Paired final images have RGB MAE 0.000254 / 0.000663 / 0.000272 on a 0–255 scale.
Only pair 2 has pixels exceeding four levels: three pixels out of 5,220,600.
Pairs 1 and 3 have maximum differences of 3 and 4 levels. Visually inspected
before/after images match. They are not bit-identical. Installed source,
publication hashes and complete receiver coverage are unchanged.

73 Node tests passed: package/encoding/ownership, source hashing/geometry,
tile-layer/guard integrity and static-sun multi-window lifecycle tests.
Six focused browser tests passed: real WebCrypto mutation safety, bounded-copy
cancellation/shared aliases, worker integrity/failure/termination, exact
background source identities and atomic receiver installation. These are separate
from the six full startup and six isolated measurements.

**Changed files for this step**

- `src/app/illumination/package/{RawSha256,IlluminationEncoding,IlluminationBinaryPackage}.js`
- `src/app/illumination/bake_source/Hashing.js`
- `src/graphics/illumination/receiver_lightmaps/{ReceiverBufferAssembly,EnhancedReceiverResources}.js`
- `tests/node/unit/illumination_package/validation_ownership.test.js`
- `tests/headless/e2e/{validation_buffer_ownership,validation_buffer_benchmark,baked_startup_profile}.pwtest.js`
- `specs/graphics/{illumination_binary_package,receiver_lightmaps}.md`
- This prompt and `debug_tools/regression_debugging/ai574_baked_startup.md`.

All generated evidence is under
`tests/artifacts/screens/ai574_baked_startup/`:
`step4-before-01..03/`, `step4-after-01..03/`, `step4-isolated/`,
`step4-comparison.json`, and `compare_step4.py`.
The separate diagnostic `step4-profile-before/` is not included in timings.
The hash-only pilot `step4-after-initial-01/` is also excluded.
Earlier uncommitted work remains intact. No commit requested.
Next: Step 5, final combined verification. AI574 remains in progress.

### Step 5 — Combined verification executed; performance follow-up open

- [x] Rebenchmark the resulting startup changes three times per condition
  using the existing no-resize and resize fixture, with warm activation measured
  separately. Counterbalance before/after run order and retain paired differences
  alongside separate medians, including the Step 2 CPU/p99 timing caveat.
  Record browser/OS/driver cache conditions rather than calling a
  fresh browser a guaranteed empty driver cache. Keep profiler runs separate.
  Compare against both the preserved original baseline and the first AI 574
  implementation above. Report total startup, phase durations, CPU/GPU first
  frame, frame pacing/FPS, resource counts, peak/resident memory and scene images.
  Preserve the first-visible hitch improvement, accepted lighting/shadow quality
  and compatibility gates. Append changed files, rejected experiments and actual
  results here and in the existing research log before marking this AI done.

Persistent caching may improve subsequent launches, but is not a substitute for
reducing genuinely cold work. Keep generated evidence under the existing
`tests/artifacts/screens/ai574_baked_startup/` directory. AI 572 remains responsible
for nearby first-use resources while driving; AI 575 remains responsible for
recurring frame cost. Initial loading costs must not disappear from this prompt
merely because the same subsystem also runs during gameplay.

## Step 5 combined verification — 2026-09-16

Primary experiment: 18 fresh Chrome processes, three versions × two resize
conditions × three repeats; each also includes a separately measured warm
Current→Auto activation. All 36 activation checks pass. Settled statistics use
the final 600 of 900 visible baked frames after the final resize (21,600 frames
across the 36 samples). Missing GPU samples stay missing. No profiler, trace or
video is enabled in these runs. Main-renderer CDP memory sampling runs at 250 ms.
See the protocol in the research log for counterbalanced order, unchanged
recorded settings, source snapshots and cache limitations.

### Primary startup and activation results

Each cell is the median of three runs. O = original `before-src`, F = first
AI574 `step1-before-src`, C = combined Steps 1–4 `step5-current-src`.

| Metric | O no resize | F no resize | C no resize | O resize | F resize | C resize |
|---|---:|---:|---:|---:|---:|---:|
| Enter → first baked, s | 68.30 | 67.60 | 42.89 | 68.57 | 73.47 | 39.41 |
| Navigation → first baked, s | 72.45 | 71.48 | 47.04 | 72.32 | 79.58 | 43.23 |
| Enter → first Current, s | 18.80 | 20.02 | 14.65 | 17.76 | 21.89 | 14.44 |
| Installation/activation phase, s | 28.03 | 30.95 | 26.31 | 28.33 | 30.92 | 25.94 |
| Final preparation phase, s | 29.65 | 27.18 | 10.18 | 29.07 | 30.46 | 7.60 |
| Live source validation, s | 9.83 | 8.22 | 9.63 | 8.80 | 8.14 | 9.48 |
| Package worker validation, s | 2.86 | 2.82 | 2.83 | 2.81 | 2.82 | 2.67 |
| Longest main-thread task, ms | 6563.00 | 6111.00 | 2141.00 | 7104.00 | 8536.00 | 1963.00 |
| First baked CPU, ms | 250.50 | 24.50 | 27.80 | 220.40 | 24.80 | 26.50 |
| First baked GPU, ms | 252.78 | 41.01 | 24.27 | 194.37 | 24.30 | 22.71 |
| Peak main heap + backing store, MiB | 2813.27 | 2920.66 | 2976.35 | 2813.16 | 2921.14 | 2971.34 |

Phase medians overlap and must not be added. Navigation timing includes
the garage/environment wait and welcome prefetch: improvements are not simply
work shifted before Enter. The broad startup runs include contention and driver
variance; the Step 4 isolated validator experiment remains its separate evidence.

| Warm metric | O no resize | F no resize | C no resize | O resize | F resize | C resize |
|---|---:|---:|---:|---:|---:|---:|
| Request → first baked, s | 1.04 | 1.32 | 1.28 | 1.12 | 1.56 | 1.27 |
| First baked CPU, ms | 67.80 | 25.10 | 28.50 | 67.40 | 29.80 | 27.70 |
| First baked GPU, ms | 92.90 | 23.13 | 23.14 | 108.34 | 24.40 | 23.49 |
| Main heap + backing store endpoint, MiB | 2824.66 | 2844.82 | 2818.00 | 2820.04 | 2365.93 | 2847.59 |

Warm phase counters inherited from cold resource preparation are deliberately
not treated as new decode/hash work. Warm time measures the actual new request
through first presentation. Warm peak process memory is not measured.

### Primary settled-frame results

| Version | Resize | Activation | CPU median/p99 ms | GPU median/p99 ms | Interval p99 ms | FPS |
|---|---|---|---:|---:|---:|---:|
| original | 0 | cold | 20.40 / 27.52 | 21.58 / 25.61 | 33.40 | 46.21 |
| first | 0 | cold | 20.70 / 28.50 | 21.82 / 27.81 | 33.40 | 43.85 |
| current | 0 | cold | 23.80 / 31.20 | 23.30 / 27.38 | 33.50 | 37.30 |
| original | 0 | warm | 20.90 / 45.81 | 21.34 / 40.73 | 50.00 | 40.54 |
| first | 0 | warm | 20.90 / 27.50 | 21.88 / 25.97 | 33.40 | 45.17 |
| current | 0 | warm | 24.60 / 30.80 | 23.25 / 26.82 | 33.50 | 37.89 |
| original | 1 | cold | 21.10 / 25.70 | 21.88 / 26.33 | 33.40 | 44.72 |
| first | 1 | cold | 23.50 / 30.00 | 22.21 / 27.16 | 33.50 | 39.64 |
| current | 1 | cold | 22.30 / 30.80 | 22.58 / 27.06 | 33.40 | 39.21 |
| original | 1 | warm | 21.60 / 28.00 | 22.17 / 26.49 | 33.40 | 43.74 |
| first | 1 | warm | 23.20 / 31.20 | 22.05 / 27.17 | 33.40 | 40.13 |
| current | 1 | warm | 29.50 / 43.31 | 23.44 / 41.22 | 50.00 | 32.90 |

These primary timings show higher typical frame cost for the combined version.
They are retained even though the separate CPU profiles did not reproduce that
difference. Do not claim zero steady-state overhead or omit the slower samples.

Median within-pair differences below are **combined minus the named baseline**;
they are not subtraction of independent group medians.

| Baseline | Resize | Activation | Ready delta s | CPU median delta ms | GPU median delta ms | CPU p99 delta ms | GPU p99 delta ms | FPS delta |
|---|---|---|---:|---:|---:|---:|---:|---:|
| original | 0 | cold | -25.41 | +4.20 | +1.73 | +3.68 | +1.27 | -8.91 |
| first | 0 | cold | -24.71 | +2.20 | +1.35 | +2.70 | +1.84 | -5.89 |
| original | 0 | warm | +0.25 | +1.30 | +0.33 | -14.10 | -13.14 | +3.44 |
| first | 0 | warm | -0.03 | +3.70 | +1.36 | +3.00 | +1.26 | -7.16 |
| original | 1 | cold | -29.16 | +1.00 | +1.63 | +3.70 | +0.73 | -3.44 |
| first | 1 | cold | -32.89 | +1.20 | +1.30 | +1.40 | +0.84 | -2.65 |
| original | 1 | warm | +0.22 | +7.30 | +1.25 | +15.30 | +15.58 | -9.15 |
| first | 1 | warm | -0.10 | +3.30 | +1.39 | +17.21 | +14.05 | -4.91 |

### Resources, visual checks and limitations

- All variants retain 915 calls, 849,361 triangles and 1,677 geometries in the
  settled view. Textures: original 106, first/combined 107 after settling.
- Cold programs: 145 / 145 / 101; warm programs: 217 / 217 / 123.
  Peak sampled programs: cold 145 / 146 / 102; warm 222 / 222 / 128.
- Baked-map GPU residency remains 1,345.8125 MiB in every sample. This excludes
  other textures, framebuffers, shader binaries and driver allocations. Full
  process/worker/native peak RAM and physical per-process VRAM are not measured;
  WebGL counts cannot supply those values. CDP values describe the main renderer
  only. Warm endpoints and unforced GC do not establish a memory-leak rate.
- Combined cold main heap/backing peaks are about 158–163 MiB above original
  separate medians. This is a measured tradeoff, not an unchanged-memory claim.
- No map or rendering asset changed. The existing Step 3 reusable city cache adds
  1,110,361 compressed bytes (1.059 MiB); its source and geometry gates remain.
- All 36 primary images were compared against the paired combined cold capture.
  Maximum RGB MAE: 0.000668/255; at most eight of 5,220,600 pixels exceed four
  levels. Original and combined final captures were visually inspected. No
  visible lighting, shadow, material or resolution regression; not bit-identical.
- All loaded main/worker source hashes match their preserved snapshots. All
  recorded defaults match exactly; no shader warnings or GPU disjoint events.
- Resizes preserve visibility/readiness and warm mode switching completes.
  Transition-frame measurements are retained in `resizeTransitions`; isolated
  resize/frame-pacing spikes must not be folded into settled averages.
- Current still has approximately two-second construction tasks, subsecond
  validation/driver stalls and occasional >50 ms frames. Not a hitch-free claim.

### Separate diagnostics and focused checks

CPU profiles (`step5-profile-original/current`) are excluded from all tables.
Their typical CPU/GPU times were 21.4/22.41 → 20.7/20.89 ms, reversing the
primary difference. Both show the same major work: renderer/update, receiver
freshness, matrix transforms, uploads and material hooks. Freshness self time
was 1,589 → 1,401 ms across the sampled windows; no new dominant CPU hotspot
or proven new per-frame job was identified. Profiling is not evidence that the
unprofiled slowdown is imaginary. A bounded three-pair unprofiled follow-up
is recorded separately to investigate the contradictory timing observations.

29 focused checks pass: view readiness/cancellation (5), staged shader ownership
(3), hidden AO and cascade transitions (2), exact upload/cache/cancel behavior
(1), startup/publication boundaries (7), receiver background/worker ownership
(4), lighting transactions (4), city-input cache/fallback (1), validation-buffer
ownership and abort handling (2). Existing quality and compatibility gates stay.

Changed in this step: `tests/headless/e2e/baked_startup_profile.pwtest.js` adds
post-resize settled sampling, equal warm sample length, warm assertions,
navigation timing and a warm main-memory endpoint. No production runtime edit
was made for these measurements. Analysis initially excluded NumPy FPS scalars
from a numeric-only summary; explicit float conversion corrected the report.
Raw captures, timings and images were unaffected.

Evidence: `tests/artifacts/screens/ai574_baked_startup/step5-*`,
`step5-comparison.json`, `compare_step5.py`, `run_step5.ps1`,
`run_step5_regressions.ps1`, and the separate profile/follow-up directories.
Primary benchmark wall time: 12:51:24–13:30:35 local (39 minutes 11 seconds).
Hardware: RTX 3060 / driver 591.86 / ANGLE D3D11, Chrome 151, Three r183,
Windows 10.0.26200.0, Node 24.19.0. Browser processes are fresh; user applications
and OS/driver caches are not forcibly cleared. No simultaneous benchmark/render
job was launched. A spot check showed 6,006 / 12,288 MiB total GPU memory in use;
that point sample does not diagnose clocks, contention or per-process residency.

### Unprofiled follow-up and sign-off

Three extra fresh-process pairs used the same recording, 900-frame capture,
250 ms main-memory sampler and no profiler, resize or warm activation. Order:
current/original; original/current; current/original. All six pass; every loaded
source fingerprint matches. They remain a separate cohort from the primary
experiment. No source, settings or quality change occurred between cohorts.

| Pair | Original CPU/GPU ms | Combined CPU/GPU ms | Original/combined FPS |
|---|---:|---:|---:|
| 1 | 26.20 / 23.91 | 24.20 / 23.96 | 37.34 / 38.54 |
| 2 | 21.80 / 22.36 | 29.30 / 31.39 | 40.95 / 33.15 |
| 3 | 23.40 / 24.10 | 26.30 / 24.77 | 37.11 / 33.74 |

Median paired CPU delta is +2.90 ms; GPU +0.666 ms; FPS -3.37. One pair
reversed the CPU difference, another had a much larger GPU slowdown. This
confirms timing variability but does NOT clear the measured steady-state cost.
The profiled reversal cannot replace unprofiled evidence. No cause is proven:
do not label it GC, throttling, clocks, driver behavior or extra uniform work
without new evidence. The original 36 samples and all six follow-ups remain.

Step 5 verification is executed: 24 unprofiled cold startups, 18 warm activations,
two separate CPU profiles and 29 focused checks passed their functional gates.
The primary 18-process experiment took 39m11s; the additional unprofiled cohort
took 8m48s. Startup/first-visible improvement and image parity are verified.
**Performance sign-off is NOT complete; AI 574 stays open.** A new Step 6 below
owns localization of the measured cost before a DONE rename. There was no
speculative production fix or shader/material/quality change in Step 5.

Additional evidence: `step5-followup-*/startup.json`,
`step5-followup-comparison.json`, `run_step5_followup.ps1`, and
`step5-profile-*/settled.cpuprofile`. Test selection restored to
`tests/node/unit/frame_recording.test.js`. No commit was requested or made.


### Step 6 — Localize the measured steady-frame cost (diagnostics implemented; attribution open)

- [x] Investigate the Step 5 unprofiled CPU/GPU/FPS difference before final
  performance sign-off. Keep primary, diagnostic and follow-up cohorts separate;
  keep paired differences and independent medians. No zero-overhead conclusion
  from the faster single profiled pair. Do not discard the slower captures.
- [ ] Bisect preserved runtime milestones with the same startup/settled fixture:
  `step1-before-src` (first fix), `step1b-before-src` (post-1a),
  `step2-before-src` (post-1b), `step3-before-src` (post-2),
  `step4-before-src` (post-3), and `step5-current-src` (post-4).
  Narrow adaptively; avoid rerunning every combination without a hypothesis.
  Confirm the responsible interval with counterbalanced fresh-process repeats.
- [x] Capture per-pass GPU timings and actual GL call/upload counts in separate
  diagnostics when needed. Respect timer-query nesting/disjoint restrictions.
  Compare actual drawn shaders, uniform work, freshness checks and AO traversal.
  Step 2 already found equal named uniform-upload volume in its own experiment;
  do not assume extra uniform uploads or remove validation to mask variation.
  Record relevant GPU clock/utilization/memory and process conditions during
  repeated measurements rather than attributing the result from one spot check.
  Do not change machine power policy, close user applications, or purge unrelated
  caches to manufacture a favorable result.
- [ ] Fix a demonstrated avoidable regression, preserving source/ownership gates,
  staging/resize/warm readiness and accepted quality. Repeat affected comparisons
  three times and retain visual/resource evidence. If evidence instead isolates
  external variance, document that evidence and the limits of the conclusion.
  Do not transfer a possible AI574 regression to AI575 without localizing it.
  Finish this sign-off before applying the DONE filename.


### Step 6 investigation — 2026-09-16 (in progress)

Added opt-in host GPU telemetry (`BakedGpuTelemetry.js`) and separate per-render
GPU/GL/CPU diagnostics (`BakedPassProfile.js`) to the startup fixture. Ordinary
runs do not install GL wrappers. Pass diagnostics suppress the outer elapsed
query, keep disjoint/missing samples explicit, and restore it afterwards.

First adaptive cohort, in fresh processes, current → post-Step-2 → first fix:

| Snapshot | Ready s | Settled CPU median/P99 ms | GPU median/P99 ms | FPS |
|---|---:|---:|---:|---:|
| post-Step-4 (`step5-current-src`) | 39.323 | 21.2 / 25.2 | 22.199 / 25.989 | 45.00 |
| post-Step-2 (`step3-before-src`) | 49.055 | 22.0 / 25.5 | 22.885 / 27.232 | 43.27 |
| first fix (`step1-before-src`) | 68.518 | 22.3 / 24.0 | 22.907 / 27.861 | 42.85 |

GPU graphics clocks were 1912–1920 MHz throughout settled windows, memory
clock 7501 MHz, resident whole-device memory about 6500 MiB. These fresh
unprofiled runs do not reproduce the Step-5 ordering. They do not identify a
responsible code interval or invalidate Step-5 captures. No speculative runtime
edit has been made.

Separate original/current pass diagnostics (`step6-pass-*-01`) captured 607/606
frames. The 38 actually used shader source pairs have identical SHA-256 sets.
Every pass has equal draw, texture binding, texture upload and large uniform
upload counts; the current main pass has two additional `uniformMatrix4fv`
calls (738 vs 736), not additional draws or receiver-array uploads. There are
1152 `uniform4fv` uploads / 110592 elements per frame in both versions. No
buffer uploads occur in the settled window. Source checks: 6.039 → 6.023 ms/frame;
AO preparation: 3.084 → 3.039 ms/frame. Main city GPU mean is approximately
20.4–20.5 ms in both. Query disjoints/skipped queries are zero; the final 8/5
pending query samples are retained as missing. This is a diagnostic cohort,
not an ordinary benchmark, and its timings are not pooled with other cohorts.
The first diagnostic fixture version retained a stale outer whole-frame query
value while pass queries ran; ignore its startup.json whole-frame GPU fields
in those two diagnostic runs. The committed fixture now explicitly nulls GPU
fields during suppression. Per-pass query records are unaffected.

Next: three counterbalanced original/current resize + warm-activation pairs,
without profilers, retaining telemetry and process snapshots. Sign-off remains
pending until those results and image/resource comparisons are analyzed.
### Step 6 final measurements and remaining attribution

Diagnostics and repeated verification are implemented. The earlier intermittent performance penalty did not reproduce; attribution and final AI574 sign-off remain open. No production rendering changes were made in Step 6.

Three counterbalanced original/current pairs; fresh Chrome per cold run, recorded resize sequence and 900 visible frames per cold/warm capture; final 600 frames measured. NVIDIA RTX 3060, ANGLE D3D11, Chrome 151, 3390×1540 / DPR 2; unchanged recorded settings.

| Metric | Original | Current |
|---|---:|---:|
| Enter → baked (s) | 64.253 | 39.433 |
| First visible CPU (ms) | 204.500 | 25.300 |
| First visible GPU (ms) | 210.598 | 39.310 |
| Cold settled CPU median (ms) | 21.900 | 21.600 |
| Cold settled GPU median (ms) | 22.524 | 22.207 |
| Cold CPU P99 (ms) | 24.707 | 24.400 |
| Cold GPU P99 (ms) | 27.003 | 26.223 |
| Cold FPS | 43.580 | 44.223 |
| Warm activation (s) | 1.045 | 1.267 |
| Warm settled CPU median (ms) | 22.000 | 21.700 |
| Warm settled GPU median (ms) | 22.695 | 22.508 |
| Warm CPU P99 (ms) | 29.204 | 26.802 |
| Warm GPU P99 (ms) | 27.553 | 26.954 |
| Warm FPS | 43.370 | 43.633 |
| Resident baked maps (MiB) | 1345.812 | 1345.812 |

These are independent medians of three run statistics. Paired current-minus-original CPU/GPU medians: cold −0.10/−0.193 ms; warm −0.20/−0.187 ms. Full individual deltas and all cohorts are retained in `step6-comparison.json`; do not pool them with Step 5.

All source fingerprints and settings match. All six cold/warm pairs passed readiness, viewport and query-disjoint checks. Identical resource workload: 915 calls, 849361 triangles, 1677 geometries, baked maps 1345.8125 MiB. Current has one extra settled texture (107 vs 106); programs are 101 vs 145 cold and 123 vs 217 warm. Twelve images have at most 5 pixels differing by >4/255, maximum RGB MAE 0.0006704/255. Original/current repeat 3 were inspected visually.

Separate GPU diagnostics found the same 38 actually drawn shader source pairs, draw counts, texture bindings and vec4-array uploads. Source watches cover exactly 465652 fields, 12072 shapes and 8596 arrays in both. Two additional current matrix uploads remain (128 bytes per frame); no added geometry upload. Final harness validation records a 144-byte AO texture upload per frame, zero geometry bytes, and explicitly nulls all 606 suppressed whole-frame GPU samples. Four query/accounting/cleanup regression tests pass.

GPU graphics clocks during the confirmation windows: 1912–1927 MHz; memory clock 7501 MHz. Host desktop processes remained open. Their per-run CPU snapshots and whole-device telemetry are retained. This does not prove the cause of the historical Step-5 slowdown.

An additional unprofiled no-telemetry pair gives original/current CPU 22.0/21.8 ms, GPU 22.644/22.752 ms, FPS 43.42/43.37. Current CPU P99 is 29.60 vs 25.50 ms in that pair; intermittent tails are not eliminated.

Main heap plus backing memory cold peaks have original/current medians 2811.9/2975.8 MiB; one current run peaks at 3542.6 MiB. These are not whole-process memory or live retained-memory measurements. Warm endpoints are 2859.5/2841.7 MiB. Do not claim a memory reduction or infer a leak/GC cause from these samples.

Decision: no repeatable version interval or avoidable new steady-frame work is established. Do not invent a runtime fix, lower quality, weaken validation, or mark AI574 DONE. Keep the historical slower captures and the remaining root-cause/sign-off requirement. A future affected-session capture should include this telemetry and separate pass/CPU diagnostics before changing code or machine settings.

Files added: `tests/headless/harness/BakedGpuTelemetry.js`, `tests/headless/harness/BakedPassProfile.js`, `tests/node/unit/baked_pass_profile.test.js`. Fixture and specification updated. All generated evidence remains under `tests/artifacts/screens/ai574_baked_startup/step6-*`. No commit requested or made.


### Step 6 wrap-up continuation — 2026-09-16 (verification complete; attribution still open)

A host crash interrupted the longer comparison after one original run passed.
Windows recorded bugcheck 0x3b / c0000005 and an inconclusive WER analysis; no
responsible driver/component or relationship to the historical slowdown is
established. Exclude the incomplete current run. Keep the pre-reboot original
capture separate from the following fresh post-reboot cohort.

Three counterbalanced original/current pairs passed at the same recorded
settings, resize sequence, 3390x1540 / DPR 2, Chrome 151 / RTX 3060 / ANGLE D3D11.
Each captures 1,200 cold and warm visible frames; the final 600 form each result
(7,200 measured frames). No profiler, GL wrappers, trace or video in this cohort.
All source hashes match; all 846 production JS/GLSL files match post-Step-4.

| Median metric | Original | Current |
|---|---:|---:|
| Enter to baked, s | 61.946 | 38.081 |
| First visible CPU, ms | 295.900 | 28.700 |
| First visible GPU, ms | 265.721 | 24.793 |
| Settled CPU, ms | 20.200 | 20.000 |
| Settled GPU, ms | 20.752 | 20.786 |
| CPU P99, ms | 27.811 | 27.206 |
| GPU P99, ms | 25.085 | 26.165 |
| FPS | 46.388 | 47.116 |
| Warm activation, s | 1.027 | 1.269 |
| Warm CPU, ms | 20.100 | 20.200 |
| Warm GPU, ms | 21.287 | 21.190 |
| Warm CPU P99, ms | 28.003 | 23.803 |
| Warm GPU P99, ms | 24.856 | 25.865 |
| Warm FPS | 46.628 | 46.388 |
| Cold heap/backing peak, MiB | 2812.02 | 2976.70 |
| Baked GPU maps, MiB | 1345.8125 | 1345.8125 |

Independent medians above; paired current-minus-original CPU/GPU medians:
cold -0.10/+0.034 ms, warm +0.10/+0.110 ms. First pair favored original;
the gap did not repeat in pairs 2/3. Keep every individual result. No >50 ms
CPU/GPU samples occurred in these final settled windows; not a hitch-free claim.
Minimum available host RAM was 14,208.6 MiB. Images: max RGB MAE 0.000658/255;
at most five of 5,220,600 pixels differed by more than four levels. Same calls,
triangles, geometry, baked maps and lighting quality; no warnings or disjoints.

Two separate lifecycle diagnostics each ran four additional warm activations,
900 visible frames per activation. Resources remain constant, both final images
are pixel-identical to their cold images, and no progressive slowdown is shown.
Current CPU medians 19.8/20.4/20.1/20.2 ms; original 20.1/20.1/20.0/19.9 ms.
After one explicit GC outside all timed windows, main-renderer heap + backing
storage was original 2109.91 MiB / current 2135.95 MiB (+26.04 MiB). This does
not cover workers, native memory or total process/GPU memory, and four cycles
are not a complete leak proof. Do not conflate retained memory with cold peak.

Added `BakedActivationLifecycle.js` and `BAKED_STARTUP_LIFECYCLE=1`; the existing
GPU sampler now streams JSONL rows plus available RAM to retain partial evidence
on interruption. All eight streamed captures match their final JSON; four
query/accounting/cleanup unit tests pass. No owned Chrome/sampler remains;
selected test restored. No runtime change or commit made in this continuation.

Decision: startup/quality/lifecycle verification passed, but the historical
Step-5 penalty and host bugcheck are not attributed. Both remaining Step-6
checkboxes stay open; no DONE rename or claim of a fixed intermittent regression.
Next useful action is an affected-session CPU/pass diagnostic with continuously
saved host telemetry before restarting, rather than another blind milestone
sweep without a reproducible signal. No speculative production change or transfer
to AI575. Full individual results, memory data and limitations:
`tests/artifacts/screens/ai574_baked_startup/step6-resume-report.md`,
`step6-resume-comparison.json`, and `step6-lifecycle-comparison.json`.

## On completion

- Mark DONE in the first line and rename to
  `prompts/AI_DONE_graphics_574_ATMOSPHERE_baked_loading_hold_and_first_visible_frame_stalls_DONE.md`.
- Keep the file in `prompts/`; archive only when explicitly requested.
- Summarize each completed change, proven cause, regression checks and evidence.
- Include a same-condition before/after table with frame time/FPS, phase timings,
  CPU/GPU metrics, workload and memory, hardware/resolution/settings, warm-up,
  sample counts and statistics. Mark unavailable metrics `not measured` with a
  reason. State residual stalls honestly; projected savings are not final results.
