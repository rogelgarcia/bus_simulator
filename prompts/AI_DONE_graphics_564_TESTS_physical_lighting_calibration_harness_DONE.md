DONE

# Problem

The city experiments compare plausible pictures without establishing whether the light transport, material inputs or color pipeline are correct. Matching a gray card to the existing scene only reproduces that scene's scale. An attractive generated image cannot establish physical accuracy, and a generic Cornell-box demo is not equivalent to Cornell's measured experiment.

# Request

Implement and execute a reproducible calibration harness grounded in independent analytical results and measured reference data. Establish which parts of the Blender/export/game pipeline are trustworthy before calibrating city lighting. Follow the planned contract in `specs/graphics/lighting_calibration.md`. This is the prerequisite for AI 565, AI 566 and AI 567; AI 562 retains ownership of production lighting integration.

Tasks:

- [x] Acquire and version a reference manifest for the original [Cornell Box dataset](https://bowers.cornell.edu/computer-graphics/data), including geometry, units, camera, measured reflectance spectra, source spectrum and the available measured images/camera response. Record URLs, hashes, license/access conditions and any conversion. Preserve measured geometry rather than substituting an ideal box. Unavailable measurements must be reported; a synthetic reference must never be labeled a measurement.
- [x] Document the source's relative spectral scale and the limitations of an RGB renderer reproducing a spectral/camera-filter experiment. Declare one justified normalization and uncertainty before comparison. Do not infer absolute solar watts from relative source data or independently fit exposure for every output. Keep any spectral reference adapter optional and explicit if required for a particular comparison.
- [x] Provide small analytical fixtures with independently calculated expectations: Lambertian radiance under known irradiance, cosine response, point-source distance falloff, uniform-environment diffuse response, opaque visibility and finite-emitter shadow profiles. Include neutral reflectance steps and RGB/color samples with documented definitions. Separate fixture physics from the production material shader so a glossy dielectric is not incorrectly tested as a pure Lambertian surface.
- [x] Inspect [CIE 171:2006](https://www.cie.co.at/publications/test-cases-assess-accuracy-lighting-computer-programs), its available case definitions and applicable errata. Implement a useful, explicitly identified subset when the definitions and expected values are accessible. List cases, edition, dependencies and omitted cases. Do not claim CIE certification or complete conformance from its abstract or a guessed reconstruction; do not make paid access a hidden prerequisite for the analytical harness.
- [x] Pin scene-linear primaries/white point, texture decoding, HDR decoding, radiance scale, camera projection, exposure, output encoding and the exact installed Three.js ACESFilmic implementation. Add a separately pinned Blender AgX/OCIO display path. Disable creative grading for validation. Evaluate raw linear values before evaluating either display transform; validate the display transforms with known input vectors rather than visual resemblance.
- [x] Run the fixtures in Cycles and the actual game renderer's deterministic test harness, with isolated direct, indirect and reflection outputs where supported. Record unsupported transport explicitly. Establish honest renderer capability/error results without requiring all production GI/shadow limitations to be solved here; forward those failures to AI 562. Cross-check a bounded transport case with an independent implementation such as [Radiance](https://github.com/LBNL-ETA/Radiance) when needed to resolve disagreement, recording its configuration rather than treating its defaults as truth.
- [x] Establish tolerances from analytic accuracy, measurement uncertainty, spectral approximation, image registration and Monte Carlo noise before scoring candidates. Report absolute and relative errors, energy ratios and confidence/noise estimates on appropriate masks. Demonstrate that injected gamma errors, a doubled light contribution and an incorrect scale are detected. A failing or unavailable reference must not silently become a passing baseline.
- [x] Provide independently callable scene generation/export, render/capture and analysis stages registered under the existing `node tools/bake.mjs` experiment hierarchy. Reuse `tools/baking/blender.local.json`. Track scripts, fixture definitions, reference manifests, schemas and defaults; keep downloaded bulk datasets and generated `.blend`, EXR, screenshots and reports under `tests/artifacts/screens/ai564_physical_calibration/`, ignored by Git. Register tools and update framework/spec documentation.
- [x] Execute the complete supported suite, preserve the reusable scenes and evidence, and produce a clear report of verified behavior, actual mismatches and unavailable coverage. Publish the resulting calibration contract for subsequent AIs. Do not change city presets or publish production bake packages as part of this task.

## On completion

- Mark the document DONE on its first line only after implementing and executing the supported harness with honest coverage/results.
- Rename it in `prompts/` to `AI_DONE_graphics_564_TESTS_physical_lighting_calibration_harness_DONE.md`; do not archive automatically.
- Add a high-level one-line summary per completed change and link the executed report, reference provenance and unresolved renderer limitations.
- Report measured stage/total durations, hardware, renderer versions and sampling conditions. Clearly distinguish a working test harness from a renderer that passes every physical test.

## Implemented and executed — 2026-09-09

- Added independent analytic fixtures, native GameEngine captures, a reusable 20-scene Blender file and authenticated standalone experiment stages.
- Imported and pinned original Cornell geometry/spectra, seven camera EXRs and four response datasets; retained the material/camera pairing limitation as unavailable measured comparison.
- Implemented the accessible CIE 171:2006 5.2 axis-A geometric subset with explicit omissions and no conformance claim.
- Validated linear/sRGB/HDR handling, exact native ACESFilmic and pinned Blender AgX; gamma, duplicate-light and scale faults are detected.
- Executed 36 Cycles renders and 17 native captures: 31/32 transport checks and 6/6 input/display checks pass; the finite-source shadow mismatch remains assigned to AI 562.
- Added artifact-tampering, lifecycle, mathematical and MAT-decoding tests; physical-calibration suite passes 5 Node tests including 7 Python tests, and shared framework suite passes 12 tests.
- Registered tools and documented the calibration contract and handoff. Production lighting and presets were not changed.

Final full run: **27.8 seconds**, RTX 3060 / Cycles OptiX, Blender 5.2.1 LTS, 256 samples, two analytical seeds, four CPU threads. Authenticated reuse: **0.3 seconds**. Stage timings, reference eligibility and unresolved renderer limitations are documented in the [executed results](../specs/graphics/physical_calibration_results.md).

[Report and comparisons](../tests/artifacts/screens/ai564_physical_calibration/runs/2dd11c51b2c02ebe-1788939226588/report/index.html) · [Reference provenance](../tests/artifacts/screens/ai564_physical_calibration/runs/2dd11c51b2c02ebe-1788939226588/references/manifest.json) · [Calibration contract](../tests/artifacts/screens/ai564_physical_calibration/runs/2dd11c51b2c02ebe-1788939226588/report/contract.json)

## Requested follow-up — failed finite-sun check

- [x] Implement a reusable runtime fix for `finite_sun_far`, preserve the independent equations/tolerances and original evidence, and rerun the suite. Added an opt-in native-depth PCSS adapter with world-space contact hardening and map-resize handling. Far-case error fell from 14.54% to 0.67%; the expanded suite passes 38/38 transport and 6/6 input/display checks in 31.9 seconds. Shader lifecycle, source-size/gap behavior and measured GPU cost are verified. Production CSM/baked integration remains AI 562's responsibility.

[Follow-up results and scope](../specs/graphics/physical_calibration_results.md#finite-sun-fix--2026-09-09) · [Before / after / Cycles](../tests/artifacts/screens/ai564_physical_calibration/runs/5ebb44ba35fe05ef-1788974749356/qa/before_after.png)
