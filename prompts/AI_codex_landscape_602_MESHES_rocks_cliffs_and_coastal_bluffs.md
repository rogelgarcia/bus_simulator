# Rocks, cliffs and coastal bluffs (AI 602)

# Problem

The landscape has no rock geometry. The repository contains no rock, boulder, cliff, pebble or talus
meshes, and no rock generator. Only 1k rock textures and the AI 577 rock material exist.

A single-valued heightfield cannot represent vertical faces, overhangs, wave-cut notches or strata
ledges. The source package's own guidance says to "use rock materials and separate cliff/retaining
meshes where needed".

Today the plan's exposed-rock band along the beach is a soft 6–12° ramp painted brown. The escarpment
around the high city has no rock at all.

The user's steep-coast reference R10 shows what the areas near the beach with steep slope must become:

- a layered sandstone bluff with a vegetated crown and gullied faces;
- a talus apron;
- a wave-cut rock platform with wet rock;
- boulder and cobble fields, scattered pebbles and driftwood.

R08 shows boulders lining a shore under a wooded slope with pale exposed rock. R02 shows mossy boulders
and outcrops in grass. R03 and R06 show eroded rock faces on high ground.

Poly Haven lists suitable CC0 scanned models, including:

- `coastal_cliff_01`, `_02`, `_04`;
- `coast_rocks_01`–`_05` and `coast_land_rocks_02`–`_04`;
- `boulder_01`, `rock_07`, `rock_09`, `rock_face_01`, `_02`;
- `rock_moss_set_01`, `_02`;
- the Namaqualand boulder, cliff, rock and stone sets;
- `sand_rocks_small_01`, `stone_01`.

# Request

Build a procedural rock and cliff system for the landscape:

- cliff and bluff faces wherever terrain exceeds what a heightfield can represent, following the strata;
- rock outcrops on steep and convex ground;
- talus and scree aprons;
- shore platforms with tide pools;
- boulder and cobble fields;
- scattered rocks by geology.

All of it is placed through the AI 599 engine from the AI 596 geology channels. Materials match the
AI 598 lithologies, and the rocks blend into the terrain without visible seams or floating.

## Execution and scope

- Start only after AI 595 PROJECTMAINTENANCE (removing the landscape cache from Git history) is
  complete: it rewrites this branch and moves the landscape cache to a gitignored location. Generated
  landscape data (terrain revisions, pages, fields, channels, placement tiles, caches) is a local bake
  output that is never committed or sent through Git LFS. Commit recipes, small authored configuration,
  code, tests and specs. Paths written as `assets/public/landscape/` mean the cache location AI 595
  documents.
- Read `specs/landscape/LANDSCAPE_NATURAL_WORLD_ROADMAP.md` first. This AI owns layer L3 and the bluff
  sector of the catena (§7).
- Depends on AI 596 (face mask, strata, deposits, coastal zones), AI 599 (engine) and AI 600 (shadows).
  It also consumes AI 598's rock-face blending contract.
- Implement one deliverable at a time, using subagents with maximum reasoning. Verify and commit each
  completed deliverable.
- Use port 8002. Put evidence under `tests/artifacts/screens/landscape/ai602/<deliverable>/`. Composites
  are `[reference | before | after]`, mainly against R10, R08 and R02.
- Assets:
  - CC0 only, with URL, author, license, dimensions and hashes in a `source.json` beside each installed
    asset;
  - procedural variation is welcome;
  - Blender may be used through the registered bake leaves and `tools/baking/blender.local.json`;
    prefer headed Blender through MCP when it is free, and follow the project's Blender rules when it
    is busy.
- Plan constraints:
  - no boulders or rocks in the southwest swim zone or at the beach arrival;
  - no tall walls at the arrival;
  - rocks keep road clearances and stay off developed district ground.
- Rock meshes are presentation and content layers. They do not change authoritative heights. Provide
  collision-ready proxy data (hulls or simplified meshes) for future gameplay adapters without
  implementing colliders.
- Realism first, with budgets accounted and measured.

## Deliverables and dependencies

| Deliverable | Depends on | Usable outcome |
| --- | --- | --- |
| D1. Rock asset library | AI 599 renderer | Calibrated CC0 and procedural rock assets with LOD chains and lithology materials |
| D2. Cliff and bluff faces | D1, AI 596 face mask | Strata-following faces that blend with terrain, with crown and toe |
| D3. Talus, scree and shore platform | D2 | Size-sorted talus, scree aprons, wave-cut platform with tide pools, cobble and boulder fields |
| D4. Inland outcrops and boulders | D1 | Outcrops on convex steep slopes, escarpment rims, boulders in forest and grassland |
| D5. Integrated acceptance | D3, D4 | Comparisons, performance, specs |

### D1. Rock asset library

- [ ] **Assets and LODs.** Install the selected CC0 scans and add procedural variation for: cliff
  segments, outcrops, boulders, cobbles, pebbles and platform slabs. Each has a LOD chain down to
  merged or impostor far LODs, and collision-proxy data.
- [ ] **Materials.** Calibrate the materials to the AI 598 lithologies: layered sandstone, caprock, and
  wet algae rock. Albedo must stay within physical ranges under the game daylight.
- [ ] **Gate.** Audit sheets per asset and LOD, provenance complete, memory and triangle budgets
  declared. No conspicuous repeated silhouettes in a 20-instance field.

### D2. Cliff and bluff faces

- [ ] **Faces.** Wherever the AI 596 face mask marks slopes a heightfield cannot represent, place or
  generate faces that follow the strata index and the crest and toe lines. Include gullies and
  buttresses, and wave-cut notches or overhangs where the coastal processes put them.
- [ ] **Blending.** Faces blend into the terrain above and below with no floating edges, gaps or
  visible intersections. Colour and normals match the AI 598 surfaces in the blending band.
- [ ] **Crown hooks.** The vegetated crown on the top edge gets hooks for AI 601 and AI 603.
- [ ] **Gate.** NW-03 and NW-04 composites against R10. A Solid/wireframe inspection view shows no gaps
  or see-through seams. Ray probes confirm the blending (no coincident-face flicker).

### D3. Talus, scree and shore platform

- [ ] **Talus.** Talus and scree aprons come from the AI 596 deposits, with size sorting: large blocks
  at the outer toe, finer scree upslope.
- [ ] **Platform.** The wave-cut platform at the bluff toe has slab steps, tide pools that work with the
  AI 597 water, wet and algae zones, and boulder and cobble fields.
- [ ] **Pebbles.** Cobbles and pebbles spread onto the upper beach in the bluff sector, outside the swim
  zone.
- [ ] **Gate.** NW-03 against R10 (rock platform, cobbles). No rocks appear in the swim zone or at the
  arrival, verified by an exact exclusion report.

### D4. Inland outcrops and boulders

- [ ] **Outcrops.** Place outcrops on convex steep slopes and along the high city escarpment rims.
  Scattered boulders go in forest and grassland, with moss and lichen by moisture and aspect and grass
  at their bases.
- [ ] **Variety.** Density, size and clustering follow the geology, not uniform scatter. There must be
  no repeated patterns.
- [ ] **Gate.** NW-07 and NW-08 against R03 and R08, and NW-05 against R02.

### D5. Integrated acceptance

- [ ] **Captures and regressions.** Re-render the flyover and all rock-related review poses. Run all
  landscape suites in both surface-cache modes.
- [ ] **Performance.** Record same-condition performance and residency tables.
- [ ] **Specs.** Update the ecosystem, roadmap and handoff specs. The handoff lists the collision-proxy
  data for future gameplay adapters.

## Evidence and measurements

- **Captures.** Matched captures at the review poses, inspection views of the face/terrain blending,
  exclusion reports, and `[reference | before | after]` composites.
- **Performance.** Report frame time, FPS, GPU and CPU time, draws, triangles, instance counts, memory
  and uploads, with full benchmark conditions. Mark missing metrics as not measured, with a reason.

## Research basis

- Poly Haven CC0 model catalog: `https://api.polyhaven.com/assets?type=models` (rocks, coastal cliffs, boulders).
- Houdini [heightfield erosion](https://www.sidefx.com/docs/houdini/heightfields/erosion.html) (debris and talus as scatter masks).
- Ubisoft, [Procedural world generation of Far Cry 5](https://www.sidefx.com/learn/talks/procedural-world-generation-far-cry-5/) (generated cliff rocks connected to terrain and water networks).

## Completion record

Record each deliverable here when it passes: a summary, spec and source locations, validation results,
measurements, limitations and artifact paths.

## On completion

- Mark the first line DONE only after D1–D5 pass.
- Rename to `prompts/AI_DONE_codex_landscape_602_MESHES_rocks_cliffs_and_coastal_bluffs_DONE.md`.
- Keep it in `prompts/`; do not archive automatically.
- Add a one-line summary per completed change, focused validation results, before/after performance
  tables with conditions, and artifact paths. Update the roadmap status table.
