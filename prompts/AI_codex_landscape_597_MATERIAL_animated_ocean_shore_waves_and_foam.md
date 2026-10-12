# Animated ocean, shore waves and foam (AI 597)

# Problem

The coastal landscape needs a sea with proper sea movement. Today the water is a flat two-triangle quad
at Y = 0, exactly the size of the 4 km extent (`LandscapeWaterReference.js`). Its single-pass optics
are good: exact Fresnel, a prefiltered sky reflection, the in-water column, sun glint and the underwater
Snell window. But nothing in the repository animates a water surface.

What is missing:

- No waves, swell, whitecaps or breaking surf.
- No foam and no moving swash.
- The beach's wet band and swash film are static. They come from a fixed 0.5 m / 6 s swell run-up.
- The sea ends at the map boundary, which is visible from the air.

The user's beach references show what is expected:

- R08: turquoise shallows over sand, a small shore break with foam lines, sparkling glints, and a
  darker sea over rock.
- R09: an open spectral sea and a breaking-wave foam band rolling onto the sand, leaving residual foam.
- R10: a calm sea washing over a wet rock platform.
- R05 and R06: wind ripples and reflections.

# Request

Deliver a real-time animated ocean for the landscape viewer:

- a deep-water wind sea and swell that respond to finite depth;
- shoaling, refraction and breaking at the beach, guided by the terrain's bathymetry;
- a foam lifecycle;
- swash run-up that drives the wet beach;
- depth-driven colour and refraction of the seabed;
- reflections and glints;
- a surface continuing to the horizon;
- a deterministic time base for captures.

The ocean must integrate with the existing water optics and preserve sea level, picking and terrain
queries.

## Execution and scope

- Start only after AI 595 PROJECTMAINTENANCE (removing the landscape cache from Git history) is
  complete: it rewrites this branch and moves the landscape cache to a gitignored location. Generated
  landscape data (terrain revisions, pages, fields, channels, placement tiles, caches) is a local bake
  output that is never committed or sent through Git LFS. Commit recipes, small authored configuration,
  code, tests and specs. Paths written as `assets/public/landscape/` mean the cache location AI 595
  documents.
- Read `specs/landscape/LANDSCAPE_NATURAL_WORLD_ROADMAP.md` first. This AI owns layer L1 and the sea part
  of L8. Use review poses NW-01, NW-02, NW-03, NW-09, NW-10, NW-11 and NW-12, and references R05, R06,
  R08, R09 and R10.
- Depends on AI 596 for bathymetry, the shoreline distance and the coastal zone channels. Development may
  start on the current terrain, but final acceptance uses the AI 596 terrain.
- Implement one deliverable at a time, using subagents with maximum reasoning. Verify and commit each
  completed deliverable.
- Use port 8002. Open a renderer only for verification. Put evidence under
  `tests/artifacts/screens/landscape/ai597/<deliverable>/`, gitignored. Composites are
  `[reference | before | after]`.
- WebGL2 only. Keep the shader rules (`.glsl` files through the loaders), program variants and the
  ANGLE/D3D11 compile constraints in `LANDSCAPE_AI577_SURFACES.md`. Measure cold-compile impact.
- Sea level stays authoritative at Y = 0. The tide stays a documented constant unless the user asks
  otherwise.
- Water stays non-pickable. Terrain picking, queries, edits and the underwater view keep working.
- The flat reference plane remains available as an inspection mode.
- Realism first, with budgets accounted and measured. Captures and motion comparisons must use a fixed,
  deterministic simulation time.

## Deliverables and dependencies

| Deliverable | Depends on | Usable outcome |
| --- | --- | --- |
| D1. Spectral ocean surface | AI 596 bathymetry (or current terrain for development) | Animated open sea to the horizon with sea-state presets |
| D2. Depth-aware shore waves | D1 | Shoaling, refracting and breaking waves aligned with the beach and bars |
| D3. Foam lifecycle | D2 | Whitecaps, breaker bands, residual and shoreline foam |
| D4. Swash and wet beach | D3 | Moving run-up and backwash, wet sand driven by the swash |
| D5. Water colour, refraction and light | D4 | Turquoise shallows, seabed refraction, caustics, glints and reflections |
| D6. Inland water | D5 and AI 596 hydrology | Calm presets for ponds and creeks, where AI 596 created them |
| D7. Integrated acceptance | D6 | Quality presets, measured cost, specs and handoff |

### D1. Spectral ocean surface

- [x] **Spectrum and surface.** Provide multi-cascade spectral waves with:
  - directional spreading;
  - a finite-depth spectrum and dispersion (TMA rather than deep-water only);
  - choppy horizontal displacement, normals and a surface-folding measure.

  Wind, swell and fetch parameters live in versioned sea-state presets (calm, moderate, rough). The time
  base is deterministic.
- [x] **Coverage to the horizon.** The surface covers everything from the shoreline to the horizon, well
  beyond the 4 km extent, with continuous level of detail. It must show no visible tiling, swimming,
  cracks or popping, and no seam with the AI 596 far-field land.
- [x] **Optics.** Keep the existing optics physically consistent on the displaced surface: Fresnel,
  sky reflection, water column, glint and underwater view.
- [x] **Gate.**
  - Open-sea views at NW-10, NW-11 and NW-12 compared against R09.
  - A periodicity check at large view distances.
  - Temporal stability under a moving camera.
  - Measured GPU and compile cost.

### D2. Depth-aware shore waves

- [ ] **Wave behaviour near shore.** Use the bathymetry and shoreline distance:
  - waves grow and shorten as they shoal;
  - crests turn towards the shore normal;
  - waves break where a declared depth-limited criterion is met, forming a surf zone over the bars and
    beach slope;
  - waves are damped over reefs and in the sheltered swim zone.
- [ ] **Rocky shores.** At the bluff toe and wave-cut platform, waves wash, surge and retreat over rock
  instead of breaking like a sand beach. Spray particles are optional.
- [ ] **Gate.**
  - Crests run roughly parallel to the beach.
  - Breaking positions agree with the bars and foreshore slope across sea states.
  - Composites against R09 at NW-12 and R08 at NW-01.

### D3. Foam lifecycle

- [ ] **Foam types.** Provide:
  - whitecaps from surface folding in rougher states;
  - breaker foam bands created at breaking;
  - residual foam that advects with the flow and decays;
  - shoreline foam lines;
  - foam left on the sand by backwash.
- [ ] **Look.** Foam has physical-scale detail at close range without visible tiling, and consistent
  lighting and shadowing.
- [ ] **Gate.** Composites against R08 and R09 at NW-01 and NW-12. A motion review shows no popping or
  repeated patterns.

### D4. Swash and wet beach

- [ ] **Run-up.** Animate run-up and backwash for each wave group across the foreshore, as a time-varying
  thin water sheet with transparency and a foam edge.
- [ ] **Wet sand.** Sand darkens under the swash and dries with a visible lag. This replaces the static
  wet band from AI 577 D5 while keeping its calibrated wet/dry albedo and the glossy swash film. The
  wrack line and debris inputs follow the maximum run-up.
- [ ] **Gate.**
  - The wet line moves plausibly at NW-01 and NW-03.
  - Terrain queries and picking are unchanged.
  - Time-stepped captures are deterministic.

### D5. Water colour, refraction and light

- [ ] **Colour.** Colour follows depth, turbidity and bottom type: turquoise over shallow sand, darker
  over rock and weed, deep blue offshore.
- [ ] **Light through the water.** Provide:
  - refraction of the visible seabed;
  - caustics on the shallow seabed;
  - light scattering through thin wave crests;
  - stable sun glints without aliasing sparkle.
- [ ] **Reflections.** Reflect sky and terrain. Use screen-space or planar reflections only where
  measurement justifies them, and document their limits. The underwater view stays consistent.
- [ ] **Gate.** Composites against R08 at NW-01 and NW-02, plus a seabed-visibility comparison over sand
  versus rock.

### D6. Inland water

- [ ] **Calm water.** If AI 596 published ponds or creek water, render them with calm presets of the
  same system: ripples, colour and reflections. Their flow direction comes from the drainage channels.
  If AI 596 published no inland water, record that and close this deliverable.

### D7. Integrated acceptance

- [ ] **Presets.** Provide quality presets with an explicit low-cost path, and sea-state presets.
- [ ] **Measurements and regressions.** Run a full landscape regression in both surface-cache modes.
  Record same-condition performance tables at the water-related review poses.
- [ ] **Spec.** Create a new canonical spec, `specs/landscape/LANDSCAPE_OCEAN.md`, and update the viewer
  and appearance specs and the roadmap status.

## Evidence and measurements

- **Captures.** Time-fixed captures at the listed poses, short deterministic motion clips (open sea,
  surf zone, swash), and `[reference | before | after]` composites.
- **Performance.** Report frame time, FPS, GPU time per water pass, draws, triangles, GPU memory for
  simulation textures, and compile time, with hardware, browser, viewport, warm-up, sample count and
  statistics. Mark missing metrics as not measured, with a reason.

## Research basis

- Tessendorf, [Simulating Ocean Water](https://jtessen.people.clemson.edu/reports/papers_files/coursenotes2004.pdf).
- [TMA finite-depth spectrum](https://wavespectra.readthedocs.io/en/latest/generated/wavespectra.construct.frequency.tma.html).
- Crest: [shallows and shorelines](https://crest.readthedocs.io/en/4.17/user/shallows-and-shorelines.html), [ocean simulation](https://crest.readthedocs.io/en/4.11/user/ocean-simulation.html).
- Atlas [shorelines](https://atlas-devkit.readthedocs.io/en/latest/Guides/Shorelines.html); Unity [shoreline distance fields in Survival Kids](https://unity.com/blog/graphics-and-rendering-tips-from-survival-kids).
- Jeschke et al., [Making Procedural Water Waves Boundary-aware](https://diglib.eg.org/handle/10.1111/cgf14100), 2020.

## Completion record

Record each deliverable here when it passes: a summary, spec and source locations, validation results,
measurements, limitations and artifact paths.

### D1. Spectral ocean surface — delivered 2026-10-12

**Summary.** The viewer draws an animated spectral sea instead of the flat AI577 plane (`landscapeOcean=animated`, the default; `flat`
keeps the plane as the inspection surface). Wind sea (JONSWAP from wind speed and fetch) plus a narrow swell calibrated to its significant
height, both under the TMA finite-depth factor with Mitsuyasu spreading and finite-depth dispersion, are evolved on the GPU in band-limited
cascades (medium: 1600 / 200 / 25 m patches at 256 texels) through a single-output radix-2 FFT over a cascade atlas, with per-cascade wrapped
displacement and slope/Jacobian textures (mipmapped). The surface is a camera-snapped clipmap of 11 rings (128 cells, 0.5 m base cell,
CDLOD morph, hole collapse) that reaches the 25 km far plane over the surround's seabed; the spectral amplitude fades below 4 m of depth
(the beach and the far coast stay flat until D2), the swell carries a world-space envelope so the patch never repeats. Shading keeps the
AI577 optics on the displaced normal: split-sum Fresnel with a LEAN roughness, the prefiltered sky blurred by the removed slope variance,
below-horizon reflections resolving to the water's own colour, a Cox–Munk (Beckmann) sun glitter, composed in display space over the
terrain's water column. The clock is deterministic (`free` / `fixed`, `landscapeOceanTime=<s>`, `setOcean({clock})`), every browser suite
opens the viewer at a fixed time (`tests/shared/landscape_viewer_url.js`, `LANDSCAPE_TEST_OCEAN_TIME`), and the capture tool, the new
`clip.mjs` (deterministic motion clips with stability statistics) and `periodicity.py` carry the gates. Sea level, picking, queries and the
underwater view are unchanged; the water reference keeps the optical body; `uLandscapeOcean.x` hands the terrain's flat-surface glint to the
ocean's facets while it draws. Residency: the view holds the ocean's 32 / 64 MiB share (`LANDSCAPE_OCEAN.budgets`) as one standing
reservation of kind `landscape-ocean` in the shared ledger for its lifetime whenever the budget is at least the shipped profile (smaller
evidence profiles keep every byte for the streams and report the ocean unavailable), the ocean's own entries (24.5 MiB GPU at medium)
account inside it (`createLandscapeReservedShare`), so a rebuild after a sea-state, quality or flat switch can never be denied by the streams
(the suite caught that denial); the shipped profiles grew by exactly the share, as for the surround: 640 / 352 → 672 / 416 MiB uncached,
640 / 544 → 672 / 608 MiB with the cache (748 / 1110 MiB at 2560 × 1440 and 3840 × 2160), stream reserve 352 → 416 MiB.

**Spec and sources.** `specs/landscape/LANDSCAPE_OCEAN.md` (new, canonical), `LANDSCAPE_VIEWER.md` and `LANDSCAPE_STREAMING.md` (water
extent), `LANDSCAPE_NATURAL_WORLD_ROADMAP.md` status; `src/graphics/engine3d/landscape/ocean/` (`LandscapeOceanModel.js`,
`LandscapeOceanSpectrum.js`, `LandscapeOceanField.js`, `LandscapeOceanSimulation.js`, `LandscapeOceanSurface.js`, `LandscapeOcean.js`),
shaders `src/graphics/shaders/materials/landscape/ocean_*.glsl` + `LandscapeOceanShaderLoader.js`, chunks `ocean_spectrum.glsl`,
`ocean_sampling.glsl`; `LandscapeLightingModel.js` / `LandscapeLighting.js` / `lighting.glsl` / `terrain.frag.glsl` (`uLandscapeOcean`),
`LandscapeWaterReference.js` (`setSurfaceDrawn`), `LandscapeView.js` / `main.js` / `LandscapePanel.js` (options, hooks, Ocean button),
`LandscapeResidencyBudget.js` (`createLandscapeResidencyShare`, the surround ledger now delegates to it), tools
`tools/landscape_review/capture.mjs` (`--ocean`, `--sea-state`, `--ocean-time`), `clip.mjs`, `periodicity.py`.

**Validation.** Unit: `tests/node/unit/landscape_ocean_model.test.js` (presets, band partition, rings, clock, share, spectrum, FFT table
against a direct DFT, Hermitian pairs, field raster), `landscape_review_tools.test.js`; all 609 landscape unit tests pass. Browser:
`tests/headless/e2e/landscape_ocean.pwtest.js` on coastal v3 with the surround (status, fields, 22 simulation draws, share, GPU read-back
Hs 0.554 / 1.125 / 0.196 m vs the model's 0.556 / 1.147 / 0.196 m, determinism same time 0.001 / stepped 18.28 / restored 0.003 mean luminance units over the open-sea region (the terrain under the sea drifts by up to
0.3 between captures seconds apart under a loaded GPU, so the sea is judged against its step); picking through the sea to the seabed;
hide/show; flat switch and back; sea-state switch; disposal to zero), `landscape_lighting` 6/6, `landscape_surround` 1/1,
`landscape_surface_cache` 6/6 with the raised profile pins, `landscape_surface_transition` opt-in (skipped by design, its overhead accounting
updated), `landscape_acceptance` 4/4 at 23:00 with the fixed ocean time (its revisit check had failed with a free-running sea); the later
acceptance runs during another process's Blender render at 99–100 % GPU failed timing-sensitive checks (one revisit stop drifting 1.9–2.5
bytes while every water-facing stop reproduced within 0.08, a 57 KB margin on the per-frame upload cap in flat mode, 20 FPS under held
responses): recorded in `d1/README.md`, to be settled by the D7 regression on an idle GPU. Periodicity (row autocorrelation after a 96 px high-pass, lags ≥ 64 px): animated NW-11 peak 0.032, NW-10
0.035, flat NW-11 0.015 (threshold 0.5). Motion: static clips NW-09 / NW-11 mean frame difference 2.28 / 2.20 with no spikes, moving-camera
clips NW-10 / NW-11 11.3 / 20.3 with no spikes (no popping); NW-12 static 0.014 (the D1 depth fade keeps the shore band flat).

**Measurements** (RTX 3060, ANGLE/D3D11, 1920 × 1080, cache on at 640/544 MiB, 30 warm-up + 120 sampled frames, animated and flat in one
session minutes apart): see `tests/artifacts/screens/landscape/ai597/d1/README.md` for the table; simulation batch (22 draws) median
0.45–0.6 ms (2.2 ms at NW-12), surface program compile 174–513 ms linked in parallel, simulation init 2.9 ms, 24.5 MiB GPU / 5.7 MiB CPU
in the share, frames stay vsync-bound at every pose. Not measured: cold FXC compile of the surface on a fresh profile beyond the in-page link
time (the Playwright profile is fresh, so the 174–513 ms figures are cold), GPU memory as reported by the driver (estimated from formats).

**Limitations.** No shoaling, refraction, breaking (D2), foam (D3), swash (D4) or seabed refraction (D5); the far-field sea damps near the
far coast from a 62.5 m raster; reflections are the prefiltered sky only; R08–R10 are still missing on disk, so the composites use the
user's coast photos and beach-video frames (`tests/artifacts/screens/landscape/references/natural_world/user_coast/`).

**Artifacts.** `tests/artifacts/screens/landscape/ai597/d1/` (README.md: captures `animated/`, `flat/`, composites, periodicity receipts,
clips with `clip.mp4`, suite receipt `suite/ocean-suite.json`, `perf/measure_ocean*.json`).

## On completion

- Mark the first line DONE only after D1–D7 pass.
- Rename to `prompts/AI_DONE_codex_landscape_597_MATERIAL_animated_ocean_shore_waves_and_foam_DONE.md`.
- Keep it in `prompts/`; do not archive automatically.
- Add a one-line summary per completed change, focused validation results, before/after performance
  tables with conditions, and artifact paths. Update the roadmap status table.
