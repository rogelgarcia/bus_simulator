DONE — demonstrated faults corrected; measured renderer/policy limitations retained below.

# Problem

The calibrated game still renders some shaded buildings darker than the matched
Cycles reference. Global lighting calibration and a corrected full indirect bake
have not made all material responses equivalent. Glass is intentionally different
between the engines and must not contaminate opaque-wall measurements.

# Request

Continue this as incremental, evidence-driven work until the remaining differences
are understood and justified corrections are validated. Preserve a durable plan,
all findings, failed assumptions, controls, image paths and measurements here.
The user explicitly requested this prompt and execution of the next step on
2026-09-13. This is a regular incremental AI, not `start ai` interactive mode.
Continue through the necessary causal experiments and a validated correction,
appending results after each bounded experiment. The user's later instruction is
to keep working until the root cause is found and fixed. Do not stop merely because
one experimental step finished, or mark the entire AI DONE after one step.

## Outcomes and boundaries

- Compare current game and Cycles at identical saved poses and display settings.
- Diagnose transport, material response and display separately. A smaller image
  error is not by itself proof of a physically correct change or 99% realism.
- Exclude window/glass materials and frames from opaque-wall measurements. Show
  exact selected pixels and counts, not an unexplained rectangular average.
- Retain authored bus/body/rim colors and existing independent reflection controls.
- Prefer correcting missing or inconsistent terms over a global brightness gain.
- Preserve every baseline and progress image in new immutable artifact directories.
- Keep scripts, configurations, default poses, this prompt and summaries tracked;
  generated screenshots, EXRs, Blender files, logs and receipts remain gitignored.
- Do not launch a complete rebake until a demonstrated transport/source change
  requires it. Do not silently alter the reference to make a score improve.
- For production changes, validate all five poses, sunlit controls, runtime costs,
  repeated toggles and baked activation without popping, freezing or resource leaks.
- Do not commit unless explicitly requested. Preserve unrelated pending changes.

## Incremental plan

- [x] Establish a formal calibration harness and coherent daylight/material controls (earlier AI 564-567; see their completed prompts for original scope and limitations).
- [x] Correct baked transport clamping and install the complete v7 receiver package.
- [x] Regenerate the five current game/Cycles comparisons with authenticated controls.
- [x] Isolate opaque environment reflections and texture AO in a four-condition matrix.
- [x] Enable existing opaque building environment reflections by default; preserve explicit saved Off preferences and authored material inputs.
- [x] Validate the reflection default on all five poses and repeated actual Options toggles.
- [x] Add wall-only comparisons, game measurement overlays and window-edge sensitivity measurements.
- [x] Step 1: Establish equivalent texture-AO-off controls, separate scene-linear diffuse/specular and albedo contributions on shaded brick/stone and sunlit controls, and identify the next supported correction. Keep production AO unchanged while diagnosing.
- [x] Step 2: Resolve demonstrated material equivalence gaps (AO treatment, procedural base-color variation, UVs, normals/roughness or exporter translation). Document the physical and visual tradeoff rather than blindly copying AO into base color.
- [x] Step 2 causal isolation: verify all five poses against equivalent source-texture inputs, preserving production material variation and AO; authenticate restoration and exclude unsupported wall proxies.
- [x] Correct the calibration comparison contract: retain omitted procedural source parameters in new exports/Blender metadata, identify appearance-only measurements per material, and provide a separate source-material lighting diagnostic.
- [x] Step 3: With materials controlled, measure remaining direct/indirect irradiance, local reflection/occlusion and bake reconstruction errors. Fix the largest proven cause; rebake only when required.
- [x] Step 4: Validate each accepted change across all five poses and an independent close-up; retain sunlit walls, road/marking and dynamic-object controls.
- [x] Step 5 boundary: glass/interior equivalence was conditional on a separate request, which was not activated in this opaque-wall investigation. Keep those proxies excluded and explicitly unvalidated; no glass correction is claimed.
- [x] Step 6: Record final current-game/Cycles image pairs, unresolved approximations, performance, memory and exact reproduction commands. Define achieved acceptance without inventing a full-scene parity percentage.

Completed checklist text is historical; append a new correction item if it needs
revision. Add dated implementation notes after each pass and update pending states.

## Established lighting and display controls

- City `bigcity2`; City Bus; five canonical poses in
  `tools/bake_lighting/experiments/lighting_configurations/config/poses.json`.
  Preserve its overlapping-pose shared bus placement (not a separate overlapping
  bus per camera). Authenticated captures contain the resolved actual poses.
- 1920 x 1080, camera vertical FOV 55 degrees; frozen simulation/camera.
- Three r183 ACESFilmic display mapping on both outputs; grade Off; bloom Off.
  Cycles generates scene-linear radiance and uses the matched display transform.
- Exposure multiplier `0.0511001705221839`, EV `-4.290528084304614`.
- Sun elevation 55 degrees, azimuth 45 degrees, intensity `162.714329883607`,
  linear RGB `[1, 0.8587931781765412, 0.6757006518788592]`.
- Disc-free calibrated environment `ibl.calibrated.clear_afternoon_55`, intensity
  1; hemisphere intensity 0. Preserve the calibrated sky/sun ratio and color.
- Comparison controls explicitly disable bus glass/body reflections and rim shine
  to match the saved reference. This differs from the user's runtime defaults.
- Baked shadows On, moving-object shadow resolution High, indirect receivers On.
  Require effective baked mode and receiver activation blend exactly 1.
- Screen-space AO is GTAO, dynamic-only when baked. Authored material texture AO
  is a separate contribution and remains enabled in the production game.
- Global PMREM reflections approximate local specular visibility. Exported window
  interiors and legacy bus materials are documented proxies, not exact parity.

## Installed bake and prior transport finding

An earlier Cycles indirect clamp of 10 discarded bounced light. Explicitly setting
direct/indirect sample clamps to zero fixed that transport error. The complete
accepted run used 512 samples, four diffuse bounces, 0.33m texels, ten 4096px atlas
pages with two mip levels, RGB9E5 and OPTIX. Eleven jobs passed in 4165.3 seconds.

- Profile: `ai553.cycles.surface.complete512.v7`.
- Receiver package: `a837e60a48873e5d500828fa8593fa432290d184d039904300cf8cbd25444d3a`.
- Source hash: `c19801f9fb7ba873960e86e3eb3fffb823768f768bfe19d3d234f8ae50090fe5`.
- Full run: `tests/artifacts/screens/ai556_bake_framework/run-1789254029307-27356-d552823d`.
- Native receiver files: the run's `lighting/illumination/bake/<receiver-package>/`.
- Reported resident receiver allocation: about 941,424,640 bytes. This is distinct
  from the reflection toggle, which reuses existing textures.
- Last commit when this prompt was created: `5b611b4`,
  `fix(lighting): correct baked bounce energy and reference materials`.
- Reflection/default/tool changes following that commit were still uncommitted.

## Findings: opaque reflections and material AO

The existing runtime suppressed environment response on eligible opaque building
materials. Enabling it uses the resident global environment and changes uniform
intensity; it does not replace materials or allocate a new reflection texture.
Windows/glass/transmission and materials with independently authored environments
are excluded by the existing eligibility rules.

The Cycles exporter explicitly removes `aoMap`, `lightMap` and `envMap` on cloned
materials. Cycles still computes geometric occlusion; it lacks the additional
authored texture-AO multiplication used by the game. AO-off agreement does not
automatically justify deleting authored micro-occlusion in production.

Mean linearized-display luminance bias versus Cycles on fixed eroded wall masks:

| Surface | Original | Reflections | Texture AO off | Reflections + texture AO off |
|---|---:|---:|---:|---:|
| Pose 02 shaded brick | -40.41% | -24.72% | -32.58% | -14.81% |
| Pose 03 shaded stone | -44.70% | -4.54% | -44.51% | -2.99% |
| Pose 02 sunlit brick | -4.67% | +1.32% | -3.08% | +3.41% |
| Pose 03 sunlit white wall | +1.65% | +2.66% | +3.44% | +4.56% |

- Reflections reduce the brick's brightness deficit by 38.8% (15.69 percentage
  points), not merely 15% relative. Shaded RGB MAE falls by 44.0% for brick and
  59.9% for stone. The reflected contribution is proportionally larger in the
  sampled dark stone view; do not infer a measured roughness difference.
- With reflections on, texture-AO bypass explains approximately another ten
  percentage points of the brick difference. The remaining 13-15% is not yet
  established as a bake error. Do not sum this display-space residual with older
  scene-linear irradiance-control percentages from different experiments.
- Export audit brick: `MAT_396_MeshStandardMaterial`, city/authored, roughness
  0.85, metalness 0, opacity 1, normal scale [0.9,0.9], linear source color
  [0.9822505503,0.7835377915,0.7011018919], UV tiling [1.3793103448,2].
- Dark stone: `MAT_459_MeshStandardMaterial`, roughness 0.85, metalness 0,
  normal scale [0.9,0.9], source factor [1,1,1] over its dark texture,
  UV tiling [1.5555555556,1.5555555556]. Sunlit white wall: `MAT_82_MeshStandardMaterial`.
- These materials had texture AO removed and `materialVariationConfig` recorded
  as an untranslated procedural hook. Inspect actual texture/color/normal
  outputs before attributing residuals to light strength.
- Under-bus road/marking regions retain a separate dynamic indirect-occlusion
  mismatch (some large relative errors on dark pixels); do not treat those as
  static-facade bake brightness or hide them in a whole-frame average.

## Findings: glass exclusion and sampling limits

`bake_progress_regions.json` contains fixed normalized facade rectangles. Within
each rectangle the analyzer selects an eligible opaque Cycles wall material ID,
intersects it with the region and erodes the mask by two pixels. It is not an
average over every pixel inside the rectangle. These Cycles-derived masks are
applied to aligned game images; an independent game material-ID intersection has
not yet been generated. Orange game overlays visibly verify masonry selection.

| Pose 02 shaded brick mask | Pixels | Current bias | Reflections + diagnostic AO off |
|---|---:|---:|---:|
| Existing eroded mask | 50,558 | -24.72% | -14.81% |
| Additional 3px inset | 27,169 | -24.00% | -14.01% |
| Additional 6px inset | 13,547 | -23.62% | -13.50% |

The brick residual persists away from window boundaries. The smaller stone mask
has 4,507 pixels and -4.54% bias; an extra 6px inset leaves 1,532 pixels with +1.03%
bias. Insets change sampled wall areas as well as edge contamination. Retain all
results and counts; do not select the mask closest to zero. These are regional
display-image metrics, not a whole-building/whole-scene photorealism score.

## Findings: five-pose production validation and performance

| Pose | Shaded bias before / after | RGB MAE before / after | GPU median off / on (ms) |
|---|---:|---:|---:|
| 01 | -37.64% / -21.77% | 0.03852 / 0.02139 | 9.486 / 9.432 |
| 02 | -40.41% / -24.72% | 0.03876 / 0.02172 | 9.798 / 9.772 |
| 03 | -44.70% / -4.54% | 0.04505 / 0.01804 | 9.078 / 9.092 |
| 04 | -31.05% / -23.06% | 0.04693 / 0.03206 | 8.030 / 8.094 |
| 05 | -31.41% / -18.94% | 0.05153 / 0.02678 | 7.430 / 7.225 |

All sampled sunlit facades also improved RGB MAE. Road/marking pixels were unchanged.
The largest median GPU increase was 0.064ms (0.8%). Calls, triangles, texture,
geometry and program counts matched per pose. Estimated extra reflection texture
allocation is zero; driver-level allocation was not instrumented. Frame/FPS/CPU
and tail statistics are retained in capture `review.json`; do not reinterpret
1/GPU time as measured whole-frame FPS.

Conditions: RTX 3060/WebGL2, 1920x1080, controls above, two fresh sequential Chrome
instances, two balanced passes per condition/browser, 60 warmup and 240 measured
frames per pass, completed GPU queries matched to submission IDs. Validation:
40 passes / 9,600 measured frames / 563.1 seconds. Matrix: 32 passes / 494.7 seconds.
The first matrix browser's initial timing varied; all repeated samples were kept.
Pose 04 GPU p99 was 10.425ms Off / 16.781ms On, with one anomalous On pass. This
does not demonstrate a fix for every intermittent desktop/game stall.

Four focused unit tests, thirteen bake framework tests and the actual Options E2E
passed. E2E took 2.3 minutes and checked eight alternating toggles, fully applied
bake/material identity, persistent explicit Off, Cancel restoration and Use defaults
removing saved overrides and restoring On. The selected-test file was restored.

## Evidence inventory and reproduction

Unless stated otherwise, paths below are beneath
`tests/artifacts/screens/ai562_acesfilmic_reference_matching/`:

- `unclamped_20260912_capture_01`: authenticated v7 source capture, resolved five
  poses, exact stored settings, bake/source hashes and original game PNGs.
- `building_review_20260912_render_02/full`: unchanged full Cycles reference,
  reusable `source_city.blend`, `scene.json`, `request.json`, `renders.json`,
  multilayer EXRs, PNGs and material audit. Sibling `geometric_diffuse` is a
  separate diagnostic Lambert control, not the beauty target.
- `current_cycles_20260912_01`: authenticated current/Cycles control,
  `bake_progress_receipt.json`, masks, frozen regions, target references and PNGs.
- `material_matrix_20260912_01`: failed CDN load; no accepted measurements.
- `material_matrix_20260912_02`: successful four-condition capture on poses 02/03.
- `material_matrix_analysis_20260913_01`: original matrix analysis and timings.
- `material_validation_20260913_01`: actual new-default five-pose capture and timings.
- `material_validation_analysis_20260913_01`: final five game/Cycles pairs and metrics.
- `material_masks_20260913_02`: all five pose wall-only pairs and selection overlays
  under `facades/`, inset metrics, reports, authenticated receipt; 5.7 seconds.
- `material_matrix_masks_20260913_01`: same mask-sensitivity check with all four
  conditions; 2.8 seconds. Earlier `_01` wall-only analysis is retained history.
- `debug_tools/regression_debugging/building_material_response.md`: tracked research log.

New outputs for this prompt go under
`tests/artifacts/screens/ai562_acesfilmic_reference_matching/ai568_<step>_<run>/`
to reuse the existing framework's guarded output hierarchy. Never overwrite an
authenticated baseline, open Blender file, installed package or prior run.

Use `node tools/bake.mjs --target lighting/experiments/reference-matching/<leaf>`
and scoped `--set lighting/experiments/reference-matching/<leaf>:<key>=<value>`.
Existing `material-response-analysis` requires `capture`, `control`, `output`;
`material-response-capture` requires an authenticated source `capture`, `output`
and `phase=matrix|validation`. Register new independent stages in the existing
domain/leaf hierarchy, document them and reuse `tools/baking/blender.local.json`.
Do not add another standalone machine-specific bake command.

Relevant sources: `BuildingReviewCapture.mjs`, `RawRadiance.mjs`,
`MaterialResponseAnalysis.mjs`, `material_response_analysis.py`,
`bake_progress_review.py`, `bake_progress_regions.json` under the reference-matching
tool; `export_city/ExportGameScene.mjs` and `MaterialEquivalence.js` under
`lighting_configurations`; `BuildingSurfaceReflections.js` and
`BuildingWindowVisualsSettings.js` under `src/graphics/visuals/buildings/`.

Check for existing Blender sessions before use. Never repurpose an occupied session.
If occupied, use an isolated background process only when safe, writing new paths.
Do not overlap Cycles rendering with GPU benchmarks. Reuse authenticated renders
where valid. Public game CDN modules may need sandbox network permission; a failed
load is not a renderer regression. Dispose diagnostic render targets/hooks and
restore light/material state in `finally`; assert restoration before accepting data.

## Implementation log

### 2026-09-13: prompt opened

Consolidated the calibration/bake context, reflection/AO matrix, five-pose checks,
glass-exclusion audit, artifact map and remaining plan. Next: Step 1, material AO
equivalence and lobe/albedo isolation. No new production lighting change is justified
by the current display-only residual alone.

### 2026-09-13: Step 1 implementation and failed temporal control

Added registered `material-parity-capture` and `material-parity-analysis` leaves,
using the existing raw shader outputs, immutable Cycles full/sun-only EXRs and
fixed glass-excluding masks. Added diffuse/beauty AO bypass, albedo and lobe
measurements, inset sensitivity, radiance restoration and pass-closure checks.

First capture `ai568_material_capture_20260913_01` completed in 451.1 seconds
(126.1 seconds until game/bake ready; the largest additional delay was the first
raw shader render). This is offline diagnostic overhead, not gameplay frame time.
Its analysis `ai568_material_analysis_20260913_01` correctly rejected the run:
1,262 of 66,990 sunlit white-wall pixels changed along shadow edges between the
first and restored captures (maximum linear-channel difference 3.80356). Shaded
brick/stone and sunlit brick restored exactly; no final result is accepted from
this incomplete analysis. The simulation was paused but renderer updates continued
between asynchronous readbacks. Do not weaken the check or erase the failed run.

Minimal capture correction: stop the isolated engine for the complete raw sequence,
assert the frame counter did not change, and resume its previous running state in
`finally`. Repeat into `ai568_material_capture_20260913_02`; keep identical masks,
light, reference and AO controls. Thirteen bake framework tests passed and the
selected-test file was restored. No production AO/bake/light setting changed.

The `_02` frozen-frame capture completed its own resource/pose checks in 269.7
seconds. A read-only check confirmed exact zero restored-radiance differences on
all four facade masks, including the previously failing white wall. However, the
framework rejected the run because the agent edited `material_parity_analysis.py`
while capture was active. Keep this run as diagnostic history, not a successful
framework run; do not retroactively certify it or weaken input immutability.

Final rerun `_03` also waits for requested shadow-detail pages to finish fetching
and uploading, then settles before freezing. Keep all capture tool inputs unchanged
until the framework finishes. The failed temporal check demonstrated why paused
simulation alone is insufficient for reproducible material-lobe experiments.

### 2026-09-13: Step 1 accepted results and next decision

Clean capture `ai568_material_capture_20260913_03` passed the framework in 280.8
seconds, including 118.5 seconds until game/bake readiness. Shadow-detail queues
were empty with no selected-page fallback before each frozen sequence. Both poses
held a single engine frame during the raw passes, resumed successfully, retained
the authenticated light/display/bake/source controls and restored all four wall
regions exactly (maximum linear-channel difference zero).

`ai568_material_analysis_20260913_02` passed in 9.7 seconds. Final analysis
`ai568_material_analysis_20260913_03` passed in 9.5 seconds and adds Cycles
direct/indirect specular shares and a strict noisy-beauty reconstruction check.
Its 40 authenticated output files include 12 wall-only comparison sheets.
The final images are byte-identical to the prior analysis sheets. Brick beauty,
diffuse and albedo, shaded-stone beauty and sunlit-white-wall beauty were visually
inspected with gray exclusions and readable comparison labels.

Ratios below are mean **scene-linear** game/Cycles values with game texture AO
bypassed; they are separate from the earlier postprocessed PNG brightness scores.
The albedo column is game diffuseColor versus Cycles Diffuse Color (BSDF-weighted),
so it remains a diagnostic rather than exact material base-color certification.

| Wall | Pixels | Beauty | Diffuse | Specular | Albedo diagnostic | Sky + bounce diffuse | Color-normalized sky + bounce diagnostic |
|---|---:|---:|---:|---:|---:|---:|---:|
| Pose 02 shaded brick | 50,558 | 0.9110 | 0.9420 | 0.7677 | 0.9885 | 0.9423 | 0.9540 |
| Pose 02 sunlit brick | 10,030 | 1.0744 | 1.1287 | 0.9308 | 1.0003 | 1.0292 | 1.0242 |
| Pose 03 shaded stone | 4,507 | 0.9887 | 1.0552 | 0.9628 | 1.0444 | 1.0890 | 1.0241 |
| Pose 03 sunlit white wall | 66,990 | 1.0634 | 1.0727 | 0.9589 | 1.0063 | 1.1751 | 1.1564 |

Shaded-brick mask sensitivity, keeping every result:

| Extra inset | Pixels | Diffuse ratio | Specular ratio | Albedo diagnostic | Color-normalized sky + bounce diagnostic |
|---|---:|---:|---:|---:|---:|
| 0px | 50,558 | 0.9420 | 0.7677 | 0.9885 | 0.9540 |
| 3px | 27,169 | 0.9634 | 0.6995 | 0.9844 | 0.9800 |
| 6px | 13,547 | 0.9695 | 0.6916 | 0.9802 | 0.9915 |

Conclusions and constraints for Step 2:

1. The brick base-color diagnostic is already close (about 98-99%); a large
   arbitrary texture/albedo brightening is not supported by this experiment.
2. Texture AO reduces shaded-brick diffuse radiance by about 7.44%. Relative to
   Cycles noisy beauty, its total contribution explains 6.77 percentage points
   of the raw brightness deficit. Keep that separate from display percentages.
3. With texture AO removed, the remaining shaded-brick raw beauty deficit is
   8.92 points: approximately 4.76 from diffuse and 4.16 from specular. Neither
   component can be called pure irradiance error without equivalent materials.
4. Shaded-brick diffuse is 94-97% of Cycles; the color-normalized diagnostic is
   95-99% depending on inset. This is encouraging evidence against another large
   global bounce/exposure increase, not proof of 99% scene parity.
5. Brick specular remains only 69-77% of Cycles. Cycles indirect specular is
   54.22% of its brick specular term, versus 20.67% for shaded stone and about
   11% for the sunlit controls. This makes bounced/local reflection transport an
   important candidate, but does not by itself assign the entire gap to missing
   local probes; game and Cycles also differ in BRDF/normal response and visibility.
6. Sunlit controls are already brighter in the game. Pose-02 sun-diffuse ratio
   is 1.1639 on the original mask but falls to 1.0337 after a 6px inset, which
   leaves only 524 pixels. Strong edge/region sensitivity means do not tune global
   sunlight to that original regional average. Pose-03 white-wall sky/bounce is
   about 17.5% high despite similar albedo; a global bounce increase would worsen it.
7. Cycles color-weighted diffuse/glossy lobes reconstruct its Noisy Image to mean
   absolute relative error below 2.3e-7. Denoising changes regional mean luminance
   by less than 0.15%, so it does not explain the brick brightness deficit.
   Pixel-level noise remains visible in diffuse diagnostic images; do not confuse
   noisy lobe passes with denoised final beauty or claim every pixel is matched.
8. Raw captures bypass the game's postprocessing and use a separate float target.
   Their displayed errors can differ from the original production PNGs, especially
   on narrow sunlit regions and edges. Compare raw to raw for this attribution and
   retain the production PNGs for appearance acceptance.

Next bounded iteration: control AO equivalently, then use matched normal/roughness
and reflection-environment controls to split BRDF/normal response from local
specular transport on the brick. Quantify each term before choosing a production
AO adjustment or reflection implementation. Preserve shaded stone and sunlit
facades as regression controls. An independent game material-ID intersection is
still desirable before making claims about narrow boundary-dominated regions.

No production material/lighting/bake value changed in Step 1. The new workflow
and frozen-frame correction are implemented; production AO remains enabled while
its equivalence policy is unresolved. Capture timing is offline tool cost, not
game performance. Existing 13 framework tests pass; syntax/diff checks pass;
generated captures remain gitignored. No commit was made.

Reproduce the accepted stage using these scoped inputs:

```sh
node tools/bake.mjs --target lighting/experiments/reference-matching/material-parity-capture --set lighting/experiments/reference-matching/material-parity-capture:capture=tests/artifacts/screens/ai562_acesfilmic_reference_matching/material_validation_20260913_01 --set lighting/experiments/reference-matching/material-parity-capture:control=tests/artifacts/screens/ai562_acesfilmic_reference_matching/current_cycles_20260912_01 --set lighting/experiments/reference-matching/material-parity-capture:output=tests/artifacts/screens/ai562_acesfilmic_reference_matching/ai568_material_capture_NEW
node tools/bake.mjs --target lighting/experiments/reference-matching/material-parity-analysis --set lighting/experiments/reference-matching/material-parity-analysis:capture=tests/artifacts/screens/ai562_acesfilmic_reference_matching/ai568_material_capture_20260913_03 --set lighting/experiments/reference-matching/material-parity-analysis:output=tests/artifacts/screens/ai562_acesfilmic_reference_matching/ai568_material_analysis_NEW
```

Choose fresh output names; never overwrite an accepted or failed run. Analysis can
reuse the accepted capture without reopening the game or rendering in Blender.

## Step 2 investigation in progress

User explicitly requested continuing until the cause is found and fixed. The next
causal controls reuse the authenticated Blender scene rather than rebaking:

- Separate game direct and environment specular; capture shading normals and a
  primary flat-normal control with texture AO bypassed only during diagnostics.
- In Cycles, compare original local reflection transport with geometry invisible
  to glossy rays, and repeat both with primary geometric normals. This separates
  local reflected radiance from normal-map/BRDF differences. These are diagnostic
  controls, never replacement physical references.
- Preserve direct sunlight, diffuse transport, original texture AO and material
  appearance in production until the controlled results justify a correction.
- Record every added/changed source file, run, result and rejected hypothesis here.

### Step 2 accepted transport controls

Step 2 first accepted run:
`tests/artifacts/screens/ai562_acesfilmic_reference_matching/ai568_transport_20260913_01`
passed the framework in 144.0 seconds (six Cycles renders). Framework summary:
`tests/artifacts/screens/ai556_bake_framework/run-1789277842802-28428-639b8d72/summary.json`.

Mean scene-linear specular Y, original fixed wall masks:

| Wall | Full local | No glossy geometry | Primary flat normal | Both |
|---|---:|---:|---:|---:|
| Pose 02 shaded brick | .116773 | .117530 | .119203 | .120018 |
| Pose 02 sunlit brick | .677729 | .707624 | .671001 | .701674 |
| Pose 03 shaded stone | .488496 | .509618 | .485589 | .509224 |
| Pose 03 sunlit white | .494132 | .494001 | .487781 | .488197 |

This rejects the hypothesis that missing local reflected radiance alone explains
the 23–31% brick specular deficit. Removing glossy visibility also changes
secondary transport slightly (brick diffuse .535740 -> .518367); retain that
limitation rather than claiming a perfectly independent glossy-only edit.
Primary normals produce only a small change in Cycles, pending the matching game
normal/roughness/specular capture. Do not install local probes based on Step 1's
indirect-specular percentage alone.

Step 2 file inventory (in progress): new `MaterialTransportControl.mjs` and
`material_transport_control.py` in the reference-matching tool; extended
`RawRadiance.mjs`, `MaterialParity.mjs`, `jobs.mjs`, and diagnostic-only
`src/graphics/shaders/materials/lighting_diagnostic_apply.frag.glsl` for specular
and flat-normal passes; registered the leaf in `PROJECT_TOOLS.md`,
`specs/tools/bake_framework.md` and the tool README. Production shaders/material
values remain unchanged. Existing Blender process 2820 was occupied, so the
experiment uses the framework's isolated headless configuration, not that process.

### Step 2: actual shader inputs and matched roughness

Accepted `ai568_reflections_20260913_01` took 287.7 seconds (115.3 seconds to
game/bake readiness). It adds direct/environment specular, effective roughness,
texture AO and world-normal passes, plus primary flat-normal controls. The frozen
snapshot preserves production settings. Roughness includes Three's geometric
normal antialiasing term; do not call this the original scalar material property.

Accepted `ai568_inputs_20260913_01` took 53.0 seconds and adds **true Principled
input AOVs** to Cycles. These correct the previous albedo comparison's limitation:
Cycles Diffuse Color is BSDF-weighted and is not the unmodified Base Color input.

| Wall | Game effective roughness | Cycles input roughness | Game AO | Game specular Y | Cycles specular Y |
|---|---:|---:|---:|---:|---:|
| Shaded brick | .847778 | .786577 | .925579 | .089643 | .116773 |
| Sunlit brick | .844982 | .786633 | .925914 | .630815 | .677729 |
| Shaded stone | .647208 | .625210 | .969806 | .470327 | .488496 |
| Sunlit white | .788355 | .791196 | .875548 | .473815 | .494132 |

The shaded-brick roughness delta persists with additional 3px/6px erosion
(.063365/.064005), rejecting a window-boundary-only explanation. Inspecting the
verified native BSIB confirms active procedural macro, brick/mortar, streak and
edge/base wear. The glTF exporter removes the `materialVariationConfig` hook.
Consequently the engines render different authored roughness and color, even
though their scalar material parameters and textures look equivalent in the audit.
True Cycles brick Base Color averages [.269049,.107068,.059311]; the earlier
98–99% albedo claim must not be used as proof of exact base-color equivalence.

Accepted `ai568_matched_roughness_20260913_01` took 49.9 seconds. Substituting
the measured game roughness **only at primary camera hits** in Cycles changes
shaded-brick specular Y from .116773 to .101795, versus game .089643. It explains
about 55% of that lobe's gap. This screen-projected input is a diagnostic causal
control, not a reusable physical material or a production exporter solution.
Other wall controls are retained in its `renders.json` and EXRs.

Local glossy transport and normal-map bypass did not explain the gap. Another
global sunlight, exposure or indirect gain is unsupported. Texture AO remains a
separate approximately 7.4% diffuse attenuation absent from the Cycles proxy.
The existing AI566 neutral-fixture artifacts also show a smaller Three/Cycles
specular difference with identical PBR inputs; authenticate/retest before using
those old results as quantitative evidence for the current renderer.

Next investigation: run the game with the **same source-material contract that
the existing exporter actually renders**, in an isolated diagnostic capture:
authored textures/factors retained, procedural variation and texture AO bypassed,
production state restored and verified. This tests whether the remaining facade
deficit is an illumination bug or an invalid comparison between unlike materials.
Do not remove authored variation or AO from production merely to improve a score.
The comparison workflow must distinguish physical/source-material parity from
production-appearance comparisons with acknowledged exporter approximations.

### Step 2 conclusion: two different causes, different corrections

The runtime error was suppression of opaque environment reflections. Its default
has been corrected, with explicit saved Off preserved, original materials retained
and repeated five-pose GPU/Options validation recorded above. That is the actual
game rendering change. This investigation must not pretend that another global
lighting increase is needed to compensate for a different reference material.

The residual brick discrepancy is mostly an **unlike-material comparison**:
Cycles receives original source textures/factors; the game additionally applies
procedural wear/color/roughness and authored texture AO. These are intentional
appearance inputs, not evidence of insufficient baked light. The source-control
experiment isolates this without deleting those inputs from production or altering
the original target. The correction to the calibration workflow is implemented:

- `SourceMaterialControl.js` applies the same source-texture material policy only
  during isolated diagnostic passes, using reversible uniforms. It retains texture
  factors/UV tiling, disables unexported variation/normal flips/texture blend, and
  restores state even on exceptions. It does not modify saved settings or bakes.
- `SourceMaterialContract.js` preserves complete procedural source parameters in
  each new material audit and explicitly marks omitted texture AO, variation,
  bump/custom shaders or proxy BRDFs as non-equivalent to production appearance.
  `ExportGameScene.mjs` uses it; `ExportCity.mjs` includes it in the cache identity;
  `build_scene.py` retains the audit on saved Blender materials. Unused source
  materials after instanced tinting/clipping are listed instead of causing a false
  missing-material failure. This preserves semantics; it does **not** implement
  a complete Cycles version of the procedural shader.
- `source_material_analysis.py` separates production, AO-only and source-material
  controls. It rejects selected walls with other unsupported shader hooks/proxies,
  reconstructs Cycles lobes, validates radiance restoration, retains all mask insets,
  and keeps production/Cycles pairs separate from labeled diagnostic wall sheets.
- `bake_progress_review.py` now records per-region material comparison contracts
  and explicitly marks beauty-image measurements as not isolated illumination
  errors. Existing authenticated targets and original metrics remain unchanged.

Accepted five-pose capture `ai568_source_contract_20260913_01` completed in
**292.1 seconds**, including 105.0 seconds to game/bake readiness and cold offline
shader compilation. It recorded 45 full-resolution raw passes. Analysis `_01`
took 13.4 seconds; final `ai568_source_analysis_20260913_02`, adding strict selected
material-contract checks, passed in **13.2 seconds**. Both are accepted framework
runs. Final output contains five current/Cycles pairs and ten wall-only diagnostic
sheets. Original and restored radiance is exactly equal on all ten wall masks.

All following values are mean scene-linear game/Cycles ratios, not percentages of
whole-scene photorealism. The source-control image is not the production game.

| Pose / wall | Pixels | Production beauty | Texture AO off | Source-material beauty | Source diffuse | Source specular |
|---|---:|---:|---:|---:|---:|---:|
| 01 shaded brick | 95,715 | .8603 | .9282 | .9915 | 1.0121 | .9002 |
| 01 sunlit brick | 11,419 | .9872 | 1.0089 | 1.0602 | 1.1122 | .9244 |
| 02 shaded brick | 50,558 | .8431 | .9108 | .9773 | .9872 | .9316 |
| 02 sunlit brick | 10,030 | 1.0557 | 1.0746 | 1.1281 | 1.1947 | .9507 |
| 03 shaded stone | 4,507 | .9782 | .9882 | .9902 | 1.0835 | .9548 |
| 03 sunlit white | 66,990 | 1.0396 | 1.0649 | 1.0909 | 1.1005 | .9615 |
| 04 shaded wall | 29,676 | .8455 | .8862 | .9317 | .9385 | .8444 |
| 04 sunlit wall | 16,612 | 1.0348 | 1.0580 | 1.0580 | 1.0803 | .8488 |
| 05 shaded wall | 3,410 | .8715 | .9137 | .9465 | .9927 | .6683 |
| 05 sunlit wall | 20,839 | .9540 | .9638 | 1.0295 | 1.0466 | .8633 |

Pose 02 shaded brick's remaining production deficit is 15.69 scene-linear
percentage points: texture AO explains 6.77 points, procedural material response
6.64, and the source-material residual is 2.27 points. Equivalent diffuse is
98.72% of Cycles (101.21% at pose 01). Additional 6px erosion yields pose-02
source beauty .9914 and diffuse 1.0221; retain both selections, not just the closest
one. This explains why another light/bake-energy increase is not the right fix.

Remaining, explicitly **not** declared fixed:

- Full camera-independent translation of procedural materials into Cycles is
  still unimplemented. The exporter now preserves and identifies the missing
  semantics, and the harness provides a valid source-material diagnostic instead
  of silently treating texture-only export as production shader parity.
- Pose 04 source diffuse remains .9385 on the original mask / .9700 with 6px inset.
  Pose 05 source diffuse is .9927, while specular remains .6683. These residuals
  deserve separate visibility/BRDF/filtering controls in Step 3 if pursuing tighter
  full-material parity. Do not apply the brick correction to them by assumption.
- Sunlit masks are boundary-sensitive; pose 01's 6px inset leaves only 220 pixels
  and substantially changes the result. The white wall remains about 10% brighter
  in source-control diffuse. These controls contradict a blanket light increase.
- Glass/interior proxies, game-only postprocessing, directional light/shadow
  filtering, derivative normal sampling and global versus local reflections remain
  approximations. No 99% full-scene claim or complete AI568 DONE status is justified.

Validation: 3 new source-control/audit tests, 4 opaque-reflection/geometry tests,
13 shared bake-framework tests passed through the selected-test runner. The
selected file was restored. The prior actual Options E2E and repeated 40-pass GPU
validation remain applicable to the unchanged runtime reflection correction.
Current changes add no new game-time resources or new production shader behavior
beyond the recorded reflection default. New raw selectors are diagnostic only.
No commit or additional rebake was performed.

Additional tracked file inventory for this iteration:

- `tools/bake_lighting/experiments/lighting_configurations/export_city/SourceMaterialControl.js`
- `tools/bake_lighting/experiments/lighting_configurations/export_city/SourceMaterialContract.js`
- `tools/bake_lighting/experiments/lighting_configurations/export_city/ExportGameScene.mjs`
- `tools/bake_lighting/experiments/lighting_configurations/export_city/ExportCity.mjs`
- `tools/bake_lighting/experiments/lighting_configurations/export_city/build_scene.py`
- `tools/bake_lighting/experiments/reference_matching/source_material_analysis.py`
- `tools/bake_lighting/experiments/reference_matching/bake_progress_review.py`
- `tools/bake_lighting/experiments/reference_matching/RawRadiance.mjs`
- `tools/bake_lighting/experiments/reference_matching/MaterialParity.mjs`
- `tools/bake_lighting/experiments/reference_matching/MaterialTransportControl.mjs`
- `tools/bake_lighting/experiments/reference_matching/material_transport_control.py`
- `tools/bake_lighting/experiments/reference_matching/jobs.mjs` and `README.md`
- `tests/node/unit/source_material_control.test.js`
- `src/graphics/shaders/materials/lighting_diagnostic_apply.frag.glsl`
- `PROJECT_TOOLS.md`, `specs/tools/bake_framework.md`,
  `specs/graphics/building_surface_reflections.md`, and the research log below.

Reproduction (choose fresh artifact output names):

```sh
node tools/bake.mjs --target lighting/experiments/reference-matching/material-parity-capture --set lighting/experiments/reference-matching/material-parity-capture:capture=tests/artifacts/screens/ai562_acesfilmic_reference_matching/material_validation_20260913_01 --set lighting/experiments/reference-matching/material-parity-capture:control=tests/artifacts/screens/ai562_acesfilmic_reference_matching/current_cycles_20260912_01 --set lighting/experiments/reference-matching/material-parity-capture:phase=source --set lighting/experiments/reference-matching/material-parity-capture:output=tests/artifacts/screens/ai562_acesfilmic_reference_matching/ai568_source_NEW
node tools/bake.mjs --target lighting/experiments/reference-matching/material-parity-analysis --set lighting/experiments/reference-matching/material-parity-analysis:capture=tests/artifacts/screens/ai562_acesfilmic_reference_matching/ai568_source_contract_20260913_01 --set lighting/experiments/reference-matching/material-parity-analysis:output=tests/artifacts/screens/ai562_acesfilmic_reference_matching/ai568_source_analysis_NEW
```

Evidence: all paths use the AI562 artifact root defined earlier. Final report
`ai568_source_analysis_20260913_02/analysis.md`; raw metrics `analysis.json`;
`pose_02_shaded_facade_material_control.png` shows production, material control and
Cycles with glass removed. `pose_01_current_cycles.png` through
`pose_05_current_cycles.png` retain the current appearance comparisons. Full source
images are under `images/`. The pose-02 crop and full pair were visually inspected.
Framework summaries:
`tests/artifacts/screens/ai556_bake_framework/run-1789279637869-6416-5486c13b/summary.json`
and `tests/artifacts/screens/ai556_bake_framework/run-1789280479703-28504-85be461d/summary.json`.

### 2026-09-13: continuing Step 2, native surface-material export

The next implementation evaluates the existing native material shader in a
camera-independent planar surface atlas for each ordinary opaque building mesh.
It exports linear Base Color, roughness/metalness, world shading normal and a
separate authored-AO field. Blender imports the resolved textures with their
dedicated surface UVs; the scene, sun and exposure remain fixed. This avoids
inventing a second implementation of the game's procedural noise/wear formula.
It is an offline export option, not a runtime texture allocation or new bake.

AO stays separate from Base Color: Cycles retains geometric light visibility.
Physical Cycles and an artistic indirect-AO comparison must be clearly labeled.
The exporter rejects view-distance texture blending and unsupported instanced/
skinned material surfaces rather than silently claiming exact translation. Native
derivative antialiasing is sampled at the declared surface texel density; compare
two densities and independent poses before accepting the translation.

Files added: `export_city/SurfaceAtlas.js`, `SurfaceMaterialExport.js`,
`surface_materials.py`, four `src/graphics/shaders/materials/surface_export*` GLSL
sources, and `tests/node/unit/surface_atlas.test.js`. Updated `ExportGameScene.mjs`,
`ExportCity.mjs`, `build_scene.py`, reference-matching `jobs.mjs`, its README and
the bake framework specification. Three atlas tests pass (metric continuity,
nonoverlap/material isolation, oversized-input rejection). Render validation is
pending; this entry does not mark Step 2 complete.

Registered existing stage: `lighting/experiments/reference-matching/reference`
with `surface-materials=on` and `surface-density=16|32|64`. Original source-texture
exports remain available with the option Off. New outputs must remain immutable.

First surface run `_01` stalled before game readiness under restricted network
access and was cancelled at about 190 seconds, before exporting any surface data.
Retry with the existing public module CDN accessible. The exporter now preserves
an incomplete cached export instead of overwriting it on a retry.

The unrestricted `_02` run started successfully and evaluated 10/54 surfaces,
but measured raw-map growth made 32px/m inappropriate for the first full-city
load. It was cancelled before Blender import. Added explicit aggregate 160M texel
preflight (fail, never silently downsample) and per-surface manifests. Use 16px/m
for the initial complete export, then denser isolated controls. This is offline
reference memory, not a new runtime allocation. Both cancelled attempts remain.

Full 16px/m `_03` exported 54 surfaces, 118.5M atlas texels (5.55 GiB raw), and
finished in 514.6s. The framework authenticated the files, but visual acceptance
failed: the importer flips glTF V coordinates, unlike the native bottom-up atlas.
This produced incorrect surface sampling. Fixed the import with an explicit,
idempotent native-UV conversion. `/surface-reference` rerenders the saved scene
without repeating the export and checks the complete expected surface inventory.
`/surface-analysis` checks identical pose/light/exposure controls and reports
color/roughness input differences before brightness. Added SurfaceReference.mjs,
surface_reference.py, SurfaceMaterialAnalysis.mjs and surface_material_analysis.py;
registered/documented the two leaves. The `_03` images are rejected visual
evidence, not an accepted lighting target. No production game value changed.

The corrected `_04` reference completed in 220.8s. UV validation verified all 54
expected meshes and idempotence. The `_03` rejected reference remains preserved.
Accepted analysis `ai568_surface_analysis_20260913_03` completed in 12.5s; its
`pose_02.png` pair was visually inspected. Native base-color means agree within
about 0.7%, with roughness differences below .008. Mean production game/resolved
Cycles shaded-wall ratios for poses 01–05 are .8996, .8758, .9739, .8794, .8947.
With the game's authored texture AO bypassed for diagnosis, those ratios are
.9706, .9461, .9839, .9217, .9379. These are scene-linear wall means, not final
accuracy claims. Pose 04's sunlit material has no procedural variation and uses
unchanged source PBR; its absent surface AOV is explicitly unmeasured, not zero.

Continue with 32px/m convergence and all-five-pose diffuse/specular isolation.
Sparse coplanar trim charts previously enclosed whole empty courtyards. Partition
them and rotate charts without reversing winding, preserving physical density
and world texel phase. Four atlas tests now pass, including sparse trim allocation
and metric continuity. A first test exposed waste from sparse two-triangle charts
and mixed chart orientation; both were fixed before rendering. The denser `_05`
run preflights 160M texels / 7.50 GiB raw, versus 118.5M at the earlier 16px/m.
This memory belongs to the offline reference, not to production game resources.

Added a `resolved` material-capture phase for all five poses, separate raw diffuse,
sun diffuse, sky/bounce diffuse, direct/environment specular, material inputs and
restoration. Native surface references now retain sun-only contributions for all
five views and a world-normal AOV. This is a diagnostic extension; no runtime AO,
light power, exposure or authored material tuning was changed.

### 2026-09-13: resolved materials, density convergence and all-pose lobes

Accepted 32px/m surface reference `ai568_surfaces_20260913_05` took 729.7s,
including export/import, five full renders and five named-sun renders. Packed raw
inputs total 7.50 GiB. Visually inspected poses 01 and 03. The earlier 16px/m `_04`
remains an immutable convergence control. Native atlas packing preserves winding;
the regression test now explicitly verifies this to prevent inverted normals.

Capture `ai568_resolved_capture_20260913_01` contains all five canonical views plus
the previously supplied `pose_custom` (`material_validation_closeup.json` is now
tracked). Six views / 78 raw passes validated in 344.5s. Fresh game readiness took
111.7s, followed by a slow first diagnostic shader/readback; later poses completed
much faster. This diagnostic workload is not a gameplay timing benchmark. Saved
settings, pose, bake identity, material restoration and frozen frames passed.
Metadata retains Three r183's AO shader contract. It multiplies indirect diffuse,
and uses a roughness/view-dependent occlusion for indirect specular, not Base Color.

Accepted `ai568_resolved_analysis_20260913_01` completed in 22.7s. All raw lobe
closure/restoration checks passed. New `resolved_surface_analysis.py` reports the
original masks plus 3px/6px inset sensitivity, input/normal differences, density
convergence and separate named-sun / sky-bounce / environment-specular means.
The framework rejected a concurrent analyzer start while capture owned its lock;
no competing bake was launched. Analysis was rerun after capture completed.

| Shaded wall pose | Production game / Cycles | Texture AO off / Cycles | Diffuse / Cycles | Environment specular / Cycles | 32 vs 16px/m radiance |
|---|---:|---:|---:|---:|---:|
| 01 | .8934 | .9639 | .9874 | .8480 | +.687% |
| 02 | .8719 | .9420 | .9600 | .8524 | +.439% |
| 03 | .9781 | .9881 | 1.0646 | .9671 | -.428% |
| 04 | .8810 | .9234 | .9306 | .8362 | -.180% |
| 05 | .8965 | .9398 | .9863 | .6677 | -.199% |

These are scene-linear regional means, not percent whole-scene accuracy. Shaded
base-color mean RGB ratios are within .5%; resolved/native AO means agree within
.0021. Pose 04/05 world-normal medians differ only .077/.066 degrees. Brick normal
tails are larger (up to 34 degrees at p95) because sampling filtered microdetail
differs; do not claim exact normals or screen-pixel parity. At 6px inset, pose 02
diffuse becomes .9942 and pose 04 .9626, while their reflection deficits persist.
The small pose-01 sunlit 6px inset retains only 220 pixels and is not a reliable
whole-facade control. All counts/results remain in the JSON, not cherry-picked.

Pose 02's 12.81-point production deficit separates into 7.01 points authored AO,
3.34 diffuse and 2.46 specular. Pose 05 separates into 4.34 AO, 1.17 diffuse and
4.85 specular. Sunlit diffuse is often already above the reference, so a global
light/bake gain is contradicted by these controls. Next: confirm local versus
global glossy transport on the now-matched materials and finish the independent
close-up. Do not silently remove authored AO to improve an appearance score.

### 2026-09-13: local-reflection hypothesis rejected; isolated specular fixture

`ai568_global_glossy_20260913_01` completed all five poses in 132.2s. Hiding city
geometry from glossy rays did not remove the reflection discrepancy: pose 05's
game/Cycles specular ratio changed only .6677 -> .6825. This rejects missing local
city reflections as the primary explanation for that residual. Do not repeat the
earlier hypothesis as an established cause. `ai568_resolved_analysis_20260913_02`
adds this control and completed in 26.6s.

The independent saved close-up was added to the reusable 32px/m scene in
`ai568_closeup_20260913_01` (87.3s, full and sun-only renders, all 54 surface checks).
`ai568_closeup_analysis_20260913_01` produced its current-game/Cycles pair in 8.6s.
There is no invented close-up wall score; it is a separate visual validation.

Added registered `specular-fixture` leaf, `SpecularFixture.mjs` and
`specular_fixture.py`. `ai568_specular_fixture_20260913_01` completed in 17.6s:
56 black dielectric cells, seven roughness values and eight actual view/normal
angles, white and calibrated disc-free sky, 2048 Cycles samples. No textures,
AO, normal maps, city geometry, tone mapping or local reflection visibility.
Native shader source is retained in `game.json`. A discrepancy exists under
constant white as well as sky. For roughness .85 the white ratios are
.972/.941/.907/.882/.877/.890/.916/.943 for NoV
1/.9/.75/.6/.45/.3/.15/.05; sky ratios are
1.063/1.037/.982/.929/.890/.861/.834/.817.

Next validate the fixture's angular/environment controls and distinguish native
Schlick/split-sum approximations from a source/coordinate error. Do not fit an
arbitrary reflection gain or change production shaders from this table alone.
The Cycles source documents true dielectric Fresnel for Principled; Three's
captured shader uses a Schlick DFG lookup and PMREM environment filtering. Those
are different response models, not evidence of weak sunlight or a deficient bake.

### 2026-09-13: independent integral and corrected comparison policy

`ai568_specular_fixture_20260913_05` validated actual geometry NoV and camera
projection, the exported HDR against the analytic sky, and independent visible
GGX quadrature. Added `specular_integral.py` (Heitz visible-normal sampling,
https://jcgt.org/published/0007/04/01/). It has no fitted gains, renderer DFG LUT
or copied native reflection code. 65,536 versus 16,384 samples changes sky
radiance by at most .070%. The HDR mean-Y ratio to analytic sky is .994855,
with 2.434% p99 per-channel source error from RGBE/discrete sky sampling. Sky
direction and camera projection passed; there is no demonstrated orientation bug.

White-normalized Cycles sky response agrees with the exact-Fresnel independent
integral within 1.72% across all 56 cells. At roughness .85, its error is about
.5% across every tested angle, consistent with HDR source quantization. Three's
white-normalized Schlick sky response ranges from 1.103 to .848 across those
angles. White results independently reproduce the difference between Schlick
and exact dielectric Fresnel; energy-compensation differences are also retained.
These controls identify BRDF/filter approximations, not missing irradiance.
No production BRDF/LUT was replaced and no scene-fitted reflection gain was added.

Final fixture `ai568_specular_fixture_20260913_06` passed the recorded projection,
source, convergence, Fresnel anchor and angular-response gates in 17.8s. Limits
are engineering validation budgets, not an industry photorealism score. Earlier
`_02` stopped on a missing script import, fixed by adding the script directory.
`_03`/`_04` stopped at the projection assertion: Blender's float matrix differed
by 1.01e-6 normalized units. The explicit tolerance is now 1e-5 (less than .006
pixel), still far inside the 16-pixel sensor. Those runs are not accepted renders.

`ai568_resolved_analysis_20260913_03` completed in 31.2s and adds an explicitly
labeled **Cycles + authored AO** artistic wall-only control. It uses the exported
surface AO, shading normal, roughness and saved camera to apply Three's indirect
diffuse/specular occlusion equations. Direct sunlight and Base Color are untouched.
The physical Cycles images are retained unchanged. No game AO setting changed.

| Shaded wall | Game / physical Cycles | Game / same-authored-AO Cycles control |
|---|---:|---:|
| 01 | .8934 | .9655 |
| 02 | .8719 | .9434 |
| 03 | .9781 | .9882 |
| 04 | .8810 | .9233 |
| 05 | .8965 | .9396 |

With 6px additional wall insets, the same-policy ratios are .9768/.9590/1.0120/
.9518 for poses 01-04; pose 05 retains only a valid 3px sample, .9551. All original
regions and counts remain; do not select the inset closest to one. Unsupported
pose-04 sunlit AOVs are explicitly unmeasured. Insets alter the sampled wall area.
The physical-reference deficit remains 2.2-12.8% on these shaded masks; this must
not be relabeled as 99% parity or concealed using the artistic control.

The corrected `reference` export now defaults to native surface materials at
32px/m. Explicit `surface-materials=off` remains the source-only diagnostic.
This prevents future reference runs from silently reverting to omitted procedural
wall appearance. The general city exporter remains opt-in. Dry-run verified the
effective defaults; existing 32px/m export/render validation covers that branch.

Updated `Reference.mjs`, `jobs.mjs`, `SurfaceMaterialAnalysis.mjs`,
`resolved_surface_analysis.py`, the reference README, `PROJECT_TOOLS.md`,
`specs/tools/bake_framework.md` and `specs/graphics/building_surface_reflections.md`.
The independent quadrature and geometric fixture are offline only. Four atlas
tests (including winding/metric continuity) and thirteen bake-framework tests
passed. Shader-source policy, JavaScript syntax and `git diff --check` passed;
the original selected-test file was restored byte-for-byte.

### Completion boundary for this incremental investigation

The demonstrated faults are corrected: lost bounce energy (v7), suppressed
opaque environment response (existing uniform toggle, now default On), and
unmatched procedural reference materials/UV convention (native surface export).
The remaining differences are now separated into authored AO policy, native
BRDF/environment-filter approximations, boundary/normal-map filtering, and known
dynamic/glass proxy limitations. A further global exposure or bake gain is
contradicted by sunlit controls, some of which already exceed Cycles.

This is not a claim that every renderer approximation is eliminated or that the
game has reached 99% full-image parity. Replacing native environment integration
would be a further rendering feature with its own performance validation; these
measurements do not authorize describing it as already implemented. Existing
glass/interior proxies remain excluded as requested. No extra complete rebake
was needed, no production asset was published during this pass, and nothing was
committed. The reference export consumes offline memory (7.50 GiB raw at 32px/m),
not game GPU memory. The earlier repeated runtime benchmark still applies to the
unchanged reflection-uniform correction; no new gameplay shader/texture workload
was introduced by the export or analysis work.

### Final evidence and reproduction

Final five-pose physical comparisons:
`tests/artifacts/screens/ai562_acesfilmic_reference_matching/ai568_resolved_analysis_20260913_04/pose_01.png`
through `pose_05.png`. The final analyzer took 30.9s. Its `images/` folder retains
each full-resolution game/Cycles image separately; `facades/` retains uncropped
wall selections, inspection crops and separately labeled authored-AO controls.
The same mask pixels and numerical results from `_03` are retained; `_04` makes
the wall control crops easier to inspect.

Independent close-up final pair:
`tests/artifacts/screens/ai562_acesfilmic_reference_matching/ai568_closeup_analysis_20260913_02/pose_custom.png`
(9.0s analysis; 87.3s original full/sun-only rendering). Visual review confirms
the same masonry/textures and pose; glass, bus BRDF and dynamic shadow differences
remain visible and excluded from opaque-material accuracy claims.

Commands below use PowerShell continuations; each stage is standalone and writes
to a **new** output path. Keep the shared framework lock and publication gates.
Existing authenticated artifact names are inputs, never overwrite destinations.

```powershell
$root = 'tests/artifacts/screens/ai562_acesfilmic_reference_matching'
$leaf = 'lighting/experiments/reference-matching/surface-analysis'
node tools/bake.mjs --target $leaf `
  --set "${leaf}:capture=$root/ai568_resolved_capture_20260913_01" `
  --set "${leaf}:reference=$root/ai568_surfaces_20260913_05" `
  --set "${leaf}:previous=$root/ai568_surfaces_20260913_04" `
  --set "${leaf}:transport=$root/ai568_global_glossy_20260913_01" `
  --set "${leaf}:output=$root/ai568_surface_analysis_new_run"

$leaf = 'lighting/experiments/reference-matching/specular-fixture'
node tools/bake.mjs --target $leaf `
  --set "${leaf}:input=$root/ai568_surfaces_20260913_05" `
  --set "${leaf}:capture=$root/ai568_resolved_capture_20260913_01" `
  --set "${leaf}:output=$root/ai568_specular_fixture_new_run"
```

The final specular fixture is `_06`; its `quadrature.json` and `analysis.json`
retain all 56 cells, both sample densities and explicit numerical checks. The
largest native angular-only discrepancy across the entire grid is 48.3% in a
glossy grazing-angle cell; this is an isolated reflection component, not whole-wall
brightness. Rough masonry values and all-five-pose residuals are given above.
The tools README documents fresh captures, exports and independent close-ups.

Final visual inspection covered the physical pairs for all five poses, the
independent close-up and the brick AO-control selection. Prompt-name validation
accepts this completed AI568 name but the repository-wide command still fails on
five pre-existing paths (AI524, AI525, AI497, AI498 and archived AI480); it also
warns about legacy archived names. Those unrelated prompts were not renamed.
This is a recorded validation limitation, not a passing repository-wide check.

## On completion

- Mark DONE on the first line only when the full agreed scope is complete; retain
  pending incremental requirements and explicit unresolved limitations otherwise.
- Rename to `prompts/AI_DONE_graphics_568_MATERIAL_game_cycles_opaque_surface_parity_DONE.md`.
- Do not archive automatically.
- Add a high-level summary of each accepted correction and links to final evidence.
- Any optimization/performance claim requires a same-condition before/after table
  with frame time/FPS, CPU/GPU statistics, draw calls, triangles, memory, hardware,
  resolution, graphics settings, pose/workload, warmup and sample count. State
  unavailable measurements and reasons; projections are not final results.
