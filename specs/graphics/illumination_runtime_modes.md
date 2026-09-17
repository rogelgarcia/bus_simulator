# Player illumination modes (AI 535)

This is the current player-policy supplement to [the illumination framework](illumination_framework.md).
Offline source, channel, package and publication contracts remain unchanged.

## Controls and persistence

Options → Baked lighting offers Current, Baked and Auto:

- Current requires no bake files and performs no bake fetches. It uses the existing
  live sunlight, shadows, hemisphere/IBL and the user's Current AO preferences.
- Baked requests the selected channels, with an explicit reason when unavailable.
- Auto selects the same complete exact-compatible set when available, otherwise Current.

Baked preferences (shadow enablement, moving-shadow resolution and indirect
illumination) survive Current mode, Save/Cancel/Reset and preset export/import.
Current lighting/shadow settings and both AO parameter banks remain separate.
Defaults select Auto with baked shadows, High moving-object shadow resolution,
and baked indirect illumination enabled. Glass reflections, Body reflections
and Rim shine also default on; these use the global HDRI on the existing bus
materials. Saved custom overrides remain honored. Use defaults clears those
overrides and follows this recipe. A distribution without compatible packages
falls back to Current normally.

The accepted AI 548 implementation is now the **only baked indirect path**. Its
surface coverage and render optimizations are part of indirect illumination;
there is no enhancement switch or warning. The old direct/enhancement/link fields
are normalized for compatibility: direct=false, enhanced=true, linked=false.
Old saved settings and imports cannot enable baked direct. The original compiler
and low-level channel implementations remain available for offline development;
normal gameplay fetches neither original-preview nor direct-irradiance maps.
Direct sunlight remains live, with the selected live/baked shadow visibility.

## Atomic activation and fallback

`BakedLightingRuntime` coordinates `BakedShadowRuntime` and the enhanced receiver
runtime. It reuses AI 530's existing mode/resource controller, package validation,
shadow cache and frame ownership; there is no second renderer or resource loader.
The shadow pipeline holds prepared activation until every selected channel is
ready. Receiver activation follows successful shadow preparation in the same
frame, before AO composition and visible rendering. Gameplay entry requests
background preparation: complete Current rendering continues through bake
loading after the live scene's shaders are ready. The black gameplay loading
cover waits for that first live frame, not for baked items. Baked activation
prepares the new shaders before displaying them. Later setting changes retain
the last coherent frame while preparing their replacement; changing intent
cancels old generations and restores Current internally before starting a new
asynchronous transaction.

### View preparation (AI 574)

Shadow package preparation and receiver source/map loading start concurrently.
Receiver preparation may stage authenticated resources while shadows are still
loading, but its uniform/material/geometry installation waits for successful
shadow preparation in the same lighting generation. Failure, cancellation or
replacement cannot commit the staged receiver view. Verified cached resources
retain the existing bounded lifetime and are released on invalidation/disposal.
Final scene shader submission and presentation still follow complete channel
activation; this scheduling change does not make provisional variants visible.

Preparation submits the requested scene/material variants in cooperative 4 ms
CPU batches, then polls only those programs for completion. It resolves uniform
and attribute reflection before drawing and prepares visible geometry/textures
in batches. Temporary dynamic-AO material assignments are snapshotted before the
first yield and restored after every use; objects are not reparented or cloned.

Program readiness alone does not establish first-draw readiness. Once resource
preparation finishes, the scene is rendered into the post pipeline's existing
offscreen scene target at its actual resolution. A zero-timeout GPU fence is
polled asynchronously before releasing presentation. This prepares driver
pipelines and the full view's resource accesses. The displayed canvas remains
unchanged until the coherent frame can be composed. Without a post scene target,
a temporary full-resolution target is disposed on completion or cancellation.
No lighting, map, filtering or shadow-quality reduction is used.

Preparation requests carry monotonically increasing revisions and causes.
Superseded, page-hidden, context-lost or disposed work cannot release a newer
view. A bounded 128-event diagnostic history records requests, starts, phases,
cancellations, failures and completions. `viewPreparationMs` measures the last
successful job; `viewWaitMs` includes time waiting for it from the first request
in that continuous hold. These overlap resource/activation timers and must not
be added together as if they were sequential phases.

`tests/headless/e2e/baked_startup_profile.pwtest.js` measures actual garage Enter,
the first live and baked frames, optional viewport changes and warm reactivation.
The full startup has residual construction/authentication and initial live-shadow
costs; completion of this preparation pass is not a claim that all loading work
is nonblocking. See `debug_tools/regression_debugging/ai574_baked_startup.md`.

A failure or source/profile change restores the complete Current selection; a
shadow package cannot remain active on its own when requested indirect failed.
An indirect-only selection is supported with live shadows. Empty selections stay
Current and explicitly report `no_channels_requested`.

One validated publication per channel can remain cached while inactive. Mode
round trips reuse its maps; identity/source changes, context loss, explicit reload
and disposal invalidate it. Reload / revalidate clears the cached indices and
resources and repeats the existing validation path. Superseded loads cannot
commit. GPU resource retirement remains with its original owner.

## Lighting tab interactions

| Control | Behavior with baked indirect selected |
|---|---|
| Exposure / tone mapping | Applied live to the composed result; no source invalidation. |
| Visible HDR background / gradient, sky colors/exposure, haze, glare/disc | Remain live display/atmosphere controls; they do not replace the separately authored IBL/hemisphere sources. |
| Sun azimuth/elevation | Restore Current and select only an exact sun/indirect profile. No approximate reuse. |
| Sun intensity/color | Changes direct sunlight immediately; bounced sunlight in indirect requires an exact revalidation. |
| Hemisphere intensity/colors | Restore Current and revalidate; the mapped indirect bake replaces this diffuse contribution. |
| IBL enabled/intensity/HDR identity | Restore Current and revalidate the baked environment contribution. Reflections remain live. |
| Bloom / grading / flare / AA / AO | Remain live; do not restart source loading. |
| AO scope | Effective indirect activation selects the user's baked-lighting AO preference (Dynamic Only by default). Loading, Current and fallback use the separate Current preference. |

The enhanced index light profiles are checked before expensive geometry/source
validation. Full authenticated source and channel hashes are still required;
the quick comparison cannot authorize a publication by itself. Incompatible
Lighting changes are visible as a fallback, and restoring a compatible setting
triggers exact revalidation without changing the selected mode.

### Planned follow-up: independent reflections and compatibility warnings

[AI 557](../../prompts/AI_graphics_557_UI_independent_ibl_reflections_and_baked_lighting_warnings.md)
requests a separate environment-reflection intensity that can change without
invalidating baked indirect lighting. Diffuse source controls retain exact-profile
validation. Settings that can invalidate selected baked channels will receive an
alert icon and an accessible, setting-specific explanation popup. This is planned
work; the current coupled IBL behavior in the table above remains in effect until
that prompt is implemented and this interaction contract is updated.

## Diagnostics and offline workflow

The performance bar's right side has fixed slots for Shadows, Indirect,
Bus indirect and Visibility. Label columns fit their full text with a separate
gap before the fixed-width status column, so longer labels cannot overlap values.
Labels are soft white; state text uses muted colors: Loading
(light blue), Validating (blue), Disabled (red), Off (gray), Applied (green).
Waiting, Preparing and Ready distinguish queued work, resource/shader preparation
and waiting for atomic activation. Missing, stale, unsupported or failed data
shows Disabled with its reason on hover/focus; user-disabled features show Off.
Only committed use reports Applied, not downloaded or merely validated resources.
Applied fades after four seconds without moving the other slots; hovering or
focusing the reserved slot reveals it again. A new activation restarts its timer.
Other states persist. On narrow viewports the slots scroll within the right-hand
area without covering the hide button or increasing the 24px bar height.
The strip polls compact runtime status at the existing performance-bar cadence;
it does not serialize full material/resource diagnostics or control the bake.

The player status shows requested → effective mode, phase/reason and profile.
Developer diagnostics expose the selected channels, retained unavailable/stale/
failed cause, source/profile/compiler and channel identities, resource timing,
channel memory/residency, coverage, and indirect/UV/page/unmapped/difference/mip
views. These are snapshots, with no per-frame notification spam. Current intent
is represented as effective Current with the controller's fallback/current-requested
reason; the six public lifecycle states remain unavailable/loading/active/stale/
failed/fallback, with failed availability retained as the fallback cause.

Offline generation is `node tools/bake.mjs`; consult [the bake hierarchy](../../tools/baking/README.md)
and [its contract](../tools/bake_framework.md). The shared gitignored Blender
configuration, domain/leaf scripts, validation and publication gates remain the
only supported workflow. Options never invokes Blender.

Validation evidence and same-condition measurements are recorded in the
[AI 535 completion report](illumination_535_validation.md) and
`tests/artifacts/screens/illumination_535/final/`.


## Exact shader preparation during loading (AI 574 Step 1b)

Once the root receiver package and mapping coordinates are authenticated, the
current surface-diffuse publication can prepare city shader programs while the
remaining page packages and GPU uploads continue. This stage also waits for the
actual verified shadow binding; it never fabricates a binding identity. The city
supplies its future sun light inventory so Current CSM cascades are excluded from
this isolated compile. Receiver coverage, authored material patches, physical
material accessors and the future dynamic-AO recipe match final activation.

Only temporary material owners and shallow object snapshots are created. They
borrow existing buffers/textures and never become visible, replace live geometry,
or use live objects as prototypes. Compile submission yields between batches;
a single driver call can still exceed the scheduling budget. Staging does not
render, allocate an extra atlas, or authorize any resource for use.

Receiver installation still requires all selected packages, source/profile and
shadow validation. Shader staging is not a prerequisite for installation; the
existing final-view shader/resource/raster readiness gate owns presentation.
Temporary program owners remain until that final view acquires the programs,
then are disposed. Refresh, cancellation, fallback, page hide and teardown abort
and release the stage. Source/profile freshness is checked again before receiver
bindings are installed. Unsupported historical receiver representations use the
existing final preparation path.

`timings.shaderOverlap` reports mapping readiness, submission/readiness phases,
maximum submission batch time and the number of staged programs reused at handoff.
It does not embed shader source or program-cache strings. Tests:
`baked_shader_staging`, `baked_startup_overlap`, `receiver_page_shards` and the
same-condition `baked_startup_profile` fixture. Evidence is under the existing
ignored `tests/artifacts/screens/ai574_baked_startup/` directory.

### Avoiding unused startup variants (AI 574 Step 2)

When the lighting coordinator is available, city CSM activation requests final
view preparation instead of synchronously compiling the entire scene against
the current framebuffer. Preparation must use the post pipeline's scene-color
target, whose shader tone-mapping recipe differs from the display framebuffer.
Standalone hosts retain their direct compile path. CSM uniform arrays must still
be padded immediately on activation and after updates; deferred compilation
must not reintroduce cached-program failures when reducing cascade count.

Final preparation covers hidden city objects as well as visible objects. When
dynamic AO is effective, give eligible hidden receivers the same shader recipe
that the normal AO update applies before their first visible draw. Respect
receiver ancestry, participant policy, transparent and alpha-cutout exclusions.
This preparation does not change visibility or allocate hidden meshes' AO
participant geometry/depth resources. The normal per-frame update still visits
only visible objects, and an inactive AO policy does not acquire new AO hooks.

Regression coverage: `lighting_shader_variants.pwtest.js` checks real-target
compilation, CSM downshifts, hidden-receiver program reuse, exclusions and source
geometry restoration. Opt-in `BakedShaderProfile.js` captures compile calls,
link/readiness/reflection and first-use diagnostics separately from unprofiled
startup benchmarks. Shader source/cache keys are diagnostic artifacts only.

The startup fixture also supports longer settled sampling through
`BAKED_STARTUP_STEADY_FRAMES` (180 by default). `BAKED_STARTUP_SETTLED_PROFILE`
enables a CPU profile after 300 rendered baked frames; the independent
`BAKED_STARTUP_UNIFORM_PROFILE` records named vec4-array upload counts, lengths
and CPU duration through `BakedUniformProfile.js`. Both settled diagnostics
require at least 900 frames. They are opt-in test instrumentation, restored at
capture completion, and must not be mixed into unprofiled performance medians.

`BAKED_STARTUP_GPU_TELEMETRY=1` records read-only NVIDIA clock, utilization,
temperature, power and whole-device memory samples in the artifact directory.
The capture includes `performance.timeOrigin` so host samples can be aligned to
cold/warm settled windows. No power policy or unrelated process is changed.
This requires `nvidia-smi`; missing telemetry is an explicit test failure.
Rows also stream to `gpu-telemetry.jsonl` with available host memory so an
interrupted test can retain partial evidence. Incomplete runs are not benchmark
results, and comparisons across a host reboot belong to separate cohorts.

`BAKED_STARTUP_PASS_PROFILE=1` installs `BakedPassProfile.js` after 300 visible
baked frames (requires at least 900). It records GPU elapsed time per outer
renderer render, actual draws/bindings/uploads, drawn shader sources and CPU
scope totals. The normal whole-frame GPU query is suppressed during capture:
elapsed queries cannot nest, and whole-frame GPU values are marked missing.
Disjoint and pending query samples remain missing, never zero. Teardown releases
owned queries and restores methods and the original timer, including on a draw
failure. Per-pass means must use completed samples rather than treating pending
samples as zero. Diagnostic timings cannot establish ordinary-run FPS overhead.
`baked_pass_profile.test.js` checks query ownership, missing/disjoint handling,
upload accounting and restoration.

`BAKED_STARTUP_LIFECYCLE=1` adds a separate diagnostic after ordinary captures:
four Current-to-Auto activations, each with 900 visible frames and main-renderer
heap/backing-storage endpoints. `lifecycle.json` retains complete captures and
resource counts. One explicit garbage collection occurs only after all timed
windows, in the isolated test browser, to distinguish retained storage from
uncollected garbage. It is never used to improve reported ordinary timings or
to claim whole-process/worker/GPU memory usage. Lifecycle cohorts stay separate
from cold-start and single-warm-activation comparisons.

`BAKED_STARTUP_WARM_PROFILE=1` requires at least 1,800 frames and records a
separate warm diagnostic: 600 frames before CPU sampling, 600 during sampling,
then at least 600 after sampling. Exact profile boundaries are capture events.
`BakedCpuPhaseProfile.js` records low-frequency method scopes across these
windows without wrapping WebGL calls. Nested CPU phases overlap; do not sum
them or equate their wall time with GPU execution. The diagnostic cohort is
excluded from ordinary benchmark medians, even for its unprofiled portions.

On Windows, `tests/headless/harness/BakedHostTelemetry.ps1` can independently
sample process CPU deltas and working sets once per second for a bounded
duration. Pass `-Output tests/artifacts/screens/<topic>/<name>.jsonl` and
`-Seconds <duration>`; create the artifact directory first. It reads processes
without changing them, streams each row immediately, and never closes user
applications. First samples and unavailable/reset counters retain null CPU
deltas. Working sets are not total committed memory, and process totals alone
cannot attribute GPU contention. Align timestamps with capture time origins;
retain runs overlapping other rendering jobs separately from idle confirmations.
