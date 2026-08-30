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
