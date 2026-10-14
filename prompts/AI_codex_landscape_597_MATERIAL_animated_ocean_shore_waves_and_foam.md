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

- [x] **Wave behaviour near shore.** Use the bathymetry and shoreline distance:
  - waves grow and shorten as they shoal;
  - crests turn towards the shore normal;
  - waves break where a declared depth-limited criterion is met, forming a surf zone over the bars and
    beach slope;
  - waves are damped over reefs and in the sheltered swim zone.
- [x] **Rocky shores.** At the bluff toe and wave-cut platform, waves wash, surge and retreat over rock
  instead of breaking like a sand beach. Spray particles are optional.
- [x] **Gate.**
  - Crests run roughly parallel to the beach.
  - Breaking positions agree with the bars and foreshore slope across sea states.
  - Composites against R09 at NW-12 and R08 at NW-01.

### D3. Foam lifecycle

- [x] **Foam types.** Provide:
  - whitecaps from surface folding in rougher states;
  - breaker foam bands created at breaking;
  - residual foam that advects with the flow and decays;
  - shoreline foam lines;
  - foam left on the sand by backwash.
- [x] **Look.** Foam has physical-scale detail at close range without visible tiling, and consistent
  lighting and shadowing.
- [x] **Gate.** Composites against R08 and R09 at NW-01 and NW-12. A motion review shows no popping or
  repeated patterns.

### D4. Swash and wet beach

- [x] **Run-up.** Animate run-up and backwash for each wave group across the foreshore, as a time-varying
  thin water sheet with transparency and a foam edge.
- [x] **Wet sand.** Sand darkens under the swash and dries with a visible lag. This replaces the static
  wet band from AI 577 D5 while keeping its calibrated wet/dry albedo and the glossy swash film. The
  wrack line and debris inputs follow the maximum run-up.
- [x] **Gate.**
  - The wet line moves plausibly at NW-01 and NW-03.
  - Terrain queries and picking are unchanged.
  - Time-stepped captures are deterministic.

### D5. Water colour, refraction and light

- [x] **Colour.** Colour follows depth, turbidity and bottom type: turquoise over shallow sand, darker
  over rock and weed, deep blue offshore.
- [x] **Light through the water.** Provide:
  - refraction of the visible seabed;
  - caustics on the shallow seabed;
  - light scattering through thin wave crests;
  - stable sun glints without aliasing sparkle.
- [x] **Reflections.** Reflect sky and terrain. Use screen-space or planar reflections only where
  measurement justifies them, and document their limits. The underwater view stays consistent.
- [x] **Gate.** Composites against R08 at NW-01 and NW-02, plus a seabed-visibility comparison over sand
  versus rock.

### D6. Inland water

- [x] **Calm water.** If AI 596 published ponds or creek water, render them with calm presets of the
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

### D2. Depth-aware shore waves — delivered 2026-10-12

**Summary.** Inside the landscape extent the sea state's swell becomes one coherent shore train marched over the bathymetry on
the CPU (`ocean/LandscapeOceanShore.js`: an exact signed Euclidean shore distance, the finite-depth phase speed per texel,
fast-marching travel time from the open-sea plane wave so the crests turn toward the shore normal, the energy flux `H² cg`
transported along the characteristic and capped at the depth-limited breaking height `γ h` = 0.78 h on sand, so bars and reefs
shadow the water behind them and the capped texels are the surf zone; rock keeps its flux and surges) and drawn by the surface
programs on top of the spectral cascades (`chunks/landscape/ocean_shore.glsl`: phase `ω (t − T)`, amplitude `H / 2` under a
group envelope and a longshore variation, a Stokes crest that sharpens toward breaking, a front compressed into a bore on sand,
a Gerstner orbital displacement that fades in the last metre, a reflected standing component on rock; band-limited like the
cascades so it never aliases on the far rings or at grazing views). The coast comes from the geology sidecar
(`ocean/LandscapeOceanCoast.js`: rock = platform ∪ bluff-toe, the `waveExposure` of the bar, surf and swash damps the train of
a sheltered shore toward 0.4 over its last 60–220 m; a missing or unbound sidecar yields the neutral coast). The extent field
carries the shore channels as RGBA16F (depth, shore distance, wave height, exposure) plus RG32F (travel time, rock − 8 over
land; the land side of the travel time is filled from the shoreline so bilinear lookups never bleed), the cascades fade per
cascade below a tenth of their longest wavelength (7.2–18 m, 2–5 m, 0.25–0.625 m at medium) and the train's weight is the
complement of the swell cascade's fade, so the open sea hands over once. A sea-state switch marches the shore again in the
background and swaps the channels in when done (`snapshot().ocean.settled`); the far-field surround now binds after the ocean
exists (a surround that became active during the march was missed before). Residency: the share grew to 48 / 64 MiB
(`LANDSCAPE_OCEAN.budgets`; 21 CPU and 16 GPU bytes per extent texel) and the shipped CPU profiles by the same 16 MiB (672 →
688 MiB, `LANDSCAPE_STREAMING_BUDGETS` / `LANDSCAPE_SURFACE_CACHE_BUDGETS`, appearance ceilings 344 / 208 MiB). Two shading
fixes landed with it: a facet tilted away from a grazing view bends its normal toward the eye instead of switching to the
underwater branch (the D1 branch painted the backs of steep crests as the sea's underside), and reef shadows spread by the
upwind-weighted flux instead of running grid-aligned corridors.

**Spec and sources.** `specs/landscape/LANDSCAPE_OCEAN.md` §2b (shore model), §3 (runtime rows), §5 (limitations);
`LANDSCAPE_VIEWER.md` (`snapshot().ocean.shore`, `setOceanDebug(0..8)`), `LANDSCAPE_STREAMING.md` / `LANDSCAPE_PERFORMANCE.md`
(688 MiB CPU profiles), `LANDSCAPE_NATURAL_WORLD_ROADMAP.md` status; `src/graphics/engine3d/landscape/ocean/LandscapeOceanShore.js`,
`LandscapeOceanCoast.js` (new), `LandscapeOcean.js` (shore march, textures, async sea state), `LandscapeOceanModel.js`
(`cascadeFade`, `shore`, `landscapeOceanCascadeFade`, `landscapeOceanShoreInputs`, budgets), `LandscapeOceanSurface.js`
(shore uniforms, `update(camera, time)`, `setShore`, debug view 8), shaders `chunks/landscape/ocean_shore.glsl` (new),
`ocean_sampling.glsl`, `ocean_surface.vert/frag.glsl`; `LandscapeView.js` (awaited sea-state switch, far-field binding after
the ocean); `LandscapeResidencyBudget.js`, `LandscapeSurfaceCacheLayout.js`; tools `tools/landscape_review/capture.mjs`
(`--ocean-debug`), `poses/ocean-shore-v1.json` (OS-01..OS-05), `shore_statistics.mjs` (new), README; `.claude/launch.json`
(`landscape-server-v3`).

**Validation.** Unit: `tests/node/unit/landscape_ocean_shore.test.js` (EDT against brute force, land fill, phase-speed limits,
plane-wave travel time, beach refraction 30° → mean crest angle < 12°, breaking depth ≈ H / γ for 0.5 / 1 / 2 m, reef shadow and
rock surge, deepest-percent fallback, the yielding driver bit for bit, the beach crest mask), `landscape_ocean_coast.test.js`
(north-first page sampling, zones, exposure, breaking per zone, beach mask, neutral coast), `landscape_ocean_model.test.js`
(fades, shore inputs, field bytes, the 48 / 64 MiB share); all 618 landscape unit tests pass. Offline on coastal v3
(`tools/landscape_review/shore_statistics.mjs`, `d2/shore/statistics.json`; calm / moderate / rough): crest angle on the beach
mean 10.8 / 10.0 / 9.8° (p90 24 / 23 / 22°), breaking depth p90 0.65 / 2.03 / 4.57 m against H / γ 0.44 / 1.65 / 4.07 m, breaking
share of the bar 0 / 3.5 / 53 %, the reef 0 / 7.6 / 43.5 %, the surf 0 / 49 / 52 %, the swash 29 / 44 / 44 % (dry texels included), the
open-sea zone 0 / 0 / 4.6 % (its shoals above 5 m), the platform and the bluff toe 0 % (every rock texel of v3 is 0.4–10 m above sea level: the rock surge is verified on synthetic rasters only).
Browser: `tests/headless/e2e/landscape_ocean.pwtest.js` D2 test on v3 with the surround (`d2/suite/shore-suite.json`, run 4 after three assertion rounds: 2 passed in 4.6 min; the browser numbers equal the offline ones exactly; surf determinism at NW-12 mean difference 0.016 at the same time, 1.39 after a 0.5 s step, 0.019 restored): the field bytes and
linear filtering, the coast (16 pages, rock and exposure texels), the train's inputs, the gate statistics for moderate / rough /
calm (crest angle < 15° mean and < 30° p90, no breaking on rock or offshore, swash denser than surf, p90 breaking depth within
0.6–1.6 H / γ, rough deeper and more on the bar and reef than moderate, calm shallower), determinism of the surf at NW-12
(same time / step / restored), debug view 8, the march repeating bit for bit after the switch back, disposal to zero; the D1 test
still passes. Regressions: `landscape_surround` 1 / 1 (self-served v3), `landscape_surface_cache` 6 / 6 (the raised CPU profile pins), `landscape_lighting` 6 / 6 and `landscape_acceptance` 4 / 4 on the v2 default server (`d2/regressions/`, runs 3: the first runs failed on the ocean's program-link poll outliving a disposal during the longer D2 load (GL_INVALID_VALUE warnings; the poll now follows the current program and stops on the load abort) and on the geology sidecar probe's 404 on v2, whitelisted like the surround probe; the ocean suite ran six times while the D2 assertions and that fix settled, `d2/suite-run6.log` is the final 2 / 2). Captures (`d2/animated/` NW-12, NW-10, NW-09, NW-01; `d2/shore_poses/`
OS-01..05; `d2/debug8/`) and composites against the user's coast references (`d2/composites/`: NW-12 and NW-01 as the gate's
R09 / R08 substitutes, NW-10, OS-01, OS-03; R08–R10 are still missing on disk). Motion: static clips of 90 frames at 30 fps from the fixed time (`d2/clips/`, `clip.mp4` each): NW-12 over the surf (right half above the beach) mean frame difference median 0.22 / max 0.31, OS-01 over the sea band 1.05 / 1.18, no spikes (the train moves smoothly, no popping).

**Measurements.** Paired GPU frame time animated vs flat (`d2/perf/measure_ocean.json`, RTX 3060, 1920 × 1080, cache on, 30 warm-up + 120 sampled frames, medians): NW-12 9.6 vs 7.3 ms (+2.3), NW-10 11.2 vs 5.0 ms (+6.2), NW-09 11.5 vs 9.5 ms (+1.9), the simulation batch 0.98 ms (D1: +3 to +6 ms, batch 1.1–1.65 ms); measured while another process's Blender render held the GPU at 98 % (every pose shows 515 ms stalls and NW-11 read 326 vs 55 ms with 337 / 167 ms frame intervals), so these are conditions, not budgets: D7 re-measures on an idle GPU. CPU: march 165–190 ms per sea state, distance transform 51 ms, land fill 8–21 ms, coast
rasterization with the 16 geology pages ~0.3 s of fetches; the ocean reports active 0.9 s after the load on v3 (D1 0.6 s).
Residency at medium: 30.8 MiB GPU / 21.4 MiB CPU in the share (D1 24.5 / 5.7).

**Limitations.** One monochromatic train (the wind sea's short waves fade without breaking; the group envelope rides with the
phase; no diffraction model; depth-limited breaking only); rock surge untested on v3 (no wet rock there); a crest can wash a
few metres over low sand until D4; no foam, so the breaking fronts read as dark faces (D3); the train stops at the extent (the
surround's coast keeps the depth fade only); the sea-state recompute re-reads the depth raster but not an edited terrain.

**Artifacts.** `tests/artifacts/screens/landscape/ai597/d2/` (README.md: captures, composites, debug views, `shore/statistics.json`,
`suite/shore-suite.json`, clips, `perf/`, `regressions/`).

### D3. Foam lifecycle — delivered 2026-10-12

**Summary.** Foam is a lifecycle state over the extent plus an instantaneous term per fragment. The state
(`ocean/LandscapeOceanFoam.js`, `ocean_foam.frag.glsl`) is a ping-pong RG16F raster at the extent field's resolution (1024², 8 MiB
in the share): the foam density on the water and the foam the backwash leaves on the sand. One full-screen pass advances it by a
fixed 1/30 s step, sharing the surface's uniform set so it reads the same fields, shore train and cascades: both channels decay
(6 s on the water, 25 s on the sand), the water foam drifts shoreward along the train at 0.3 m/s and diffuses into its
neighbours, and the step adds its sources: the breaker band at the bore front of the shore train, whitecaps where the spectral
surface folds (a point sample of the full-resolution Jacobian, so a texel accumulates foam as often as it folds, filling to half
at most so the streak stays lacy), the shoreline line where each crest reaches the last metres of water, and the deposit on the
sand within 8 m of the waterline when a crest arrives. The schedule is a pure function (`landscapeOceanFoamSchedule`): fixed steps
with a carried remainder in free mode; any time the steps cannot reach within four (a fixed capture time, a clock reset, a
sea-state switch) restarts the state from zero 12 s earlier and steps up to it (360 steps), so a fixed time repeats exactly. The
surface (`chunks/landscape/ocean_foam.glsl`) draws the fragment's density (state plus its own breaker front and folding) through a
world-space procedural pattern (value noise at 9.6 / 2.4 m, ridged lace at 2.4 / 0.6 m, a 0.15 m bubble octave that fades with
the pixel footprint: no texture, no tiling) as a Lambertian layer (albedo 0.85) under the sun with the terrain's sun visibility
and the sky irradiance, hazed like the water, composed over the water's radiance and raising the alpha to opaque. Debug view 9
shows the density, the coverage and the sand deposit; `oceanFoamReadback()` returns the rasters with their statistics per coastal
zone. The foam on the sand is computed (the state's second channel, mean 0.07 along the swash) but drawn only by the D4 swash
sheet: the terrain program has no sampler or uniform left.

**Spec and sources.** `specs/landscape/LANDSCAPE_OCEAN.md` §2c (foam model), §3 (foam state and drawing rows), §4, §5;
`LANDSCAPE_VIEWER.md` (`snapshot().ocean.foam`, `oceanFoamReadback`, `setOceanDebug(0..9)`), `LANDSCAPE_NATURAL_WORLD_ROADMAP.md`;
`src/graphics/engine3d/landscape/ocean/LandscapeOceanFoam.js` (new), `LandscapeOceanModel.js` (`foam`, `landscapeOceanFoamSchedule`,
the resources part), `LandscapeOcean.js` (the state's creation, per-frame advance, reset on a sea-state switch, read-back,
snapshot), `LandscapeOceanSurface.js` (`uniforms`, `setFoam`, the foam uniforms, debug view 9), `LandscapeOceanCoast.js`
(`zoneLabels`); shaders `materials/landscape/ocean_foam.frag.glsl` (new), `chunks/landscape/ocean_foam.glsl` (new),
`ocean_sampling.glsl` (`oceanFoldingAt`), `ocean_shore.glsl` (the slope's phase), `ocean_surface.frag.glsl`,
`LandscapeOceanShaderLoader.js` (the `foam` kind); `main.js` (`oceanFoamReadback`); `tools/landscape_review/capture.mjs`
(`--ocean-debug 0..9`), README, `PROJECT_TOOLS.md`.

**Validation.** Unit: `landscape_ocean_model.test.js` (the schedule: grid steps with the carried remainder, the pre-roll restart for
unreachable times, the foam bytes in the estimate); all landscape unit tests pass. Browser: the D3 test of
`tests/headless/e2e/landscape_ocean.pwtest.js` on v3 with the surround (`d3/suite/foam-suite.json`, 3 / 3 with the D1 and D2
tests in 1.1 min): the state's recipe, texels, step, pre-roll (360 steps) and bytes, the share's five entries, moderate foam on the
surf (covered 56 %), the bar (17 %), the swash (38 %) and none on the open sea, the swash deposit, determinism (the read-back
restored to the fixed time equals the boot's exactly, a 0.5 s step differs), debug view 9 at NW-12, rough whitecaps on the open sea
(6.9 % covered) above moderate's (0 %) and more foam everywhere, calm next to none beyond the shoreline (swash 15.6 %), disposal
to zero. Per-zone statistics across the sea states: `d3/foam_statistics.json` (`foam_statistics.mjs`). Motion: static clips of
90 frames (`d3/clips/`): NW-12 over the surf mean frame difference median 0.40 / max 0.64, OS-01 over the sea band 1.06 / 1.16, no
spikes; periodicity of the OS-01 surf band (`d3/periodicity-OS-01-foam.json`): not repeating. Captures (`d3/animated/` NW-12,
NW-01, NW-10; `d3/shore_poses/` OS-01, OS-02, OS-04; `d3/debug9/`) and composites `[reference | D2 | D3]` against the user's coast
references (`d3/composites/` NW-12 as the R09 substitute, NW-01 as the R08 substitute, OS-01; R08–R10 still missing on disk).
The look iterations (`d3/first..fourth/`) record the tuning: the first folding threshold (0.08) whitened the whole sea, the
moderate sea's finest cascade reaches a folding of 0.64 only at its rarest crests, so whitecaps start at 0.55; the source rates
were lowered until the state stopped saturating. Regressions: `landscape_surround` 1 / 1 (self-served v3), `landscape_lighting` 6 / 6 and `landscape_acceptance` 4 / 4 on the v2 default server (`d3/regressions/`; the first acceptance run failed its orthographic zoom on the global popping ratio, 2.22 against the flat-sea pin of 1.18–1.22 x 1.15: the frame difference falls smoothly from 13.6 to 5.5 over the zoom because the wide end sees the foam's contrast, the local ratio stays 1.05 (no pop), so the pin moved to the animated sea's measurement and the second run passed); all 619 landscape unit tests pass.

**Measurements.** Paired GPU frame time animated (D3: cascades + shore train + foam) vs flat on an idle GPU (`d3/perf/measure_ocean.json`, RTX 3060, ANGLE/D3D11, 1920 × 1080, cache on, 30 warm-up + 120 sampled frames, medians): NW-12 9.0 vs 5.6 ms (+3.5), NW-10 12.9 vs 5.4 ms (+7.5), NW-11 14.6 vs 12.6 ms (+2.0), NW-09 13.1 vs 6.5 ms (+6.6); every pose stays vsync-bound at 16.7 ms intervals (p95 16.8); the simulation batch 0.42–1.33 ms (its own timer; the foam steps and the surface draw are inside the frame time). The D1 deltas were +3 to +6 ms under a contended GPU, so the shore train and the foam add about +1 to +2 ms at the oblique poses; D7 tabulates the quality presets. The state: 360 pre-roll steps submit in under 2 ms of CPU, 1–4 steps per frame in free mode, 8 MiB
GPU in the share (medium total 39 MiB GPU of 64).

**Limitations.** Opaque Lambertian foam (no translucency, no crest shadow on it); persistence only inside the extent (the far-field
sea shows the instantaneous folding); whitecap streaks follow the folding of 4 m texels, so they read as patches rather than
individual crest breaks; the sand deposit is state only until D4; the eye-level swash is still a mirror (D4).

**Artifacts.** `tests/artifacts/screens/landscape/ai597/d3/` (README.md).

### D4. Swash and wet beach — delivered 2026-10-12

**Summary.** The run-up, the backwash and the wet beach are a thin sheet drawn over the sand the terrain renders
(`ocean/LandscapeOceanSwashBand.js` pure, `ocean/LandscapeOceanSwash.js` runtime, `ocean_swash.vert/frag.glsl`, chunk
`ocean_swash.glsl`, constants `LANDSCAPE_OCEAN.swash`; spec §2d). The band is the native beach samples (`manifest.grid.maxLevel`:
the coarser levels differ from them by 3 cm on average and 1.8 m at the bluff steps) between 6 m into the water and 100 m inland,
1.5 m below to 2.5 m above sea level: 29 chunks, 344 669 vertices as 16-bit integers (grid column, height in millimetres, grid
row), 665 348 triangles, 6.06 MB loaded beside the shore march in 0.3–0.4 s, one premultiplied mesh per chunk lifted 3 cm plus
2 mm per metre of distance, drawn before the rings, never picked. Each sand fragment follows its nearest waterline texel's crest
arrival (read along the gradient of the exact shore distance, 2 m past the waterline and averaged along the shore), the swash
cycle `u = fract(lag / period)` runs the front up to Stockdon's R2 run-up of the sea state's swell at the foreshore slope (capped
at 14°, scaled by the train's group envelope, longshore variation and exposure) and back; the sand is under the film while the
front is above it, wet afterwards with the drying lag `e^(−t / 60 s)` from the last of eight remembered cycles, saturated below
the 0.85 m tidal and capillary reach, with the wrack line at the highest remembered run-up; everything analytic in the clock.
The terrain hands its static AI577 D5 wetting to the sheet while it draws (`uLandscapeOcean.y`, `LandscapeLighting.setOceanSurface(animated, swash)`,
`landscapeCoastalWetSurface(..., reach × (1 − uLandscapeOcean.y))`). The sheet composes in linear light over the sand's representative
radiance and reaches the terrain's display-encoded pixel as a display ratio (the Lekner–Dorf darkening of the calibrated wet
surface, 0.6 of the albedo, the alpha) plus a display increment (the Fresnel sky along the reflection, the Cox–Munk glitter: the
water sheet near a mirror under the finest cascade's ripples at half amplitude, saturated sand at the calibrated wet roughness and
0.6 gloss); the foam at the leading edge is a 1.5 m band along the beach, the sheet carries 0.3 of the shoreline's foam supply
thinning seaward and the backwash leaves 0.5 of it dying over 10 s, all through the D3 lace. The D3 state's sand channel became
that supply (the water foam at the texel's nearest waterline, refreshed per crest; its D3 deposit rate saturated the band), the
D3 rings fade out within 4 m inland of the still-water line so a crest no longer washes over the beach as a water surface, and
the shared shading helpers moved to `chunks/landscape/ocean_shading.glsl`. Residency: the band reserves 6.1 MiB in the ocean share
(estimate 8 MiB); the share is 48 / 80 MiB and the shipped GPU profiles grew by 16 MiB (432 / 624 MiB, 764 and 1126 MiB at QHD and
UHD; `LandscapeResidencyBudget`, `LandscapeSurfaceCacheLayout`, the streaming and performance specs, the pins). Debug view 10 shows
the sheet's wetness, film and front foam; the review poses OS-06 (the swash from the berm) and OS-07 (the wet line from above,
heading 180 so the frame looks away from the sun's mirror point) joined `poses/ocean-shore-v1.json`.

**Evidence.** Suite `tests/headless/e2e/landscape_ocean.pwtest.js` D4 test (run 3: 4 / 4 after the oldest-cycle fade; run 2: 4 / 4; run 1 failed only the D1 test's lighting pin `[1, 0, 0, 0]`, now `[1, 1, 0, 0]`; `d4/suite/swash-suite.json`): the sheet
active over the native band with its geometry inside the share, drawn with the ocean, the lighting uniform `[1, 1, 0, 0]`, six
share entries with the surround; at NW-12 identical pixels at the fixed time, different after a 2 s step, identical when restored;
the pick through the sheet returns the terrain, the same point the flat surface returns; debug view 10 draws and returns; at NW-03
the wet line differs half a period later; the flat switch drops the sheet and gives the terrain its static wetting back
(`[0, 0, 0, 0]`), the animated switch restores both; disposal to zero. Clips of 90 frames (NW-12 mean frame difference median 0.39 / max 3.37 (2 flagged frames at the start: the leading edge leaving the camera's near field at its fastest, the per-frame difference decaying 3.37 → 1.07 over 14 frames with no isolated jump); OS-06 mean frame difference median 0.27 / max 0.31, no spikes; NW-01 mean frame difference median 0.04 / max 0.07, no spikes; NW-03 mean frame difference median 0.28 / max 0.33, no spikes). Captures (`d4/animated/` NW-12,
NW-01, NW-03, NW-10; `d4/shore_poses/` OS-06, OS-07; `d4/debug10/`) and composites `[reference | D3 | D4]` against the user's
references (`d4/composites/`; R08–R10 still missing on disk). The look iterations (`d4/first..eighth/`, `d4/probe_terms/`) record
the tuning: the BFS fill's Manhattan arcs on the front, the 1 cm height staircase, the deposit blanket, the sun's mirror point in the
OS-07 frame, the display-space composition and the front band width. Regressions: `landscape_surround` 1 passed (self-served v3), `landscape_lighting` 6 passed and `landscape_surface_cache` 6 passed on the v2 default server; `landscape_acceptance` 4 passed on run 2 (run 1 1 passed, 3 failed: 17 per-entry console warnings of the PBR catalog skipping a sibling branch's `tree_ai_*` materials of unknown classes in the shared assets folder, now one info line). Unit tests
`landscape_ocean_swash.test.js` (3), `landscape_ocean_shore.test.js` (the land-side smoothing), `landscape_ocean_model.test.js`
(share, parts, lighting value); the landscape unit set 623 passed (`d4/unit-run1.log`).

**Measurements.** Paired GPU frame time animated (D4: cascades + shore train + foam + swash sheet) vs flat
(`d4/perf/measure_ocean.json`, ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11), 1920 × 1080, cache on, 30 warm-up + 120 sampled frames, medians): NW-12 12.3 vs 6.6 ms (p95 14.9; D3 9.0 vs 5.6), OS-06 11.6 vs 6.5 (p95 14.4), OS-07 11.4 vs 5.7 (p95 14.9), NW-10 13.6 vs 6.5 (D3 12.9 vs 5.4), NW-11 15.4 vs 12.7 (D3 14.6 vs 12.6), NW-09 13.5 vs 6.4 (D3 13.1 vs 6.5); the flat reference itself rose by about 1 ms at NW-12 and NW-10 against the D3 measurement, so the machine was not in the same state: the sheet's own share at the shore poses is the animated rise above D3 less that, about 2 ms at NW-12 where the sheet covers the lower half of the frame (the dry part of the 100 m band still pays the arrival and run-up samples before it discards); D7 sizes the presets. The sheet's program links in 16–330 ms in parallel with the surface's.

**Limitations.** Stockdon's statistical R2 per wave, no hydrodynamic bore, infiltration or backwash–bore interaction, one front per
train period; the foreshore slope, the arrival and the foam supply come from the 3.9 m extent field; the rings stay over the
shallow sand seaward of the still-water line, where their LOD steps show as faint angular reflection patches over the bright
bottom (D5's water colour covers the shallows); a pose looking at the sun's mirror point sees the wet beach as glare (the physics
of a wet mirror); the prompt's NW-01 and NW-03 see the swash only at the horizon, so the wet-line motion is shown at NW-12, OS-06
and OS-07 and measured at NW-12 and NW-03.

**Artifacts.** `tests/artifacts/screens/landscape/ai597/d4/` (README.md).

### D5. Water colour, refraction and light — delivered 2026-10-14

**Summary.** The viewer's frame renders into a linear half-float target and a final pass tone-maps it for the canvas
(`LandscapeFramePipeline.js`, pure constants `LandscapeFramePipelineModel.js`, `frame_final.frag.glsl`; spec §2e): three.js compiles
the materials' own tone mapping and output transfer out under a render target, so no material changed to write linear radiance, and
the first ocean ring copies the opaque frame (the terrain lit under water without its column, the backdrop, the swash sheet) into a
scene texture before the sea draws. The terrain hands its water column, interface and air light to the sea while the animated
surface draws (`uLandscapeOcean.x`, camera above the water); the surface refracts the eye ray at the facet to the seabed level,
reads the scene texture at that point's projection (the straight sample where the refracted point leaves the frame or lands on
land), runs the AI577 column along the refracted path with the local water (the clear coastal water blended toward an oceanic type
with the still-water depth, 5–20 m, and toward a stirred surf type with the breaking and the foam), scales the sun's share of the
seabed by the caustic ratio of the refracted sun's mapping (`1 / |1 + (1 − 1/n) d ∇²h|` from the two finest cascades' slopes at the
sun's entry point, contrast 0.5, fading with depth and with the pixel footprint), adds the crest scattering (the fragment's own
height with the train's sharpening, toward the sun, in the local deep colour) and the terrain where the mirrored ray of the train's
smooth normal meets the extent's height raster inside the frame (a heightfield screen-space reflection with a soft clearance
weight), then composes transmitted share, reflected sky, glitter and foam in linear light, opaque. The final pass carries an
FXAA-console edge filter in place of the canvas multisampling (an RGBA16F target with four samples would cost 116 MB at 1080p and
464 MB at UHD, and the copy cannot read a multisampled framebuffer). Verification views 11–14 (the seabed through the surface, the
water below it, the caustic ratio, the crest scattering); the capture tool accepts `--ocean-debug 0–14`.

**Evidence.** Suite `tests/headless/e2e/landscape_ocean.pwtest.js` D5 test (run 3 5 passed (run 2 4 passed, 1 failed: the flat reference's drawn-last-frame flag lagged the pipeline's second pass; run 1 4 passed, 1 failed: the D1 determinism read before the terrain under the sea had stopped refining, now a converged read); `d5/suite/light-suite.json`): the pipeline
active at the drawing buffer's size with the model's bytes and copies, the surface reading the scene with the water types and the
light constants, the lighting handover `[1, 1, 0, 0]`, identical pixels at the fixed time over the reef, different after a 2 s step,
identical when restored, views 11–14 drawing (the seabed sample differing from the shaded water) and returning, the pipeline kept
through the flat switch, disposal to zero. Reflection measurement `d5/reflection_hits.json`: NW-10 0.2 % planar (8.8 % at 5°, water 55 % of the frame), NW-02 0.0 % planar (0.0 % at 5°, water 1 % of the frame), NW-12 1.7 % planar (4.4 % at 5°, water 7 % of the frame), NW-09 12.7 % planar (32.1 % at 5°, water 48 % of the frame), OS-06 0.0 % planar (0.0 % at 5°, water 12 % of the frame), OS-04 0.0 % planar (0.0 % at 5°, water 74 % of the frame), NW-01 0.0 % planar (0.0 % at 5°, water 1 % of the frame), NW-03 0.0 % planar (15.2 % at 5°, water 0 % of the frame). Seabed visibility over
sand and rock at OS-04 (`d5/seabed_visibility_OS-04.json`, the shaded frame against view 11 per coastal zone and depth bin):
rock 1–2 m: shaded 0.662 / seabed 0.723, ratio 0.916, correlation 0.158; rock 2–4 m: shaded 0.524 / seabed 0.677, ratio 0.774, correlation 0.204; rock 4–8 m: shaded 0.454 / seabed 0.603, ratio 0.754, correlation 0.091; sand 0–1 m: shaded 0.683 / seabed 0.767, ratio 0.891, correlation 0.115; sand 1–2 m: shaded 0.684 / seabed 0.733, ratio 0.933, correlation 0.188; sand 2–4 m: shaded 0.508 / seabed 0.684, ratio 0.743, correlation 0.498; sand 4–8 m: shaded 0.44 / seabed 0.567, ratio 0.775, correlation 0.023. Clips of 90 frames (NW-10 mean frame difference median 1.59 / max 1.74, no spikes; OS-06 mean frame difference median 0.49 / max 0.53, no spikes). Captures (`d5/animated/` NW-01, NW-02, NW-10, NW-12, NW-09; `d5/shore_poses/` OS-01,
OS-04, OS-06; `d5/debug11..14/`; `d5/flat/` the reference through the pipeline) and composites against the user's references
(`d5/composites/`: NW-01 against the R08 substitute with D4 as the before, NW-02 against the R08 substitute with the flat
reference as the before (no earlier capture of that pose exists), OS-04 sand against rock with the seabed view, NW-10, OS-06; R08–R10
still missing on disk). The look iterations (`d5/first..sixth/`, `d5/probe_terms/`) record the tuning: the broken-program
turquoise seabed, the caustic speckle at 70 m, the deposit of the crest factor from the vertex cell, the reflection loops of the
per-facet normal. Regressions: `landscape_surround` 1 passed (self-served v3), `landscape_lighting` 6 passed, `landscape_surface_cache` 6 passed and `landscape_acceptance` 4 passed on the v2 default server. Unit tests `landscape_ocean_model.test.js` (the water types), the landscape unit set
623 passed (`d5/unit-run1.log`).

**Measurements.** Paired GPU frame time animated vs flat, both through the pipeline (`d5/perf/measure_ocean.json`,
ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11), 1920 × 1080, cache on, 30 warm-up + 120 sampled frames, medians): NW-12 13.1 vs 5.3 ms (D4 12.3 vs 6.6), OS-06 13.5 vs 5.1 ms (D4 11.6 vs 6.5), OS-07 15.0 vs 3.6 ms (D4 11.4 vs 5.7), NW-10 15.5 vs 5.1 ms (D4 13.6 vs 6.5), NW-11 13.5 vs 6.4 ms (D4 15.4 vs 12.7), NW-09 15.6 vs 5.1 ms (D4 13.5 vs 6.4); the flat reference itself fell against D4 (NW-12 1.3 ms, OS-07 2.0 ms, NW-11 6.2 ms: the scene no longer renders with the canvas multisampling), so the water light's own cost is the animated rise plus that saving: NW-12 2.0 ms, OS-07 5.7 ms, NW-11 4.3 ms (NW-11 is the aerial view, where the multisampling saving on the far terrain outweighs the light; OS-07 looks down on a frame full of sea, where the refraction read, the caustic taps and the reflection march run per pixel). Draw calls per frame with the final pass: NW-12 74, OS-06 45, OS-07 30, NW-10 80, NW-11 116, NW-09 72. Pipeline bytes 41.5 MB at 1920 × 1080 (166 MB at UHD), outside the ledger.

**Limitations.** The terrain reflection sees only terrain inside the extent and the frame, through the frame's front-most surface,
never the sheet, the foam or the surround; caustics and the crest scattering are approximations (no sun-disc blur, no path through
the crest); three blended water types, not a turbidity field; the flat reference composes in linear light now, so its horizon
reads darker than its display-space calibration; NW-01 and NW-02 see the sea only at the horizon, so the R08 composites there show
little water (the sand-versus-rock comparison is OS-04).

**Artifacts.** `tests/artifacts/screens/landscape/ai597/d5/` (README.md).

### D6. Inland water — closed 2026-10-14 (nothing to render)

**Finding.** AI 596 published no inland water surface on coastal-city-v3 (`specs/landscape/LANDSCAPE_AI596_HANDOFF.md` §7): the
land-cover class 0 is exactly the 4,447,457 samples below sea level (the drainage class `sea`), no drainage channel carries a water
level above Y = 0, and the hydrology products are data only: the `drainage` classes (hillslope 10,080,384, rill 213,646, gully
119,628, channel 12,831, flat-pond 1,911,463 samples) and the terrain fields' depression analysis (1,911,391 samples filled in
1,080 flats, a maximum fill depth of 9.70 m), where a pond candidate is a flat-pond sample with a positive fill depth outside
planning cover. The prompt closes the deliverable in that case; this record is the closure.

**What the system holds for it.** The `calm` sea state (a 3 m/s breeze over 15 km of fetch with a low long swell) is the preset such
water would use. The surface, the water column and the light are bound to the sea level and the extent field, so an inland body
would need its own published surface (a water level per body, a raster or polygons, which AI 596 did not derive: its own data-only
product, never a terrain edit) and a second instance of the surface at that level with the flow direction from the drainage
channels; nothing of that is built, and the spec (§2f) records the gap for the product that would need it.

**Artifacts.** None: there is no inland water to capture. The finding is recorded in the spec and the roadmap.

## On completion

- Mark the first line DONE only after D1–D7 pass.
- Rename to `prompts/AI_DONE_codex_landscape_597_MATERIAL_animated_ocean_shore_waves_and_foam_DONE.md`.
- Keep it in `prompts/`; do not archive automatically.
- Add a one-line summary per completed change, focused validation results, before/after performance
  tables with conditions, and artifact paths. Update the roadmap status table.
