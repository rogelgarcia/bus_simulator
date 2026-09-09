# AI 564 executed calibration contract

Executed 2026-09-09. This is an implemented fixture harness with measured outcomes, not a claim that the production city is physically calibrated. See the [tool contract and commands](../../tools/bake_lighting/experiments/physical_calibration/README.md) and [versioned reference definitions](../../tools/bake_lighting/experiments/physical_calibration/reference_manifest.json).

The initial execution is preserved below. The [finite-sun follow-up](#finite-sun-fix--2026-09-09) resolves its one failed check using an opt-in runtime filter and passes the expanded 38-check transport suite. Production shadow integration remains separate.

## Retained evidence

- [Executed comparison report](../../tests/artifacts/screens/ai564_physical_calibration/runs/2dd11c51b2c02ebe-1788939226588/report/index.html)
- [Raw results and actual implementation identities](../../tests/artifacts/screens/ai564_physical_calibration/runs/2dd11c51b2c02ebe-1788939226588/report/summary.json)
- [Machine-readable calibration contract](../../tests/artifacts/screens/ai564_physical_calibration/runs/2dd11c51b2c02ebe-1788939226588/report/contract.json)
- [Reusable 20-scene Blender file](../../tests/artifacts/screens/ai564_physical_calibration/runs/2dd11c51b2c02ebe-1788939226588/calibration.blend)
- [Acquired reference provenance and hashes](../../tests/artifacts/screens/ai564_physical_calibration/runs/2dd11c51b2c02ebe-1788939226588/references/manifest.json)
- [Measured-photo eligibility audit](../../tests/artifacts/screens/ai564_physical_calibration/runs/2dd11c51b2c02ebe-1788939226588/report/measured_reference.json)
- [Soft-shadow comparison](../../tests/artifacts/screens/ai564_physical_calibration/runs/2dd11c51b2c02ebe-1788939226588/qa/soft_shadow_comparison.png)

These generated artifacts are deliberately ignored. Fresh checkouts execute the tracked scripts to reproduce the report. Earlier failed launch attempts and the corrected undersized-environment-fixture run remain under the same ignored topic directory; they are not promoted reference results.

## Conditions and timings

Windows x64, NVIDIA GeForce RTX 3060; Blender 5.2.1 LTS / Cycles OptiX; Chrome 151.0.7922.176 / Three revision 183 (harness import map 0.183.2) through ANGLE D3D11. Four Blender CPU threads, 256 samples, seeds 564/565 for each of the 16 analytical fixtures. No denoiser or adaptive sampling. Analytical images 192×192; Cornell 384×384. Thirty-six Cycles renders and 17 game captures. Linear Rec.709/D65, presentation multiplier 1, no grading or auto-exposure.

| Stage | Wall time including launch |
| --- | ---: |
| Acquire and authenticate original references | 2.21s |
| Native game captures | 2.33s |
| Generate Blender scene file | 2.35s |
| Cycles render loop | 18.44s |
| Analysis | 2.33s |
| Final receipt | 0.03s |
| Framework total | **27.8s** |

The same full command subsequently authenticated and reused all six stages in **0.3s** (framework duration; about 0.7s including CLI startup). No render/browser process was launched during reuse. Review-page validation loaded all 58 images without errors or broken resources. The physical-calibration Node suite passed 5 tests, including 7 Python tests; shared bake-framework regression suite passed 12 tests.

The repository-wide prompt-name validator still reports five pre-existing errors in AI 480, 497, 498, 524 and 525, plus legacy archive warnings. AI 564's completed filename is compliant; unrelated prompt names were not changed. `git diff --check` passes.

## Results and interpretation

**31/32 transport checks passed.** Cycles passed all 16; the native renderer passed 15. Basic Lambertian scale, neutral/RGB reflectance, cosine response, point falloff, the CIE 171 5.2 axis-A geometric subset, known sRGB texture decoding and constant diffuse environment response are supported under the documented fixture scope.

The only failed transport check is native `finite_sun_far`: **14.54% relative RMSE**, despite an integrated energy ratio of **1.00071**. Cycles has **0.335% relative RMSE** and an energy ratio of **1.00083** against the same independent disc-visibility expectation. This is a distribution/shadow-profile mismatch, not a total light-power error. Native directional shadow filtering does not reproduce the fixture's finite emitter. The narrower-gap check passes the predefined image tolerance but does not establish finite-disc support. The 0.12-radian diagnostic emitter is deliberately larger than the real Sun.

The corrected native uniform environment differs by **0.269%** from its analytic expectation; Cycles differs by **0.00017%**. An earlier 32×16 HDR texture was below Three PMREM's supported cube-mip layout and produced black. The final 256×128 fixture fixes that harness error; it is not evidence of broken production IBL.

**6/6 input/display checks passed.** Native float and Cycles EXR vectors preserve HDR up to 16. Both HDR decoders recover the known RGBE sample within one quantization bin. Maximum display-vector absolute error: **0.001909 ACESFilmic**, **0.003369 AgX**, against a predefined 0.0045 limit. Both paths remain separately identified; their different appearance is not a pipeline error. Native ACES GLSL plus Blender OCIO config/LUT hashes are retained in the contract.

All **three injected faults** were detected: incorrect gamma, double light contribution, half radiance scale. High Monte Carlo noise also cannot turn an invalid reference into a pass. A report with `validated` handoffs can still contain physical failures; consumers must inspect `analyticalReferenceValid`, `displayContractValid`, `measurementValidated`, individual check results and scope.

## Measured and unsupported coverage

Cornell's original geometry, reflectance spectra, relative source spectrum, seven measured EXRs and all four linked source/camera/filter/lens MAT datasets were acquired, hashed and decoded. The three wavelength renders retain the published geometry and relative source normalization.

**Measured-photo agreement remains unavailable.** The downloaded photos appear to contain a reflective tall block and use different framing from the published diffuse-scene table; a valid material/camera pairing is not established. Response spectra also extend beyond available surface reflectance wavelengths. No per-image exposure fitting, speculative registration or invented measurement uncertainty was used. These monochromatic synthetic renders are useful transport references but not measured RGB truth or absolute sunlight calibration. The photo previews share a fixed gain solely for inspection.

Only CIE 171:2006 **5.2 on-axis A** is adapted from the accessible AGi32 implementation report. Full normative/errata coverage, off-axis photometry and remaining cases are omitted; no CIE conformity claim. Analytical agreement required no additional Radiance implementation to resolve disagreement in this subset.

Native captures isolate the actual GameEngine renderer's light/material/shadow/PMREM paths. They do not exercise production AO/compositing, city bakes, multi-bounce GI, local reflection visibility or arbitrary bus/building shaders. Cycles EXRs preserve contribution passes; the game isolates contributions by fixture construction. Those scope boundaries remain explicit in the contract.

## Next consumers

- **AI 565:** use the verified scalar mapping and color paths to define physically conditioned daylight and coherent sky/background/reflections; do not infer a calibrated sun power from current city presets or Cornell's relative spectrum.
- **AI 566:** establish actual asphalt/building/bus material reflectances, BRDF semantics, texture roles and exporter parity under neutral fixtures. Passing Lambertian checks does not validate glossy production materials.
- **AI 567:** gate fitting on reference eligibility and the relevant test results; preserve these independent checks while fitting bounded daylight/material choices.
- **AI 562:** address finite-source/contact-dependent shadow softness, production GI/visibility and material/export differences. In this fixture, increasing sun power cannot repair the shadow shape because its integrated energy already agrees. Keep the actual city and material-specific diagnosis separate from the isolated fixture result.

AI 564 does not modify city presets or publish/rebuild production lighting packages.

## Finite-sun fix — 2026-09-09

Explicit follow-up request: implement the fix for the failed check. Added the shared [FiniteSunShadow runtime adapter](finite_sun_shadow.md), using the native readable directional depth map, receiver-plane correction and a world-space penumbra derived from blocker separation and source angular size. Material hook ownership is preserved. A runtime regression also found and fixed native map-size changes leaving the old render-target dimensions in place.

The calibration selects this opt-in adapter only for finite-source fixtures. It does not replace the production PCF/CSM or baked-depth filter contracts. That integration and city-scale GPU validation remain AI 562 work. No analytical expectation, existing fixture geometry, pass tolerance, exposure or archived image was changed to make the check pass.

- [Corrected report: 38 passes, zero failures](../../tests/artifacts/screens/ai564_physical_calibration/runs/5ebb44ba35fe05ef-1788974749356/report/index.html)
- [Corrected raw measurements](../../tests/artifacts/screens/ai564_physical_calibration/runs/5ebb44ba35fe05ef-1788974749356/report/summary.json)
- [Corrected calibration contract](../../tests/artifacts/screens/ai564_physical_calibration/runs/5ebb44ba35fe05ef-1788974749356/report/contract.json)
- [Before / after / Cycles image](../../tests/artifacts/screens/ai564_physical_calibration/runs/5ebb44ba35fe05ef-1788974749356/qa/before_after.png)
- [Reusable 23-scene Blender file](../../tests/artifacts/screens/ai564_physical_calibration/runs/5ebb44ba35fe05ef-1788974749356/calibration.blend)
- [Lifecycle, profile and GPU timing evidence](../../tests/artifacts/screens/ai564_physical_calibration/finite_sun_fix/runtime.json)

| Finite-source native fixture | Relative RMSE | Result |
| --- | ---: | --- |
| Near: 0.3m gap, 0.12rad diameter | 0.329% | Pass |
| Far: 1m gap, 0.12rad diameter | **0.671%**, previously **14.542%** | Pass |
| Additional: 0.6m gap, 0.06rad diameter | 0.902% | Pass |
| Additional: 0.7m gap, 0.18rad diameter | 0.940% | Pass |
| Additional: 1m gap, 0.00925rad diameter | 1.113% | Pass |

All **38/38** transport results (19 native, 19 Cycles), **6/6** input/display results and all three injected-fault checks pass. The far-case native energy ratio is 1.000217; Cycles relative RMSE remains 0.335%. This fixes the shadow distribution rather than compensating with illumination or tone settings. Cornell measured-photo pairing, full CIE coverage and production interreflection remain unavailable/unsupported as before.

Full framework execution took **31.9 seconds**: references 3.5s, native capture 2.6s, Blender preparation 2.7s, render 20.2s, analysis 2.6s (rounded independently). It produced 42 EXRs and 20 native captures using the original RTX 3060 / OptiX, 256-sample, two-seed conditions. Browser review verified all 67 report images and all 44 passing result cells, with no broken images or page errors.

The targeted Chrome runtime test passes: a 10–90% shadow transition grows from 0.03125m at the near gap to 0.10417m at the far gap; halving angular diameter gives 0.05208m. Frustum/zoom changes preserve that width, and resizing 2048² →1024² →2048² restores the original profile. Twenty detach/attach cycles preserve exact pixels, map/depth object identity and the companion shader hook. Angle edits introduce no shader variants; toggling uses one additional cached native variant. Lambert, Phong, Standard and Physical materials compile, including shadows disabled. Unsupported sampler/light modes and duplicate material ownership are rejected.

GPU timing on RTX 3060 / ANGLE D3D11, Three r183, 1280×720, 2048² shadow map, 24 measured frames per mode after warm-up: fixed PCF median **0.1495ms** (p95 0.1587ms), finite sun **0.4936ms** (p95 0.4987ms). CPU render-submission medians were about 0.10ms for both. These numbers include the native shadow update for a two-plane fixture, not a city or whole-engine budget. The quality filter costs approximately 0.34ms more in this workload. GPU queries yield while pending and are deleted; there is no CPU depth-readback loop in the runtime adapter.

The physical-calibration selected test passes 5 Node tests including 7 Python tests. `git diff --check` passes. Generated evidence remains ignored, and the completed AI 564 checklist is retained unchanged with this follow-up recorded separately.
