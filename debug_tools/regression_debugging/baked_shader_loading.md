# Baked loading and ANGLE shader warnings

Date: 2026-09-14. Starting revision: `efcd832`.

The user reports slow baked activation, CPU stalls, ANGLE X3595 (implicit
derivatives inside varying loops) and X4000 (`getCalibratedIBLIrradiance` result
possibly uninitialized). Scope: correct these shader paths and measure activation
without changing lighting, shadow samples, map resolution or material appearance.

## Hypotheses and reproduction

- Dynamic and native finite-sun depth filters use `texture2D` inside loops with
  per-pixel branches/continue. Their depth maps have no mipmaps. Explicit level-zero
  sampling should preserve the filter while removing implicit texture derivatives
  and potentially expensive compiler lowering.
- The calibrated diffuse function has two return paths with duplicated PMREM
  sampling. Resolve the calibrated/legacy intensity before one native-equivalent
  sample, preserving environment rotation and both intensity semantics.
- Existing evidence in `baked_activation_stutter.md` reports roughly 80 seconds
  of cold shader preparation after earlier CPU decode/validation fixes. Warnings
  alone do not prove they cause this duration; measure separately.

Use the hardware route replay with startup CPU profiling, one stored pose at
0x120, current defaults, 3520x1540 and three samples. `REPLAY_SHADER_LOGS=1` saves
program logs, original GLSL and available ANGLE translation after readiness.
`REPLAY_ASSERT_SHADER_LOGS=1` additionally rejects the two reported warnings.
Collect ordinary timing separately from expensive diagnostic queries/profiling.

Artifacts: `tests/artifacts/screens/recorded_slowdown/shader-loading-*/`.
The test owns a private Chrome process; user browsers and Blender are untouched.

## Results

The first complete diagnostic (`shader-loading-before-01`) reproduced warnings in
78 of 137 programs. Final view preparation took 90.80 seconds, after 38.25 seconds
of activation work; the phase observer saw the prepared view at 137.93 seconds.
Three stationary frame samples are insufficient for a gameplay performance claim.

The first patch removed implicit texture derivatives and the calibrated IBL
early return. An isolated reproduction then exposed two additional X4000 return
warnings in static bilinear comparison and streamed visibility. Explicitly
initialized single-exit results remove those too. Three captured heavy production
programs link successfully with empty logs after all five shader corrections.
Their compilation remains about 11–14 seconds each, so the warnings themselves
were not the main compilation-time cause.

An isolated intervention fixing debug mode to Final reduces one heavy program
from 14.67 to 7.50 seconds. Production shaders previously compiled every shadow
debug visualization, duplicate lookup path, and diagnostic fallback despite using
Final mode. The implementation specializes Final and retains a separate shared
uniform-driven diagnostic variant, with correct hook keys and asynchronous view
preparation when crossing that boundary.

| Diagnostic run | Result |
|---|---|
| before-01 | Complete; 90.80 s view preparation; 78 programs with warnings |
| after-01 | Warning-only attempt hits the existing preparation deadline; excluded from performance |
| after-02 | Specialization via shader.defines invalidates authenticated material metadata; rejected by source checks |
| after-03 | Source-only specialization; complete; 28.83 s preparation; 137 programs, zero X3595/X4000 |

The metadata mutation was removed. The production preprocessor define is injected
only into fragment shader source; material defines, assets, source hashes and
compatibility validation remain intact. No timeout or readiness gate was relaxed.
The successful after-03 phase observer saw readiness at 62.38 seconds, including
26.16 seconds of activation work. Profiled timings include instrumentation overhead.

`tests/headless/e2e/baked_shader_warnings.pwtest.js` is the opt-in captured-program
repro: set `BAKED_SHADER_CAPTURE` to before-01/shaders.json. Original shader copies
are under `tests/artifacts/screens/baked_shader_loading/before-*.glsl`.
`BAKED_SHADER_EXPERIMENT=final-specialization` compares corrected uniform code
with the constant-Final intervention. It does not mutate production source.

The matched repeated experiment serves an `efcd832` snapshot of the seven modified
production JS/GLSL files using `REPLAY_SHADER_BASELINE=1`. They are stored with
their repository paths under `tests/artifacts/screens/baked_shader_loading/before-src/`;
files.json lists only these source files. Each before/after pair uses a fresh private
Chrome, the same defaults and drawing buffer, 90 warm-up frames followed by 256
stationary frames at source pose 0x120. CPU profiling and shader-log queries are
off for these runs. Names: `shader-loading-repeat-{before,after}-0{1,2,3}`.
Final canvas captures in pair 1 support the appearance comparison.

### Repeated ordinary timings

All six runs completed on the RTX 3060 through ANGLE/D3D11 with baked lighting
active, a stable activation generation and valid GPU timer samples. Each fresh
private Chrome context starts without previously submitted scene programs; this
does not claim to flush the operating system or the GPU driver's disk cache.

| Version/pass | Shader preparation (s) | Load/activation (s) | CPU median / p99 (ms) | GPU median / p99 (ms) | Frame interval median / p99 (ms) |
|---|---:|---:|---:|---:|---:|
| Before 1 | 85.18 | 30.92 | 21.90 / 27.27 | 22.64 / 28.39 | 22.40 / 29.74 |
| After 1 | 28.78 | 27.43 | 21.80 / 26.19 | 22.78 / 26.78 | 22.40 / 26.79 |
| Before 2 | 87.09 | 31.17 | 21.80 / 28.79 | 22.38 / 26.83 | 22.40 / 29.44 |
| After 2 | 27.63 | 27.50 | 21.80 / 27.96 | 22.93 / 26.60 | 22.40 / 28.67 |
| Before 3 | 87.77 | 29.86 | 21.80 / 30.06 | 23.11 / 26.79 | 22.40 / 32.21 |
| After 3 | 28.75 | 27.28 | 19.80 / 21.94 | 18.66 / 24.57 | 20.30 / 22.44 |

Median shader preparation falls from 87.09 to 28.75 seconds: 67% less time,
58.34 seconds saved. Loading/activation is a separate phase, not part of that
shader-only percentage. The first two pairs have comparable steady GPU medians;
the faster third after-run is not sufficient evidence of a gameplay FPS gain.
The stationary measurements establish no consistent steady rendering regression.
They do not establish that route-dependent first-use hitches are resolved.

All runs retain 919 calls, 859,774 triangles, 98 textures, 1,567 geometries and
137 programs. The same tracked baked/shadow GPU allocations total 1,599,683,200
bytes: receiver maps/mapping 941,424,640; parent depth 469,762,048; dynamic shadow
134,217,728; streamed detail 54,278,784. This estimate excludes other game
resources and driver/program binaries; it is not measured total VRAM. No bake
assets, settings, resolution, samples or source validation gates changed.

Machine-readable summaries: `tests/artifacts/screens/baked_shader_loading/repeated-results.json`
and `repeated-results.md`. Full per-frame and activation diagnostics remain in
each replay directory.

### Appearance and regression checks

The first before/after pair's `final.png` captures use identical camera, settings
and 3520x1540 drawing buffers. Mean absolute RGB difference is 0.000266 code
values out of 255; 99.9962% of pixels differ by at most one code value in every
channel. The largest isolated channel difference is seven. Both images were
visually inspected. See `tests/artifacts/screens/baked_shader_loading/image-comparison.json`.

Passed through the standardized test runner:

- `static_sun_receiver_plane.pwtest.js`: two parent/detail slope, contact and
  penumbra cases; specialized and uniform Final images are exactly equal.
- `illumination_static_sun_depth_adapter.pwtest.js`: authenticated authored
  defines stay unchanged; Final/diagnostic keys change and Final is reusable.
- `calibrated_diffuse_ibl.pwtest.js`: legacy and calibrated response preserved,
  including rotation; reported compiler warnings absent.
- `finite_sun_shadow.pwtest.js`: native finite-sun penumbra/resolution behavior
  and material hooks preserved.
- `lighting_view_preparation.pwtest.js`: two asynchronous preparation,
  cancellation and superseded-view tests.
- `illumination_static_sun_depth_pipeline.pwtest.js`: verified activation,
  rollback, dynamic receivers, debug switching, context loss and source drift.
- Captured-program warning experiment: three production variants linked with
  empty logs; isolated Final specialization also linked with an empty log.
- Full city diagnostic: all 137 programs compile without X3595/X4000. Six
  unprofiled replay runs independently finish with baked lighting active.

The pipeline fixture initially failed its synchronous compile-rejection assertion
with both the working tree and the `efcd832` source snapshot. Its harness now owns
an asynchronous baked coordinator, which bypassed the synchronous throw the
fixture intended to inject. The fixture explicitly disables/restores that
coordinator for its standalone pipeline contract; no assertion was relaxed.
The actual game's asynchronous path remains covered by view-preparation tests
and the six complete replays. Temporary baseline routing for this check was
removed after confirming the identical pre-existing failure.

### Remaining work

Initial city construction, source validation, package download/decode and GPU
uploads remain separately measured costs. The successful startup profile still
contains an initial city task around six seconds and later tasks around 1.18,
0.88 and 0.82 seconds. This change does not remove every startup freeze.
Diagnostic views compile their shared variant on first use; returning to Final
reuses the prepared program. AI 572's gradual nearby texture/geometry preparation
is still pending and addresses a different source of route hitches.
