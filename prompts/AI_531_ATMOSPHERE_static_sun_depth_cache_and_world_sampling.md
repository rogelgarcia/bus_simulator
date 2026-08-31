# Problem

The mostly static city is repeatedly submitted to current camera-relative sun shadow passes. A surface lightmap or dark decal cannot replace those shadows on arbitrary walls, roofs, roads, and elevated receivers, and cannot later tell a moving bus whether a building blocks the sun.

The framework needs a reusable world-space directional visibility representation. For a fixed sun profile, a tiled orthographic light-space depth field can record the nearest static caster along each sun ray and can be sampled from any receiver fragment without rerendering static casters every frame.

# Request

Implement the optional static directional sun-depth cache and apply it to static world receivers. Produce the cache through the deterministic AI 529 compiler, package/load it through AI 530, and compare it against the current runtime shadow engine. Do not integrate the bus or baked GI in this step.

## Execution gate

- Do not start until AI 527 through AI 530 are DONE.
- Use the current single/CSM shadow stack from AI 497 as the correctness oracle and always-available fallback.
- This feature must remain internal/development opt-in until the bus path in AI 532 and Options path in AI 535 are complete.

Tasks:
- Define a versioned static-sun-depth channel keyed by exact city source identity, caster inventory, sun azimuth/elevation, point-direction profile, projection/tile layout, alpha semantics, precision, bias/filter policy, compiler signature, and channel version.
- Generate deterministic orthographic light-space depth tiles with Blender 5.2.1/Cycles CPU Z/depth passes through AI 529 scripts. This is an exact geometric visibility product, not a stochastic surface `SHADOW` lightmap.
- Define stable light-space basis/origin, tile coordinates, overlap/guards, near/far/depth normalization, empty/background encoding, quantization, and reconstruction metadata.
- Size and tile the approximately 600 m city through measured texel-density, disk, decode, upload, GPU-memory, and streaming tradeoffs. Do not select a monolithic maximum-resolution texture without evidence.
- Validate opaque depth against deterministic geometry ray/BVH truth samples.
- Treat alpha-tested foliage and cutout casters as a release gate. Reproduce runtime UV, alpha texture, threshold, side/culling, and mip semantics or compile deterministic silhouette geometry. Geometry-only ray tests may not certify foliage.
- Preserve rooflines, overhangs, decorations, traffic controls, curbs, and other silhouettes required by the accepted current shadow result. Record any deliberate caster exclusions and visual consequence.
- Decide and document V1 sun softness:
  - a single point-direction depth field plus runtime PCF/penumbra approximation; or
  - a small deterministic multi-direction profile representing sun angular size.
  Do not claim physical soft shadows from an unmeasured blur.
- Implement runtime world-position sampling in dedicated shader source files under `src/graphics/shaders/`, integrated through the illumination hook defined by AI 527.
- Attenuate only lobes produced directly by the named sun: direct diffuse, direct specular/clearcoat, and explicitly supported direct transmission. Preserve indirect IBL/environment reflection/specular, indirect light, emissive, material variation, and final-color behavior. Road markings receive ordinary direct-sun visibility; never multiply their generic base/final color by a dark decal.
- Support static receivers on roads, terrain, curbs, sidewalks, walls, roofs, props, and foliage where compatible; do not limit the cache to a flat ground decal.
- Implement tile lookup, guard-band sampling, mip/filter behavior, bias/normal-bias equivalent, out-of-bounds behavior, streamed/unresident tile behavior, and seam diagnostics.
- Use AI 530 atomic lifecycle. No sampling is allowed until the complete compatible cache required by the active view/profile is ready.
- In baked-development mode, remove static casters from recurring runtime shadow-map submission only after cached-world correctness is active. Keep the current live maps intact and restorable for `current`, unavailable assets, wrong profiles, unsupported devices, editor/debug cities, or any failure.
- Do not alter current-engine rendering or cost when the illumination mode is `current`.
- Add debug views for light-space tiles, reconstructed depth, receiver coordinates, comparisons, tile residency, bias, out-of-range samples, and per-pixel current-vs-cache visibility difference.
- Add deterministic same-session image comparisons at the AI 527 lab/route cases, including low sun, long shadows, vertical receivers, roofline/self-shadow detail, tile boundaries, city edges, and alpha-cutout foliage.
- Require zero missing occluders. Define strict numeric/image tolerances for filtering differences and reject halos, light leaks, acne, peter-panning, swimming, seams, and stale-profile use.
- Benchmark current shadows, cache sampling with current maps still present, and cache sampling with static caster submissions removed. Record whole-frame and shadow-pass calls/triangles, CPU/GPU timing, shader cost, memory, disk/load/upload, and tile residency.

Acceptance requirements:
- Static world receivers reproduce the accepted current-engine sun visibility within documented gates across the full test matrix.
- Static casters are not rerendered every frame in the cache mode after activation.
- Current mode remains visually and behaviorally unchanged and works without the payload.
- Missing/stale/corrupt/unsupported cache states atomically retain or return to current shadows.
- The cache exposes a stable arbitrary-world-position sampling contract for AI 532 without containing bus-specific logic.

## Implementation progress — 2026-08-30

Implemented the development/runtime foundation:

- Strict versioned `static_sun_depth` identity, float32-safe coordinate/depth
  contract, RG8 encoding, complete-set residency, guard-aware arbitrary-world
  CPU sampler, and deterministic fixture compiler.
- AI 530 RG8 array packaging and capability vocabulary, pre-upload per-layer
  SHA-256 and complete guard verification, explicit upload boundary, async
  prewarm, frame-boundary activation, fence-safe retirement, and exact current
  fallback.
- Dedicated GLSL world sampling for Standard/Physical materials through the
  ordered illumination hook. Only the named sun's direct lobes are attenuated;
  indirect/environment/emissive/final color remain outside the multiplier.
- Exact live-provenance revalidation, ambiguous directional-light rejection,
  exact attached-city shader compilation before caster suppression, City-only
  caster ownership, comparison mode with current casters retained, pipeline
  replacement/removal symmetry, and WebGL context-loss restoration.
- Ten debug variants and a frozen 205-case validation catalog (8 lab, 100 route
  profiler, 1 civic, and 96 low-sun cases).

Current automated evidence:

- 161 focused Node contract, encoding, sampling, hook, graphics, fence, caster,
  engine-lifecycle, validation-catalog, and tile-integrity tests pass.
- Chromium compiles the pinned stock/CSM shader paths and verifies 14 rendered
  CPU/GPU visibility pairs across MeshStandard and MeshPhysical, including
  rotated world coordinates, signed/empty depths, PCF, internal guards, global
  boundaries, and normal bias. Ten additional final-color readbacks prove that
  cache occlusion attenuates the named sun while preserving a non-aligned
  directional light, ambient contribution, and emissive.
- Browser lifecycle coverage proves that forged tile hashes, valid-hash invalid
  guards, whole-package corruption, stale request identity, live identity
  drift/exceptions, receiver-material drift, exact-city compile failure,
  context loss, and pipeline removal never expose a partial cache or leave
  static caster ownership orphaned.

The prompt intentionally remains active. The available AI 529 city
reconstruction emits only a 32×32 proof depth image, so these release gates are
still open:

- a fresh production multi-tile city bake and production `.ilpkg`;
- opaque BVH/ray truth plus exact alpha-cutout/foliage certification and reviewed
  caster exclusions;
- same-session full validation-catalog image comparisons and required visual
  artifacts with zero missing occluders; and
- measured current/comparison/cache frame and shadow workload, CPU/GPU timing,
  memory, payload/load/upload/residency, bake duration, variance, and hardware
  table.

See [the static-sun cache authority](../specs/graphics/static_sun_depth_cache.md),
[runtime/app contract](../src/app/illumination/static_sun_depth/),
[graphics pipeline](../src/graphics/illumination/static_sun_depth/),
[shader sources](../src/graphics/shaders/materials/), and
[fixture compiler](../tools/static_sun_depth/).

## On completion

- Mark the AI document as DONE in the first line.
- Rename it to `prompts/AI_DONE_531_ATMOSPHERE_static_sun_depth_cache_and_world_sampling_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Add a concise completion summary linking the channel spec, production/fixture bake, shader/runtime modules, debug views, validation artifacts, tests, and fallback behavior.
- Include same-condition before/after tables for visual error, frame time/FPS, whole-frame and shadow-pass calls/triangles, CPU/GPU time, GPU memory, payload size, load/decode/upload time, tile residency, bake duration, hardware, resolution, settings, route/poses, warm-up, sample count, statistic, and variance. Mark unavailable metrics as `not measured` with a reason.
