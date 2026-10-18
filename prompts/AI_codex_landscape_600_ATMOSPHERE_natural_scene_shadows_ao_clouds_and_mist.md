# Natural scene shadows, AO, clouds and mist (AI 600)

# Problem

The landscape viewer lights the terrain with the game's calibrated daylight: an HDR sky, spherical
harmonic sky light, closed-form aerial perspective, and horizon-based terrain self-shadowing. That is
enough for bare ground. It is not enough once trees, shrubs, rocks and ground cover arrive.

What the viewer lacks:

- **Shadows.** There are no shadow maps (`LANDSCAPE_APPEARANCE_RUNTIME.md`: lighting resolves "without
  GameEngine, City or CSM"), so placed objects would cast no shadows.
- **Post-processing.** There is no screen-space ambient occlusion and no post-processing chain.
- **Sky.** The sky is cloudless (`clear-afternoon-55.hdr`). There are no clouds, cloud shadows or mist.

The game itself already has cascaded shadows (`CityCascadedShadows.js`, `ShadowSettings.js`), caster
culling, a finite-sun penumbra, GTAO and an anti-aliasing and post-processing pipeline
(`PostProcessingPipeline.js`).

The references depend on these effects:

- R07: thousands of tree shadows on slopes.
- R02, R05, R06: dark forest interiors, ground mist and fog banks.
- R01, R03, R08, R10: cumulus clouds and cloud shadows.
- R03, R10: low golden sun with long shadows.

# Request

Give the landscape viewer natural-scene lighting that stays consistent with the game's calibrated
daylight. It needs:

- sun shadows for terrain and instanced content;
- ambient occlusion at screen, object and canopy scale;
- clouds with cloud shadows;
- terrain-aware mist and haze;
- time-of-day and weather presets for matching the references.

The calibrated daylight stays the default, so screenshots remain game-consistent.

## Execution and scope

- Start only after AI 595 PROJECTMAINTENANCE (removing the landscape cache from Git history) is
  complete: it rewrites this branch and moves the landscape cache to a gitignored location. Generated
  landscape data (terrain revisions, pages, fields, channels, placement tiles, caches) is a local bake
  output that is never committed or sent through Git LFS. Commit recipes, small authored configuration,
  code, tests and specs. Paths written as `assets/public/landscape/` mean the cache location AI 595
  documents.
- Read `specs/landscape/LANDSCAPE_NATURAL_WORLD_ROADMAP.md` first. This AI owns layer L7.
- The AI 599 instanced renderer provides the shadow-caster hooks. Start with test casters if AI 599 is
  incomplete. Final acceptance happens with real layers.
- Reuse the game's shadow, AO and post components where they fit, without importing GameEngine or City
  into the viewer. Where reuse is impossible, explain why.
- Implement one deliverable at a time, using subagents with maximum reasoning. Verify and commit each
  completed deliverable.
- Use port 8002. Put evidence under `tests/artifacts/screens/landscape/ai600/<deliverable>/`. Composites
  are `[reference | before | after]`.
- Keep the ANGLE/D3D11 constraints in mind:
  - PMREM triggers FXC warning X4122;
  - multi-output programs stall the first draw;
  - cold compiles are expensive.

  Measure compile impact and keep optional features as compiled variants.
- The game lighting standard is CALIBRATED_DAYLIGHT (`CalibratedDaylight.js`: sun azimuth 45°,
  elevation 55°, exposure 0.0511, IBL). Tool views that clamp exposure are not game-consistent. Keep the
  calibrated preset as the default and the reference for regressions.
- Realism first, with costs measured and quality tiers provided.

## Deliverables and dependencies

| Deliverable | Depends on | Usable outcome |
| --- | --- | --- |
| D1. Sun shadows | AI 599 caster hooks | Soft cascaded sun shadows from instances and terrain, consistent with horizon shadows |
| D2. Ambient occlusion and contact | D1 | Screen-space AO, canopy-scale occlusion and ground contact |
| D3. Clouds and cloud shadows | D1 | Cloud presets drawn in the sky and shadowing terrain, water and instances |
| D4. Mist and aerial depth | D3 | Terrain-aware valley mist, coastal haze and forest mist |
| D5. Lighting presets and calibration | D4 | Time-of-day and weather presets matched to references; calibrated default unchanged |
| D6. Integrated acceptance | D5 | Performance tiers, regressions, specs |

### D1. Sun shadows

- [ ] **Cascades.** Fit cascaded or otherwise view-dependent sun shadows to the landscape's scales:
  2 m eye height, low flyovers and aerial overviews. Use soft penumbrae consistent with the finite sun
  disc.
- [ ] **Casters and receivers.** Instances cast onto terrain and onto each other. Terrain casts onto
  instances, consistent with the existing horizon visibility. No double darkening and no light leaks.
  Use shadow LOD and caster culling with stable transitions.
- [ ] **Gate.**
  - No shadow acne, peter-panning, swimming or cascade seams on the AI 577 camera paths.
  - Agreement with horizon shadows where both apply.
  - Measured cost per cascade configuration.

### D2. Ambient occlusion and contact

- [ ] **Screen-space AO.** Add GTAO or equivalent, with a cost-measured quality tier.
- [ ] **Canopy and contact occlusion.** Darken the forest floor under canopies, consistent across
  distance. Add contact occlusion for rocks, trunks and plants meeting the ground. Instances keep their
  self-occlusion.
- [ ] **Gate.** Forest interior (NW-05) and edge (NW-06) composites against R02 and R07. The aerial view
  shows no AO halos.

### D3. Clouds and cloud shadows

- [ ] **Clouds.** Add cloud layers consistent with the HDR sky and the sun: fair-weather cumulus,
  scattered and overcast presets, with physically plausible lighting and silhouettes against the
  horizon.
- [ ] **Cloud shadows.** Cloud shadows move across terrain, water and instances. A deterministic time
  base is used for captures.
- [ ] **Sky light.** Sky and ambient light stay consistent with the cloud cover. Document how this
  relates to the calibrated HDR.
- [ ] **Gate.** NW-10 and NW-11 against R01 and R03 (cloud masses and shadows). Clouds must not tile or
  repeat. Cost is measured.

### D4. Mist and aerial depth

- [ ] **Mist.** Add terrain-aware mist on top of the existing aerial perspective: valley and hollow fog
  pooling along the AI 596 drainage and wetness channels, coastal haze over the sea, and forest-interior
  mist. Light shafts are optional.
- [ ] **Gate.** NW-05, NW-08 and NW-11 against R02, R05 and R06, with mist off by default unless the
  user approves otherwise.

### D5. Lighting presets and calibration

- [ ] **Presets.** Provide time-of-day presets (morning, calibrated afternoon, golden hour, overcast) and
  weather presets, using physically consistent skies: calibrated renders or CC0 HDRIs with clouds, with
  provenance retained.
- [ ] **Exposure and grading.** Exposure and an optional grading LUT are applied consistently.
- [ ] **Default.** The calibrated daylight stays the default and the regression reference.
- [ ] **Gate.** A reference-matching sheet pairs each reference with the closest preset at its matching
  review pose.

### D6. Integrated acceptance

- [ ] **Regressions.** Run all landscape suites in both surface-cache modes.
- [ ] **Performance.** Record same-condition performance tables per quality tier, plus cold-compile
  measurements.
- [ ] **Specs.** Update the viewer, appearance runtime and lighting specs, and the roadmap status.

## Evidence and measurements

- **Captures.** Matched captures at the review poses per preset, motion clips for cloud shadows and
  shadow stability, and `[reference | before | after]` composites.
- **Performance.** Report frame time, FPS, GPU time per pass, compile time and memory, with full
  benchmark conditions. Mark missing metrics as not measured, with a reason.

## Research basis

- Game shadow and AO specs: `specs/graphics/` (cascaded shadows, finite-sun shadow, ambient occlusion,
  illumination runtime modes).
- Sucker Punch, [Samurai Landscapes: Building and Rendering](https://gdcvault.com/play/1027352/Samurai-Landscapes-Building-and-Rendering) (open-world landscape lighting at scale).
- Poly Haven CC0 HDRIs with clouds (`https://api.polyhaven.com/assets?type=hdris`) as calibrated-preset candidates.

## Completion record

Record each deliverable here when it passes: a summary, spec and source locations, validation results,
measurements, limitations and artifact paths.

## On completion

- Mark the first line DONE only after D1–D6 pass.
- Rename to `prompts/AI_DONE_codex_landscape_600_ATMOSPHERE_natural_scene_shadows_ao_clouds_and_mist_DONE.md`.
- Keep it in `prompts/`; do not archive automatically.
- Add a one-line summary per completed change, focused validation results, before/after performance
  tables with conditions, and artifact paths. Update the roadmap status table.
