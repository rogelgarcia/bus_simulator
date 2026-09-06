# DONE — baked facade radiance and single-sun repairs

## Problem

Baked illumination turns Stone Lowrise 2 wall faces black while trim stays lit.
The default HDRI and authored sun produce different shadow edges, sidewalks have
uneven baked lighting, and a shaded tower cornice appears unexpectedly bright.

# Request

Fix the reported defects with deterministic reproductions and run a longer bake
targeting approximately 30 minutes using the existing headless Blender installation.
Preserve the working live renderer, AI 548 toggle, and cached resources.

Tasks:
- [x] Restore valid baked irradiance on materials that use material variation.
- [x] Give hard sunlight one source in the enhanced bake while retaining sky and colored bounce.
- [x] Verify the shaded cornice with direct and indirect channels isolated.
- [x] Reduce sidewalk lighting patches and assess them at fixed cameras.
- [x] Run and validate the longer bake, report actual elapsed time, and publish the verified maps.
- [x] Keep repeated toggles bounded in programs, geometry, textures, and downloads.
- [x] Recover the interrupted bake without publishing missing or unwritten pass data.
- [x] Bound output-copy memory and durably write pages in future complete-surface bakes.
- [x] Prevent hidden nearly coplanar terrain layers from producing dark filter seams at exposed boundaries.

## Reproduction notes

- Artifacts: `tests/artifacts/screens/illumination_refinement/`.
- Stone Lowrise 2 at building_35, camera `[47,11,120]` toward `[47,9,145]`.
- A facade texel contains irradiance `[0.81666,0.81294,0.73602]`; runtime displays zero.
- The material-variation normal-map code retains Three's normal-map include inside
  its disabled branch. The receiver preparation was injected into that branch.
- The focused rendered material test fails with 0 instead of `1/pi` irradiance response.
- HDRI peak direction differs from the authored sun by 18.08 degrees. The enhanced
  bake needs a declared diffuse-environment solar separation policy.

## Research log

- Original facade texel: nonzero data, black rendered GI. The real material-variation
  GPU fixture failed at 0 instead of `1/pi` before the shader-anchor fix.
- Move receiver preparation outside the material-variation conditional, after
  the final normal stage. The same fixed city facade regains its authored color.
- HDRI solar separation: synthetic bright-disc and unchanged uniform-sky tests pass.
  The v4 city bake records 1,715 replaced HDRI pixels, leaving the source image intact.
- Shaded-underside CPU proof with the production sun orientation: direct light
  `[0,0,0]`, green-ground bounce `[0.12376,0.77737,0.12376]`, and below `0.000005`
  per channel when the ground is hidden. Shaded surfaces can legitimately brighten
  from bounce; this does not prove convergence of every city texel.
- The original preview's cornice brightening was not reproduced after fully
  settling each isolated channel at the fixed GovCenter camera. Do not change
  the original engine or force the underside dark to match its appearance.
- The computer rebooted during final map assembly. File lengths alone were
  insufficient: several saved sky pages and assembled files contained unwritten
  zeros. Recovery rejected these outputs. All nine bounce-page alpha masks match
  the earlier validated bake with identical source and chart hashes; reuse them
  and replace the sky pass. Save recovery provenance and distinguish measured
  replacement-pass time from the missing original completion timer.
- Add a packaging regression for partially unwritten data: sky and bounce raster
  masks must match before chart padding runs. The synthetic lost-block test passes,
  and the ordinary dark-sample/neighbor-isolation test remains passing.
- Recovered sky pass: 879.04 measured seconds. Original pre-sky checkpoint plus
  replacement sky is 2,270.90 seconds (37.85 minutes), explicitly an estimate of
  effective bake time, not the lost original completion timer. All 18 pass files
  validate and all nine pages package successfully.
- The output lifecycle fixture passes exact float/mip comparisons, verifies
  single-page image reads, and preserves an existing file on simulated write
  interruption. Scene release and durable page writes now apply to ordinary
  complete-surface bakes too.
- The remaining diagonal line inside the Lowrise shadow follows the boundary
  between CityFloor and GroundTiles, rather than a sun direction or triangle UV
  edge. The floor is 1 mm lower, so its texels underneath tiles are occluded.
  GPU sampling at the exposed boundary blends these dark hidden values into the
  visible floor. An isolated texture probe removed the line without changing
  visible lighting samples or postprocessing.
- The production correction proves near-coplanar overlap from world geometry,
  then extends exposed samples within each partially hidden chart before mips.
  No building IDs, tile indices, names or material exceptions select receivers.
  The small fixture reproduces the filtering darkening and verifies corrected
  continuity, rotated surfaces, real-gap exclusions and preserved dark samples.

## Completion

- Restored material-variation facade irradiance without changing the original renderer.
- Removed the photographed sun from enhanced diffuse transport while retaining
  the authored sun, sky and colored bounce; live reflections retain the source HDRI.
- Recovered and validated 18 pass files from the 896-sample, nine-page 4096px bake.
  Effective bake time is estimated at 37.85 minutes; the original completion
  timer was lost in the reboot. The replacement sky pass measured 879.04 seconds.
- Corrected hidden-layer filtering offline and published
  `feaa25516d97801e8daa23cbcb6913ff2d18175a7bf03bfa354e6941391480a0`.
- The actual ground-boundary GPU regression failed before correction: red
  irradiance was 0.780 versus 1.206 across the boundary, a 35.3% loss. Afterwards
  it is 1.223 versus 1.206, a 1.38% difference. The false dark stripe is absent
  in the fixed-camera capture.
- The full seven-camera city regression passes, including facade/cornice channel
  checks, Welcome/bus-selection startup and four repeated off/on cycles. Programs
  remain 215, textures 136 and geometries 2,663 with no extra downloads or shader
  errors. Material GPU, padding/overlap, solar-separation, shaded-bounce and durable
  output fixtures pass. Captures: `tests/artifacts/screens/illumination_refinement/verified/`.
- Platform/sidewalk patchiness is reduced in the longer bake. Small indirect-light
  details remain limited by the current 0.5 m texel spacing and thin-chart raster
  coverage; additional samples do not increase spatial resolution. The experimental
  toggle warning remains. Cornice bounce is valid: direct debug is black while
  indirect debug is positive, confirmed independently by the shaded-bounce fixture.

| Resource / timing | Before overlap correction | After correction |
| --- | ---: | ---: |
| Indirect page allocation, including mips | 720 MiB | 720 MiB |
| Coordinate table allocation | 97.875 MiB | 97.875 MiB |
| Enhanced indirect compressed download, all shards | 167,422,784 bytes | 162,722,510 bytes |
| Programs after each of four warmed toggles | 215 | 215 |
| Textures after each warmed toggle | 136 | 136 |
| Geometries after each warmed toggle | 2,663 | 2,663 |
| Frame time / FPS / GPU duration | Not measured | Not measured |

Conditions: RTX 3060, Chrome D3D11, 1600×900 viewport, default city lighting,
high moving-object shadows, both illumination channels enabled, seven fixed
cameras and fully settled activation. Resource counts use the same complete
camera sequence and four warmed toggle cycles (`final/` versus `verified/`).
The rendering loop is paused and explicitly stepped for deterministic visual
checks, so these runs do not support frame-time or FPS claims.

## On completion

- Mark this document DONE and rename within `prompts/` with DONE naming.
- Summarize the fixes, validation, actual bake duration, and material limitations.
- Keep generated captures and machine-readable measurements gitignored.
