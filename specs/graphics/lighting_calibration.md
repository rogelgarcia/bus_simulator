# Physical lighting calibration

Status: **planned**. This document defines the calibration work requested after the AI 563 sun/sky experiment. It does not certify the current renderer, change production lighting defaults or announce an implemented calibrator.

## Goal and scope

Establish trustworthy light transport, color handling, daylight and material inputs before optimizing city appearance. Preserve ACESFilmic as the primary presentation and AgX as a separately specified alternative. Use the existing game/export/Cycles experiment pipeline, with immutable baseline and progress evidence.

An attractive image cannot uniquely identify exposure, illumination, reflectance or sky conditions. Neutral fixtures and independently defined data must constrain those quantities before city-level fitting. The selected generated blue-sky image remains an aesthetic reference; its geometry, textures and illumination are not measurements.

## Ownership and order

| AI | Responsibility | Prerequisites | Deliverable |
| --- | --- | --- | --- |
| [564](../../prompts/AI_graphics_564_TESTS_physical_lighting_calibration_harness.md) | Analytical/measured harness and color-pipeline validation | Existing deterministic game and Cycles tools | Executed fixture results, coverage and shared calibration contract |
| [565](../../prompts/AI_graphics_565_ATMOSPHERE_coherent_daylight_and_sky_calibration.md) | Coherent sun, sky, background and reflection calibration | 564 | Daylight profiles with physical conditions and unit mappings |
| [566](../../prompts/AI_graphics_566_MATERIAL_measured_material_calibration_and_export_parity.md) | Material audit and calibrated export-equivalence profiles | 564; final verification with 565 | Evidence-based material candidates and documented approximations |
| [567](../../prompts/AI_graphics_567_TOOLS_automated_lighting_calibration_and_reference_handoff.md) | Automated bounded search, comparison and handoff | 564, 565, 566 | Executed comparisons and validated candidate configuration |
| [562](../../prompts/AI_graphics_562_ATMOSPHERE_match_game_lighting_to_cycles_acesfilmic_reference.md) | Actual game/exporter/bake/shadow integration and convergence | Consume the calibration results for final tuning | Verified game improvements, compatible bakes and final comparisons |

AI 566 can begin neutral-fixture work after 564 while daylight work proceeds; its final validation uses 565. AI 562's independent diagnosis can proceed earlier, but it must consume the calibrated inputs before final appearance tuning. AI 567 must not depend on AI 562 already having solved every discrepancy that its handoff is intended to expose.

## Reference authority

Keep four roles explicit in data and the viewer:

1. **Analytical reference:** known equations, units, independently calculated expected values and numerical tolerances.
2. **Measured reference:** provenance, acquisition conditions, calibration, uncertainty, scale and permitted use.
3. **Renderer reference:** reproducible output from a pinned implementation whose relevant behavior has been checked against the first two roles.
4. **Visual target:** artistic direction with no implied physical calibration.

The [original Cornell data](https://bowers.cornell.edu/computer-graphics/data) provide measured geometry and reflectances with camera/source information. Preserve their assumptions and relative source scale. A spectral experiment reproduced with RGB approximations requires declared limitations; it is not an absolute solar-power calibration.

[CIE 171:2006](https://www.cie.co.at/publications/test-cases-assess-accuracy-lighting-computer-programs) supplies a formal test-case framework. Record exact implemented cases, edition/errata and inaccessible or unsupported coverage. Do not claim complete conformity from a subset or recreate unavailable definitions by guesswork.

[CIE Standard General Sky](https://www.cie.co.at/publications/spatial-distribution-daylight-cie-standard-general-sky-0) constrains sky luminance distribution; absolute normalization and spectral color require additional information. Verify the published edition used and distinguish drafts. A sky shader is a model with assumptions, not automatic standards certification.

## Calibration contract

Tracked, versioned definitions must identify:

- Geometry units, coordinate conversion, camera projection and deterministic scene/pose identities.
- Light quantity and scale, spectral/color assumptions, solar direction/angular extent and sky/environment ownership. Radiometric and photometric quantities require explicit conversion assumptions.
- Texture encoding and roles, final material inputs, BRDF semantics and exporter approximations.
- Scene-linear color space, exposure convention, exact tone mapper/OCIO version, grading and output encoding.
- Reference role, provenance/version/hash, known normalization, masks, independent expectations, uncertainty and predefined tolerances.
- Applicable renderer capabilities and actual outcomes: pass, fail or unavailable/unsupported with a reason. A working harness does not imply every tested renderer passes.

Raw physical comparisons precede display evaluation. Shader channels must be compared by contribution, not merely by matching pass names. Neither histogram similarity nor a single image-quality score establishes correct transport. Known gamma, scaling and duplicate-light faults must be detected by the harness.

## Daylight and material constraints

The physical candidate uses coherent sun/sky illumination and a consistent visible/reflected environment. Avoid counting a solar disc or hemispherical fill twice. Preserve direction-dependent sky color. A camera-only sky correction remains a separately labeled artistic variant.

The current sun 7, hemisphere 1.22, HDRI 0.28 and AI 563 ratios remain legacy controls. They are not established physical reference values. Select and record environmental conditions before choosing exposure; do not compensate weak ambient light with arbitrary material brightness.

Material plausibility is sample-specific. Distinguish dry/wet/worn surfaces and measured versus assumed reflectance. Preserve original bus paint/trim/rim identity and independent reflection controls. Coordinate window-interior equivalence with AI 562, local reflection work with AI 551 and visibility errors with AI 559. Retained albedo/visibility changes invalidate affected indirect bakes as well as exported material caches.

## Automation, evidence and publication

All new offline work belongs in the existing `node tools/bake.mjs` hierarchy as explicit experiment stages, excluded from routine production bake execution. Reuse the shared ignored `tools/baking/blender.local.json` and existing validation/publication policies. Independently callable scene generation/export, capture, rendering, analysis and orchestration remain tracked with defaults, poses, schemas and READMEs. Register implemented tools in `PROJECT_TOOLS.md`.

Generated/downloaded bulk data, `.blend` files, EXRs, screenshots, traces and reports go under ignored prompt-specific directories:

- `tests/artifacts/screens/ai564_physical_calibration/`
- `tests/artifacts/screens/ai565_daylight_calibration/`
- `tests/artifacts/screens/ai566_material_calibration/`
- `tests/artifacts/screens/ai567_automated_calibration/`

Capture the game with its installed baked data before changing inputs. Preserve all five canonical poses and the shared bus placement for poses 01/02. Retain legacy targets, corrected references and chronological rejected/accepted iterations without overwriting evidence. Authenticate reuse by scene, material, lighting, toolchain and display identities. The actual render is required to confirm finalists produced by any valid linear recombination shortcut.

The optimizer first checks independent calibration and then explores bounded, identifiable parameters. Use predefined fitting and held-out validation cases, one global profile and explicit uncertainty. Do not fit all of albedo, light scale and exposure freely against a final screenshot. Invalid references prevent promotion; known game limitations become explicit AI 562 requirements.

Production application remains AI 562's responsibility, including conditional direct baking, shadow representation, bake validity, fallback, stable settings toggles and measured runtime cost. Calibration tools must not auto-publish production assets or weaken publication gates. Completion requires executed evidence, actual stage timings and a concrete handoff; creating configuration files alone is insufficient.
