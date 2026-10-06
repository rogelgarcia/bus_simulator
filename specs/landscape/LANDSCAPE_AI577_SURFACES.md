# Realistic landscape surfaces (AI 577) — reference

AI 577 turned the coastal landscape's ground from category-cell colors into continuous, physically scaled,
terrain-driven natural surfaces lit like the game, then made them cheap enough to ship. This page is the
consolidated reference: what each deliverable delivered, the quality profiles, the canonical data and
recipe identifiers, how to reproduce the data and the measurements, the benchmark results and the
remaining limitations. The detailed contracts live in the linked specifications; the per-deliverable
completion records (with every before/after table) are in
`prompts/AI_DONE_codex_landscape_577_MATERIAL_realistic_landscape_surfaces_and_multiscale_detail_DONE.md`.

## Deliverables

| Step | Outcome | Contract |
| --- | --- | --- |
| D1 | Continuous, antialiased material coverage from fitted contours instead of square category cells | [LANDSCAPE_SURFACE_COVERAGE.md](LANDSCAPE_SURFACE_COVERAGE.md) |
| D1a | Homogeneous CC0 base materials and relief-driven height-competition transitions | [LANDSCAPE_BASE_MATERIALS.md](LANDSCAPE_BASE_MATERIALS.md) |
| D2 | Generated fine surface pages (L4–L6, down to 0.24 m) with natural boundaries and physical interleaving | [LANDSCAPE_SURFACE_DETAIL.md](LANDSCAPE_SURFACE_DETAIL.md) |
| D3 | World-anchored stochastic hex tiling without visible repetition | [LANDSCAPE_APPEARANCE_RUNTIME.md](LANDSCAPE_APPEARANCE_RUNTIME.md) |
| D4 | Physical-period sampling, landscape-scale variation, micro detail, 1024 tiers, slope projection, per-material texel demand | [LANDSCAPE_APPEARANCE.md](LANDSCAPE_APPEARANCE.md), runtime spec |
| D5 | Global terrain fields, game daylight with HDR sky, haze and water optics, terrain shadows and bounce, natural-ground response, catena variation, wet/dry beach, terrain-driven planning infill, dressing inputs | [LANDSCAPE_TERRAIN_FIELDS.md](LANDSCAPE_TERRAIN_FIELDS.md), runtime spec |
| D6 | Profile, compile-variant savings, and the runtime surface cache with an exact near-field pass | runtime spec, "Profile-guided surface caching" |
| D7 | Integrated acceptance, the restored strict-pin editing check, viewport-scaled cache capacity and the cache on by default | [LANDSCAPE_HANDOFF.md](LANDSCAPE_HANDOFF.md), runtime spec |

## Quality profiles

| Setting | Values (default first) | Effect |
| --- | --- | --- |
| `landscapeSurfaceCache` | `on`, `off` | Cached view-independent surface with an exact near pass, or the full per-pixel program; output within about 1 sRGB byte |
| Budget profile | cache on: the display's cache profile (512/448 MiB up to 1920×1080, 512/588 at 2560×1440, 512/950 at 3840×2160); cache off: 512/256 MiB; `historical` 128/64; `constrained` 48/24 | Reduced profiles keep complete coverage with explicit degradation reasons and run uncached |
| `landscapeLighting` | `standard`, `high`, `low` | `low` drops haze, underwater scattering and terrain fields; `high` adds direction-dependent sky in-scattering and specular horizon occlusion |
| `landscapeTerrainAppearance` | `on`, `off` | Terrain-driven catena, rock weathering and coastal wetting (a compiled variant) |
| `landscapeTerrainFields` | `auto`, `off` | Terrain shadows, sky occlusion, bounce and the appearance layer |
| `landscapeNaturalInference` | `terrain`, `overview` | Terrain-driven natural soil for planning-only cover, or the former 15.6 m overview flood fill |
| `landscapeMaterialSampling` | `hex-contrast`, `hex-linear`, `hex-variance`, `single` | Stochastic sampling modes kept for A/B evidence |
| `landscapeMultiscale` | `auto`, `off` | The 1024 tiers and micro layer of the companion sidecar |

## Canonical data and recipes

Published data under `assets/public/landscape/coastal-city/` (content-addressed pages, immutable snapshots):

| Data | Revision | Produced by |
| --- | --- | --- |
| Terrain manifest | `materials-bfcf20f7e27aa79db4d9983b` | AI 576 import, nature pass and the D1a material-only publication |
| Appearance sidecar (schema 1) | `appearance-b3b39f64367c43336b3f45bd` | `landscape/appearance` bake leaf |
| Multiscale companion (1024 tiers, micro) | `multiscale-eedd520219823e11ff6c7381` | `landscape/appearance` with the `multiscale` request |
| Terrain fields and natural soil | `terrain-fields-5dbdfc766dca6cce908bd7b4` | `landscape/terrain-fields` bake leaf |

Recipes and algorithms: `landscape-surface-coverage-v1`, `landscape-height-competition-v1`,
`periodic-log-microdetail-v1` (preparation), `landscape-surface-detail-v4`, `landscape-material-clumps-v1`,
`landscape-hex-tiling-v1`, `landscape-macro-variation-v1`, `landscape-physical-tiling-v1`,
`landscape-micro-detail-v1` (`micro-normal-height-luminance-v1`, `micro-periodic-highpass-v1`),
`landscape-slope-projection-v1`, `landscape-normal-mip-vmf-v1`, `landscape-material-water-filling-v1`,
`landscape-terrain-fields-v1`, `natural-terrain-inference-v1` (fallback `natural-overview-infill-v1`),
`landscape-dressing-inputs` v1, `landscape-material-response-v1`, `landscape-terrain-bounce-v1`,
`landscape-terrain-visibility-v1`, `landscape-material-calibration-v1`, `landscape-surface-cache-v1`
(runtime v3, `landscape-surface-cache-near-v1`, `landscape-surface-cache-demand-v2`,
`landscape-surface-cache-controller-v3`, `landscape-surface-cache-capacity-v1`). Material sources and their
CC0 provenance are in LANDSCAPE_BASE_MATERIALS.md and LANDSCAPE_NATURE_MATERIALS.md.

## Reproduce

```sh
node tools/landscape_server/run.mjs
node tools/bake.mjs --target landscape/appearance --set landscape/appearance:multiscale=tools/bake_landscape/appearance/multiscale-v1.json --publish
node tools/bake.mjs --target landscape/terrain-fields --publish
node --test tests/node/unit/landscape_*.test.js
```

Browser suites run against the server on port 8002 with `E2E_BASE_URL=http://127.0.0.1:8002`, one worker,
and `LANDSCAPE_TEST_SURFACE_CACHE=on|off` to pin the cache mode (unset runs the default). Matched before/after
captures use `tests/headless/e2e/landscape_surface_transition.pwtest.js` with `LANDSCAPE_SURFACE_PHASE`,
`LANDSCAPE_SURFACE_DELIVERABLE` and `LANDSCAPE_SURFACE_PROFILE`; the reproducible route benchmark is
`tests/headless/e2e/landscape_performance.pwtest.js` (shipped, historical and constrained profiles, cold and
warm, 11 stops). Paired GPU timing and motion evidence tools are kept with the evidence under
`tests/artifacts/screens/landscape/ai577/` (gitignored).

## Benchmarks

Every step was measured before/after under identical conditions on the same machine (Windows 10.0.26200,
Ryzen 5 9600X, RTX 3060 through ANGLE/D3D11, Chromium 151.0.7922.34, 1920×1080 at DPR 1, completed GPU timer
queries). GPU median at the four AI577 views, in milliseconds, as recorded in each step's completion record
(each step's own profile; the budget rose from 128/64 to 384/192 in D2 and 512/256 in D4, which also refined
geometry from 0.93 M to 2.0 M triangles):

| Step | Game POV | Oblique | Top-down | Medium distance |
| --- | --- | --- | --- | --- |
| D1 (128/64) | 5.22 → 3.44 | 5.92 → 4.59 | 3.92 → 2.93 | 6.40 → 5.07 |
| D1a (128/64) | 4.94 → 4.43 | 5.57 → 5.22 | 2.32 → 2.81 | 5.51 → 5.58 |
| D2 (384/192) | 4.79 → 6.95 | 5.02 → 11.18 | 2.54 → 3.41 | 6.44 → 16.55 |
| D3 (384/192) | 6.91 → 7.63 | 11.87 → 12.98 | 3.40 → 3.76 | 17.47 → 18.70 |
| D4 (384/192) | 7.61 → 8.16 | 12.89 → 12.98 | 3.76 → 5.88 | 18.78 → 17.34 |
| D5 (512/256) | 8.17 → 12.45 | 13.00 → 18.94 | 5.93 → 6.60 | 17.34 → 21.18 |
| D6 cache on vs off (paired, 512/448) | 12.14 → 6.01 | 18.58 → 4.79 | 6.07 → 2.52 | 20.81 → 5.39 |

Across the 36 AI577 views and three suns the shipped cache brings the mean from 11.8–12.3 ms to 4.1–5.2 ms at
1920×1080 (worst view 7.5–8.1 ms, D5 up to 25.6 ms), 24.1 → 8.2 ms at 2560×1440 and 35.8 → 10.5 ms at 3840×2160,
within 0.4–0.9 sRGB bytes of the uncached frame.

The reproducible route (`landscape_performance`: 11 stops, 30 warm-up and 120 sampled frames each, 1,320
frames per run, final D7 code) at the shipped profile:

| Mode, profile | Load | GPU median / p95, ms | Estimated GPU current / lifetime peak, MiB | Controlled CPU peak, MiB | First coarse / settled, ms |
| --- | --- | ---: | ---: | ---: | ---: |
| Cache on (default), 512/448 | cold | 1.00 / 2.92 | 214.9 / 339.0 | 243.2 | 769 / 9,063 |
| Cache on (default), 512/448 | warm | 1.01 / 2.98 | 214.9 / 339.0 | 245.5 | 106 / 1,413 |
| Cache off, 512/256 | cold | 3.18 / 11.41 | 42.6 / 166.7 | 242.7 | 6,858 / 7,556 |
| Cache off, 512/256 | warm | 3.20 / 11.40 | 42.6 / 166.7 | 243.2 | 103 / 759 |

Frame intervals stay at the 60 Hz vsync (median 17.5 ms, p95 18.1–18.2 ms) in every run. The historical
128/64 and constrained 48/24 profiles cannot admit the cache and run uncached in both modes (GPU median
3.1 ms, p95 10.4–10.5 and 6.3 ms) with complete coverage. Receipts:
`tests/artifacts/screens/landscape/ai577-d7-default/performance/` and `ai577-d7-off/performance/`.

## Limitations

- Measurements come from one GPU, driver and browser build; program occupancy moves single views by
  ±1–5 ms between structurally equivalent programs, and absolute timings drift with machine load, so only
  paired comparisons are tight.
- The coastal terrain is a designed prototype: graded roads dominate flow and wetness (planning areas are
  excluded from the catena), the catena follows the generator's periodic undulations, sky view is near 1
  almost everywhere and no rock lies within the splash reach.
- Lighting uses one calibrated sky (sun elevation 55°) for every sun elevation; terrain bounce is single
  scattering with unshadowed occluders; backlit grass has no canopy transmission; haze is single scattering;
  the water is flat and the tide a fixed falling-tide look.
- The cached frame is not pixel-identical (worst views at a 12° sun keep a relief speckle of 2–4 sRGB bytes),
  fast zooms and speeds above about 17 m/s show coarser fallback or motion-biased detail, edits and reloads
  regenerate every page, and the 4K cache profile reserves 950 MiB of estimated GPU memory without measuring
  device VRAM.
- The uncached program compiles in 8–9 s on a fresh browser profile (the cached one in 0.5 s beside a 6.5 s
  generation program); Chromium's program cache makes later loads fast.
- Ground vegetation, rocks and props are not placed: dressing inputs define where they would agree with the
  soil, and the surface-layer contract defines how roads and decals extend the surface.

## Evidence

`tests/artifacts/screens/landscape/ai577/<step>/` holds every capture, comparison sheet, receipt, log and
measurement per step (`d1`, `d1a`, `d2`, `d3`, `d4`, `d5`, `d6`, `d7`), including sealed `before/` baselines
with content-hash manifests.
