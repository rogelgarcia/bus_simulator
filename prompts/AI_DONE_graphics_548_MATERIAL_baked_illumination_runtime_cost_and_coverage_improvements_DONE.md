DONE

# Problem

Follow-up measurement: ordinary default-page activation on port 8001 took
58.39 seconds, including 51.37 seconds of source validation, while the same
source check on the regression server took 9.71 seconds. Profile source texture
requests against the user's server and distinguish transfer/queue latency from
hashing, extraction and map preparation. The default-page test must keep core
tests enabled so shared test-fixture contamination remains covered.

AI 533's first-pass direct/indirect receiver lightmaps add substantial resident
memory without an established frame-time benefit. The current renderer already
uses inexpensive ambient/environment approximations; it does not perform the
Cycles path tracing that baking moves offline. Adding lightmaps therefore does
not automatically make the existing renderer faster.

The preview still evaluates live diffuse contributions before replacing them,
adds mapping and irradiance texture reads, and checks extensive source/material
state every frame. These are optimization candidates, not measured explanations
of a confirmed slowdown. Sparse coverage of already-bright roofs also makes the
visual benefit difficult to assess.

# Request

Investigate and implement evidence-backed improvements to baked illumination
runtime cost, startup latency, memory use, and useful receiver coverage. Profile
the existing implementation first, prioritize improvements that preserve its
high-resolution lighting, and retain or defer each candidate according to its
measured benefit and correctness. Keep the current engine and independent
configuration-menu opt-ins working throughout.

## User extension — September 4, 2026

- [x] Gate every AI 548 runtime, shader, loading, memory and coverage change behind
  one new persisted Options toggle, off by default. Off selects the existing
  AI 533 preview with its original assets and behavior. Preserve linked channel
  controls, Save/Cancel/Reset and cached maps across switching.
- [x] Item 2 — implement and validate directional indirect irradiance evaluated using the
  runtime shading normal, including normal/bump-mapped static receivers. Preserve
  texture UVs, instance transforms and live specular response. Measure angular
  approximation error, flat-normal agreement, seams and useful city coverage;
  do not merely bypass the scalar-map exclusion or flatten normal-map response.

## Starting evidence

Read [AI 533](AI_533_MATERIAL_baked_direct_and_indirect_illumination.md),
the [receiver specification](../specs/graphics/receiver_lightmaps.md), and the
[first-pass assessment](../tests/artifacts/screens/illumination_533/report.md).
Reproduce the relevant baseline from current code before making comparisons.

- RTX 3060 / Ryzen 5 9600X, 1280x720, paused `civic_center_curve_front`, visibility
  map disabled, 10 warm-up and 30 measured GPU-finished frames per mode.
- Median frame times: current 21.35 ms; cached sun 22.45 ms; indirect 21.30 ms;
  combined 22.75 ms; direct 23.00 ms. Approximately 2 ms frame variation means
  the combined-versus-cached difference of 0.30 ms is not a proven regression.
- Each channel adds 173.5 MiB of GPU data; both add 347 MiB, with roughly the
  same amount retained in CPU texture arrays. Gzip reduces transport bytes,
  not resident GPU texture storage. Direct-only was measured after combined
  mode and retained the inactive indirect channel in its cache.
- The preview uses four 2048-square pages per channel at 0.04150390625 m/texel,
  explicit mips 0-3, 16-pixel padding, and 69.16% atlas occupancy.
- Initial exact live-city source validation took 110.15 seconds. The existing
  headless Blender bake took 800.59 seconds at 64 samples.
- The rooftop capture contains 3.16% mapped pixels. Indirect changed their RGB
  by 2.79 levels out of 255 on average; direct changed it by 0.24. These measure
  display differences, not lighting accuracy or convergence.

## Candidate improvements

Related AI 533 loading correction: runtime now omits offline BSIB construction,
shares an in-flight source check, captures shared images once per export variant,
and reports progress/cancellation. Fresh Options and saved-toggle startup checks
activate both original channels. Account for this changed baseline when executing
AI 548; its broader per-frame validation, memory, shader and controlled benchmark
requirements remain open. See `tests/artifacts/screens/illumination_533/loading/`.

Tasks (checked after assessment and a documented retain/defer decision; a check
does not imply every optimization candidate produced a speed gain):

- [x] Separate CPU validation, shader preparation, GPU lighting/sampling,
  geometry processing, and loading costs. Determine whether the workload is
  limited by CPU work, GPU work, memory bandwidth, or synchronization before
  attributing a frame-time change to the maps.
- [x] Reduce recurring source-validation work. Avoid rebuilding equivalent
  lighting profiles, serializing unchanged materials, and scanning unchanged
  city data every frame. Evaluate revision/change-driven validation and reusable
  authenticated source identities while preserving exact invalidation for city,
  geometry, instance, material, texture, lighting, and receiver-binding changes.
  Faster validation must not allow stale illumination to activate or persist.
- [x] Reduce the initial activation delay and keep the interface responsive.
  Separate reusable identity work from channel loading; report cold and warm
  activation separately. Any cached identity must remain tied to the actual
  resolved source, lighting profile, and compiler/package contract.
- [x] Avoid calculating live diffuse terms that the active baked channel will
  replace. Preserve live specular/reflections, independent channel switching,
  and correct fallback. Keep the sun's static visibility applied once and its
  moving-object visibility applied once. Evaluate shader variants and debug
  instrumentation so unused channels and difference views do not impose
  unnecessary work on normal rendering.
- [x] Reduce mapping and geometry overhead. Evaluate unnecessary mapping reads
  on unmapped objects sharing a material, duplicated coordinate resources across
  channels, and geometry expansion. Preserve unique per-instance illumination,
  existing PBR UVs, batching where possible, and complete restoration on disable.
- [x] Reduce resident and peak memory without starting by lowering resolution.
  Evaluate more compact HDR storage or supported GPU compression, allocation
  sharing, fewer temporary copies, and releasing CPU data that can be restored
  safely. Measure precision, decode/sampling cost, filtering, mip seams, device
  support, and recovery before adopting a format. Transport compression alone
  does not count as a GPU memory improvement.
- [x] Define bounded independent channel/page residency while preserving the
  user's requested behavior: disabling either or both controls retains loaded
  maps for reuse, like shadows (implemented in the AI 533 follow-up). Evaluate
  receiver-driven page loading, prefetch and eviction for
  expanded coverage, with compatible fallback and no stale or bright transition
  frames. Verify rapid toggles, context loss/restoration, cancellation and teardown.
- [x] Improve visual assessment with mapped shaded surfaces, walls, overhangs,
  thresholds, repeated instances and representative ground-level views, rather
  than relying on bright roofs. Record coverage and exclusions. Investigate
  oversized-chart subdivision and packing efficiency without sacrificing
  padding or mip safety. Include the user-authorized directional-irradiance design
  and validation in this prompt; keep legacy scalar-map fallback when AI 548 is off.
- [x] Assess direct and indirect independently. Retain runtime direct lighting
  if baked direct does not justify its cost; do not infer direct-lightmap value
  from the benefit of indirect illumination or the static shadow cache.

## Constraints and sequencing

- Optimize against the same maps, resolution, coverage, lighting and graphics
  settings first. Evaluate coverage, format and quality changes separately so
  less rendered work cannot masquerade as an implementation speedup.
- Preserve the high-resolution starting density. Any later density tradeoff
  needs measured visual evidence; do not silently downsample to meet a budget.
- Blender brightness/color differences are intentional. Do not match the old
  illumination by changing exposure, tone mapping, base materials, or AO.
- Keep the independent direct/indirect toggles off by default during assessment.
  Preserve current rendering for missing, corrupt, unsupported or stale data.
- Keep the moving bus outside static receiver lightmaps. Preserve its live PBR
  lighting and generic static/dynamic shadow interactions; do not claim dynamic GI.
- Build on the existing AI 533 preview without requiring that unfinished prompt
  to be marked DONE. Record which remaining acceptance cases this work covers.
  AI 534 owns AO migration; AI 547 owns static/dynamic shadow multiresolution.
  Coordinate shared interfaces without changing those policies in this prompt.
- Reuse the existing Blender installation; do not download another. Prefer an
  isolated headless job for any needed bake, leaving occupied sessions untouched.
  Increase samples later to assess convergence after the runtime investigation.
  At fixed format/resolution, more samples increase offline bake time, not map
  memory or runtime sampling cost.

## Validation and acceptance

- Compare current, cached sun with live diffuse, baked indirect, baked direct,
  and combined modes. Also compare the original preview with the optimized
  implementation under identical inputs and with shader debug views disabled.
- Use repeated, alternating-order runs with adequate warm-up and at least 300
  measured frames per run, three runs per mode. Report median, mean, p95 and
  variation. Separate normal frame timing from forced GPU synchronization;
  use supported GPU timers and reject invalid/disjoint samples when available.
- Report frame time/FPS, CPU validation cost, GPU pass/shader cost where
  measurable, draw calls/triangles, resident and peak CPU/GPU bytes, disk and
  download bytes, decode/upload costs, and cold/warm activation latency. State
  hardware, browser/backend, resolution, settings, camera/workload, warm-up,
  sample count and statistics. Mark unavailable metrics `not measured` with a
  reason; estimates and projections do not replace final measurements.
- Verify linear PBR composition, no duplicate albedo/AO/shadow/display terms,
  exact freshness checks, unmapped/shared/instanced receiver behavior, mip and
  atlas boundaries, bus shadows, and resource recovery. Add targeted regression
  checks for the behavior changed by each optimization.
- Compare format/precision changes against the original bake, and any later
  sample-count changes against a higher-sample reference. Do not treat packing
  error or before/after display differences as a GI accuracy measurement.
- Keep changes with demonstrated benefit and preserved required behavior;
  document rejected/deferred candidates and tradeoffs. Make separate direct
  and indirect adoption decisions without promising an unmeasured speed gain.
- Save screenshots, paired comparisons, coverage views, traces and reports
  under `tests/artifacts/screens/illumination_548/`, gitignored. Include embedded
  before/after images in the final handoff and update relevant specs under `specs/`.

## Implementation record

- Added the default-off `Enhanced baked illumination (AI 548)` Options toggle,
  a lazy enhanced runtime and separate publication. Compatible original/enhanced
  maps remain cached; only the selected implementation binds materials/geometry.
- Added item 2: four-sample affine directional irradiance evaluated with the
  final runtime normal, including normal/bump maps and transformed instances.
  Live specular remains; mapped indirect replaces live ambient diffuse.
- Retained four 2048² pages at the existing texel density, padding and mip limit.
  The 64-sample, four-bounce bake used the existing headless Blender for 31.3 minutes.
- Added linear per-component RGBA8 encoding and shared coordinates. Repacked
  original scalar maps use 173.5 MiB instead of 347 MiB; the directional publication
  uses 344.09 MiB because indirect requires three coefficient layers. Both visited
  implementations stay resident, as requested. CPU backing is retained for recovery.
- Reused indexed receiver geometry where atlas coordinates agree, preserved PBR
  UVs and per-instance illumination, and skipped replaceable live diffuse work.
  Fixed cached shader uniform ownership and interpolated atlas page selection.
- Added four-way source texture capture, ordinary captured-field validation and
  an enhanced-only Options apply/Cancel path that preserves cached source objects.
  Core-test city/fog fixtures are isolated from live gameplay materials and CSM.
- Measured rather than adopted property-accessor/per-property-reader optimizations.
  Both were rejected. The retained stronger source watch costs more CPU than the
  original; a revision API, demand paging/eviction and CPU-backing disposal are
  deferred. This implementation does not establish an overall speed improvement.
- Coverage now includes 1,680 triangles/274 charts, including 140 normal-mapped
  triangles, over 15,203.23 m². Most area is ground; most custom/metallic facades
  remain live. The overhang exposes a mapped/live boundary, so expanded whole-surface
  coverage remains necessary before promotion. Higher samples cannot fix that boundary.
- Independent 256-sample wall/overhang references measure about 3–13% angular
  approximation RMS error. Full-precision flat-normal agreement is within 1.2e-16.
  Storage RMS error is separately 0.176% direct and 0.768% indirect coefficients.
- Keep indirect as an opt-in quality preview and direct independently experimental.
  Neither is promoted automatically. Larger sample counts, higher-order angular
  fits and complete secondary material reconstruction remain later quality work.

### Controlled before/after results

RTX 3060 / Ryzen 5 9600X, Chrome 151/D3D11, 1280×720, paused
`civic_center_curve_front`, default lighting, visibility map disabled. Three
alternating-order runs per mode, 30 warm-up + 300 measured frames each, final view.
Combined direct/indirect results:

| Implementation | CPU mean / median / p95 ms | GPU mean ms | Validation mean ms | Observed FPS | Receiver GPU MiB |
|---|---:|---:|---:|---:|---:|
| Original preview | 20.60 / 20.30 / 23.80 | 14.33 | 2.02 | 47.66 | 347.00 |
| Compact runtime, identical original bake/coverage | 30.31 / 30.00 / 32.60 | 16.30 | 9.54 | 32.63 | 173.50 |
| Directional publication, revised coverage | 32.43 / 31.80 / 38.20 | 17.12 | 10.16 | 30.49 | 344.09 |

All variants render 1,842 draws / 2,519,283 triangles. The original-map comparison
isolates runtime/storage changes; directional coverage is a separate quality/cost
comparison. There is a measured CPU/GPU regression despite the storage benefit.
Individual shader duration, bandwidth utilization and process/driver peak memory
are not measured. The report distinguishes owned texture/CPU backing bytes from
those unavailable peaks and includes per-channel decode/upload timing.

Evidence: [full report](../tests/artifacts/screens/illumination_548/report.md),
[matched captures and coverage](../tests/artifacts/screens/illumination_548/visual-captures.json),
[display differences](../tests/artifacts/screens/illumination_548/capture-differences.json),
[precision](../tests/artifacts/screens/illumination_548/quantization.json), and
[angular reference](../tests/artifacts/screens/illumination_548/angular-reference.json).

### Validation and remaining limitations

- Passed 38 focused Node checks for directional math, atlas mapping, source
  texture identity, exact field changes and authenticated package encodings.
- GPU readbacks pass normal/bump response, rotated instances, unmapped live
  ambient/specular, single moving-sun visibility, restored geometry/callbacks,
  cached shader uniforms and atlas-page rounding. All final 300-frame benchmark
  runs pass, with 900 valid GPU samples per mode and implementation.
- Context restoration, disabled-cache teardown, linked UI/keyboard/Save/Cancel,
  authored caster identity, saved startup and real default-page cache tests pass.
  A controlled 20-second shadow-response delay also passes concurrent activation.
- Final successful localhost:8001 receiver activation: 58.31 s; source validation
  49.85 s (47.34 extraction, 0.84 source hash, 1.45 channel hash), shader preparation
  2.13 s and binding preparation 13.3 ms. Both-channel UI reenable: 1.31 s; return
  from original to enhanced cache: 144 ms. One source export, no repeat enhanced
  downloads, and cache reuse preserved after reopening Options and Cancel.
- Source-request timings contain 58 textures, averaging 2.56 s, with 0.62 s mean
  pre-request delay and three response-body tails around 31 s. Their overlap with
  renderer/shadow preparation prevents attributing the entire delay to server
  transfer. No established cold-start improvement on port 8001 is claimed.
- One profiling run rejected the static-shadow cache at its existing live-city/sun
  identity guard. The cause remains unisolated; live lighting was retained, and
  subsequent default-page and deliberate-delay checks passed. Preserve the
  [failure diagnostics](../tests/artifacts/screens/illumination_548/shadow-activation-failure/result.json)
  and trace for follow-up; do not claim that rejection was fixed.
- The automatic core suite is not clean: unrelated atmosphere/building/fog
  expectations and renderer-less postprocessing fixtures still report failures.
  Full AI 533 release validation remains outside this completed assessment pass.

## On completion

- Mark the AI document as DONE in the first line.
- Rename to
  `prompts/AI_DONE_graphics_548_MATERIAL_baked_illumination_runtime_cost_and_coverage_improvements_DONE.md`.
- Do not move to `prompts/archive/` unless explicitly requested.
- Add a high-level one-line summary per completed change, the required
  same-condition before/after performance table, visual evidence, validation
  results, and separate direct/indirect decisions. Keep remaining work explicit.
