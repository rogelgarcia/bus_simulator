# Southwest façade lighting comparison

The user reported shaded buildings remaining darker after the dirt-strip bake
compatibility repair. This investigation isolates material AO and diffuse
lighting at the exact supplied southwest pose, with ACESFilmic exposure held at
0.0511001705221839 and the installed compatible bake fully applied.

## Reproduction

- Reference: `tests/artifacts/screens/ai562_acesfilmic_reference_matching/pose_comparison_20260912_southwest_baked/`.
- Registered diagnostic: `lighting/experiments/reference-matching/material-diagnostics`.
- Regions: `tests/artifacts/screens/ai562_acesfilmic_reference_matching/poses/southwest_material_regions.json`.
- Fresh isolated Chrome; repository defaults; no personal settings, production
  changes, forced compatibility, or new bake.
- Capture raw beauty, material AO off, diffuse-only with/without material AO,
  base color, and repeated original. Reuse the authenticated Cycles EXR lobes.
- Material texture AO is separate from screen-space and bus contact AO. Raw
  captures bypass postprocessing; full default screenshots are retained separately.

## Evidence and controls

The façade ray samples have valid active receiver atlas coordinates. Their
`aoMapIntensity` is 1, normal-map strength is 0.9, roughness is 0.85, and
`envMapIntensity` is 0. The exporter drops material AO textures and Cycles retains
Principled reflections. Neither fact alone establishes its share of the gap;
use the measured AO and diffuse passes.

The initial `southwest_material_diagnostics_01` run failed because the diagnostic
used the Standard shader's `totalDiffuse` variable on Phong materials. It was
corrected to the shared `reflectedLight.directDiffuse + indirectDiffuse` fields.
The failed run is retained and is not a validated comparison.

The second capture had no browser errors, but its stats bar reserved 24 pixels
of canvas height. The analyser rejected the 1920×1056 / 1920×1080 mismatch. The
capture now uses the established performance-bar hiding API and asserts the
actual canvas dimensions before drawing. These mismatched images are excluded.
The analyser also no longer depends on Pillow, which is absent from the shared
Blender Python runtime; captions are composed using the configured browser.

Validation: the existing bake framework's 13 tests and material hook registry's
8 tests pass. The visual job separately requires zero browser shader errors,
matching exposure, active indirect lighting, unchanged settings/pose/source hashes,
and matching original/restored radiance in the static building regions.

## Validated outcome

`southwest_material_diagnostics_03` completed in 276.5 seconds. The 1920×1080
capture has zero browser errors, fully active indirect lighting, identical
original/repeated static radiance (maximum difference 0), and unchanged pose,
lighting, AO settings, source hashes and saved preferences. The authenticated
reference EXR was reused; no new Cycles render or production rebake was needed.

Numbers below are mean scene-linear luminance over the dominant opaque material
mask in each region, eroded by two pixels. Windows are excluded: the game's
brighter glass otherwise conceals the darker brick in whole-façade averages.

| Material | Game beauty | Game AO off | Cycles beauty | Game diffuse, AO off | Cycles diffuse |
| --- | ---: | ---: | ---: | ---: | ---: |
| Brick `MAT_396` | 0.4092 | 0.4420 | 0.6286 | 0.4390 | 0.5178 |
| Dark stone `MAT_395` | 0.1199 | 0.1264 | 0.3647 | 0.1236 | 0.1403 |
| Right wall `MAT_685` | 0.6371 | 0.7188 | 0.8909 | 0.7160 | 0.7917 |

- Removing material AO brightens the brick by 8.0%, stone by 5.4%, and right wall
  by 12.8%. It does not close the gap.
- The dark stone's difference is dominated by reflected light. Subtracting the
  diffuse lobe from each beauty image attributes about 90% of that brightness
  gap to the residual non-diffuse component, versus about half for the brick.
  These are approximate lobe contributions: Cycles Combined is denoised, while
  its separated lighting passes retain sampling noise.
- Surface samples report `envMapIntensity: 0`. `disableIblOnMaterial` in
  `BuildingFabricationGenerator.js` (and the legacy generator) explicitly sets
  this and prevents automatic IBL intensity assignment. Cycles Principled still
  reflects the environment. Baked diffuse does not restore that specular lobe.
- Even with AO removed and reflections excluded, game diffuse is 15.2% below
  Cycles on `MAT_396`, 17.2% below on adjacent `MAT_397`, 11.9% below on the stone,
  and 9.6% below on the right wall. This remaining transport/BRDF difference has
  not yet been isolated between geometric-normal baking, authored normal response,
  and scene-export differences. It is not evidence to multiply all lighting.
- The main brick and stone base-color luminances agree within roughly 1.1%, so
  a large wrong-albedo multiplier is not the explanation for these two masks.
  Cycles Diffuse Color is a BSDF-weighted diagnostic, not an exact base-color AOV.
- The existing Cycles export's grass/road overlap and window approximations remain
  visible. They are limitations of the reference and can affect transported light.

Use `ao_comparison_facade.png` and `diffuse_comparison_facade.png` in the validated
directory for the side-by-side evidence. Full-size individual passes and all
material/region measurements are retained there. No game defaults or materials
were changed by this investigation.

## Opaque-reflection and geometry control follow-up

- Added an off-by-default opaque building environment toggle, independent of
  windows. It preserves authored materials and changes only their reflection
  intensity uniform; no new cubemap, texture or shader variant is created.
- Options state skips window material application when only the opaque toggle
  changes. This prevents unrelated window changes and bake invalidation.
- Added export-only subtraction of actual asphalt triangle coverage from
  coplanar GroundTiles. UVs and other vertex attributes are interpolated at cuts.
- Added three independently runnable registered review stages: capture/render/
  analysis. Captures repeat both settings in two fresh sequential browsers;
  rendering compares full Cycles with primary geometric Lambert at the same poses.
- Unit checks: 4/4 new material/clipping tests and 7/7 existing preset tests pass.
- Current evidence directory: `building_review_20260912_capture_01` under the
  AI562 artifact root. Six initial pose captures validated; fresh-browser timing
  repeat and corrected Cycles evidence are pending. No production rebake or
  publication was initiated.
- Actual Options end-to-end check passed (2.2 minutes): eight alternating toggles
  kept baked mode active with activation blend 1, material identity/version and
  authored inputs remained intact, Save persisted, Cancel restored, Use defaults
  cleared the override. Existing preset tests 7/7 and framework tests 13/13 pass.
- Capture 01 completed all samples and raw passes in 805.128 seconds, but its outer
  framework run failed the final code stability check because `jobs.mjs` gained
  the analysis-stage registration during execution. This is preliminary evidence,
  not the accepted workflow result. No production gate was bypassed.
- Capture 02 repeats the complete experiment with all script sources frozen;
  renderer and analyzer execute sequentially afterward. Keep both iterations.

### Accepted follow-up results, 2026-09-12

- Accepted capture: `building_review_20260912_capture_02` (771.109 seconds).
  All five canonical poses have four passes per variant across two fresh
  browsers; the supplied southwest pose has two passes per variant.
- Accepted reference: `building_review_20260912_render_02` (524.2 seconds).
  Six full Cycles views and six primary geometric-normal Lambert controls,
  plus the existing two sun-only diagnostic views. Camera validation passed
  133 checks with maximum projection error 0.000662 pixel.
- Final analysis and three-way image sheets:
  `building_review_20260912_analysis_04`. Earlier analysis iterations remain.
  All paths above are under `tests/artifacts/screens/ai562_acesfilmic_reference_matching/`.
- Export-only clipping removed 10,216.824 square meters of coplanar grass/asphalt
  overlap from 273 GroundTiles meshes. Road grass artifacts are absent from the
  inspected full references. The game geometry was not changed.
- GPU median original/reflections in milliseconds: pose 01 11.05/11.09,
  02 10.40/10.36, 03 10.27/10.28, 04 8.75/8.79, 05 7.95/7.97,
  custom 12.28/12.28. The largest canonical median change is 0.042 ms;
  this experiment finds no meaningful added GPU cost. Calls, triangles,
  texture/geometry counts and shader-program counts match each variant.
  No new texture or render target is allocated; exact driver memory is unmeasured.
- On the custom pose's eroded opaque masks, the optional reflections reduce
  mean absolute display RGB error versus the full Cycles target by 40.2%/40.5%
  for the main brick materials, 64.3% for dark stone, and 35.8% for the right
  wall. These local error reductions do not establish full-scene parity.
- With game material AO removed, brick diffuse remains 13.4%/16.5% below
  the full Cycles diffuse lobe, and 16.3%/19.3% below the geometric Lambert
  control. The true-normal control does not close the gap. Dark stone remains
  10.7% below full diffuse and 12.6% below the geometric control.
  Therefore authored normal response alone is not the missing energy source.
- Keep the new opaque-reflection option off by default. Global PMREM lacks
  local specular occlusion and parallax; glass/export approximations remain
  visible, and the diffuse transport mismatch is unresolved. The justified
  next diagnostic is tracing identical receiver irradiance through offline
  sampling, atlas encoding, runtime decoding and shader composition, with
  remaining source-scene differences controlled. Do not compensate globally
  with exposure or claim another production rebake would fix it yet.
- Validation: four new unit checks, seven preset checks, thirteen framework
  checks and the actual-game Options end-to-end check pass (25 total).
  No production rebake, publication or commit was performed in this follow-up.
