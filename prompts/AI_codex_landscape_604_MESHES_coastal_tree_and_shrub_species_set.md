# Coastal tree and shrub species set (AI 604)

# Problem

The vegetation catalog (`TreeMeshCatalog.js`) holds five urban and temperate broadleaf species:

- London plane;
- silver linden;
- northern red oak;
- American elm;
- arrowwood viburnum (a shrub).

Each species has three mature forms, built through the registered `tools/bake_vegetation` pipeline as
detailed references, LOD0 and LOD1 branchlet canopies, and LOD3–LOD6 distant levels.

Most of the user's references feature species the catalog lacks:

- conifer forests (R02, R05, R06, R07);
- Mediterranean-type coastal pines and scrub on a wooded hill above the beach (R08);
- wind-shaped trees on bluff crowns (R10).

The catalog also has no young trees or saplings, no dead trees or snags, and no wind-sheared coastal
forms. AI 601 records the precise gap list after mapping the current species to habitats.

Poly Haven lists CC0 inputs that may help, including `pine_tree_01`, `fir_tree_01`, `island_tree_01`
to `_03`, `pine_sapling_small`, `pine_sapling_medium`, `tree_small_02`, `dead_tree_trunk` and
`dead_tree_trunk_02`.

# Request

Extend the catalog with a coherent coastal species set through the existing vegetation bake pipeline.
Every new species gets the full LOD chain and slots into the AI 601 palette without code changes, so
forests, edges and bluff crowns can match the references.

## Execution and scope

- Start only after AI 595 PROJECTMAINTENANCE (removing the landscape cache from Git history) is
  complete: it rewrites this branch and moves the landscape cache to a gitignored location. Generated
  landscape data (terrain revisions, pages, fields, channels, placement tiles, caches) is a local bake
  output that is never committed or sent through Git LFS. Commit recipes, small authored configuration,
  code, tests and specs. Paths written as `assets/public/landscape/` mean the cache location AI 595
  documents.
- Read `specs/landscape/LANDSCAPE_NATURAL_WORLD_ROADMAP.md` and the AI 601 gap list first.
- This AI can run in parallel with AI 599–603. Its integration into the forests happens through AI 601's
  data-driven palette.
- Implement one deliverable at a time, using subagents with maximum reasoning. Verify and commit each
  completed deliverable.
- Produce every species through the registered `node tools/bake.mjs` vegetation leaves
  (`tools/bake_vegetation/`), keeping their validation and publication gates.
- Follow the existing vegetation specs (`specs/graphics/vegetation_*.md`,
  `specs/trees/urban_vegetation_assets.md`) and the LOD contract in `vegetation_distant_lods.md`
  (no LOD2).
- Blender:
  - prefer headed Blender through MCP when it is free;
  - fall back to an isolated headless process only when the headed session is busy;
  - if neither is safe, skip only the Blender-dependent part and report what remains.
- Sources are CC0 only (scans, photos, models), with URL, author, license and hashes retained. The
  vegetation assets live in the shared `assets/` store, so never overwrite existing species.
- Use port 8002. Put evidence under `tests/artifacts/screens/landscape/ai604/<deliverable>/`.

## Deliverables and dependencies

| Deliverable | Depends on | Usable outcome |
| --- | --- | --- |
| D1. Biome palette decision | AI 601 D1 gap list (or the roadmap if not yet available) | User-approved species list with habitat roles |
| D2. Species production | D1 | Each approved species with forms and the full LOD chain |
| D3. Catalog integration and acceptance | D2 | Catalog entries, AI 601 habitat rules, comparisons and budgets |

### D1. Biome palette decision

- [ ] **Proposal.** Propose a coherent coastal biome palette that is consistent with the existing
  species and the references, with habitat roles. For example: one or two pines for bluff tops and
  sandy ground, a fir or spruce for cooler moist slopes, a coastal oak, a juniper, an evergreen coastal
  shrub and a dune shrub.
- [ ] **Forms.** Plan forms per species: sapling, young, mature, old, wind-sheared, and dead snag where
  relevant.
- [ ] **Sheet.** Show each candidate with photo references, its habitat role and the forms planned.
- [ ] **Gate.** The user approves the palette. Record the decision and date in this file.

### D2. Species production

- [ ] **Assets.** For each approved species, build:
  - a detailed reference model;
  - LOD0 and LOD1 branchlet canopies;
  - the LOD3–LOD6 distant set;
  - bark and leaf or needle PBR from CC0 sources;
  - the planned forms.

  Conifers need a needle-appropriate canopy representation at every LOD.
- [ ] **Gate.** Per species: inspection renders at each LOD, triangle and texture budgets comparable to
  the existing catalog, LOD silhouette and colour continuity, and complete provenance.

### D3. Catalog integration and acceptance

- [ ] **Integration.** Register the species in the catalog. Extend AI 601's habitat rules with them:
  conifer stands, coastal pines on bluff crowns and sandy ground, shrub mantles, snags in old stands.
- [ ] **Comparisons.** Re-render NW-04, NW-05, NW-06, NW-10 and NW-11 against R02, R05, R06, R07 and
  R08.
- [ ] **Measurements.** Record same-condition performance and memory changes.
- [ ] **Specs.** Update the vegetation specs and the roadmap status.

## Evidence and measurements

- **Captures.** Inspection renders per species and LOD, and `[reference | before | after]` composites
  at the review poses.
- **Performance.** Report triangles, texture memory, draws, frame and GPU time, with full benchmark
  conditions. Mark missing metrics as not measured, with a reason.

## Research basis

- Existing pipeline documentation: `specs/graphics/vegetation_*.md` and `tools/bake_vegetation/`.
- Poly Haven CC0 model catalog: `https://api.polyhaven.com/assets?type=models` (pines, firs, island
  trees, saplings, dead trunks).

## Completion record

Record each deliverable here when it passes: a summary, spec and source locations, validation results,
measurements, limitations and artifact paths.

## On completion

- Mark the first line DONE only after D1–D3 pass.
- Rename to `prompts/AI_DONE_codex_landscape_604_MESHES_coastal_tree_and_shrub_species_set_DONE.md`.
- Keep it in `prompts/`; do not archive automatically.
- Add a one-line summary per completed change, focused validation results, before/after performance
  tables with conditions, and artifact paths. Update the roadmap status table.
