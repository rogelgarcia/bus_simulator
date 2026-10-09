# Ground-level vegetation and natural clutter (AI 603)

# Problem

The user wants a proper ecosystem from any close camera angle at about 2 m height, not flat textures.
Today, at eye height, the ground is texture only. Grass is a uniform lawn texture, forest floor is bare
soil, the beach is clean sand without wrack, and rock areas are a brown band (see
`tests/artifacts/screens/landscape/ai577/d5/views/final/`).

At 2 m the visible frame is dominated by objects between 5 cm and 10 m:

- grass clumps of several species and heights;
- flowers and forbs, ferns, sedges, moss cushions and low shrubs;
- pebbles and stones, litter, twigs, fallen branches, logs, stumps and roots;
- beach wrack: driftwood, seaweed and shells.

None of these exists.

The earlier Grass Lab work (AI 350–362 and AI 537) was rejected by human visual review on 2026-08-31
(`specs/grass/GRASS_LAB_HUMAN_REJECTION.md`). Its appearance, atlases, density, LOD hierarchy,
thresholds and conclusions must not be reused as a baseline. Grass work restarts under a new visual
direction, and human acceptance of representative renders is required before optimisation or gameplay
use.

References:

- R02: moss, grass, rock and puddles mixed in small areas.
- R03: tall mixed grass with a stony dirt path.
- R06: sedge clumps and mud.
- R08: beach scrub and grass in the foreground.
- R10: cobbles, pebbles and driftwood.

# Request

Make the 2 m ecosystem. Ground vegetation and natural clutter are placed by habitat through the AI 599
engine, rest on the AI 598 layered surfaces, and fade at distance into the surface cover without a
visible boundary. They share wind with the trees and receive AI 600 shadows and occlusion.

Every NW review pose taken at eye height must show a believable, varied habitat within 0–30 m of the
camera.

## Execution and scope

- Start only after AI 595 PROJECTMAINTENANCE (removing the landscape cache from Git history) is
  complete: it rewrites this branch and moves the landscape cache to a gitignored location. Generated
  landscape data (terrain revisions, pages, fields, channels, placement tiles, caches) is a local bake
  output that is never committed or sent through Git LFS. Commit recipes, small authored configuration,
  code, tests and specs. Paths written as `assets/public/landscape/` mean the cache location AI 595
  documents.
- Read `specs/landscape/LANDSCAPE_NATURAL_WORLD_ROADMAP.md` first. This AI owns layers L5 and L6.
- Depends on:
  - AI 598 for surfaces, cover fraction and worn ground;
  - AI 599 for the engine;
  - AI 600 for shadows and AO;
  - AI 601 for forest-floor context and wind;
  - AI 602 for rocks and platforms;
  - AI 597 for swash reach and the wrack line.
- Implement one deliverable at a time, using subagents with maximum reasoning. Verify and commit each
  completed deliverable.
- **Human gate.** D1 needs the user's explicit visual acceptance before D3–D5 scale or optimise anything
  (Grass Lab restart rule). Lab instrumentation, timer tooling and exclusion queries may be consulted
  as references.
- Use port 8002. Put evidence under `tests/artifacts/screens/landscape/ai603/<deliverable>/`. Composites
  are `[reference | before | after]` at the 2 m review poses.
- Assets: CC0 only, with provenance. Candidates on Poly Haven include `grass_medium_01`, `_02`,
  `grass_bermuda_01`, `fern_02`, `shrub_01`–`_04`, `shrub_sorrel_01`, `nettle_plant`, `periwinkle_plant`,
  `moss_01`, flower sets, `dry_branches_medium_01`, `tree_stump_01`, `_02`, `dead_tree_trunk`,
  `pine_roots`, `root_cluster_01`, `_02` and `lambis_shell`. Procedural generation is welcome.
- Plan constraints:
  - low vegetation in the beach arrival's open-view corridor;
  - no boulders in the swim zone (pebbles and shells are allowed only where the habitat rules say so);
  - nothing on road surfaces or developed district ground.
- Realism first, with budgets accounted and measured once the look is accepted.

## Deliverables and dependencies

| Deliverable | Depends on | Usable outcome |
| --- | --- | --- |
| D1. Visual direction and human acceptance | AI 598, AI 599 | Accepted habitat vignettes at 2 m, before any scaling |
| D2. Ground-cover and clutter asset set | D1 | CC0/procedural plant and clutter assets with LOD chains, wind-ready |
| D3. Dense near-field vegetation | D2 | Grass, forbs, ferns, sedges, moss and low shrubs within 0–30 m, fading into the surface cover |
| D4. Clutter layers | D2 | Pebbles, stones, litter, branches, logs, stumps, roots and beach wrack by habitat |
| D5. Wind, light and contact | D3, D4 | Shared wind, shadows, AO, translucency, contact darkening |
| D6. Integrated acceptance | D5 | 2 m comparisons everywhere, motion review, performance, specs |

### D1. Visual direction and human acceptance

- [ ] **Vignettes.** Build representative habitat vignettes on the real terrain at the 2 m review
  poses:
  - forest floor (NW-05);
  - woodland edge (NW-06);
  - grassland and scrub slope (NW-07);
  - beach and dune (NW-01, NW-02);
  - bluff toe (NW-03);
  - bluff top heath (NW-04);
  - a wet hollow along drainage.
- [ ] **Sheets.** Present them as `[reference | current | proposal]` sheets.
- [ ] **Gate.** The user explicitly accepts the look. Record the decision, date and any requested
  changes in this file. Without acceptance, iterate on D1 only.

### D2. Ground-cover and clutter asset set

- [ ] **Assets.** Build the accepted species and objects with physical scale, LOD chains (mesh to cards
  to surface cover), consistent PBR calibration under the game daylight, and wind-ready data.
- [ ] **Gate.** Audit sheets, provenance complete, memory and triangle budgets declared.

### D3. Dense near-field vegetation

- [ ] **Density and variety.** Vegetation density, height and species mix follow habitat rules. Inputs:
  AI 598 cover and disturbance, AI 596 wetness and drainage, light under the canopy, and shoreline
  distance.
  - Grass grows thinner on paths and under dense canopy.
  - Sedges grow in wet hollows, ferns in shade and dune grass on the foredune.
  - Plants grow around rock bases and never through rocks or logs.
- [ ] **Distance hand-off.** Runtime generation covers the near field. Representations step down with
  distance and end in the AI 598 surface cover, with no visible ring, boundary or popping at normal
  speeds.
- [ ] **Gate.** 2 m composites at every eye-height review pose against R02, R03, R06 and R08. Motion
  review on walking and driving-speed paths.

### D4. Clutter layers

- [ ] **Forest and outcrops.** Litter pieces, twigs, fallen branches, logs, stumps and roots in forests
  and at edges; cones where conifers exist (AI 604). Stones and pebbles on thin soils, paths and around
  outcrops.
- [ ] **Beach and bluff.** A beach wrack line of driftwood, seaweed and shells along the maximum swash
  reach from AI 597. Cobbles and pebbles on the bluff-sector beach and platform, consistent with AI 602.
- [ ] **Gate.** NW-03 against R10 (pebbles, driftwood), NW-05 against R02, and NW-01 for a clean swim
  beach with a natural wrack line.

### D5. Wind, light and contact

- [ ] **Wind.** Shared with AI 601 trees: gust fronts cross grass and trees coherently, with a
  deterministic time base for captures.
- [ ] **Light.** AI 600 shadows reach small plants and clutter without acne or shimmer. Add AO and
  contact darkening at plant and object bases, and translucency for backlit grass.
- [ ] **Gate.** Backlit and low-sun captures at NW-04 and NW-07 against R03.

### D6. Integrated acceptance

- [ ] **Coverage.** Every eye-height review pose shows a believable habitat within 0–30 m, confirmed by
  the user's review.
- [ ] **Regressions and performance.** Run all landscape suites in both surface-cache modes. Record
  same-condition performance and residency tables with an explicit reduced-quality tier.
- [ ] **Specs.** Update the ecosystem and surface specs and the roadmap status.

## Evidence and measurements

- **Captures.** 2 m captures and motion clips at the review poses, habitat diagnostics, and
  `[reference | before | after]` composites.
- **Performance.** Report frame time, FPS, GPU and CPU time, draws, triangles, instance counts, memory
  and uploads, with full benchmark conditions. Mark missing metrics as not measured, with a reason.

## Research basis

- Sucker Punch, [Procedural Grass in Ghost of Tsushima](https://gdcvault.com/play/1027214/Advanced-Graphics-Summit-Procedural-Grass), GDC 2021.
- Guerrilla, [GPU-based procedural placement in Horizon Zero Dawn](https://www.guerrilla-games.com/read/gpu-based-procedural-placement-in-horizon-zero-dawn).
- Epic [PCG hierarchical generation](https://dev.epicgames.com/documentation/unreal-engine/using-pcg-generation-modes-in-unreal-engine) (small cells for grass, flowers and stones).
- Poly Haven CC0 model catalog: `https://api.polyhaven.com/assets?type=models`.

## Completion record

Record each deliverable here when it passes: a summary, spec and source locations, validation results,
measurements, limitations and artifact paths.

## On completion

- Mark the first line DONE only after D1–D6 pass.
- Rename to `prompts/AI_DONE_codex_landscape_603_MESHES_ground_level_vegetation_and_natural_clutter_DONE.md`.
- Keep it in `prompts/`; do not archive automatically.
- Add a one-line summary per completed change, focused validation results, before/after performance
  tables with conditions, and artifact paths. Update the roadmap status table.
