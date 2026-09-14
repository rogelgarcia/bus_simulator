# Building material response after the v7 irradiance correction

## Hypothesis and controls

The five current game/Cycles comparisons retain large shaded-facade differences
after the native irradiance clamp fix. Isolate suppressed environment specular
from authored texture AO before changing any lighting or rebaking.

Use poses 02 (brick) and 03 (dark stone), with opaque environment reflections
off/on crossed with texture AO on/off. Preserve the authenticated v7 bake,
55-degree sun, ACESFilmic, exposure, grading, bloom, bus materials and camera.
Change AO only synchronously during rendering and restore it before another
engine update, because bake freshness intentionally watches authored AO intensity.
Keep geometry/material identity and shader versions fixed.

## Measured matrix, 2026-09-13

Evidence is under `tests/artifacts/screens/ai562_acesfilmic_reference_matching/`:

- `material_matrix_20260912_01`: failed before loading the game because the
  sandbox denied existing CDN modules. No measurements accepted from this run.
- `material_matrix_20260912_02`: validated 32 passes across two fresh browsers,
  240 matched GPU queries per pass; 494.7 seconds. The first browser's initial
  pose-02 timing varied during warmup; retain those samples and use the repeated
  passes rather than attributing the transient to reflections.
- `material_matrix_analysis_20260913_01`: authenticated fixed masks from
  `current_cycles_20260912_01`; all runtime light/display and bake identities match.

Mean linearized-display luminance bias against Cycles, on eroded opaque wall masks:

| Surface | Original | Reflections | AO off | Reflections + AO off |
|---|---:|---:|---:|---:|
| Pose 02 shaded brick | -40.41% | -24.72% | -32.58% | -14.81% |
| Pose 03 shaded stone | -44.70% | -4.54% | -44.51% | -2.99% |
| Pose 02 sunlit brick | -4.67% | +1.32% | -3.08% | +3.41% |
| Pose 03 sunlit white wall | +1.65% | +2.66% | +3.44% | +4.56% |

Reflections alone reduce shaded RGB MAE by 44.0% and 59.9%. Road and marking
samples are unchanged. Aggregate GPU medians are 9.753/9.675 ms (off/on, pose 02)
and 9.058/9.065 ms (pose 03); draw calls, triangles, textures, geometries and
program counts match within each pose/condition. These are image comparisons,
not scene-linear irradiance measurements or a percentage of photorealism.

## Selected correction

Enable existing opaque building reflections by default. Retain authored AO,
albedo, roughness, normals and all calibrated light/bake parameters. Missing
preferences adopt the new default, while an explicit saved Off remains Off.
Use defaults resumes following the repository setting. The Options label no
longer describes this selected material response as an experimental comparison.

The exported Cycles target explicitly removes texture AO, so its AO-off agreement
does not justify erasing authored micro-occlusion from the game. The remaining
brick mismatch needs a shared material/normal/occlusion reference, rather than a
global exposure or irradiance gain. Global PMREM reflections still approximate
local specular visibility and cannot reproduce nearby reflected buildings.

The default-preference test failed before the two-line settings change and passed
after it. Four focused unit tests and thirteen bake framework tests pass.

## Five-pose validation

`material_validation_20260913_01` passed all 40 timing passes in 563.1 seconds.
Each browser starts from the repository reflection default, without overriding
that preference. `material_validation_analysis_20260913_01` verifies the same
five poses, lighting, graphics and active v7 package against the frozen control.
Its five image sheets contain only current game (left) and Cycles (right).

| Pose | Shaded brightness bias before / after | RGB MAE before / after | GPU median off / on (ms) |
|---|---:|---:|---:|
| 01 | -37.64% / -21.77% | 0.03852 / 0.02139 | 9.486 / 9.432 |
| 02 | -40.41% / -24.72% | 0.03876 / 0.02172 | 9.798 / 9.772 |
| 03 | -44.70% / -4.54% | 0.04505 / 0.01804 | 9.078 / 9.092 |
| 04 | -31.05% / -23.06% | 0.04693 / 0.03206 | 8.030 / 8.094 |
| 05 | -31.41% / -18.94% | 0.05153 / 0.02678 | 7.430 / 7.225 |

All sampled sunlit facades also reduce RGB MAE; road/marking samples are unchanged.
The maximum median GPU increase is 0.064 ms (0.8%). Draw calls, triangles,
texture/geometry counts and program counts are identical between variants within
each pose. The existing PMREM is reused; extra GPU texture allocation is estimated
at zero, not measured with driver allocation instrumentation. Timing tails remain
noisy: pose 04 p99 is 10.425 ms off / 16.781 ms on, with one on pass at 10.70 ms
and other on passes around 8 ms. This study does not establish a fix for all
intermittent game/desktop stalls.

The actual Options E2E test passed in 2.3 minutes: eight alternating toggles
retained fully applied baked illumination and material identity, saved Off
survived reopening, Cancel restored the saved Off state, and Use defaults removed
the saved bucket and restored On. The selected-test file was restored afterward.
All five final comparison sheets were visually inspected; syntax/diff checks pass
and generated evidence remains gitignored. No commit was made in this pass.

## Glass exclusion and measurement sensitivity

The facade scores already used eroded Cycles wall material-ID masks within
fixed regions; the full-context image pairs still displayed glass. Add explicit
wall-only pairs (gray for excluded pixels), orange selection overlays on the
game, and additional 3/6-pixel inset measurements. These masks are applied to
aligned game captures, not independently intersected with a game ID pass.
Visual inspection confirms the pose-02 selection falls on brick between windows
and excludes glass and frames. The samples describe selected wall regions, not
every pixel of the building or a whole-scene parity percentage.

`material_masks_20260913_02` reuses the final five-pose validation and completes
in 5.7 seconds. `material_matrix_masks_20260913_01` reuses the four-condition
material study and completes in 2.8 seconds. Both authenticate original controls
and validate outputs without recapturing, rerendering, or modifying game settings.

| Pose 02 shaded brick selection | Pixels | Current bias | Reflections + diagnostic AO off |
|---|---:|---:|---:|
| Existing eroded wall mask | 50,558 | -24.72% | -14.81% |
| Additional 3 px inset | 27,169 | -24.00% | -14.01% |
| Additional 6 px inset | 13,547 | -23.62% | -13.50% |

The brick deficit is robust away from window edges. Reflections reduced the
original 40.41% deficit by 38.8%; AO treatment explains a further approximately
10 percentage points in this control. That does not establish the remaining
13-15% as a bake error. Compare equivalent AO, albedo/procedural variation and
normal response before another global lighting adjustment. The Cycles exporter
removes texture AO and records untranslated procedural material hooks.

The stone mask is smaller (4,507 pixels); its current -4.54% bias becomes +1.03%
with the extra 6 px inset (1,532 pixels). Do not present that small region as
precise whole-building agreement. Insets alter the sampled wall area as well as
boundary contamination, so retain all masks and counts rather than selecting
whichever number is closest to zero.

## AI568 continuation

The complete incremental plan, controls, evidence inventory, failed temporal
restoration check and accepted next-step results are consolidated in
`prompts/AI_DONE_graphics_568_MATERIAL_game_cycles_opaque_surface_parity_DONE.md`.

Registered `material-parity-capture` / `material-parity-analysis` now separate raw
AO-on/off beauty and diffuse, live-sun diffuse, sky/bounce diffuse, albedo and
Cycles specular lobes. The initial simulation-paused capture drifted along white
wall shadow edges; freezing the engine frame and waiting for shadow streaming
restored exact agreement before/after all passes. One subsequent run was rejected
because tool inputs were edited while it ran; it remains failed evidence.

Accepted `ai568_material_capture_20260913_03` took 280.8 seconds;
`ai568_material_analysis_20260913_03` took 9.5 seconds, reusing the existing Cycles
EXRs. Shaded-brick AO-off diffuse is 94-97% of Cycles across mask insets, albedo
diagnostic 98-99%, and specular 69-77%. Of the original-mask AO-off raw beauty
deficit, 4.76 percentage points come from diffuse and 4.16 from specular; texture
AO accounts for another 6.77 points in the production material control. These are
scene-linear values, not the earlier postprocessed display percentages.

Cycles indirect specular contributes 54.22% of brick specular (20.67% for shaded
stone). Investigate material normal/BRDF and local reflection equivalence before
another global illumination gain; sunlit controls already lean bright. No new
production AO/material/bake change was selected in this diagnostic step. All
restoration checks pass, Cycles noisy-beauty lobe reconstruction error is below
2.3e-7, and regional denoising mean shifts are below 0.15%. Thirteen framework
tests passed. The AI568 document retains detailed mask counts and limitations.

## AI568: confirmed material-reference mismatch (2026-09-13)

The durable full investigation is now in
`prompts/AI_DONE_graphics_568_MATERIAL_game_cycles_opaque_surface_parity_DONE.md`.
Local-glossy and flat-normal Cycles controls rejected a large missing-local-light
explanation for shaded brick. True shader input AOVs found game roughness .8478
versus Cycles .7866. A primary matched-roughness control explains about 55% of the
remaining brick specular gap. The actual game additionally applies texture AO and
procedural wear/color/roughness that the glTF source-texture reference omits.

Five-pose source-material controls passed in 292.1 seconds. Pose 02 shaded brick:
production/Cycles scene-linear beauty .8431; texture AO bypass .9108; matching the
source-material policy .9773; diffuse .9872 and specular .9316. Texture AO and
procedural material response account for 6.77 and 6.64 percentage points of the
15.69-point production deficit. Pose 01 source diffuse is 1.0121. This supports the
opaque-reflection default correction, and rejects another global light gain.

The workflow fix preserves original appearance while making those comparisons
explicit: reversible `SourceMaterialControl.js`, per-material export/Blender
`SourceMaterialContract.js` metadata, supported-wall checks, and separate labeled
source-material analysis. `bake_progress_review.py` no longer permits treating
unmatched regional beauty as isolated illumination error. Full procedural shader
translation is still unimplemented and is explicitly recorded, not claimed fixed.

Final accepted artifacts under `tests/artifacts/screens/ai562_acesfilmic_reference_matching/`:
`ai568_source_contract_20260913_01` and `ai568_source_analysis_20260913_02` (13.2s).
All ten wall-mask restoration checks are exactly zero. All five original/current
appearance pairs, ten diagnostic wall sheets, all inset metrics and receipts are
preserved. Pose 04 diffuse and pose 05 specular retain separate residuals; no 99%
whole-scene claim. Twenty focused/shared-framework unit tests pass. Production AO,
variation, source lighting and installed v7 bake remain unchanged. No commit.

## Pose 04 GPU tail repeat (2026-09-13)

After commit `43e7e50`, the user requested three repeats of the earlier pose-04
GPU p99 anomaly (Off 10.425ms / On 16.781ms). The existing registered
`material-response-capture` leaf now accepts an explicit pose subset and fresh
browser count. No production rendering or settings were changed for this retest.

Run with `node tools/bake.mjs --target
lighting/experiments/reference-matching/material-response-capture`, using scoped
options on that target: `capture=tests/artifacts/screens/ai562_acesfilmic_reference_matching/material_validation_20260913_01`,
`phase=validation`, `pose-ids=pose_04`, `browser-runs=3`, and a new `output`.
The accepted output is
`tests/artifacts/screens/ai562_acesfilmic_reference_matching/ai568_pose04_perf_retest_20260913_01/`.
The adjacent `ai568_pose04_perf_retest_20260913_01_summary.json` retains pooled
repeat/per-pass statistics and the cache-history limitation. Original evidence
and receipts are unchanged; generated outputs remain ignored.

Three isolated browsers ran sequentially. Each used both Off/On and On/Off
orders, with 240 measured frames per condition/pass and the original warmup.
All 12 passes / 2,880 measured frames and GPU-query validation passed. Total time
was 476.44 seconds, including three fresh game/bake loads. The pose, bake hashes,
lighting/AO/display settings and 1920x1080 viewport match the prior measurement.
Draw workload stayed at 791 calls / 833,705 triangles. Reflection On/Off resource
counts matched within each repeat, and authored material identity was preserved.

| Fresh-browser repeat | Off median GPU ms | On median GPU ms | Off GPU p99 ms | On GPU p99 ms |
|---|---:|---:|---:|---:|
| 1 | 8.411 | 8.605 | 11.440 | 11.568 |
| 2 | 8.486 | 8.395 | 11.384 | 11.549 |
| 3 | 8.261 | 8.449 | 11.211 | 11.502 |

Each row pools both passes (480 samples per condition), rather than averaging
percentiles. No On pass reproduced the former 16.8ms p99. The largest median
On increase was 0.195ms (2.3%); the largest p99 increase was 0.291ms (2.6%).
Repeat 3 nevertheless had one 16.861ms frame with reflections Off; On maxima
were 12.259/11.922/11.914ms. This argues against a repeatable large steady-state
reflection cost, but does not identify the source of intermittent GPU stalls.

These focused browsers start directly at pose 04. The earlier five-pose run
visited other views first; its resident cache counts differ (104 textures / 2044
geometries / 131 programs versus the first new pass's 76 / 1287 / 134). Therefore
this does not reproduce the old traversal's exact cache/streaming history, nor
prove route-related stalls are fixed. Existing user applications were not closed.
There was no concurrent diagnostic Blender render. Syntax, staged-independent
diff whitespace and the authenticated capture receipt passed validation.
