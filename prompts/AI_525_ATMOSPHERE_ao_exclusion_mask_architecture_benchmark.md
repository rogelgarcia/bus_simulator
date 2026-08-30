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
