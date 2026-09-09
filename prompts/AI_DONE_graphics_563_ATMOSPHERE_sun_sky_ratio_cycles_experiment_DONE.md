# DONE

# Problem

The city can have acceptable contrast without conveying convincing sunlight. The
current Cycles source reconstruction uses game-relative sun, hemisphere and HDRI
values, and a brighter display exposure does not isolate the sun-to-sky balance.

# Request

Create and execute a repeatable stronger-sun experiment using the existing AI 560
exported Blender city. Compare ACESFilmic and AgX, compensating exposure so the
effect of lighting distribution can be judged without simply brightening every
image. This is an offline diagnostic; retain current game settings and baked data.

Tasks:
- [x] Add repository scripts and tracked configuration defaults through the shared
  `node tools/bake.mjs` hierarchy and ignored Blender machine configuration.
- [x] Reuse and authenticate an explicitly supplied AI 560 source run and saved
  Blender scene. Keep its five cameras, shared bus placements, geometry and
  materials. Do not start the game or re-export the city for this experiment.
- [x] Render current source balance, sun multipliers 2, 4 and 8 with fixed sky,
  and a 4x-sun / 1.5x-sky variant. Include a uniform-light scaling control that
  distinguishes numerical radiance scale from a change in sun-to-sky balance.
- [x] Recompute direct, indirect and specular transport with Cycles. Keep one
  explicit sun, source direction and 0.53-degree angular diameter. Preserve linear
  EXRs and separate Sun/Sky contributions; disclose approximated source hemisphere
  fill and existing exporter material limitations.
- [x] Measure a neutral sunlit calibration card to derive one exposure offset per
  lighting configuration, shared across all poses and both tones. Offer fixed
  exposure and compensated comparisons, plus -0.5/0/+0.5 EV inspection variants.
  Do not use per-pose exposure fitting or call relative intensities measured lux.
- [x] Generate exact runtime ACESFilmic and Blender OCIO AgX display versions from
  the same EXRs, with grading off and explicit base exposure. Include existing
  grading-off native game baselines for each tone where available.
- [x] Produce a pose-grouped local comparison page and contact sheets with labeled
  lighting, tone and exposure. Save configurations, checksums, timing, luminance,
  clipping and shaded-region evidence; these are diagnostics, not an automatic
  photorealism score. Include a matched display check for the uniform-scale control.
- [x] Keep generated images, scenes, EXRs, reports and run manifests under
  `tests/artifacts/screens/ai563_sun_sky_ratios/` (gitignored). Keep executable code,
  default experiment recipes, documentation and focused tests in the repository.
- [x] Run the experiment, inspect the images, report measured duration and show
  representative comparisons in the handoff. Preserve every completed run and
  support authenticated resumption without overwriting AI 560 evidence.

## On completion

- Mark this document DONE in the first line and rename in `prompts/` to
  `AI_DONE_graphics_563_ATMOSPHERE_sun_sky_ratio_cycles_experiment_DONE.md`.
- Add a high-level summary and measured execution/evidence results.
- Do not archive or commit automatically.

## Completed implementation and evidence

- Registered the standalone `lighting/experiments/sun-sky-ratios` experiment and
  Python/browser-only `/review` stage, with repository scripts/default recipes.
- Reused the authenticated AI 560 `8c6e7243fe66d4a5` scene and five original cameras;
  30 actual 1920x1080 Cycles renders retained full transport and Sun/Sky groups.
- Generated 240 display images, ten original grading-off game baselines, five full
  comparison sheets and five compact source-versus-2x sheets, with independent
  ACESFilmic/AgX 0.5 EV controls and keyboard carousel navigation.
- Preserved all results at
  `tests/artifacts/screens/ai563_sun_sky_ratios/80139a28552c2fdd/`.
  Open `report/index.html`; raw renders and calibration are in `linear/pilot/`.
- Measured exposure offsets: source 0 EV; sun 2x -0.76 EV; sun 4x -1.63 EV;
  sun 8x -2.55 EV; sun 4x/sky 1.5x -1.70 EV; uniform 4x -2.00 EV.
- All ten real-image uniform controls passed: encoded RGB RMSE 0.00275-0.00443,
  below the declared 0.012 limit. This verifies that a large radiance number alone
  does not improve the image when exposure compensates the same scale.
- Three focused unit tests and six existing pipeline tests passed. The generated
  gallery passed image decoding, independent exposure controls, fixed-mode state,
  carousel arrow keys and Escape checks. Inspected both primary-pose compact sheets
  after fixing Windows UTF-8 decoding and sticky-header overlap in exported sheets.
- Blender 5.2.1 / RTX 3060 OPTIX / 256 maximum samples / adaptive threshold 0.02:
  initial render stage 876.725 s (14m37s); sum of Cycles render/write calls 778.255 s;
  final display/report stage 115.818 s (1m56s). First attempt to successful handoff
  took 1276.040 s (21m16s), including report debugging/resumption. The successful
  resumed invocation took 130.344 s and authenticated/reused all 30 EXRs.
- In Pose 02, the fixed shaded-brick region's mean encoded luminance under ACESFilmic
  falls from approximately 0.14 (source) to 0.10 (2x), 0.07 (4x) and 0.05 (8x).
  These measurements support the visual tradeoff, not a photorealism ranking.
  The source and 2x variants are the restrained starting points for visual selection;
  higher ratios deepen shade substantially. The uniform control retains source
  appearance, and the additional-fill variant partly recovers shaded detail.
- Production lighting settings and baked assets were not changed by this experiment.
