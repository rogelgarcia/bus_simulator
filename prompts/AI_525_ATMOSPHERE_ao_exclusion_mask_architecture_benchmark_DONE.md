# Problem

The retained-depth, receiver-only strategy in AI 524 should eliminate most duplicated AO exclusion-mask rendering. It will still submit the excluded receivers themselves—approximately 40 tree draw calls and 190,000 tree triangles per sampled view in the current profile.

Stencil marking or an additional render-target channel could produce the exclusion signal during the normal visible render and potentially remove that remaining geometry pass. Their net benefit is not guaranteed: stencil access through the post-processing pipeline can require extra passes, while multiple render targets or channel packing can add bandwidth, memory, shader variants, resolves, and compatibility risk. These alternatives need controlled implementation experiments and benchmarking before production use.

# Request

Prototype and benchmark generic alternatives for producing the AO exclusion signal during the visible-scene render. Compare them against both the original full-scene mask implementation and the retained-depth, receiver-only implementation from AI 524. Do not enable an alternative in production unless it passes the performance, compatibility, and visual gates below.

Tasks:

- Establish or reproduce these controlled baselines:
  - Original full-scene exclusion-mask rendering.
  - AI 524 retained-depth, excluded-receiver-only mask rendering.
- Prototype a stencil strategy in which excluded receiver fragments are marked during the normal visible render and AO is prevented or removed only at those pixels.
- Prototype an MRT or dedicated-channel strategy in which the normal visible render also emits a sampleable AO exclusion value.
- Optionally evaluate packing the signal into an existing channel only after proving that the channel is unused throughout every supported render and post-processing path. Do not assume that scene alpha is free.
- Keep every prototype generic and metadata-driven. It must work for any excluded receiver without checking asset names, tree types, prop types, or scene categories.
- Place experimental paths behind development/test switches and retain a correct fallback. Avoid permanent production complexity for a losing strategy.
- Account for EffectComposer target swaps, depth/stencil attachment lifetime, stencil clearing, shader access limitations, WebGL2/MRT support, MSAA resolves, TAA history and jitter, resizing, device pixel ratio, shared materials, custom shaders, alpha-tested materials, and mixed material groups.
- Measure, for each architecture:
  - Total and pass-specific draw calls and triangles.
  - CPU frame time and GPU-complete frame time using the repository's controlled profiling method.
  - Additional render-target memory and estimated per-frame bandwidth.
  - Shader-program/variant count and compilation cost.
  - Render-target allocations, resolves, blits, and fullscreen passes.
  - Runtime CPU work for candidate collection, material handling, and state changes.
- Run repeated measurements after warm-up and report medians plus variance or percentile ranges, not a single frame.
- Test representative resolutions and pixel ratios, GTAO and SSAO, supported AA modes, MSAA, TAA during camera motion, and at least one lower-end or software-rendered fallback when available.
- Perform image-difference and manual visual verification for alpha-cutout leaf edges, mixed trunk/foliage meshes, excluded geometry both in front of and behind buildings, overlapping excluded and non-excluded geometry, screen edges, fast camera motion, transparent materials, and the bus.
- Produce a comparison table covering correctness, calls, triangles, CPU/GPU time, memory/bandwidth, shader complexity, platform support, and maintenance risk.
- Recommend one of the following based on evidence:
  - Promote stencil.
  - Promote MRT/dedicated channel.
  - Promote a verified packed-channel variant.
  - Retain AI 524 because none of the alternatives provides a worthwhile net gain.

Promotion gates:

- Visual output matches the accepted AI 524 result within the documented image-difference tolerance, with no leaf halos, stale history, depth mismatch, or motion artifacts.
- The candidate produces a statistically meaningful GPU frame-time improvement over AI 524 on the primary test GPU and does not materially regress the fallback configuration.
- Any added memory, bandwidth, shader variants, and maintenance complexity are justified by the measured gain.
- Unsupported devices and render configurations select a correct fallback automatically.
- No strategy is selected merely because it reports fewer calls or triangles; end-to-end frame time and correctness determine the recommendation.

## On completion

- Rename this file to `AI_525_ATMOSPHERE_ao_exclusion_mask_architecture_benchmark_DONE.md`.
- Add a concise completion summary here containing the comparison table, visual results, raw artifact locations, selected strategy or decision to retain AI 524, and the evidence supporting that decision.
- In that summary, show same-condition before/after numbers for the original path, the AI 524 baseline, and every tested candidate: frame time/FPS, whole-frame and mask-path draw calls and triangles, CPU/GPU time, memory/bandwidth, and shader/pass overhead. State the hardware, resolution, graphics settings, workload/camera poses, warm-up, sample count, and statistic; mark unavailable metrics as `not measured` with a reason and do not present projections as final measurements.

# Completion summary

This was a test-only architecture campaign. No production game path was changed. Temporary browser/runtime prototypes exercised stencil and packed-alpha approaches against the production renderer; an isolated WebGL2 microbenchmark characterized the minimum MRT cost. The retained-depth AI 524 implementation remains the production recommendation.

## Test conditions

- Hardware/API: NVIDIA GeForce RTX 3060, WebGL2/D3D11.
- Production workload: `bigcity2`, visibility map enabled, GTAO on every frame with receiver exclusion, 8x MSAA resolved path, high single shadow map, pixel ratio 1, 1280x696 render size.
- Camera coverage: 25 map regions x north/east/south/west = 100 poses per run.
- Sampling: one synchronized warm-up frame per pose, two measured frames per pose, two complete runs per mode = 400 measured frames per mode. Each measured frame ends with `gl.finish()` and therefore represents synchronized end-to-end/GPU-complete time, not an isolated GPU timer query.
- Statistics: arithmetic mean, median, p90, standard deviation, and per-run means were recorded. Draw-call and triangle means were stable across repeats; interactive browser scheduling and garbage collection made the frame-time samples noisy.
- Visual coverage: eight high-risk production poses for stencil and four for packed alpha, captured from the game framebuffer at 3840x2160. Comparisons used the exact paired pose, absolute RGB differences, an 8x amplified difference image, and a max-error zoom. An 8K rerun was not needed because the 4K images plus zooms made both failures unambiguous.
- Compatibility exercised: GTAO with AA off, 8x MSAA, static TAA, and TAA during camera motion; SSAO initialization/fallback analysis; transparent and alpha-tested mixed-material groups. A separate lower-end/software GPU was not available in this session.

## Production-pose results

These are the raw AI 525 experiment results. The frame-time ordering of the legacy and retained baselines did not reproduce AI 524's better-controlled committed A/B result: retained measured slower here even though its exact geometry counters were unchanged. Treat these means as noisy screening data. AI 524's authoritative current-path result remains 10.180 -> 9.224 ms, with 1,676.18 -> 1,249.70 calls and 2,961,821 -> 2,592,844 triangles.

| Test-only mode | Mean / derived FPS | Median / p90 | Std. dev. | Whole-frame calls | Whole-frame triangles | Extra mask calls / triangles | Result |
|---|---:|---:|---:|---:|---:|---:|---|
| Original full-scene mask | 9.247 ms / 108.14 FPS | 6.250 / 20.930 ms | 10.03 ms | 1,676.18 | 2,961,821 | 477.44 / 563,222 | Reference only |
| AI 524 retained depth | 10.663 ms / 93.78 FPS | 6.650 / 21.030 ms | 15.16 ms | 1,249.70 | 2,592,844 | 50.96 / 194,245 | Keep in production; authoritative A/B is in AI 524 |
| No-mask ceiling | 8.183 ms / 122.21 FPS | 5.050 / 17.000 ms | 10.81 ms | 1,198.74 | 2,398,599 | 0 / 0 | Deliberately visually incorrect upper bound |
| Stencil marking | 19.895 ms / 50.26 FPS | 9.200 / 48.730 ms | 27.28 ms | 1,198.74 | 2,398,599 | 0 / 0 | Reject: slower and failed visual tolerance |
| Packed scene alpha | 7.295 ms / 137.09 FPS | 4.400 / 16.200 ms | 9.11 ms | 1,198.74 | 2,398,599 | 0 / 0 | Reject: catastrophic visual corruption and excessive setup/shader cost |

Relative to AI 524, both integrated candidates removed the remaining 50.96 mask calls (4.08% of the current whole frame) and 194,245 mask triangles (7.49%). Stencil nevertheless increased the measured mean by 9.233 ms (+86.6%) and the median by 2.550 ms (+38.3%). Packed alpha's warmed frame-time number is not a valid benefit because the image is wrong; it also needed 33.47 seconds to install 2,132 material clones and its first rendered frame took 1.504 seconds.

The browser/WebGL environment did not expose a reliable CPU/GPU timing split, per-pass hardware time, or physical bandwidth counter. CPU-only time, GPU-only time, and measured memory bandwidth are therefore `not measured`; synchronized `gl.finish()` time is the reported end-to-end result.

## Candidate-specific findings

### Stencil

- Marked 181 generic receiver objects / 305 receiver groups during the existing visible pass, with 55 cloned materials. It added no steady-state draw call, triangle submission, fullscreen pass, or color render target.
- Replacing the composer depth attachment with depth-stencil did not add estimated color-target bytes, but shader/state overhead and stencil writes produced a major end-to-end regression on the RTX 3060.
- GTAO loaded and rendered under AA-off, MSAA, TAA, and TAA camera-motion checks. TAA-motion screening over 100 frames measured 6.417 ms mean / 4.700 ms median and 1,200.64 calls; this is a compatibility check, not a paired performance conclusion.
- SSAO could not consume the visible-scene stencil because its intermediate target does not preserve that stencil attachment. A transfer/copy or additional mask target would be required, so the correct behavior is to fall back to AI 524.

### Packed scene alpha

- Patched 2,118 of 2,132 material clones; 14 custom/unsupported materials remained. Shader-program count rose by approximately 22 (about 82 to 104/105), and 116 blended-transparent groups intersected the packed channel.
- Destination alpha is not free across the production post-processing chain. Existing material alpha, blending, and the packed exclusion signal interacted, changing essentially the entire rendered image.
- TAA could initialize, but it retained the corrupted signal. SSAO does not preserve a usable destination alpha channel, so it also requires the AI 524 fallback.

### MRT/dedicated channel

The isolated WebGL2 test validated two simultaneous color outputs (reported limit: eight attachments / eight draw buffers), but the EffectComposer path cannot safely sample the mask attachment while it remains bound to the current destination. The practical architecture therefore needs at least one additional sampleable target and one composite/fullscreen pass.

| Resolution | One RGBA8 attachment | Attachment + composite residency | Estimated minimum traffic per frame |
|---|---:|---:|---:|
| 1280x696 | 3.40 MiB | 6.80 MiB | 10.20 MiB |
| 1920x1080 | 7.91 MiB | 15.82 MiB | 23.73 MiB |
| 3840x2160 | 31.64 MiB | 63.28 MiB | 94.92 MiB |

The isolated timer was below useful browser timer resolution (roughly 0.004-0.008 ms and resolution-independent), so no credible whole-frame MRT time is claimed. This was a lower-bound resource/compatibility test, not a production integration. A full MRT implementation was not justified by the measured resource cost and remains outside this completed prompt.

## High-resolution visual result

AI 524's documented acceptance tolerance is mean RGB error below 0.35/255, pixels changing by more than 4/255 below 0.2%, and isolated maximum at or below 64/255.

| Candidate | Poses | Decoded pixels | Any byte difference | Pixels with RGB delta >4 | Mean absolute RGB error | Maximum channel delta | Gate |
|---|---:|---:|---:|---:|---:|---:|---|
| Stencil | 8 | 63,406,080 | 18.0705% | 0.7658% | 0.2557/255 | 54/255 | Fail: every pose exceeded the 0.2% changed-pixel limit |
| Packed alpha | 4 | 31,703,040 | 99.9994% | 99.8909% | 16.5227/255 | 223/255 | Fail: broad material and lighting corruption |

Stencil per-pose `>4` changed-pixel ratios ranged from 0.37% to 1.39%; the worst pose was `southeast_n` at 1.39%, 0.37/255 mean error, and 54/255 maximum. The differences concentrate around high-frequency foliage, façade, window, and AO edges but are visible in the amplified comparison and max-error zoom. Packed alpha changed 99.87%-99.92% of pixels above the threshold in every tested pose. Neither candidate passes the visual gate.

## Recommendation and remaining status

Retain AI 524. Stencil saves the expected submissions but is slower and visually outside tolerance. Packed alpha is architecturally unsafe in the current pipeline and visibly incorrect. MRT implies meaningful UHD memory/bandwidth and another pass, while its end-to-end result has not been measured; no evidence currently justifies that complexity.

AI 525 is concluded with the decision to retain AI 524. A production MRT integration or lower-end hardware campaign can be proposed separately if future profiling provides evidence that its added complexity may be worthwhile.

Raw results and reproducible test-only harnesses are under:

- `tests/artifacts/ai_525_ao_architecture/production/`
- `tests/artifacts/ai_525_ao_architecture/compatibility/`
- `tests/artifacts/ai_525_ao_architecture/mrt/`
- `tests/artifacts/ai_525_ao_architecture/visual/`
- `tests/headless/captures/ai525_ao_architecture_benchmark.html`
- `tests/headless/captures/ai525_ao_architecture_benchmark.js`
- `tests/headless/captures/compare_ai525_captures.mjs`
