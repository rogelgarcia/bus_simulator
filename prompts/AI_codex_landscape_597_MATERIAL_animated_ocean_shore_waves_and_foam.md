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

- [ ] **Spectrum and surface.** Provide multi-cascade spectral waves with:
  - directional spreading;
  - a finite-depth spectrum and dispersion (TMA rather than deep-water only);
  - choppy horizontal displacement, normals and a surface-folding measure.

  Wind, swell and fetch parameters live in versioned sea-state presets (calm, moderate, rough). The time
  base is deterministic.
- [ ] **Coverage to the horizon.** The surface covers everything from the shoreline to the horizon, well
  beyond the 4 km extent, with continuous level of detail. It must show no visible tiling, swimming,
  cracks or popping, and no seam with the AI 596 far-field land.
- [ ] **Optics.** Keep the existing optics physically consistent on the displaced surface: Fresnel,
  sky reflection, water column, glint and underwater view.
- [ ] **Gate.**
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

## On completion

- Mark the first line DONE only after D1–D7 pass.
- Rename to `prompts/AI_DONE_codex_landscape_597_MATERIAL_animated_ocean_shore_waves_and_foam_DONE.md`.
- Keep it in `prompts/`; do not archive automatically.
- Add a one-line summary per completed change, focused validation results, before/after performance
  tables with conditions, and artifact paths. Update the roadmap status table.
