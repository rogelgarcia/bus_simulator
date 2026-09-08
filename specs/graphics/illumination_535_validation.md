# AI 535 runtime modes validation

Validation date: 2026-09-07. This implements the user's final channel policy:
AI 548 is standard baked indirect illumination, and baked direct is disabled in
player settings and migrated presets. Direct sunlight remains live. The accepted
GI, baked-shadow and physical bus AO algorithms are retained.

## Runtime and UI contract

See [runtime modes and Lighting compatibility](illumination_runtime_modes.md).
The player selects Current, Baked or Auto and retains separate shadow/indirect
preferences. Every requested channel must validate before the complete selection
commits. Loading, failed validation and cancellation keep complete Current lighting.

Implementation entry points:

- [Player settings and migration](../../src/app/illumination/runtime/BakedLightingSettings.js).
- [Mode coordinator](../../src/graphics/illumination/baked_lighting/BakedLightingRuntime.js),
  [existing shadow controller adapter](../../src/graphics/illumination/baked_lighting/BakedShadowRuntime.js)
  and [frame ownership](../../src/app/core/GameEngine.js).
- [Options controls and diagnostics](../../src/graphics/gui/options/tabs/renderBakedLightingTab.js)
  and [Options transactions](../../src/states/OptionsState.js).
- [Standard indirect runtime](../../src/graphics/illumination/receiver_lightmaps/EnhancedReceiverLightmapRuntime.js).
- [Offline bake hierarchy](../../tools/baking/README.md), including Blender
  configuration, validation and publication. Options never runs Blender.

## Current compatibility

The regression routes the committed pre-change coordinator and settings into a
separate browser page, using the same installed assets, camera and renderer
settings. Both pages request zero bake files. The matched 1280×720 images have
**zero changed pixels out of 921,600** and identical draw counts: 1,263 calls and
3,124,779 triangles.

Independent-page timings varied with run order. A second comparison alternates
old/new coordinators in the same scene: three blocks per version, 30 warm-up
frames and 60 measured frames per block. Old mean: **9.238 ms**; new mean:
**9.095 ms**. Block standard deviations range from 0.43 to 0.94 ms. This shows
no measurable Current rendering regression; it is not a statistically established
speedup.

Evidence: [before](../../tests/artifacts/screens/illumination_535/current-compatibility/before.png),
[after](../../tests/artifacts/screens/illumination_535/current-compatibility/after.png),
[raw comparison](../../tests/artifacts/screens/illumination_535/current-compatibility/result.json).
Current with resident but inactive publications is exercised separately below.

## Mode measurements

Environment: Windows, Chrome 151.0.7922.176, NVIDIA RTX 3060 through ANGLE D3D11.
Installed gameplay city, paused simulation, fixed spawn camera, 1280×720 canvas,
pixel ratio 1, normal saved lighting/AA defaults, AO off, moving shadow resolution
Medium. Shadow profile: `ai527.sun.az045.el35`; indirect publication:
`ai553.cycles.surface.complete896.v5` (seven RGB9E5 layers).

Each row uses 20 warm-up frames followed by 60 samples. Frame time is CPU-observed
submission plus `gl.finish()`, with requestAnimationFrame between samples. FPS is
1000/mean frame time, **not** a display refresh measurement or pure GPU timer.
All rows use this setup; the fallback row deliberately changes azimuth to 46°,
and Auto-current deliberately returns HTTP 404 for the shadow index.

| State | Frame ms, mean ± population SD | Equivalent FPS | Managed resident CPU / GPU bytes |
|---|---:|---:|---:|
| Current, cold | 13.38 ± 1.09 | 74.7 | 0 / 0 |
| Loading, initial fetching sample | 14.53 ± 1.01 | 68.8 | 0 / 0 at sample |
| Baked active | 21.92 ± 0.79 | 45.6 | 1,218,735,148 / 1,218,735,148 |
| Current, cached (first return) | 16.08 ± 1.13 | 62.2 | 1,218,735,148 / 1,218,735,148 |
| Auto-baked, cached | 22.49 ± 1.46 | 44.5 | 1,218,735,148 / 1,218,735,148 |
| Current, cached (second return) | 14.99 ± 0.69 | 66.7 | 1,218,735,148 / 1,218,735,148 |
| Baked, cached return | 21.86 ± 0.62 | 45.7 | 1,218,735,148 / 1,218,735,148 |
| Fallback, unmatched sun profile | 15.55 ± 1.30 | 64.3 | 0 / 0 |
| Auto-current, missing shadow index | 14.23 ± 1.31 | 70.3 | 689,766,400 / 689,766,400 (inactive indirect cache) |

Baked adds GI while Current has AO off in this comparison. These measurements do
not claim a Baked speedup or repeat AI 548's comparison against the original bake.
The paired Current comparison above isolates the mode-coordinator change.

Cold Baked activation took 35,388.6 ms. Cached Auto and Baked activation took
878.0 and 887.6 ms, respectively, without another payload fetch/upload. Returning
to Current is a synchronous restoration before asynchronous work begins; its
separate switch latency was **not measured**. Loading/fallback/Auto-current have
no successful baked activation latency. Diagnostics retain the last successful
activation time and must not be interpreted as those transitions' latency.

| Resource stage | Shadow ms | Indirect ms |
|---|---:|---:|
| Fetch/read | 1,664.7 | 560.8 |
| Integrity hash | 5,007.7 | Included in validate/decode |
| Inflate | Not applicable | 653.0 |
| Decode / validation | 0 (direct typed views) | 2,834.5 |
| CPU staging | 0.1 | Included in validate/decode |
| GPU upload | 46.7 | 135.7 |
| Child activation | 262.0 | Included in coordinator activation |
| Live source validation | Existing shadow identity path | 6,603.5 |
| Shader prewarm | Included in shadow activation | 12,034.1 |

Indirect source validation includes extraction 4,345.6 ms, mapping 87.5 ms,
source hashing 747.8 ms and channel hashing 1,335.2 ms. Its recorded refresh totals
26,891.1 ms. Stages have different scopes and should not be added to infer an
unmeasured critical path.

Shadow resident CPU/GPU: 528,968,748 bytes each. Shadow managed peak CPU:
1,058,164,044 bytes; managed peak GPU: 528,968,748 bytes. Indirect resident CPU/GPU:
689,766,400 bytes each, including 102,563,840 mapping bytes. Its compressed atlas
download is 145,612,704 bytes. Indirect transient peak, whole-process peak and
driver/total GPU residency are **not measured**: the existing resource ledger
does not account for those allocations. These values exclude the main renderer,
driver copies, parsed index data and separately owned dynamic shadow resources.

Raw [mode measurements](../../tests/artifacts/screens/illumination_535/final/results.json),
[activation diagnostics](../../tests/artifacts/screens/illumination_535/final/activation.json)
and [hardware metadata](../../tests/artifacts/screens/illumination_535/final/hardware.json)
are gitignored artifacts. The timing matrix preceded the final fallback-reason
correction: historical `failed/current_requested` for missing data in its raw
record is superseded by the focused status regression and final status captures.

## Lighting and AO interaction checks

The real-city test applies Lighting changes through `OptionsState._applyDraft`:

- Exposure, AgX tone mapping, HDR background and sky color/exposure retain active
  indirect and do not increment the bake generation.
- Sun intensity, hemisphere intensity, IBL intensity/enabled and sun azimuth
  restore complete Current lighting. Missing exact profiles never partially
  activate shadows or indirect. Restoring the original setting reactivates the
  exact bake without changing player intent.
- Canonical environment identity treats a same-origin absolute HDR URL like its
  exported pathname. Cross-origin identities remain absolute. Full authenticated
  source/channel hashes remain mandatory after the fast profile check.
- AO Off/Underbody/GTAO round trips in matched asphalt/building scenes retain
  indirect. The effective channel, rather than the requested toggle, controls
  Dynamic Only scope. Current and baked AO preference banks are retained.

The wider AO/AA round trip exposed a sampler-budget defect: mapped PBR materials
with four CSM cascades, baked shadows, indirect and dynamic AO could reserve 18
fragment textures on a device limited to 16. The shared-sun shader still queried
the retired direct atlas for its dimensions. Its unused direct sampler and size
query are now compiled out for that variant. Dynamic AO also specializes its
shader for the registered analytic/generic casters: analytic-only operation
omits the generic static-reference sample, and generic-only operation omits the
analytic bounds sample. Variant keys change together with the selected technique,
so switching methods cannot reuse an incompatible program. The original offline/low-level
non-shared-sun shader still supports its direct atlas. This changes no lighting
algorithm or image values when indirect is active. Mode timings above preceded
this sampler pruning; they are not a measurement of its performance effect.
The corrected real-city regression passes with zero shader errors through two
Off/Dynamic/Generic/All AO rounds, a moving bus, GI disable/re-enable and
FXAA/MSAA/TAA/off transitions. All AA checks return WebGL error 0, the final
channels are indirect=true/direct=false, and the Current GTAO parameters are
unchanged. The focused contact, interaction, source-contract and hemisphere-ray
tests also pass for the specialized variants.

Evidence: [AO/AA lifecycle](../../tests/artifacts/screens/illumination_534/city_contact/result.json)
and [shader failures (empty after the fix)](../../tests/artifacts/screens/illumination_534/city_contact/shader-failures.json).

Evidence: [Lighting interactions](../../tests/artifacts/screens/illumination_535/final/lighting-interactions.json)
and [physical bus contact captures](../../tests/artifacts/screens/illumination_534/physical_city/after/).
Other display-only atmosphere/postprocessing fields follow the same unchanged
rendering path; every individual slider combination was not exhaustively tested.

## Regression coverage and screenshots

The pure settings/preset/promotion and illumination resource/controller suite
passes **91 tests**. Browser coverage includes actual city modes/loading/cache
round trips, missing files, delayed channels, stale and corrupt data, unsupported
devices, cancellation, reload, idempotent disposal, context loss, resize, shadow
ownership/CSM restoration, Options Save/Cancel/Reset, receiver preview shaders,
cache cleanup, AO scope and physical bus method switching.

Primary reproducible tests:

- `tests/headless/e2e/baked_lighting_modes_535.pwtest.js`
- `tests/headless/e2e/baked_lighting_transactions_535.pwtest.js`
- `tests/headless/e2e/baked_lighting_current_535.pwtest.js`
- `tests/headless/e2e/baked_lighting_options.pwtest.js`
- `tests/headless/e2e/illumination_static_sun_depth_pipeline.pwtest.js`
- `tests/headless/e2e/receiver_lightmaps_cache_lifecycle.pwtest.js`
- `tests/headless/e2e/ambient_occlusion_scope_ui.pwtest.js`
- `tests/headless/e2e/ambient_occlusion_534.pwtest.js`
- `tests/headless/e2e/dynamic_ao_physical_city.pwtest.js`

Use `tests/.selected_test` with `node tools/run_selected_test/run.mjs`; browser
tests need access to the game's existing CDN modules. Blender is not needed.
Old lab captures that explicitly compare the retired original/direct player
workflow are historical evidence, not coverage of the new public mode policy.

Real-city state captures:
[Current](../../tests/artifacts/screens/illumination_535/final/current.png),
[loading](../../tests/artifacts/screens/illumination_535/final/loading.png),
[Baked](../../tests/artifacts/screens/illumination_535/final/baked.png),
[Auto-baked](../../tests/artifacts/screens/illumination_535/final/auto-baked.png),
[fallback](../../tests/artifacts/screens/illumination_535/final/fallback.png),
[Auto-current](../../tests/artifacts/screens/illumination_535/final/auto-current.png),
[Options](../../tests/artifacts/screens/illumination_535/final/options.png).
Injected lifecycle fixtures also exercise and capture the public status UI for
[unavailable](../../tests/artifacts/screens/illumination_535/status/unavailable.png),
[stale](../../tests/artifacts/screens/illumination_535/status/stale.png) and
[failed](../../tests/artifacts/screens/illumination_535/status/failed.png).
These three are status fixtures, not installed-city corruption screenshots.
