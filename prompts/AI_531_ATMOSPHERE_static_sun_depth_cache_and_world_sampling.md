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

## Restart handoff - 2026-08-31

AI 531 is **not DONE**. The runtime/cache foundation is committed at
64001d7 (feat(illumination): add static sun depth cache), but the production
bake, validation, diagnostics, and certification work after that commit is a
large uncommitted and partially interrupted worktree. Preserve it: audit the
diff before changing direction, and do not reset, delete, or assume every
experimental path is ready to keep. All long-running validation was stopped at
the user's request; no bake, browser run, or validator should be assumed to
survive a restart.

### Last trustworthy evidence

- Lab validation completed all 8 canonical cases: 7 passed and 1 failed. The
  stable failure is illum.lab.overhang_receiver_fixture.az135_el08 with a
  remaining missing_occluder result. Report:
  tests/artifacts/screens/illumination_531/lab_evidence_identity/canonical_fresh_evidence_canvas_v2/lab_validation_report.json.
- Production validation completed all 197 canonical cases: 51 passed and 146
  failed. Missing occluders dominate, with additional maximum/mean RGB,
  pixels-over-four, seam, continuous-seam, and aggregate browser-diagnostic
  failures. Report:
  tests/artifacts/screens/illumination_531/production_final_v1/production_validation_report.json.
- The RGB24-plus-occupancy diagnostic completed 12 selected cases: 5 passed and
  7 failed, essentially matching RG8 failure locations and magnitudes. Higher
  depth precision did not fix the blocker, so do not spend another cycle on
  depth encoding without new contrary evidence. Report:
  tests/artifacts/screens/illumination_531/depth_precision_rgba8_rgb24a_v1/depth_precision_diagnostic_validation_report.json.
- All timing evidence above is contaminated by other processes and shared GPU
  contention, as reported by the user. It is not promotion evidence. Keep final
  timing metrics not measured with that reason unless they are recollected
  under controlled same-condition runs. Calls/triangles and correctness
  evidence may still be collected independently.

### 2026-09-01 post-rebase continuation

- The AI 531 checkpoint remains an ancestor of rebased main at b949b01. The
  shader/cascade lifecycle fix is retained and the audited AI 531 files were not
  lost by the rebase.
- The native WebGL2 depth-texture transform-feedback fixture now passes. The
  helper no longer inherits an incomplete caller draw framebuffer, restores the
  exact caller GL/renderer state, authenticates the depth attachment identity,
  and preserves Depth32F plus Depth24 values. The Lab tree-transport browser gate
  also passes.
- Production alpha-cutout spatial parity is now file-backed rather than a set of
  declared counters. The builder rehashes repository-confined occupancy,
  first-hit Float32, comparison, and canonical sample-plan files; rejects
  traversal, symlinks, duplicates, tampering, incomplete data, fabricated
  classifications, omitted cutout casters, and any measured mismatch; and
  records path, byteLength, and sha256 for every stream. The sample plan binds
  the lighting profile, canonical sample indices/texels, and the exact complete
  cutout-caster ID set.
- Persisted spatial parity artifacts have an independent reauthentication API.
  The production release finalizer calls it for every profile. The focused
  parity suite passes 6/6, the release suite passes 12/12, and the complete
  static-sun-depth unit directory passes 112/112 after finalizer and sample-plan
  wiring.
- A fresh Lab validation was interrupted by a computer crash before a report
  was written. Its partial output is not evidence. Do not replace the last
  trustworthy 7/8 Lab report with that directory.
- The pinned portable Blender 5.2.1 executable is present under the AI 529
  toolchain artifacts and may be used in an isolated headless process. The open
  unsaved GUI session is Blender 5.2.0 and must not be repurposed. The user
  approved headless use. A full rebake must wait until the measured foliage
  mismatch and per-profile coverage contract are resolved; otherwise the
  expensive output remains uncertifiable.
- The remaining measured-evidence producers now exist. Native WebGL2 sparse
  capture uses integer texel attributes plus transform feedback against the
  authenticated depth attachment and restores exact GL/renderer state. The
  cutout-only live wrapper restores all caster/material identities and the full
  live shadow target. Its Three/ANGLE fixture passes, and a real BigCity2 Depth24
  probe authenticated all 124 cutout foliage slots.
- The deterministic candidate planner projects every authenticated foliage
  triangle-group centroid, retains closest depth per caster/texel, and proves
  the signed-permutation/phase transform from local 16384x16384 live texels to
  the production cache-global lattice. For `ai527.sun.az135.el08` it produced
  98,867 candidates and selected 111 native first-hit plus 111 transparent
  samples. Maximum geometric-versus-native first-hit error was
  0.0049727557596952465 m, inside the fixed 5 mm gate.
- The headless Blender producer reuses the pinned AI 529 package verification,
  reconstruction, and AI 531 production material/camera pipeline. It physically
  removes every opaque/forced-opaque face, retains 233,232 cutout triangles,
  renders the 16 exact production tiles containing the requested texels, and
  publishes authenticated U8 occupancy and Float32 source-camera-distance
  streams. The completed bounded diagnostic emitted 222 samples without using
  or modifying the open Blender GUI session.
- Measured live-versus-Blender parity currently fails as expected from the
  foliage filter blocker: live occupancy is 111/222, Blender cutout-only
  occupancy is 9/222, occupancy mismatch count is 108, only 6 samples are
  commonly occupied, and 4 of those exceed 5 mm first-hit-depth error (maximum
  1.85205078125 m). These are correctness measurements, not performance
  evidence. The reusable runner now reauthenticates both raw streams and derives
  this comparison from bytes rather than accepting declared counters.
- A separate physical coverage blocker was also proven. The camera-relative
  680 m rotated live shadow square does not contain every authenticated foliage
  caster in every profile: az045/az225 profiles cover 114 and exclude 10;
  az135/az315 profiles cover 111 and exclude 13. The current per-profile exact
  124-caster sample-plan contract is therefore unsatisfiable. Do not clamp or
  fabricate texels. Evolve it to authenticate each profile's in/out-of-coverage
  classification and require the release-wide sampled-caster union to cover all
  124 casters non-vacuously.

### Primary blocker

Production foliage/alpha-cutout caster silhouettes do not yet reproduce the
current Three.js r183 shadow sampler exactly. Runtime leaves use generated
mipmaps, trilinear minification, and anisotropy 8, while the current exported
Blender reconstruction reduces non-nearest sampling to a generic linear mode.
GPU-generated mip and anisotropic sampling are implementation-dependent. The
remaining production errors therefore cannot be accepted as a simple bias,
filter-radius, or RG8 precision difference.

The alpha-cutout release certificate must be based on actual spatial
occupancy/first-hit observations. Texture/source authentication alone, or
declared zero mismatch counts without spatial evidence, is not sufficient.
The certificate must fail closed for missing, stale, tampered, traversed,
symlinked, mismatched, or incomplete evidence.

### Remaining work, in order

1. Evolve the file-backed spatial-evidence contract without weakening it:
   authenticate each profile's native in-coverage and projected out-of-coverage
   caster sets, require the eight-profile sampled-caster union to equal the
   exact 124-caster source inventory, and use nonnegative source-camera-distance
   Float32 for the shared first-hit comparison stream while preserving signed
   canonical depth in the cache payload.
2. Implement a deterministic alpha-cutout path that matches current foliage
   shadow occupancy, either by reproducing the effective runtime UV/alpha,
   threshold, side/culling, mip, filter, and anisotropy semantics or by
   compiling deterministic silhouette geometry with proven equivalence.
3. Feed the now-implemented real producer streams into the evolved file-backed parity
   builder and mandatory release-finalizer reauthentication. Do not construct a
   spatial parity artifact from synthetic counters or unauthenticated bytes.
4. Keep AI 531 validation scoped to static-world receivers. Dynamic bus receiver
   sampling belongs to AI 532; do not promote interrupted comparisons that count
   bus pixels as AI 531 static-world failures. Preserve the required proof that
   current fallback and dynamic caster behavior remain safe.
5. Close the remaining Lab low-sun missing-occluder failure without weakening
   the zero-missing-occluder gate. Use native 1280x720 evidence captures and
   retain exact current/cache same-session pairing.
6. Fix or conclusively classify the production browser diagnostic failure. The
   interrupted audit found asset-request ERR_ABORTED noise consistent with the
   headless static server closing large parallel tree transfers; harden server
   streaming/keep-alive and fail-closed tree readiness rather than filtering the
   diagnostic.
7. After any exporter, compiler, sampler, foliage, or certification change,
   re-export the canonical city source and rebuild all 8 production sun-profile
   bakes/packages. Old packages are stale when source/compiler identity changes.
8. Rerun the strict 8-case Lab matrix and full 197-case production catalog.
   Require authenticated complete capture sets, zero missing occluders, zero
   false-lit seams, and every documented numeric/image gate. Do not substitute
   the RGB24 diagnostic subset for the full RG8 production release matrix.
9. Rerun focused Node, Python/Blender, and browser tests; update the cache,
   compiler, package, validation, and tool documentation; record deliberate
   caster exclusions and their visual consequences.
10. Collect controlled performance/load/memory/bake measurements when the host
    is suitable, or explicitly mark unavailable timing metrics not measured
    with the shared-machine/GPU reason. Never promote contaminated timing data.
11. Only after the correctness and fallback gates pass, add the completion
    summary, mark the first line DONE, rename the prompt as specified below, and
    commit when requested. Do not begin AI 532 while AI 531 remains active.

## On completion

- Mark the AI document as DONE in the first line.
- Rename it to `prompts/AI_DONE_531_ATMOSPHERE_static_sun_depth_cache_and_world_sampling_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Add a concise completion summary linking the channel spec, production/fixture bake, shader/runtime modules, debug views, validation artifacts, tests, and fallback behavior.
- Include same-condition before/after tables for visual error, frame time/FPS, whole-frame and shadow-pass calls/triangles, CPU/GPU time, GPU memory, payload size, load/decode/upload time, tile residency, bake duration, hardware, resolution, settings, route/poses, warm-up, sample count, statistic, and variance. Mark unavailable metrics as `not measured` with a reason.
