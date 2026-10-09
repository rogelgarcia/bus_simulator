# Procedural forests from the LOD tree catalog (AI 601)

# Problem

Forest soil covers about 7.9 km² of the coastal landscape: 2,067,193 native samples, roughly two thirds
of the land. It renders as bare brown ground because no trees are placed (the flyover frames 900 and
1350 in `tests/artifacts/screens/landscape/flyover/frames/`). The plan says to scatter trees on the
forest class and keep roads and developed districts clear.

A multi-LOD tree catalog already exists (`src/graphics/content3d/catalogs/TreeMeshCatalog.js`,
`specs/graphics/vegetation_*.md`, `specs/graphics/vegetation_distant_lods.md`):

- **Species.** London plane, silver linden, northern red oak and American elm, with arrowwood viburnum
  as a shrub. Each has three mature forms.
- **Near LODs.**
  - LOD0 grid cards: 3,788–9,666 triangles (`assets/public/vegetation_lod0/`).
  - LOD0 and LOD1 branchlet canopies: LOD1 has 1,514–3,866 triangles (`assets/public/vegetation_lods/`,
    no runtime loader yet).
- **Distant LODs** (`assets/public/vegetation_distant/`; there is intentionally no LOD2):
  - LOD3: about 60 triangles.
  - LOD4: about 12 triangles.
  - LOD5: a 2-triangle impostor with 16 captures.
  - LOD6: a 2-triangle cluster of ten trees.

Gaps in that catalog's runtime:

- No LOD switching, cross-fade, wind or instancing exists. City trees are cloned per tile.
- LOD5 rewrites per-object vertices on the CPU every camera update.
- LOD1 still draws 99.47% of LOD0's opaque pixels.
- Compressed textures are about 480 MiB for LOD0 across species and about 300 MiB for LOD1.
- City-scale streaming was explicitly left as separate work.

References: R07 (thousands of trees with shadows across slopes), R03 (broadleaf canopy masses and
edges), R05 and R06 (forest edges at water), R08 (coastal woodland on a slope), R01 (forest clumps from
the air), R02 (forest interior).

# Request

Grow ecologically structured forests and woodland across the landscape's natural land with the existing
catalog, through the AI 599 engine. The forests need:

- stands with size and age structure, gaps and clearings;
- edge mantles with shrubs, understory and regeneration;
- solitary trees on open ground;
- species chosen by habitat.

They must hold up from 2 m to an aerial view, with stable LOD transitions, wind, shadows and terrain
contact, within accounted budgets.

## Execution and scope

- Start only after AI 595 PROJECTMAINTENANCE (removing the landscape cache from Git history) is
  complete: it rewrites this branch and moves the landscape cache to a gitignored location. Generated
  landscape data (terrain revisions, pages, fields, channels, placement tiles, caches) is a local bake
  output that is never committed or sent through Git LFS. Commit recipes, small authored configuration,
  code, tests and specs. Paths written as `assets/public/landscape/` mean the cache location AI 595
  documents.
- Read `specs/landscape/LANDSCAPE_NATURAL_WORLD_ROADMAP.md` first. This AI owns layer L4.
- Depends on AI 599 (engine) and AI 600 (shadows and AO) for final acceptance, and on the AI 596 terrain.
  AI 604 may add species later; keep the palette data-driven so new species slot in.
- Implement one deliverable at a time, using subagents with maximum reasoning. Verify and commit each
  completed deliverable.
- Use port 8002. Put evidence under `tests/artifacts/screens/landscape/ai601/<deliverable>/`. Composites
  are `[reference | before | after]`.
- Do not regenerate or alter the catalog's tree assets except through the registered `tools/bake_vegetation`
  leaves. The vegetation assets live in the shared `assets/` store used by other checkouts.
- Keep the plan constraints:
  - no trees on roads or road clearances, or on developed district ground;
  - low vegetation only in the beach arrival's open-view corridor;
  - no trees on the beach, bluff faces or the swim zone.
- Realism first, with budgets accounted and measured.

## Deliverables and dependencies

| Deliverable | Depends on | Usable outcome |
| --- | --- | --- |
| D1. Species palette and habitat rules | AI 599 recipe model | Data-driven palette assigning catalog species to habitats; gap list for AI 604 |
| D2. Runtime LOD chain | AI 599 renderer | All catalog LODs loadable, instanced, cross-faded, with a texture-memory strategy |
| D3. Forest generation | D1, D2 | Stands, edges, clearings, understory and solitary trees across the landscape |
| D4. Wind | D3 | Coherent wind across LODs |
| D5. Lighting integration | D4, AI 600 | Shadows, canopy occlusion, translucency and distant colour consistent with terrain |
| D6. Integrated acceptance | D5 | Comparisons, performance, specs |

### D1. Species palette and habitat rules

- [ ] **Assign species to habitats.** For example: oak on dry slopes and ridges, elm and linden in moist
  hollows and valleys, plane along drainage lines, viburnum as understory and edge shrub. Base the
  assignment on the AI 596 channels (moisture, flow, aspect, slope, regolith depth, shoreline distance,
  wave exposure).
- [ ] **Variation.** Add size and age classes, and coastal exposure effects (shorter, sparser,
  wind-shaped stands near the sea), within what the catalog forms allow.
- [ ] **Gap list.** Record which reference elements the catalog cannot express: conifers, coastal
  species, saplings, dead trees and snags, wind-sheared forms. AI 604 uses this list.
- [ ] **Gate.** A habitat map and species diagnostics over the whole landscape, reviewed against the
  plan and references.

### D2. Runtime LOD chain

- [ ] **Loaders.** Load LOD0, LOD1 (branchlet), LOD3, LOD4, LOD5 and LOD6 as instanced resources. Make
  impostors instancing-compatible.
- [ ] **Clusters.** Integrate LOD6 clusters so cluster members always match the actual placements,
  either by deriving clusters from placements or by placing whole clusters.
- [ ] **Transitions.** Choose distance and screen-size thresholds with hysteresis and dithered
  cross-fades. Mark where pops are still visible.
- [ ] **Texture memory.** Plan texture memory with shared atlases, residency by LOD and distance, and
  explicit budgets.
- [ ] **Gate.** Dolly and flyover paths show no popping at normal speeds. Measure memory per species and
  LOD, and the cost of each transition band.

### D3. Forest generation

- [ ] **Stand structure.** Use the AI 599 ecological simulation or rule equivalents. Declare canopy
  closure targets per habitat. Include natural gaps and clearings, edge mantles and fringes with shrubs
  and saplings, understory, and spacing by competition.
- [ ] **Open ground.** Add solitary and small-group trees on grassland and bluff tops.
- [ ] **Placement.** Trees conform to the terrain with root flare buried naturally. No trees appear on
  exclusion areas.
- [ ] **Gate.**
  - Forest-class coverage reaches the declared closure.
  - Stand-statistics reports: density, spacing distribution, species mix by habitat.
  - Aerial reads (NW-10 and NW-11) against R01 and R07.

### D4. Wind

- [ ] **Hierarchy.** Wind moves trunks, branches and leaves consistently across LODs, including impostor
  sway. Gusts travel coherently across stands. The time base is deterministic for captures. Leaf
  textures must not swim.
- [ ] **Gate.** Motion clips at NW-05 and NW-06, and at a mid-distance forest edge.

### D5. Lighting integration

- [ ] **Light and shadow.** Use the AI 600 shadows and AO. Canopy occlusion on the forest floor should
  be consistent with the AI 598 litter and cover. Add leaf translucency in backlight.
- [ ] **Distance.** Distant forest colour and aerial perspective match the terrain's. The forest roof
  must not read as a uniform carpet from the air.
- [ ] **Gate.** NW-05 and NW-06 against R02. NW-08 shows the forest framing the high city escarpment.

### D6. Integrated acceptance

- [ ] **Captures and regressions.** Re-render the flyover and all forest-related review poses. Run all
  landscape suites in both surface-cache modes.
- [ ] **Performance.** Record same-condition performance and residency tables: instances, draws,
  triangles, memory, frame and GPU time.
- [ ] **Specs.** Update the vegetation and ecosystem specs and the roadmap status.

## Evidence and measurements

- **Captures.** Matched captures and motion clips at the review poses, habitat and stand diagnostics,
  and `[reference | before | after]` composites.
- **Performance.** Report frame time, FPS, GPU and CPU time, draws, triangles, instance counts, texture
  and geometry memory, and uploads, with full benchmark conditions. Mark missing metrics as not
  measured, with a reason.

## Research basis

- Ubisoft, [Procedural world generation of Far Cry 5](https://blog.playstation.com/2018/03/22/the-procedural-world-generation-of-far-cry-5/) (species competition, moisture- and aspect-driven stands).
- Epic [Biome Core](https://dev.epicgames.com/documentation/unreal-engine/procedural-content-generation-pcg-biome-core-and-sample-plugins-overview-guide-in-unreal-engine).
- [Octahedral impostor forest for three.js](https://discourse.threejs.org/t/a-forest-of-octahedral-impostors/85735) (instanced trees with impostor LODs at about 200,000 trees).

## Completion record

Record each deliverable here when it passes: a summary, spec and source locations, validation results,
measurements, limitations and artifact paths.

## On completion

- Mark the first line DONE only after D1–D6 pass.
- Rename to `prompts/AI_DONE_codex_landscape_601_MESHES_procedural_forests_from_lod_tree_catalog_DONE.md`.
- Keep it in `prompts/`; do not archive automatically.
- Add a one-line summary per completed change, focused validation results, before/after performance
  tables with conditions, and artifact paths. Update the roadmap status table.
