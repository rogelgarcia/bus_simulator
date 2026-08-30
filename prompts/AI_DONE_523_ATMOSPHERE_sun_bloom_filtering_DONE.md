# DONE

# Problem

The production sun-bloom occlusion path renders nearly the complete visible
scene whenever sun bloom is enabled, even when the sun effect is offscreen or
no scene object can overlap it. The visibility-on 5 x 5 regional profile
measured the sun-bloom work at approximately 491.8 calls and 565,428 submitted
triangles per frame: 22.7% of all calls and 16.0% of all triangles. Buildings
accounted for about 394.4 of those calls and trees for another 40.0.

Sun-bloom occlusion is only visually relevant when an object is between the
camera and visible bright sun-bloom content in screen space. The existing path
still traverses the scene, substitutes occluder materials, and submits objects
that cannot affect the sun disc or ray starburst. A simple direction test is
not sufficient because nearby objects can have large projected bounds and the
effect includes the sun disc, rays, bloom spread, screen-edge transitions, and
camera jitter.

# Request

Add conservative, generic sun-bloom filtering so each frame performs only the
work needed to produce the current visual result. The optimization must be
content-agnostic and based on render state and projected bounds, not on object
names or special cases for trees, buildings, props, or the bus.

Tasks:
- Distinguish at least these runtime outcomes:
  - the sun-bloom content is fully irrelevant to the current viewport, so its
    rendering can be skipped without retaining a stale texture;
  - the sun bloom is visible but no scene object can occlude it, so only the
    sun-bloom emitters and required bloom processing are rendered;
  - one or more objects may occlude the effect, so only a conservative set of
    potential occluders is submitted.
- Determine potential occlusion from the actual camera projection, active sun
  disc/ray extent, and object bounds. Account for projected object size,
  bloom/ray coverage, screen edges, TAA jitter, and rapid camera motion. Do not
  rely on a center-point dot-product test alone.
- Keep the filtering conservative: false-positive candidates are acceptable;
  false negatives that allow bloom or rays to leak through geometry are not.
  Objects with missing, unsafe, animated, or indeterminate bounds must remain
  eligible rather than silently disappearing from occlusion.
- Preserve alpha-cutout silhouettes for foliage and other cutout materials,
  opaque occlusion, depth behavior, render layers, visibility behavior, and
  dynamic occluders such as the bus.
- Apply the same generic filtering to every compatible scene occluder. Do not
  make the implementation tree-aware, building-aware, prop-aware, or dependent
  on static-visibility category names.
- Ensure skipped or dynamically selected states never reuse stale bloom data,
  flash at state boundaries, pop near the screen edge, or lag behind camera
  movement. Add a conservative guard band and stable transition behavior where
  required.
- Preserve the static-visibility render bridge and shadow behavior. Sun-bloom
  helper rendering must not rebuild shadow maps or change gameplay color-pass
  visibility.
- Avoid replacing the full-scene draw cost with comparable per-frame CPU work.
  Report candidate-testing cost and any persistent bounds/indexing memory.
- Expose concise diagnostics for the current filtering outcome, candidate
  count, retained occluder count, and fallback/conservative-inclusion count so
  profiling can verify why a frame selected each path.
- Do not change the authored sun-bloom appearance, strength, radius, threshold,
  disc, rays, or user-facing mode semantics.
- Do not redesign the ambient-occlusion exclusion mask in this AI; that is a
  separate rendering optimization.

Validation and reporting:
- Add focused tests for sun fully offscreen, clear visible sun, complete
  building occlusion, partial building-edge occlusion, foliage cutout peeking,
  the bus crossing the sun, large nearby bounds, screen-edge entry/exit, TAA
  jitter, and fast camera rotation.
- Compare optimized occlusion-relevant frames against the current output with
  deterministic pixel tests. There must be no visible bloom leakage, missing
  alpha-cutout detail, or transition flicker.
- Verify that an offscreen frame performs no stale or unnecessary sun-bloom
  render work and that a visible clear-sun frame does not submit general scene
  occluders.
- Repeat the production visibility-on 25-region x N/E/S/W profile used by the
  existing report. Record how often each filtering outcome occurs rather than
  assuming a 99% no-occlusion rate.
- Report before/after sun-bloom and whole-frame draw calls, submitted
  triangles, CPU + GPU frame time, candidate-test CPU time, and memory. Include
  global results, results per filtering outcome, and representative worst-case
  occlusion frames.
- Use the current profile as the baseline: approximately 491.8 sun-bloom calls
  and 565,428 sun-bloom triangles per average frame. Explain any materially
  different reproduced baseline before drawing conclusions.

Acceptance:
- Frames where the sun effect is irrelevant do not execute the full sun-bloom
  scene pass and cannot display stale bloom.
- Clear-sun frames submit only the sun-bloom content and required post-process
  work, not hundreds of unrelated scene meshes.
- Occluded frames submit a conservative screen-space candidate set and remain
  visually equivalent to the current occlusion-aware output.
- The optimization produces a meaningful measured reduction in production
  sun-bloom calls/triangles without a measurable regression in frame time,
  visual stability, shadow behavior, or static visibility.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_523_ATMOSPHERE_sun_bloom_filtering_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_523_ATMOSPHERE_sun_bloom_filtering_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change
- In the completion summary, include a same-condition before/after performance table with frame time/FPS, whole-frame and sun-bloom draw calls and triangles, CPU/GPU time, candidate-filter CPU cost, and memory. State the hardware, resolution, graphics settings, tested workload/camera poses, warm-up, sample count, and reported statistic; mark anything unavailable as `not measured` with a reason rather than substituting projections.

# Completion summary

- Added conservative, content-agnostic projected-bounds filtering with `irrelevant`, `clear`, and `candidate_occlusion` outcomes; unknown or animated bounds remain conservatively eligible.
- Offscreen frames now skip the helper composer and explicitly composite black, clear frames render only the bloom layer, and overlap frames retain only candidate occluders while preserving alpha cutouts and restoring all temporary scene state.
- Added runtime diagnostics, a debug-only `sunBloomFilter=0` legacy switch, profiler outcome/candidate metrics, a graphics behavior specification, pure selection tests, and deterministic browser scenarios.
- Verified pixel-identical optimized/legacy output for steady-state alpha-cutout occlusion, clear-sun frames, and offscreen frames; also exercised TAA jitter, rapid camera rotation, large nearby bounds, and dynamic candidate transitions.

## Production before/after performance

Two independent runs per mode used the production city with static visibility active, 25 regions x N/E/S/W (100 poses), one warm-up frame and two GPU-synchronized measured frames per pose. Results below are the mean of the two run averages: 400 measured frames per mode on an NVIDIA GeForce RTX 3060, 1280x696 renderer output, pixel ratio 1, 55-degree FOV, camera height 3.683 m, pitch -9.673 degrees, and the production high single-shadow configuration. `gl.finish()` was included in frame timing.

| Metric | Legacy full-scene pass | Filtered path | Difference |
|---|---:|---:|---:|
| GPU-synchronized whole frame | 12.00 ms | 10.09 ms | -1.91 ms (-15.9%) |
| FPS derived from mean frame time | 83.34 | 99.11 | +15.77 (+18.9%) |
| Whole-frame draw calls | 2,169.34 | 1,676.54 | -492.80 (-22.7%) |
| Whole-frame triangles | 3,529,440 | 2,964,011 | -565,429 (-16.0%) |
| Sun-bloom helper draw calls | 491.80 | 0 | -491.80 (-100%) |
| Sun-bloom helper triangles | 565,428 | 0 | -565,428 (-100%) |
| Candidate-filter CPU time | 0 ms | 0.392 ms | +0.392 ms |
| Approximate persistent frame references | 0 | 6.3 KiB | +6.3 KiB |

All 400 filtered production frames were `irrelevant`; none rendered or reused the sun-bloom helper texture. Every attributed renderer frame reconciled exactly with the renderer counters. The two legacy run averages were 11.90-12.10 ms and the two filtered averages were 10.01-10.17 ms.

CPU submission and GPU execution were not measured separately because the established region profiler reports synchronized end-to-end time using `gl.finish()` rather than GPU timestamp queries. Additional render-target memory and bandwidth were not measured because the optimization adds no render targets and leaves the bloom composer allocation unchanged. The reported 6.3 KiB is the filter's conservative reference-storage estimate, not total JavaScript heap usage.

## Visible-sun candidate benchmark

The deterministic aligned-sun synthetic case used 20 warm-up frames and 80 GPU-synchronized measured frames per mode. The candidate path reduced the helper pass from 31 to 15 calls and from 49 to 17 triangles. Candidate testing averaged 0.026 ms. The deliberately tiny scene's whole frame increased from 0.128 to 0.258 ms (+0.130 ms) because bounds-testing CPU cost exceeds the saving from 16 trivial plane draws; the absolute overhead remains below the 0.2 ms test gate. Production candidate-frame timing was not measured because none of the 100 production camera poses placed bloom content in the viewport.

## Verification and artifacts

- `node --test tests/node/unit/sun_bloom_occlusion_math.test.js`: 5 passed.
- `sun_bloom_occlusion_filtering.pwtest.js`: 5 passed, covering outcomes, work reduction, alpha-cutout parity, clear/offscreen parity, TAA/rotation, and candidate overhead.
- `threejs_upgrade_smoke.pwtest.js`: 3 passed.
- Legacy profiles: `tests/artifacts/sun_bloom_filtering_legacy/` and `tests/artifacts/sun_bloom_filtering_legacy_repeat2/`.
- Filtered profiles: `tests/artifacts/sun_bloom_filtering_optimized/` and `tests/artifacts/sun_bloom_filtering_optimized_repeat2/`.
- Candidate benchmark: `tests/artifacts/headless/e2e/sun_bloom_occlusion_filter-48a57--bounds-worst-case-overhead/sun-bloom-filtering-candidate-benchmark.json`.

The older `sun_bloom_foliage_occlusion_alpha_cutout.pwtest.js` sampling points produced zero bloom in both the filtered and explicitly forced legacy paths on the current Chrome runtime, so they could not distinguish the implementations. The new aligned-sun scenario supplies the valid pixel-equivalence coverage. The production profiler also logged an existing HTTP 500 for the optional brownstone material-correction module; city startup, active visibility, all 100 poses, and renderer-counter reconciliation still completed.
