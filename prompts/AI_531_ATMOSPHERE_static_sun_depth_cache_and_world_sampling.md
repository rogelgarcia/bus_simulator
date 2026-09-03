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
  parity suite passes 8/8, the release suite passes 13/13, and the complete
  static-sun-depth unit directory passes 127/127 after v2 coverage and
  release-union wiring.
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
  fabricate texels.
- The coverage-contract blocker is now resolved without weakening v1. The new
  v2 sample plan authenticates canonical per-profile in-coverage and
  out-of-coverage caster sets, requires the measured samples to cover exactly
  the in-coverage set, and binds their union to the complete source inventory.
  The isolated Blender producer accepts and revalidates the same v2 partition.
  Per-profile certification now uses a v3 record containing both caster sets,
  and the v3 exact-eight release certificate computes a release-wide union,
  remains ineligible when any source caster is missing from that union, and
  records per-profile set hashes. The real capture runner now emits the v2 path
  for physical partial coverage. The legacy all-casters v1 and explicit
  diagnostic v1 paths retain their original strict behavior.
- The real runner now deterministically converts its full per-sample depth
  diagnostics into the file-backed builder's exact streams: U8 live/bake
  occupancy, U8 independently derived comparison classifications, and compact
  Float32 live/bake first-hit values only for commonly occupied samples. It
  always writes a canonical build input and emits
  `spatial_parity_artifact.json` automatically when the measured comparison
  passes. Current mismatched foliage runs remain diagnostic and emit no passing
  artifact.
- Production receipt injection is wired. `production.mjs` accepts an
  `--alpha-parity-root` with one profile subdirectory per release sun. Node
  independently reauthenticates every nested evidence file before and after the
  long render, passes the canonical artifact plus exact hash to isolated
  Blender, requires Blender to embed it in the stdout-hashed receipt, checks
  the fresh descriptor hash, and rejects stale resumed packages. Blender parses
  and hashes the artifact without trusting its declarations; Node remains the
  semantic/file authority.
- The repository-wide Node run has no AI 531 regression. Its six failures are
  unrelated rebased work: facade attachment face fallback, two missing/incomplete
  grass-asset checks, markings debugger shortcut drift, a missing texture
  correction class, and an angled-support wall-decorator expectation.

### 2026-09-01 deterministic foliage continuation

- The requested checkpoint was committed as `033205f` (`feat(illumination):
  measure AI 531 foliage parity`). The continuation after that commit is still
  uncommitted. Gameplay activation did not change: the production cache/bake
  remains development-only and disabled, so normal gameplay continues through
  the previous current-shadow engine without requiring baked maps.
- The sparse Blender producer no longer renders 16 complete 1870x1821 tiles for
  222 samples. Pinned isolated Blender 5.2.1 now uses an exact 4x4 orthographic
  micro-camera whose source pixel is centered on the requested production texel.
  The bounded run therefore renders 3,552 pixels while preserving the production
  ray center and footprint. Retained source-coverage artifact:
  `tests/artifacts/illumination_531/alpha_diagnostics/ai527.sun.az135.el08-sparse-micro-v2`.
  It measured 111 live-occupied, 8 Blender-occupied, 5 commonly occupied, 109
  occupancy mismatches, 4 first-hit mismatches, and maximum depth error
  1.85211181640625 m. This supersedes the earlier full-tile 9/222 summary.
- A fail-closed forced-opaque diagnostic retained at
  `tests/artifacts/illumination_531/alpha_diagnostics/ai527.sun.az135.el08-sparse-force-opaque-v2`
  made Blender occupy 218/222 samples and included every one of the 111
  live-occupied rays. This proves the reconstructed geometry, light basis,
  production lattice, micro-camera, direction/culling, and primary-ray centers
  are present and aligned. The extra occupancy and 43 depth differences are the
  expected result of making normally transparent leaf layers opaque.
- A second fail-closed diagnostic retained at
  `tests/artifacts/illumination_531/alpha_diagnostics/ai527.sun.az135.el08-sparse-no-flipy-v2`
  neutralized binding `flipY` and produced byte-identical parity counts to the
  ordinary source-coverage run. Row orientation is not the blocker.
- All 124 authenticated cutout casters use one exact profile: material
  `material:2e1e1fd4e888a7c41109f96ed8f0a7121f59e19f3ec88c3699a3d99a5d1c37bd`,
  a single 2048x2048 RGBA8 raw typed-pixel atlas,
  alpha channel `a`, threshold 0.5, opacity 1, alpha-to-coverage enabled, clamp
  wrapping, `flipY=true`, linear magnification, linear-mipmap-linear
  minification, generated mips, and anisotropy 8. Coverage buffer SHA-256 is
  `a8db1e00bb094da0e3920b7209a57bc0c6b959aff841506b5dfa537d19663858`.
- The pure-Python silhouette compiler is now V2 and memory-bounded. It builds an
  explicit UNORM8 box-reduced alpha mip chain, evaluates trilinear minification,
  applies a versioned anisotropic kernel from exact affine UV gradients, and
  emits plane-preserving opaque proxy quads on the authenticated global light
  lattice. A sparse restriction evaluates only named global pixels without
  changing their footprint/LOD/depth. Mip bytes remain compact instead of being
  expanded into Python integer tuples.
- That compiler is wired into the isolated Blender producer as an authenticated
  diagnostic-only mode. It is explicitly rejected for production-eligible
  requests until spatial parity passes. For the retained 222 samples it examined
  233,232 source triangles but only 2,998 bounded triangle/pixel candidates,
  found 1,088 geometric coverages, kept 250 overlapping source hits at 108
  unique texels, and emitted 500 proxy triangles. Retained artifact with full
  per-candidate coverage/depth/UV/gradient evidence:
  `tests/artifacts/illumination_531/alpha_diagnostics/ai527.sun.az135.el08-sparse-deterministic-silhouette-v3`.
- The first deterministic render reduced the measured error from 109 occupancy
  mismatches to 11: 108 Blender-occupied, 104 commonly occupied, and 4 depth
  mismatches. A scalar threshold sweep cannot solve this without violating the
  exact 0.5 rule; its best result still has seven occupancy errors.
- Bounded offline kernel sweeps use the retained authenticated UV gradients and
  launch no Blender render. The original axis-major kernel bottoms out at six
  occupancy plus one depth mismatch. An SVD/elliptical diagnostic footprint with
  full span reaches 220/222 exact occupancy and zero first-hit mismatches (maximum
  matched depth error 0.0003336643610509782 m), but the two live-occupied residual
  samples remain false negative with maximum reconstructed coverages
  0.47887677448211774 and 0.44993436684675975. A 1,053-policy fine sweep around
  that result found no zero-mismatch kernel. Do not promote a fitted threshold,
  LOD bias, tap count, or SVD diagnostic as production truth.
- A state-restoring WebGL2 probe now binds the actual live Three.js foliage
  texture and evaluates the retained candidate centers and exact derivatives
  with explicit native `textureGrad`. It retains the authenticated binding,
  texture/filter/aniso identity, renderer, adapter, GPU/driver, and exact GL
  state-restoration result. The reusable end-to-end runner authenticated the
  candidate receipt and BSIB, replayed all 1,088 candidates, and reproduced all
  111 live-occupied samples: 0 occupancy mismatches, 0 first-hit depth
  mismatches, and maximum first-hit depth error
  0.0003336643610509782 m. Retained artifact:
  `tests/artifacts/illumination_531/alpha_diagnostics/ai527.sun.az135.el08-native-texture-grad-cli-v1`.
  Capture SHA-256 is
  `8d8fdeac97239082a2fc4a0128efe82c860b7b267eee06e1e882a8bcbefe08e7`.
  This proves the remaining sparse discrepancy was solely the
  implementation-dependent native mip/trilinear/anisotropic sampler, not
  geometry, candidate ownership, UV centers, derivatives, culling, lattice, or
  depth reconstruction. It is source-evaluated evidence tied to the recorded
  GPU/driver, not a claim that native filtering is deterministic across GPUs.
  The probe is now a single bounded batch rather than one draw/readback per
  candidate. It supports at most 262,144 queries per chunk through RG32F
  UV/derivative textures and one RGBA32F result surface, explicitly normalizes
  and restores pixel-unpack state, and restores every touched texture unit. Its
  v2 method identity and exact browser-probe, capture-helper, runner, query,
  binding, caster-inventory, source-receipt, and BSIB hashes are retained in:
  `tests/artifacts/illumination_531/alpha_diagnostics/ai527.sun.az135.el08-native-texture-grad-batched-v4`.
  The authenticated capture SHA-256 is
  `3f599491e30e2a13a940e4a9467de3ffafcc241160950196a1d7cf2ce01874d8`.
- Focused validation after this continuation passes: 132/132 standard selected
  static-sun-depth Node tests, 11/11 pure-Python silhouette tests, and pinned
  Python compilation of both Blender scripts. All observed timings remain
  non-promotable because the user declared concurrent processes/shared GPU load.

## Progress — 2026-09-02

- [x] Runtime/cache foundation, authenticated package loading, fallback behavior,
  and development-only activation are implemented. Normal gameplay still uses
  the previous current-shadow engine because the production bake is wired but
  disabled by default.
- [x] Complete direct-Depth24 and explicit-native-`textureGrad` candidate fields
  were produced for all eight release sun profiles with isolated portable
  Blender and authenticated browser sampling.
- [x] Mixed-material foliage ownership was corrected so cutout faces are removed
  from the Cycles opaque pass without dropping opaque faces that share a mesh.
- [x] A conservative minimum-depth union of the direct and native
  `textureGrad` fields reached zero missing-occluder pixels and zero false-lit
  seams in the focused low-sun production case. Its remaining strict same-pixel
  RGB maximum is 68 bytes against the original 64-byte limit at one
  cache-darker foliage edge pixel.
- [x] The large `.ilpkg` browser `ERR_ABORTED` diagnostic was traced to manual
  stream consumption of an HTTP response with a known `Content-Length`. Known
  lengths now use `Response.arrayBuffer()` with an exact post-read length check;
  unknown lengths retain the bounded fail-closed streaming path. The focused
  package request now finishes normally with zero browser diagnostics.
- [x] An implicit-gradient v4 native candidate was evaluated and rejected rather
  than promoted after measured spatial parity failed.
- [x] On 2026-09-02 the user approved a one-pixel alignment-aware RGB comparison
  because the result need not be perfectly same-pixel at foliage silhouettes.
  The strict zero-missing-occluder and zero-false-lit-seam gates remain unchanged,
  and raw same-pixel RGB metrics must remain visible beside the aligned metrics.
- [x] Implemented and tested the dual raw/alignment-aware RGB metric contract.
  Focused current/cache evidence passes with aligned mean 0.0160897490 bytes,
  aligned maximum 37 bytes, and 177/708,940 pixels (0.0249669%) over four
  bytes, while retaining raw same-pixel mean 0.0248685831, maximum 68, and
  480/708,940 (0.0677067%). Missing occluders, false-lit seams, maximum seam
  run, and browser diagnostic counts are all zero. Retained evidence:
  `tests/artifacts/screens/illumination_531/localize_regional_dense_w_az135_el08_composed_union_aligned_rgb_v1`.
- [x] Re-exported the canonical current city source after the branch rebase and
  shader fix. Two clean resolved-gameplay rebuilds produced identical complete
  package bytes. Fresh artifact:
  `tests/artifacts/illumination_528/packages/bigcity2/ai531-production-current-20260902/bigcity2.bsib`;
  358,234,104 bytes, domain package SHA-256
  `690ea5cd66ee1ff9f893af599ea6e72c6a01db094963a2942baa84b82689a2fb`,
  raw file SHA-256
  `f781f431937bb796095fcc98608d0e59a26e272ed31a7ee2c088102423c0a511`.
  The 6,043-caster/124-foliage inventory is intact. The old and fresh geometry,
  used-material, resolved-source, and all four physical channel-source hashes
  differ; the compiler hash is unchanged. Therefore no old field or package may
  be certified as current.
- [x] Rebuild and authenticate all eight current-source fields, parity artifacts,
  descriptors, and packages. Do not certify stale packages.
  - Current `ai527.sun.az135.el08` progress: explicit v3 field complete from
    16,343,496 authenticated candidates with 1,041,636 occupied texels; direct
    Depth24 field complete with 1,222,210 occupied texels; conservative union
    complete; provisional descriptor complete. Sparse union parity measured
    111 live-occupied versus 112 bake-occupied samples, with one extra bake
    occupancy and zero depth mismatches. The extra texel `[18075,2502]` comes
    only from explicit `textureGrad`; direct Depth24 is empty there.
  - All eight current-source direct Depth24 fields, provisional descriptors, and
    spatial-parity artifacts are now complete. Every profile has exact sparse
    occupancy parity (111/111 or 114/114), zero occupancy mismatches, zero
    first-hit-depth mismatches, and maximum matched error no greater than
    0.00048828125 m. Retained roots:
    `tests/artifacts/illumination_531/native_cutout_fields/current_20260902_direct_depth24_v1`,
    `tests/artifacts/illumination_531/provisional_current_20260902_direct_depth24_v1`,
    and
    `tests/artifacts/illumination_531/native_field_parity_current_20260902_direct_depth24_v1`.
    The final eight production descriptors/packages and exact-eight certificate
    remain to be built.
  - All eight fresh explicit-native-`textureGrad` v3 fields are complete from
    the retained authenticated Blender candidate captures. The eight-profile
    minimum-depth union is also complete at
    `tests/artifacts/illumination_531/native_cutout_fields/current_20260902_composed_union_v2`.
    Its receipts authenticate the fresh post-rebase BSIB and both direct and
    texture-gradient inputs. Provisional union rendering completed for all 8/8
    profiles without a second access violation. The authenticated descriptors
    are retained at
    `tests/artifacts/illumination_531/provisional_current_20260902_composed_union_v2`.
  - The 8/8 minimum-union sparse diagnostic pass is complete. It found 28
    conservative bake-only samples in total (per-profile counts 3, 3, 1, 1,
    2, 7, 6, 5), zero live-occupied/bake-empty samples, and wrong first-hit
    replacement in four profiles because minimum-depth composition could
    override an already exact direct hit. A versioned v6 direct-preferred
    hole-fill compositor is implemented and its focused Node/Python checks pass.
  - The complete v6 direct-preferred field and provisional-descriptor set is
    rebuilt and remeasured. All eight profiles have zero live-occupied/bake-empty
    samples and zero first-hit-depth mismatches; maximum matched depth error is
    0.00048828125 m. The only residual is the same 28 explicitly visible
    bake-only samples across 1,800 total samples (3, 3, 1, 1, 2, 7, 6, 5).
    Retained roots:
    `tests/artifacts/illumination_531/native_cutout_fields/current_20260902_direct_preferred_union_v1`,
    `tests/artifacts/illumination_531/provisional_current_20260902_direct_preferred_union_v1`,
    and
    `tests/artifacts/illumination_531/native_field_parity_current_20260902_direct_preferred_union_v1_diagnostic`.
  - Current non-policy validation passes 197/197 relevant Node tests (178 broad
    static-sun-depth/graphics plus 19 runtime-facade) and 12/12 pinned-Python
    tests. These counts are correctness-only; timings are non-promotable under
    the declared shared-machine/GPU contention.
- [x] Rerun the strict 8-case Lab matrix and the full 197-case production catalog.
- [x] Complete focused/full Node, Python/Blender, and browser validation; update
  documentation; record unavailable performance numbers as `not measured` due
  to concurrent processes and shared GPU use.
- [ ] Resolve the remaining strict production visual failures and rerun the
  complete 197-case catalog until its report passes without weakening any
  missing-occluder, seam, or aligned RGB gate.
- [ ] Add the completion summary and rename this prompt only after the strict
  production report and release certification pass. Keep baked gameplay
  activation disabled by default.

## Tracked issues — 2026-09-02

1. **Implicit-gradient v4 is non-promotable.** The focused v4 field measured 8
   occupancy mismatches and 1 first-hit-depth mismatch (maximum 0.313049 m), with
   105 bake-occupied versus 111 live-occupied sparse samples. Retained evidence:
   `tests/artifacts/illumination_531/native_field_parity_implicit_gradient_v4_focused_v1/ai527.sun.az135.el08`.
   Decision: retain it only as diagnostic evidence; production continues from
   the conservative direct/explicit-`textureGrad` union.
2. **The focused union has a one-pixel foliage-edge RGB residual.** It has zero
   missing occluders and zero false-lit seams, but the raw same-pixel maximum is
   68 bytes rather than 64. The approved resolution is a nearest eligible current
   pixel within a 3x3 neighborhood, minimizing RGB Chebyshev error. The validator
   must report both methods, may gate only on the aligned values, and must never
   relax missing-occluder or seam checks. Implemented result: the aligned gate
   passes at maximum 37 while the raw maximum 68 remains visible; zero
   missing-occluder and seam gates remain unchanged.
3. **The prior package-request `ERR_ABORTED` is resolved.** Runtime tracing proved
   that the response was HTTP 200, all 226,755,120 declared bytes were received,
   authenticated, uploaded, and activated, while Chromium still reported an
   aborted request for the manually consumed stream. The known-length
   `arrayBuffer()` path removes that diagnostic without filtering browser errors
   or weakening the unknown-length byte cap. Retained focused evidence:
   `tests/artifacts/screens/illumination_531/localize_regional_dense_w_az135_el08_composed_union_known_length_fetch_v4`.
4. **Current-source freshness must be re-established.** After the user rebased
   other branches and fixed a shader, the current `TreeGenerator.js` has
   `leaf.alphaToCoverage = false`, while older AI 531 source artifacts recorded
   it as enabled. Existing final packages therefore cannot be treated as current
   release evidence. The canonical city re-export is now complete and proved
   that source identity changed: static-sun-depth channel-source SHA-256 moved
   from `9c45af841f9962979a1f460b52e0631f9c9841266a481dfa14d61c7ba588cc7e`
   to `283dd9df57289807854d16c0c6ffe3fb5fc9024dceb69cbb25919fd354922552`.
   The remaining action is to rebuild every profile from that fresh source.
5. **Performance evidence is contaminated.** Multiple other processes and the GPU
   are in use. Continue correctness work, but do not promote observed timings;
   record required performance/load/memory/bake metrics as `not measured` with
   this reason unless a later controlled run is available.
6. **Fresh-source field generation had a stale layout-authority dependency.**
   The direct and native candidate tools previously assumed a rendered descriptor
   tied to the old BSIB, creating a bootstrap cycle after any legitimate source
   change. The native builder now derives its exact request/layout from the fresh
   authenticated Blender candidate receipt, defaults to the parity-proven explicit
   `textureGrad` v3 path, and retains implicit-gradient v4 only as an explicit
   diagnostic mode. Direct Depth24 capture can authenticate the same candidate
   receipt as its layout/camera authority. Focused contracts pass.
7. **Fresh `az135/el08` union sparse parity has one conservative extra texel.**
   Measured union parity is 111 live occupied, 112 bake occupied, one occupancy
   mismatch, zero depth mismatches, and maximum matched first-hit error
   0.00048828125 m. The mismatched global texel `[18075,2502]` is empty in the
   direct Depth24 field and occupied at depth 80.07 m only in explicit
   `textureGrad`. This is not a missing occluder, but exact spatial certification
   still fails. Resolution: the fresh direct-only field passes exact parity at
   111/111 occupied with zero mismatches, and all other seven direct profiles
   also pass exact sparse parity. The current-source release therefore uses the
   direct Depth24 fields; the stale-source union and fresh diagnostic union are
   retained only as forensic evidence, not release inputs.
8. **Final production retry required after a Blender access violation.** The
   current-source final build atomically published the first four profiles
   (`az045/el08`, `az045/el35`, `az135/el08`, `az135/el35`). While rendering
   `az225/el08`, portable Blender 5.2.1 exited with Windows status 3221225477 and
   `EXCEPTION_ACCESS_VIOLATION` after saving 31 of 33 strip EXRs. No failed
   profile was promoted and the four completed publications remain
   authenticated. This occurred under the user-declared concurrent-process and
   shared-machine contention. Action: retry through the orchestrator's
   authenticated existing-publication path, which must revalidate/reuse the four
   completed profiles and create a new isolated staging run for the failed one.
   Result: the retry succeeded; all eight direct-field production packages and
   the package index were published. The first four were fully reauthenticated
   and resumed, and the final four completed in new isolated runs.
9. **Exact sparse direct parity is not sufficient for full-frame foliage
   coverage.** All eight direct fields pass the 222/228-sample sparse parity
   contract exactly, but the fresh `az135/el08` focused 1280x720 production
   comparison still measures 213 missing-occluder pixels. Retained evidence:
   `tests/artifacts/screens/illumination_531/localize_current_20260902_direct_depth24_aligned_rgb_v1`.
   The direct-only release is therefore not visually eligible. The conservative
   direct/explicit-`textureGrad` union previously reduced this gate to zero but
   has one bake-only sparse occupancy at `[18075,2502]`. Under the user's explicit
   statement that the result need not be 100% perfect, the proposed safe policy
   is narrowly asymmetric: allow at most one conservative bake-only sparse
   occupancy, while continuing to require zero live-occupied/bake-empty samples,
   zero first-hit-depth mismatches, zero full-frame missing occluders, and zero
   false-lit seams. Do not promote the direct-only packages.
10. **Minimum-depth union can replace a valid direct first hit.** The fresh 8/8
    diagnostic run measured zero live-missing samples but 28 bake-only samples
    and depth mismatches in `az225/el08`, `az225/el35`, `az315/el08`, and
    `az315/el35`. The worst error was 32.531677 m in `az315/el08`, where the
    texture-gradient field selected unrelated nearer foliage over the direct
    field's already parity-proven depth. Retained diagnostic roots:
    `tests/artifacts/illumination_531/native_field_parity_current_20260902_composed_union_v2_diagnostic`.
    Resolution: v6 composition always preserves nonzero direct Depth24 and uses
    explicit native `textureGrad` only to fill direct-zero silhouette holes.
    The old v5 minimum union stays supported only so retained evidence remains
    readable; it must not be promoted. The v6 field and descriptors are
    regenerated, and all eight diagnostics confirm zero missing and zero depth
    mismatches, with the same 28 bake-only samples and a per-profile maximum of
    seven. A versioned seven-sample conservative contract was proposed but
    intentionally not applied pending explicit user approval because it changes
    release eligibility.
11. **Node 24 on Windows does not treat test directories as collections.** The
    first broad invocation passed its explicitly named tests and Python suite but
    reported two `MODULE_NOT_FOUND` harness errors for directory arguments. The
    corrected run expanded explicit `.test.js` paths and passed 178/178; the
    separately resolved runtime facade then passed 19/19. This was a test-command
    issue, not a product-code failure, and no failing result was hidden.

### Current blocker

The current source, eight incremental v11 fields, exact sparse parity, promoted
fields, fresh final packages, and strict Lab evidence are complete. Release
eligibility remains blocked by 44 genuine full-frame visual failures in the
latest 197-case report after excluding two obsolete lifecycle assertions: 25
continuous-seam, 15 maximum-RGB, 10 pixels-over-four, and 7 missing-occluder
failures, with overlapping cases. The seven missing-occluder cases contain 16
pixels total and are the next evidence-backed residual-localization targets.
No visual threshold has been weakened and no release certificate exists.

### Remaining work, in order

1. Localize all seven current missing-occluder cases with the genuine
   pre-activation current-shadow oracle. Apply only authenticated, nearer,
   nonzero live-depth corrections whose receiver/caster evidence resolves.
2. Rebuild only affected v11 fields, then regenerate the corresponding
   provisional renders, parity authority, promotion, and final packages. Keep
   all eight package/index identities coherent with the current renderer.
3. Rerun the strict 8-case Lab matrix and full 197-case production catalog.
   Require zero missing occluders, zero false-lit seams, complete authenticated
   captures, and all documented aligned numeric/image gates. Keep raw metrics
   visible and do not treat the fixed lifecycle bookkeeping bug as a visual pass.
4. Resolve or explicitly retain as open the remaining raster/filter edge
   failures. Do not invent depth corrections when signed-visibility evidence
   disagrees but CPU receiver-depth reconstruction matches the cache texel.
5. Rerun focused and broad Node, Python/Blender, and browser tests; update cache,
   compiler, package, validation, and tool documentation; preserve the default
   disabled bake/current-shadow gameplay fallback.
6. Record performance/load/memory/bake figures as 'not measured' under current
   shared-machine/GPU contention unless a controlled measurement window becomes
   available.
7. Only after all correctness and fallback gates pass, add the completion
   summary, mark the first line DONE, rename the prompt as specified below, and
   commit only when requested. Do not begin AI 532 while AI 531 remains active.

## Candidate progress — 2026-09-03

The user approved pragmatic progress without requiring perfect same-pixel
matching, provided progress and problems remain separately documented. The
completion audit nevertheless keeps AI 531 open because the active acceptance
contract still requires the strict production report to pass. The failed report
is retained, no release certificate was issued, and normal gameplay remains on
the previous current-shadow engine.

- The canonical current source remains
  `tests/artifacts/illumination_528/packages/bigcity2/ai531-production-current-20260902/bigcity2.bsib`
  (358,234,104 bytes; raw SHA-256
  `f781f431937bb796095fcc98608d0e59a26e272ed31a7ee2c088102423c0a511`).
- v9 rebased historical-hole restoration and v10 measured bake-only removal
  were followed by v11 authenticated live-depth residual correction. v11 adds
  17 exact nearer-depth corrections across five profiles: 13 in
  `az045/el35`, and one each in `az135/el08`, `az135/el35`, `az225/el08`, and
  `az315/el35`. Evidence classes remain explicit: foliage cutout, forced-opaque
  non-foliage, or unresolved; opaque residuals are not mislabeled as foliage.
- Final unpromoted fields:
  `tests/artifacts/illumination_531/native_cutout_fields/current_20260902_residual_calibrated_v11_final_unpromoted_v2`.
  Final promoted fields:
  `tests/artifacts/illumination_531/native_cutout_fields/current_20260902_residual_calibrated_v11_final_promoted_v2`.
- Definitive parity authority:
  `tests/artifacts/illumination_531/native_field_parity_current_20260902_residual_calibrated_v11_final_v3`.
  All 8/8 profiles passed exact sparse occupancy and first-hit parity: zero
  occupancy mismatches, zero depth mismatches, and maximum matched drift no
  greater than 0.00048828125 m.
- Current-producer production packages and exact-eight index:
  `tests/artifacts/illumination_531/production_current_20260903_residual_calibrated_v11_final_v1`.
  Package sizes are 226,754,688–226,755,120 bytes for elevation 8 degrees and
  529,195,408–529,195,680 bytes for elevation 35 degrees; the eight packages
  total 3,023,801,776 bytes.
- The strict Lab matrix passed 8/8:
  `tests/artifacts/screens/illumination_531/lab_current_20260903_residual_calibrated_v11_final_v1/lab_validation_report.json`.
- Focused production probes show the original 66-pixel
  `regional_dense.s.az135.el08` failure reduced to zero, a representative
  forced-opaque `profiler.r5c5.w` failure reduced to zero, and the foliage
  `profiler.r4c4.e` case reduced from three missing pixels to one. Reports are
  retained under
  `tests/artifacts/screens/illumination_531/localize_current_20260903_residual_calibrated_v11_*`.
- The full 197-case production catalog completed and improved from 138 passing
  / 59 failing to 148 passing / 49 failing. The strict report remains failed:
  `tests/artifacts/screens/illumination_531/production_current_20260903_residual_calibrated_v11_final_v1/production_validation_report.json`.
- Correctness tests pass: 257/257 explicit related Node tests, 12/12 Python
  silhouette tests, and Python compilation of
  `compile_cutout_silhouettes.py`,
  `production_alpha_cutout_sparse_samples.py`, and
  `production_static_sun.py`.
- Runtime fallback remains unchanged. `current` mode does not fetch or activate
  the bake. Development cache mode activates only after full package validation
  and restores current shadows on missing, stale, corrupt, unsupported, or
  lifecycle failure. The bus retains live dynamic casting; baked static-city
  caster suppression occurs only after cache activation.

### Before/after validation and workload

| Measure | v10/full baseline | v11/full result |
| --- | ---: | ---: |
| Passing production cases | 138/197 | 148/197 |
| Failing production cases | 59 | 49 |
| Cases with missing occluders | 21 | 9 |
| Missing-occluder pixels | 123 | 25 |
| Maximum aligned RGB error | 96 bytes | 95 bytes |
| Maximum aligned mean RGB error | 0.2917733 bytes | 0.2918063 bytes |
| Maximum pixels over four bytes | 0.4967817% | 0.4961480% |
| False-lit seam pixels | 0 | 0 |
| Maximum continuous seam-error run | 12 pixels | 12 pixels |

Across the v11 catalog, current static-city shadow submission was 70–332 calls
and 236,069–1,909,836 triangles per measured frame; cache mode reduced both to
zero while retaining dynamic bus shadow submission. Whole-frame totals varied
with view: current 101–5,657 calls and 395,822–6,189,318 triangles versus cache
29–5,327 calls and 145,139–4,328,481 triangles. Frame time/FPS, CPU/GPU time,
shader cost, physical GPU memory, bake wall time, load/decode/upload timing,
variance, and timing-derived comparisons are **not measured for promotion**
because the user declared multiple concurrent processes and shared GPU load.
The validation resolution is 1280x720 on WebGL2/ANGLE with an RTX 3060; all
timing evidence is marked contaminated and `usableForPromotion: false`.

## Tracked issues — 2026-09-03 open validation failures

1. **Strict production release remains ineligible.** The complete catalog has
   49 failed cases: 15 `maximum_rgb_error`, 26 `continuous_seam`, 12
   `pixels_over_four`, and 9 `missing_occluder` failures. Counts overlap when a
   case fails more than one gate. No threshold was weakened and no release
   certificate was produced.
2. **Twenty-five missing-shadow pixels remain in nine cases.** Four are
   `az045/el35` profiler cases (13 pixels total), two are `az225/el08` dense
   cases (3), one is `az225/el35` (1), and two are `az315/el35` (8). The largest
   remaining individual case has seven pixels. This is accepted only as a
   documented development limitation under the user's not-100%-perfect scope;
   it is not described as a strict pass.
3. **Most remaining failures are raster/filter edge differences.** Thirty-four
   of the 49 failing cases use `az045/el35`. Diagnostics showed both foliage
   cutout and forced-opaque building-edge residuals, so the remaining problem is
   general Blender-versus-live shadow raster parity rather than foliage alone.
4. **One case changed from pass to fail.** `illum.profiler.r2c5.e` moved from
   exact RGB equality to `pixels_over_four` plus `continuous_seam`. A focused
   rerun reproduced the color difference, but the strongest measured
   cache-darker pixel reported both live and cache shadow visibility equal to
   one, zero occupancy mismatches, and zero depth mismatches. Treat this as an
   unresolved non-shadow render/state difference; do not attribute it to a
   measured v11 depth correction without further evidence.
5. **Artifact authentication rejected two unsafe shortcuts.** Copying otherwise
   valid parity directories into a new aggregate root failed because evidence
   paths are authority-bound. Reusing three older unchanged provisional renders
   also failed after the producer inventory changed. Both attempts failed before
   promotion; all eight parity receipts were recaptured in the final root and
   all eight Blender outputs were regenerated with the current producer.
6. **Crash and host contention handling is complete but timing is unusable.**
   The interrupted headless Blender profile survived and finalized; subsequent
   profiles ran sequentially in isolated processes. Correctness receipts are
   valid, but all performance conclusions remain `not measured`.
7. **Gameplay activation stays intentionally disabled.** Shipping/runtime code
   remains wired for development use, but opening the game follows the previous
   current-shadow path without requiring or loading these packages. AI 532 may
   build on the stable arbitrary-world-position sampler, while any player-facing
   option remains deferred to AI 535.

## Recovery progress — 2026-09-03 post-crash continuation

- The release oracle was corrected to capture the genuine normal-gameplay
  current renderer before cache activation. The validation-only liveFinal
  transition remains available only as an explicit mismatch diagnostic because
  hardware A/B evidence proved that transition changes the following cache
  frame. The default mismatch localizer and residual calibrator now require the
  pre-activation source.
- Genuine-current localization produced five incremental corrections for
  az045/el35 and one for az225/el35. The resulting all-eight unpromoted
  authority is
  tests/artifacts/illumination_531/native_cutout_fields/current_20260903_residual_calibrated_v11_incremental_all8_unpromoted_v1.
- Incremental v11-on-v11 lineage initially failed closed in both the JavaScript
  orchestrator and Blender renderer. Both authenticated allowlists now accept
  only the exact v11 schema/method pair in addition to v9/v10, with focused
  regression coverage. A failed pre-render directory was preserved under the
  provisional artifact root rather than deleted.
- All eight provisional profiles were freshly rendered with the current
  renderer SHA-256
  bbbc66877faab9df05a2c1e038f0e485356db57d52c18da393f13de355cfba5c.
  All 8/8 native-field parity captures passed and were production-eligible:
  tests/artifacts/illumination_531/native_field_parity_current_20260903_residual_incremental_v11_v1.
- All eight fields were promoted and reauthenticated:
  tests/artifacts/illumination_531/native_cutout_fields/current_20260903_residual_calibrated_v11_incremental_all8_promoted_v1.
  Eight fresh final packages and the exact-eight index were published:
  tests/artifacts/illumination_531/production_current_20260903_residual_incremental_v11_v1.
- The strict Lab gate passed 8/8:
  tests/artifacts/screens/illumination_531/lab_current_20260903_residual_incremental_v11_v1/lab_validation_report.json.
  Timings remain non-promotable because of the user-declared concurrent
  processes and shared GPU load.
- The full 197-case run completed:
  tests/artifacts/screens/illumination_531/production_current_20260903_residual_incremental_v11_v1/production_validation_report.json.
  Its report correctly exposes 44 cases with genuine visual failures, but also
  marked every case with two obsolete post-activation lifecycle assertions.
  The evaluator now requires the exact observed genuine-current state
  (current, unavailable/not_configured, no cache caster ownership) and keeps
  cache suppression plus signed-difference restoration strict. The focused
  validation/lifecycle suite passes 28/28; a fresh catalog rerun is still
  required after visual residual work.

## Tracked issues — 2026-09-03 recovery cycle

1. **Incremental v11 lineage validation was duplicated and stale.** JavaScript
   preflight accepted top-level v11 but rejected v11 as a residual source;
   Blender then exposed the same v9/v10-only check. Both rejected before useful
   rendering, both were extended to the exact authenticated v11 identity, and
   both now have regression coverage.
2. **The genuine-current sequence invalidated two old lifecycle assertions.**
   All 197 current captures consistently proved the pre-cache current engine:
   no active cache resource, requested/effective current, controller
   unavailable/disposed for not_configured, and zero suppressed or snapshotted
   casters. The report still demanded a post-activation liveFinal state and
   compared its caster counters to signed-difference restoration, causing two
   nonvisual failures in every case. The evaluator has been corrected to the
   exact pre-cache state; visual thresholds and cache caster gates are unchanged.
3. **Forty-four genuine visual failures remain.** Excluding only the two stale
   lifecycle codes, counts are 25 continuous_seam, 15 maximum_rgb_error, 10
   pixels_over_four, and 7 missing_occluder, with overlaps. The seven missing
   cases contain 16 pixels: one in az045/el08, three in az045/el35, three across
   two az225/el08 cases, and nine across three az315/el35 cases. These are
   pending authenticated localization; the prompt remains open and no release
   certificate has been issued.

## Completion audit decision

## Stable preactivation recovery progress — 2026-09-03

- Hardware reproduction isolated the apparent cross-case regression to the
  validation-only `liveFinal` material transition. A target captured alone had
  zero missing pixels, while cache/live interleaving after a south view produced
  486 and a repeated west transition produced 2,323. Live static-shadow draw
  submission, caster inventory, sun matrices, and receiver masks were identical;
  the following cache image changed substantially after 2,043 shader hooks were
  torn down and reinstalled. TAA/GTAO/flare resets and extra warm-up frames did
  not remove it.
- The production runner now restores its original two-phase contract per sun
  profile: capture every genuine current-engine RGBA before activation, activate
  the package once, then capture cache/comparison frames without entering
  `liveFinal`. Current and cache bytes remain paired in the same page/profile
  IndexedDB. A faithful south-to-west bounded reproduction then passed every
  visual gate: zero missing pixels, maximum RGB error 37 bytes, 0.0246847% over
  four bytes, zero seam-error pixels, and zero continuous seam run.
- The restored full round-two catalog completed with all lifecycle, package,
  caster, workload, tile-boundary, dynamic-bus, browser-diagnostic, and 985-PNG
  authentication gates valid. It passed 151/197 cases and failed 46 genuine
  visual cases: 25 `continuous_seam`, 15 `maximum_rgb_error`, 10
  `pixels_over_four`, and 8 `missing_occluder`, with overlaps. Fifteen missing
  pixels remained across eight cases. Maximum aligned mean error was 0.2587177
  bytes, maximum RGB error 96 bytes, maximum over-four ratio 0.4852493%, and
  maximum seam run 12 pixels.
- Eight missing-pixel localizations were attempted against that exact authority.
  Two one-pixel cases did not reproduce and failed closed. Of the successful
  captures, five cases showed zero native live-versus-cache visibility or
  occupancy mismatches across 140 inspected taps, despite downstream screen
  classifications. Only az315/el35 west authorized a field edit: eight measured
  observations collapsed to four unique nearer-depth texels. Unresolved casters
  and samples with no admissible nearer live depth were not modified.
- The four-texel az315/el35 field was generated as an unpromoted v11 residual,
  rendered through pinned Blender 5.2.1 headlessly across all 77 tiles, and
  independently parity-checked. Parity passed 222/222 occupancy samples and
  111/111 first-hit samples with zero mismatches and 0.000244141 m maximum depth
  error against the unchanged 0.005 m gate. The field was promoted with receipt
  SHA-256 `ddce60f0f130286de38289917514fa4c4befca905a534f5eb9605af0c8cd779f`
  and rebuilt into an authenticated package. The exact-eight index at
  `tests/artifacts/illumination_531/production_current_20260903_residual_incremental_round3_az315_only_v1/package_index.json`
  carries forward seven authenticated v11 packages and selects the new az315
  package.
- The final round-three catalog completed at 152/197 passing and 45 failing:
  25 `continuous_seam`, 15 `maximum_rgb_error`, 10 `pixels_over_four`, and 7
  `missing_occluder`, with overlaps. Fourteen missing pixels remain across seven
  cases. Maximum aligned mean error is 0.2586687 bytes, maximum RGB error is 95
  bytes, maximum over-four ratio is 0.4848691%, and maximum seam run is 12
  pixels. The authoritative report is
  `tests/artifacts/screens/illumination_531/production_current_20260903_residual_incremental_round3_stable_preactivation_v1/production_validation_report.json`.
- Final correctness verification passes 218/218 related Node tests and 12/12
  Python silhouette tests. Python compilation also succeeds for
  `compile_cutout_silhouettes.py`,
  `production_alpha_cutout_sparse_samples.py`, and
  `production_static_sun.py`.
- Normal gameplay remains unchanged and safe: the baked path is wired for
  development validation but disabled by default, so opening the game continues
  to use the previous current-shadow engine without fetching these packages.

## Tracked issues — 2026-09-03 stable preactivation and round three

1. **Strict production certification is still withheld.** The unchanged visual
   gates fail 45 cases, so no release certificate was produced and this prompt
   is not marked DONE. The user's not-100%-perfect allowance is recorded as a
   development limitation, not represented as a strict pass.
2. **Most residuals are Blender/live raster-filter edge differences.** The
   remaining 25 continuous-seam and 15 maximum-RGB cases dominate. Five
   successful missing-pixel localizations showed identical native visibility
   and occupancy at every inspected tap, so those screen classifications cannot
   safely authorize depth edits.
3. **Fourteen missing pixels remain in seven cases.** Counts are one in
   `regional_dense.w.az045.el08`, one in `profiler.r4c2.n`, three in
   `profiler.r5c1.s`, two in `regional_dense.e.az225.el08`, one in
   `regional_dense.s.az225.el08`, two in `regional_dense.e.az315.el35`, and four
   in `regional_dense.w.az315.el35`. One-pixel classifications moved between
   repeated full runs, confirming threshold-edge instability.
4. **The az315 correction is authenticated but did not close its target gate.**
   Its isolated west count moved from five to four after the four-texel edit;
   the final full run still measured four, plus the pre-existing over-four and
   continuous-seam failures. No further correction is allowed without a new
   source report and genuinely mismatched native depth taps.
5. **Authority failures were preserved and not bypassed.** A combined calibration
   rejected mixed production roots; two profiles resolved no depth correction;
   an initial parity layout could not be promoted; an empty failed promotion
   destination was retained; and copied carry-forward parity files were rejected
   because their evidence paths were bound to the old authority. The successful
   path used a fresh parity capture and a fresh single-profile package.
6. **Timing remains unusable for promotion.** All new captures and Blender work
   ran sequentially/headlessly, but the user-declared multiple processes and
   shared GPU load remain. Frame, load, bake, and throughput timings are marked
   contaminated and are not used for any conclusion.

AI 531 remains open. The stable world-space sampling contract, package
lifecycle, fallback, debug/validation tooling, all-eight package selection,
headless production, and correctness gates are implemented, but the final
197-case report still contradicts the strict completion requirement. Production
release certification remains withheld until the tracked visual failures are
resolved and the full catalog passes.

## On completion

- Mark the AI document as DONE in the first line.
- Rename it to `prompts/AI_DONE_531_ATMOSPHERE_static_sun_depth_cache_and_world_sampling_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Add a concise completion summary linking the channel spec, production/fixture bake, shader/runtime modules, debug views, validation artifacts, tests, and fallback behavior.
- Include same-condition before/after tables for visual error, frame time/FPS, whole-frame and shadow-pass calls/triangles, CPU/GPU time, GPU memory, payload size, load/decode/upload time, tile residency, bake duration, hardware, resolution, settings, route/poses, warm-up, sample count, statistic, and variance. Mark unavailable metrics as `not measured` with a reason.
