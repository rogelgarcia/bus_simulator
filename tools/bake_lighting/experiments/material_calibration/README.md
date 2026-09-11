# Material calibration (AI 566)

An explicit, isolated bake experiment. Runtime inventory, material profiles, neutral fixtures, daylight comparisons and reports belong here. Production material assets and accepted bakes are never overwritten or published. Use the shared ignored `tools/baking/blender.local.json`.

Run the complete workflow:

```powershell
node tools/bake.mjs --target lighting/experiments/material-calibration --set lighting/experiments/material-calibration:daylight-run=tests/artifacts/screens/ai565_daylight_calibration/runs/daylight-07 --set lighting/experiments/material-calibration:output=tests/artifacts/screens/ai566_material_calibration/runs/my-run
```

Use a new output directory. Chrome needs the game's existing public CDN modules. The game audit waits for the installed baked data; it does not load the user's browser profile. Headed Blender is preferred when available. An occupied session requires explicit `mode=background` on the requested bake target for an isolated process. Never terminate someone else's Blender/Chrome.

| Stage | Input | Output |
| --- | --- | --- |
| `audit` | `daylight-run` | Actual runtime materials, textures, source/export correspondence, bake status and authenticated input receipt |
| `prepare` | `output` from audit | Tracked defaults/profiles resolved against sources, `fixtures.blend`, `material_city.blend`, original/candidate bindings and conversion log |
| `capture` | `output` from prepare | Final shader parameter probes, all eight reflection-toggle combinations repeated three times, native neutral swatch/sphere diffuse/specular passes |
| `render` | `output` from prepare | Fifteen neutral fixture frames and thirty city EXRs: two candidates × three daylight conditions × five poses |
| `analyze` | `output` with render/capture receipts | Raw lobe checks, source-isolated sun/sky statistics, material ratios, ACESFilmic/AgX comparisons, correction report and contact sheets |

For an individual stage, append `/stage` to the target and scope its `--set` options to that complete target. `prepare`/`render` accept `mode=headed|background`. `audit` also accepts `audit-run=<authenticated-AI566-run>` to reuse unchanged source data in a new run; it rechecks source files and preserves the earlier run. This avoids repeating the heavy game startup when only a laboratory adapter changes.

Examples:

```powershell
node tools/bake.mjs --target lighting/experiments/material-calibration/capture --set lighting/experiments/material-calibration/capture:output=tests/artifacts/screens/ai566_material_calibration/runs/my-run
node tools/bake.mjs --target lighting/experiments/material-calibration/render --set lighting/experiments/material-calibration/render:output=tests/artifacts/screens/ai566_material_calibration/runs/my-run
node tools/bake.mjs --target lighting/experiments/material-calibration/analyze --set lighting/experiments/material-calibration/analyze:output=tests/artifacts/screens/ai566_material_calibration/runs/my-run
```

Runtime parameter probes keep original mesh UVs, vertex/instance tint and shader hooks. They are projected samples, not an exhaustive material atlas. Resource references are shared deliberately: Three.js's default JSON clone of baked user data can allocate enormous texture arrays, and bus rig controller state is circular. The diagnostic clones exclude controller metadata; live material references are restored synchronously. Native raw fixture readbacks stream to disk rather than building a single huge JSON message.

The neutral inputs include original-export and plausible-material swatches. Constant sky radiance is 1 and sun normal irradiance is π, with 35° incidence and 20°/35°/80° views. Diffuse/specular lobes and source-isolated sun/sky runs are distinct measurements. Original city EXRs and all ten game screenshots are reused from authenticated AI565 evidence; game screenshots retain their legacy illumination and are not equal-light comparisons.

`profiles.json` separates verified generated-asphalt normal-channel and F0 unit-conversion corrections from optional dry-surface/dielectric choices. `export_contract.json` defines the non-emissive opaque window substitute, with AI562 owning production integration. `references.json` declares sample provenance and uncertainty. The report retains AO/color correlation, alpha-mode limitations and known linear-noise exceptions. See [material calibration spec](../../../../specs/graphics/material_calibration.md) and [executed results](../../../../specs/graphics/material_calibration_results.md).

Render receipts include immutable scene/experiment hashes. Input changes require a new prepared run; completed raw renders can resume only with matching identities. No publication path exists. Review-band BRDF differences and unsupported material identity remain explicit even when the harness checks pass. Stage timings are saved with the outputs; production FPS/frame-time is not claimed for offline-only changes.

The native constant environment is 512×256, above the CubeUV minimum mip layout. Its neutral card is checked against analytical radiance, so an unavailable/black environment fails validation. Cycles lobe-conservation checks exclude a two-pixel material-index margin where antialiased world radiance mixes with surfaces. Reanalysis preserves prior reports under `analysis_attempts/`; original captures and raw renders remain separate.

All artifacts stay under `tests/artifacts/screens/ai566_material_calibration/`. Reference values constrain sample plausibility; they do not identify the actual city assets as measured samples.
