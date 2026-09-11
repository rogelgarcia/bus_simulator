# Coherent daylight calibration (AI 565)

An offline experiment using Blender 5.2.1 multiple scattering for coherent sunlight, sky illumination, background and reflections. It preserves production lighting and baked assets. The three tracked conditions in `defaults.json` are clear, hazy and a normalized CIE overcast sky; the latter's D65 color is an explicit assumption.

## Execute

Use the shared ignored `tools/baking/blender.local.json`, including Blender, Python, browser and OPTIX/CPU configuration. The city must be a validated AI 560 export; the AI 564 report must have no unresolved calibration failures.

```powershell
$target = 'lighting/experiments/daylight-calibration'
node tools/bake.mjs --target $target `
  --set "${target}:source-run=tests/artifacts/screens/illumination_560/runs/<baseline-run>" `
  --set "${target}:source-scene=tests/artifacts/screens/illumination_560/scene/<scene-key>/scene_manifest.json" `
  --set "${target}:calibration-run=tests/artifacts/screens/ai564_physical_calibration/runs/<passing-run>" `
  --set "${target}:legacy-run=tests/artifacts/screens/ai563_sun_sky_ratios/<ratio-run>"
```

`legacy-run` is optional and preserves all six AI 563 controls with their original display metadata. It is recommended for historical comparison. The game baseline remains mandatory. The target runs preparation, rendering, native capture and analysis sequentially and records total execution time.

Each stage is independently callable. Preparation takes the same input options under its own target name. Render/capture/analyze take the output directory produced by preparation:

```powershell
$stage = 'lighting/experiments/daylight-calibration/render'
node tools/bake.mjs --target $stage --set "${stage}:output=tests/artifacts/screens/ai565_daylight_calibration/runs/<run>"
```

Replace `/render` with `/capture` or `/analyze` to execute those stages. `/analyze` also accepts `legacy-run`. Preparation writes a new run; it refuses to overwrite an existing request. The renderer resumes individual EXRs only with matching render signatures and hashes. Every stage authenticates its required upstream receipts. Changed prepared Blender scripts require a new run.

`/fixtures` can create a new calibration measurement revision without regenerating unchanged city transport. It preserves the original fixtures, writes a new `.blend` and EXRs under `fixture_revisions/`, and records the selected revision. Run `/capture` again after a native fixture change, then `/analyze`; native captures also use versioned directories. This is for test-geometry corrections, not reuse of city renders after changing daylight inputs. The analyzer uses the authenticated selected fixture revision.

Headed isolated Blender is the default and exits after the stage. If the user's Blender is occupied, explicitly select `--set "${stage}:mode=background"` for a separate process. Work uses four CPU threads and one configured GPU; scripts never terminate an unrelated browser or Blender session.

## Outputs and validation

All output stays beneath ignored `tests/artifacts/screens/ai565_daylight_calibration/`:

- `inputs/`: authenticated city identities, original pose JSON and legacy lighting audit.
- `baselines/`: ten unaltered game screenshots and metadata, with the existing accepted bakes and grading off.
- `environments/`: disc-free sky EXRs, native Float32 equirectangular textures, fine solar-disc measurements and preflight receiver renders.
- `daylight.json`: irradiance, sun direction, sky chromaticities and the single global exposure multiplier.
- `daylight_fixtures.blend`, `daylight_city.blend`: reusable calibration/city files; all five cameras and four bus placements are retained.
- `fixtures/`, `city/`, `game/`: raw Cycles EXRs, material modes, native linear captures and display previews.
- `report/`: pose-grouped ACESFilmic/AgX comparisons, multi-selection, keyboard carousel, metrics, limitations and `daylight_profile.json` for AI 562/567.

The city matrix is 3 conditions × 5 poses × 2 material modes = 30 transport renders, each shown with both display operators. Raw scene-linear data is never tone mapped in Blender before export. ACESFilmic is the pinned Three.js r183 operator applied to those pixels; AgX comes from the export's authenticated Blender OCIO configuration, look None. Exposure is derived once from the clear horizontal 18% card, then frozen across conditions, poses and tones.

Overcast is **CIE S011/E:2003 / ISO15469:2004**, not the 2024 DIS. Its relative distribution is not a spectral blue-sky standard. See [physical daylight contract](../../../../specs/graphics/daylight_calibration.md) for spectra, conversions, source links, sunlight ownership and limitations.

Native fixtures measure the renderer in isolation. They do not claim current city GI or local-reflection parity. The neutral city variant intentionally replaces alpha/transmission/emission with opaque Lambertian surfaces; it is a geometry diagnostic. AI 566 material calibration must precede final city acceptance. No experiment output auto-publishes or reuses an incompatible production bake.

## Bright afternoon comparison

`afternoon.json` defines a separate higher-sun experiment. It retains the historical
35° calibration and compares 55° (the intended bright-afternoon target) and 65°.
Clock time is not inferred without a location and date. Solar noon has the highest
solar elevation; the phrase “3 pm” describes the requested visual character here.

```powershell
$stage = 'lighting/experiments/daylight-calibration/afternoon'
node tools/bake.mjs --target $stage `
  --set "${stage}:source-run=tests/artifacts/screens/ai567_automated_calibration/runs/calibration-02" `
  --set "${stage}:output=tests/artifacts/screens/ai565_daylight_calibration/afternoon/<new-run>"
```

The registered leaf authenticates the completed AI567 scene, material/display
implementation and raw finalist renders. It remeasures 35° sun/sky against that
reference, verifies the spectral sun integral/direction and three neutral receivers
at each angle, and then renders ten new city images. All five poses keep their
shared-bus exclusions. ACESFilmic and AgX use exactly the original finalist's
global exposure; the physically derived neutral-card exposures are reported but
not applied separately to the pictures. Sun diameter, azimuth, atmosphere, materials
and white balance remain fixed. There is no extra sunlight or hemisphere fill.

Outputs include `source_city.blend`, reusable `afternoon_city.blend`, raw EXRs,
`afternoon_profile.json`, measured timings and `report/index.html`. Existing output
directories are refused. This comparison does not certify native rendering at new
angles or modify production lighting/bakes. See [afternoon results](../../../../specs/graphics/afternoon_daylight.md).

## Executed evidence

[AI 565 results](../../../../specs/graphics/daylight_calibration_results.md) record 86 passing checks, the complete five-pose matrix, measured stage times and remaining native limitations. If `fixture_revision.json` exists, its scene and raw records supersede the initial `daylight_fixtures.blend` for measurement review; older revisions remain historical evidence. Serve the report through the repository's HTTP server because its viewer loads `gallery.json` with fetch.
