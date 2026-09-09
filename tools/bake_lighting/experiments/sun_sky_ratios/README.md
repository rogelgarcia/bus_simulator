# Sun-to-sky ratio experiment (AI 563)

Run from an **explicit existing AI 560 source run**:

```sh
node tools/bake_lighting/experiments/sun_sky_ratios/run.mjs --set lighting/experiments/sun-sky-ratios:source-run=tests/artifacts/screens/illumination_560/runs/<run-id>
```

Equivalent shared entry: `node tools/bake.mjs --target lighting/experiments/sun-sky-ratios`
with the same scoped option. `--dry-run` lists the plan. This diagnostic is excluded
from `all` and rejects `--publish`. Nothing is installed into the game. The city,
materials, cameras and stored bus placements come from the authenticated saved
Blender export; the game and city exporter are never launched.

Use shared ignored `tools/baking/blender.local.json`: pinned `executable`,
`pythonExecutable` (NumPy, OpenImageIO, PyOpenColorIO), `browserExecutable`, and
`renderDevice`. The existing framework bounds CPU threads, serializes GPU jobs,
isolates background Blender and browser processes, and owns cancellation/timeouts.
Do not launch alongside another GPU render. The browser only captures the local
report with GPU disabled. It closes after generating contact sheets.

## Files and stages

- `defaults.json`: tracked sun/sky recipes, display transforms, exposure brackets,
  sampling and fixed inspection regions.
- `Plan.mjs`: validated ratio matrix and artifact boundaries.
- `Experiment.mjs`: scene authentication, generated lighting/render request,
  native baseline reuse, rendering and review orchestration.
- Existing AI 560 `render/`: actual sequential Cycles renders, calibration scene,
  source separation, EXR validation and resumable per-image receipts.
- `process.py` / `measure.py`: calibrated display images, measurements and checks.
- `gallery.html`, `gallery.css`, `gallery.js`: two tone columns, per-tone 0.5 EV
  offset controls, fixed/matched exposure modes, native baseline and image selection.
  Select any saved images, then use the bottom tray for a two-up/2×2 comparison or
  a single-image carousel. More than four selections use paged grids; the bottom
  configuration menu and thumbnails retain every selection. Left/right keys
  navigate images or groups, Escape closes. Selections retain exact pose, tone,
  mode and exposure even when the gallery controls change. Closing retains the
  selection for the current page session; Remove/Clear explicitly changes it.
- `sheets.mjs`: browser-generated labeled sheets and gallery interaction checks.

Outputs default to `tests/artifacts/screens/ai563_sun_sky_ratios/<identity>/`.
The identity includes scene, code, recipes, sampling, poses, device and Blender
executable. Raw EXRs have their own authenticated keys. Original AI 560 outputs
are never overwritten. Keep all generated images, configurations, copied baseline
receipts, scenes, EXRs, metrics and manifests gitignored; code/defaults stay tracked.

`inputs/experiment.json` and `inputs/lighting.json` contain the effective recipes.
`linear/pilot/` retains the linear renders, Sun/Sky groups, calibration card and
reusable `lighting_reference.blend`. `report/index.html` groups each pose into six
lighting rows and two tone columns. `report/pose_XX_comparison.png` are contact
sheets; the 240 display PNGs include three compensated offsets and fixed 0 EV.
`report/pose_XX_source_vs_2x.png` provides compact two-row, two-tone comparisons.
Ten existing grading-off native game screenshots are copied with authenticated
receipts. `summary.json` / `metrics.csv` contain exposure, clipping, luminance,
source groups and fixed-region measurements. `execution.json` records wall time;
path-tracing seconds are separately reported. Neither is a runtime FPS benchmark.

## Method

Six configurations: source, 2x/4x/8x sun at fixed environment, 4x sun with 1.5x
environment, and a uniform 4x-radiance control. Sun angle/direction and materials
stay fixed. The environment includes the source HDRI and hemisphere approximation;
the photographed sun is removed and one Sun owns direct sunlight and its bounces.
The camera gradient scales with the environment. Only the uniform control scales
emissive materials, so all linear contributions obey its expected invariance.

For each configuration, Cycles renders the same horizontal 18% gray card. Its
measured luminance gives `EV = log2(source card / candidate card)`, applied across
every pose and both tones. This matches a controlled sunlit surface; it does not
force all differently oriented façades to equal brightness. Matched images have
additional -0.5/0/+0.5 EV options. Fixed mode applies no compensation. Both tones
use exposure multiplier 1.02 before their transform. ACESFilmic uses the exact
Three.js r183 fit; AgX uses the saved Blender OCIO configuration and base Look.
Color grading is off. AgX is not the game's AgX approximation; native captures are
identified separately. No tone-specific or pose-specific automatic exposure fit.

Increasing sunlight changes source balance, including reflected/bounced sunlight.
Uniformly scaling all radiance and inversely scaling exposure should preserve the
image. The control checks all five poses in both tones, allowing a small declared
noise/denoising residual (encoded RGB RMSE <= 0.012). It fails the run if exceeded.
The fixed boxes aid visual review; they are not ground-truth shadow segmentation or
photorealism scores. Source hemisphere fill, window interiors, bus BRDF translation
and grass reflections retain the original export's documented approximations.

## Resume and review

Repeat the same command to authenticate and reuse completed EXRs. Optional scoped
`poses=pose_02,pose_03`, `output=<AI563 artifact directory>`, `--samples` and
`--device` are supported. Different recipes/sampling need new captures; exposure
and report changes can use the saved linear data.

```sh
node tools/bake.mjs --target lighting/experiments/sun-sky-ratios/review --set lighting/experiments/sun-sky-ratios:output=tests/artifacts/screens/ai563_sun_sky_ratios/<identity>
```

Review uses the run's snapshotted configuration, authenticates the EXRs and scene,
and starts only Python and the report browser. It does not rerender or rewrite the
source Blender file. Open the HTML directly or through the existing local server.

Optional `<output>/references.json` adds supplied visual targets to the review:
`{"images":[{"id":"pose03_target","pose":"pose_03","label":"Sunny target",
"file":"references/target.png","sha256":"<SHA-256>"}]}`. Keep the originals
inside that ignored output directory. Review validates paths, pose and hash,
copies them into the report and marks them as uncalibrated visual targets.
They participate in selection and comparison, but never in render measurements
or calibration. They may contain different geometry, materials or composition.

Validation: select `tests/node/unit/sun_sky_experiment.test.js` using
`node tools/run_selected_test/run.mjs --set <file>`, then run the selected-test runner.
The real experiment also validates EXRs, control invariance and gallery behavior.
Selection and comparison checks: `tests/headless/e2e/sun_sky_gallery.pwtest.js`.
Set `AI563_GALLERY` to a completed report for real-image UI captures as well.
