# Problem

Trees are intentionally excluded from ambient occlusion, but the current AO exclusion-mask pass redraws the entire visible scene just to establish mask depth. In the current 100-pose, visibility-enabled profile, that pass averages 477.8 draw calls and 565,413 triangles. Approximately 394.4 calls come from buildings alone, even though buildings only provide occlusion depth and are not exclusion-mask receivers.

The visible scene already produces the depth information needed to determine whether an excluded receiver is visible. Reusing that depth and drawing only excluded receivers into the mask will definitely reduce submitted geometry and draw calls. In the measured baseline, it should remove approximately 438 mask-pass calls and 375,000 mask-pass triangles, leaving primarily the approximately 40 tree calls and 190,000 tree triangles that actually define the exclusion mask. Frame-time improvement must still be measured, but the duplicated rendering work should be eliminated.

# Request

Implement a generic AO exclusion-mask path that reuses the visible-scene depth buffer and renders only objects marked as excluded AO receivers. Do not make the system aware of trees, buildings, traffic props, or any other specific asset type.

Tasks:

- Refactor render sequencing so that the mask can use depth from the exact visible frame without causing a second full-scene render.
- Clear the exclusion mask to its non-excluded value, then render only currently visible excluded receivers into it.
- Depth-test excluded receivers against the retained visible-scene depth and do not modify that depth while producing the mask.
- Preserve the exact alpha-cutout behavior of excluded foliage, including alpha maps, thresholds, material sides, mixed material groups, and partially transparent edges.
- Continue to honor frustum culling, the visibility map, runtime visibility changes, and other generic scene visibility rules.
- Skip mask rendering and use a cleared non-excluded mask when no excluded receiver candidates are visible.
- Keep the implementation compatible with GTAO and SSAO, all supported antialiasing modes, TAA jitter, MSAA and resolve behavior, device pixel ratio, resizing, and render-target recreation.
- Preserve the existing AO appearance and settings. Do not rebuild shadows or change shadow eligibility as part of this work.
- Add diagnostics that separately report mask-pass candidates, calls, triangles, and whether retained depth or a fallback path was used.
- Add focused automated tests for receiver classification, empty-mask skipping, render ordering, and generic mixed-material objects.
- Perform visual checks covering leaf edges, a tree in front of and behind a building, overlapping excluded receivers, screen edges, fast camera motion, the player bus, and resize/AA changes.
- Reproduce the visibility-enabled profiling procedure represented by `tests/artifacts/visibility_on_regions_smart_merge_repeat2/REPORT.md`, and compare calls, triangles, CPU frame time, and GPU-complete frame time before and after the change.
- Confirm through instrumentation that non-excluded buildings, roads, props, and the bus are no longer submitted to the AO exclusion-mask pass, and that the visible scene itself is not rendered twice.
- Document the final measured reduction and any platform-specific fallback behavior.

Acceptance criteria:

- The exclusion mechanism is driven by generic object/material metadata or behavior, never asset names or prop categories.
- The mask is visually equivalent to the current implementation within an explicitly documented image-difference tolerance.
- The optimized mask path contains no non-excluded geometry submissions.
- The reproduced baseline shows the expected order of reduction: approximately 438 mask draw calls and 375,000 mask triangles per sampled view, subject to normal scene/profile variation.
- There is no statistically significant frame-time regression in any supported AO/AA configuration.
- Any unsupported configuration automatically uses a correct fallback and reports it in diagnostics.

## On completion

- Rename this file to `AI_524_ATMOSPHERE_ao_exclusion_depth_reuse_DONE.md`.
- Add a concise completion summary here describing the implementation, visual verification, benchmark table, measured savings, fallbacks, and tests executed.
- In that summary, include a same-condition before/after performance table with frame time/FPS, whole-frame and AO-mask draw calls and triangles, CPU/GPU time, and relevant memory/bandwidth. State the hardware, resolution, graphics settings, workload/camera poses, warm-up, sample count, and reported statistic; mark unavailable metrics as `not measured` with a reason and keep projections separate from measured results.

# Completion summary

Implemented a generic receiver-only AO exclusion mask. The visible scene now writes a composer depth texture; a non-swapping mask pass immediately reuses that resolved depth, clears only mask color, and submits visible excluded receiver groups with depth writes disabled. Generic whole-object receiver metadata, legacy foliage tags, alpha cutouts, mixed material groups, frustum/layer/scene visibility, an empty-candidate skip, live diagnostics, and a correct full-scene fallback/debug path are supported. No prop or asset names participate in receiver classification. The profiling tool now reports AO-mask strategy/candidates/submissions and accepts `aoExclusionDepthReuse=0|1` A/B queries.

The production visibility payload was stale because the active city/building configuration had changed before this task. It was regenerated with city hash `314e44319dd7a5b9`: 607,500 bake views plus 750 native 1280×720 validation views, ending with zero misses. Production visibility/shadow gameplay tests passed after the rebake.

## Measured performance

Same-condition two-run mean on WebGL2/D3D11, NVIDIA GeForce RTX 3060, 1280×696 at pixel ratio 1. Workload: production `bigcity2`, visibility map active, GTAO every frame with AO receiver exclusion, default 8× MSAA resolved path, high single shadow map with merged casters, 25 map regions × N/E/S/W = 100 poses. Each pose had one complete warm-up frame followed by two measured frames; each configuration was run twice (400 measured frames per configuration). Frame time includes city update, renderer submission, and `gl.finish()`, so it is synchronized end-to-end/GPU-complete time. The reported statistic is the mean of the two complete profiler-run means; draw/triangle counters were identical across repeats.

| Metric | Legacy full-scene mask | Retained-depth mask | Change |
|---|---:|---:|---:|
| Synchronized frame time | 10.180 ms | 9.224 ms | -0.956 ms (-9.39%) |
| Derived throughput | 98.23 FPS | 108.41 FPS | +10.18 FPS |
| Whole-frame draw calls | 1,676.18 | 1,249.70 | -426.48 (-25.44%) |
| Whole-frame triangles | 2,961,821 | 2,592,844 | -368,977 (-12.46%) |
| AO-mask draw calls | 477.44 | 50.96 | -426.48 (-89.33%) |
| AO-mask triangles | 563,222 | 194,245 | -368,977 (-65.51%) |
| Receiver candidate test | 0.588 ms | 0.589 ms | effectively unchanged |
| CPU-only frame time | not measured | not measured | profiler intentionally synchronizes CPU and GPU work |
| GPU-only time | not measured | not measured | WebGL timer-query split was not available in this run |
| GPU-complete end-to-end time | 10.180 ms | 9.224 ms | same synchronized measurement above |
| Measured GPU memory/bandwidth | not measured | not measured | browser/WebGL exposes no reliable per-pass residency or bandwidth counter |

Storage projection, separate from measured results: four possible full-resolution 32-bit textures (two composer depth textures and up to two ping-pong-associated mask colors) total at most about 13.59 MiB at 1280×696. The actual incremental residency is lower because composer depth textures replace existing depth attachments and a second shared mask target is allocated only if both composer depth buffers are observed.

Instrumentation confirmed 194/200 sampled frames used retained depth with no fallback and six empty frames skipped mask rendering. The retained mask averaged 30.95 candidate objects / 50.96 candidate groups. Its remaining submissions were excluded receivers only: about 40.02 tree calls / 190,112 triangles and 10.94 alpha-cutout building-window calls / 4,133 triangles. Opaque buildings, roads, traffic props, slabs, terrain, and the bus contributed zero retained-mask submissions; the visible scene was rendered once.

## Verification

- Focused retained-depth E2E: legacy equivalence, hidden receiver behind an occluder, generic opaque receiver metadata, overlapping and mixed-material cutout groups, empty-mask skip, resize, TAA, SSAO, and resolved MSAA — 3/3 passed.
- Production gameplay A/B at four city poses — passed. Mean absolute RGB error was 0 to 0.0037/255; pixels changing by more than four levels were 0 to 0.0121%; isolated resolved-MSAA edge maxima were 0 to 60/255. Documented tolerance: mean <0.35/255, changed-pixel ratio <0.2%, isolated maximum ≤64/255.
- AO foliage debugger, including sun-behind-foliage and AO-off equivalence — 2/2 passed. The leaf-focused resolved-MSAA tolerance keeps mean error <0.25/255 and changed leaf pixels <1%.
- Production static-visibility activation/settings/warnings and real single/cascaded shadow color-only behavior — 2/2 passed.
- AO classification/settings unit tests — 19/19 passed. Changed modules pass syntax checks and `git diff --check`.

Fallback behavior: if retained visible-scene depth is missing or size-incompatible, the preserved legacy full-scene mask runs and reports its reason. `aoExclusionDepthReuse=0` forces that path for diagnostics. SSAO/GTAO off or non-exclusion alpha handling disables the mask pass; zero candidates use a cleared, disabled mask without a scene render.

## Follow-up high-resolution visual audit

A deterministic 24-pose production audit compared the preserved legacy path (`aoExclusionDepthReuse=0`) with the optimized path (`aoExclusionDepthReuse=1`) on the same implementation. Six city locations spanning R1C1, R1C3, R2C4, R3C3, R4C2, and R5C5 were each captured facing north, east, south, and west. Camera state and game state were frozen; all frames used GTAO exclusion, high single shadows, 8× MSAA, 55° FOV, -9.673° pitch, and pixel ratio 1. Pose coordinates, rotations, settings, and pass diagnostics are stored with the captures.

The game framebuffer was 3840×2160. The in-app browser could save a complete visible frame at 3840×2064 (96 pixels shorter than UHD), so this audit is 4K-class rather than exact UHD. Both modes used the same deterministic JPEG encoder. Lossless 1280×696 WebGL comparisons remain covered by the automated gameplay E2E described above.

Across 190,218,240 decoded pixels, seven poses were byte-identical. Any byte difference occurred in 1.7282% of pixels, but mean absolute error was only 0.0222/255 per channel. Pixels whose maximum RGB-channel delta exceeded 4/255 were 0.0636% globally; Pixelmatch's perceptual 4/255 comparison flagged 0.0302%. The maximum isolated channel delta was 51/255. The largest direct-threshold pose was `southeast_n` at 0.3829%, concentrated on high-frequency foliage, window, and façade edges; the before/after frames show no visually perceptible composition, occlusion, silhouette, or leaf-cutout regression. Full-resolution per-pose images, amplified differences, heatmaps, contact sheets, close-ups, and the machine-readable report are under `tests/artifacts/screens/ai_524_4k/`.
