# DONE

# Problem

The vegetation work moved into a 2D study because earlier 3D generations had
unclear branching hierarchies, repetitive or hairlike growth, and artificial
foliage arrangements. Prompt 649 and its subsequent ramification correction
extended the shared generator. The user now wants another AI to implement this
work in 3D again, retaining the structural improvements.

The user's latest priority is explicit: a simple trunk representation is enough.
Exact trunk curvature, bark detail and side-view wood realism are secondary.
The important result is believable bifurcations and successive levels of large
limbs, secondary branches and finer branches, approaching the supplied examples.

# Request

Implement a reusable 3D version of the current shared branching architecture for
all five species. Preserve the useful V2 and accepted 2D work, extend the shared
generator where necessary, and review actual saved 3D geometry against the
species references. Start with leafless structure so foliage cannot hide errors.
This is an implementation handoff, not a request for another research-only report.

Work in `C:/Users/rogel/Projects/bus_simulator_worktrees/graphics`.
Read `AGENTS.md`, `ai_rules/PROJECT_RULES.md`, applicable local rules, and the
documents listed below. Preserve unrelated work in this dirty shared worktree.
Do not restart or rewrite the completed prompt 649; this is a new task.

## Authoritative starting point

Use source under `tools/bake_vegetation/branching_study/`, especially its README.
The current version is **page 10, graph 9, preset 5**, generator
`shared-v2-ramification-1`. It extends the accepted page v8 / graph v7 study.

Latest review:

`http://127.0.0.1:4192/tests/artifacts/screens/vegetation_branching_study/649_ramification_followup/review_v4/ramification.html`

The same directory contains:

- `index.html`: editable generator, replay, branch inspection and exports.
- `comparison.html`: both reference collections, detail views and three seeds.
- `presets/<species>.json`: complete default graphs and settings.
- `comparisons/<species>-seed-{1,31,92}.json`: reproducible graph fixtures.
- `comparisons/<species>-levels.png`: reference and progressive subdivision views.
- `manifest.json`: output identities, reference provenance and graph audits.

These are gitignored local artifacts; the next AI must have this worktree and
artifact directories available. If an artifact is unavailable, regenerate it
through the documented `vegetation/branching-study` bake instead of substituting
an earlier review. Source modules, not copied artifact modules, are the code to edit.

Read these supporting documents:

- `specs/graphics/vegetation_species_rules.md`, particularly the 2026-10-17
  ramification follow-up and its limitations.
- `specs/graphics/vegetation_enhanced_reference.md`.
- `tools/bake_vegetation/enhanced_reference/README.md`.
- `tools/baking/README.md` and `specs/tools/bake_framework.md`.

The folder `tools/bake_vegetation/enhanced_reference/growth_v2/` is an **older,
elm-only 3D experiment**, not the current all-species branching source of truth.
Inspect it for reusable support, mesh, leaf, audit and rendering infrastructure.
Do not restore rejected incremental attraction-field or hairlike growth merely
because that folder is named V2. Previous 3D builders also contain species-specific
experiments; do not substitute those for the newer shared architecture.

## Implemented behavior to carry forward

| Source | Responsibility |
| --- | --- |
| `model.mjs` | Seeded ancestry, generation phases, budgets, exported graph and audits |
| `parameters.mjs`, `species.mjs` | Shared editable settings and ordinary numeric species presets |
| `architecture.mjs` | Basal stems, framework sites, roles, local attachments and bounded curves |
| `ramification.mjs` | Repeated unequal daughter forks, intermediate side branches, outward preference |
| `geometry.mjs` | Actual centerlines, local tangents and radius sampling |
| `support.mjs` | Downstream reach and distributed daughter cross-section sizing |
| `roots.mjs` | Shared base ownership, distinct cane anchors, collars and root graph |
| `draw.mjs`, `app.mjs`, `review.mjs`, `job.mjs` | Existing 2D display and review adapters |

Preserve these contracts:

- `depth` counts framework levels; `ramificationLevels` adds explicit daughter-fork
  tiers; `growthLevels` is their sum. `level` is graph generation, not plant age.
  Each child advances one level. `order` increases on a lateral/fork and remains
  unchanged on a continuation. Export `phase`, `ramificationLevel`, `kind`, `role`,
  parent identity, attachment position and stable ancestry keys.
- Both daughters can bifurcate again, including branches classified `terminal`.
  Optional smaller intermediate branches attach before the endpoint. Do not
  replace real descendants with decorative twigs or force every fork into a
  dominant continuation with tiny side shoots.
- `primaryLimbs` independently controls up to eight distributed major limbs in
  mixed architecture. Zero uses the ordinary framework child-count settings.
  Fork inequality, daughter length, divergence and intermediate branching remain
  independently controllable. Outward preference is a geometric guide, not a
  light or competition simulation.
- Branches use a bounded whole-axis curve with optional recovery. Children attach
  to the actual parent curve/tangent. Avoid repeated waves and random steering
  at every sampled point. Adding a tier preserves existing identities and
  centerlines; support sizing may enlarge radii for the additional descendants.
- Thickness respects local parent attachments, same-tip daughter area and
  downstream daughter cross-sections at distributed nodes, as well as supported
  reach. Configured base diameter can increase during support sizing.
- Preserve the direction-wrap bug fix: descending leftward branches previously
  lost descendants because `atan2` returned an equivalent negative angle. In 3D,
  express direction rules in consistent vector/local-frame terms so this
  asymmetry cannot return.
- Arrowwood has eleven separate basal canes with individual ground anchors on a
  common root crown. Lean keeps each base fixed. Roots have independent random
  streams and explicit host ownership. Changing root settings must not reshuffle
  the crown.
- Minimum sizes and direction constraints may stop candidates early. Requested
  tier count is a maximum, not a promise that every tip reaches it. Omissions and
  budgets remain explicit; current 2D limits are 4,000 shoots and 600 root axes.
  Do not silently truncate a 3D specimen and present it as complete.

## Species and current starting presets

| Species ID | Framework + daughter tiers | Current structural starting point |
| --- | --- | --- |
| `london_plane` | 1 + 6 | Seven distributed major limbs; spreading repeated forks |
| `silver_linden` | 3 + 4 | Persistent leader; ascending, height-dependent lateral structure |
| `northern_red_oak` | 1 + 6 | Seven unequal major limbs; broad daughter divergence |
| `american_elm` | 2 + 4 | Ascending limbs opening into arches |
| `arrowwood_viburnum` | 2 + 3 | Eleven basal canes; shorter subdivisions |

Read all numeric settings from the current source. These are editable artistic
starting points, not measured botanical branching statistics. Keep one shared
implementation with species data rather than five disconnected generators.

## References and limits of the current result

Preserved latest complete references, including the user's simplified London
plane silhouette, are under:

`tests/artifacts/screens/vegetation_branching_study/649_ramification_followup/inputs/`

Read `complete-studies.json` for species mapping and original hashes. The supplied
`London_Plane_Branches.svg` and `vector-source.json` are there too. That SVG is one
compound filled path: it is a visual reference, not an existing branch graph.
Do not extrude it, trace one silhouette, or treat it as adjacency data.

The newer image collection and original provenance are under:

`tests/artifacts/screens/vegetation_branching_study/20261016_photorealistic_references/references/manifest.json`

Plane, oak and elm crowns are cropped in the newer images; use their complete
studies for crown structure. Blurred side panels and background trees are not
additional branches of the subject. Supplied images are visual targets, not
verified photographs or measured root-depth data.

The current graph is a verified structural starting point, **not a claim that
reference-level realism has been achieved**. Crown spacing, branch proportions,
distribution of gaps and fine-branch visibility still differ. Plane has uneven
open regions; linden and elm remain too open. Preserve the improvements while
addressing these issues in the shared 3D rules. More bark detail or extra twig
count alone does not resolve them.

## Required 3D outcomes

- [x] Generate genuine volumetric trees/shrubs with branch-local frames and seeded
  azimuthal distribution. Front, side and oblique views must contain meaningful
  structure; do not make a flat tree, rotate duplicate planar trees, or optimize
  generation for a camera.
- [x] Preserve graph ancestry, branch orders, subdivision levels, attachments,
  deterministic seeds and shared presets in the 3D representation. Document
  units and axes explicitly: the 2D study uses metres and Y-up; Blender uses Z-up.
  Distinguish shoot `parentT` (normalized arc length) from the existing root
  sample-index convention, or explicitly migrate and validate the latter.
- [x] Reuse or extract shared rules instead of maintaining an independently
  drifting 3D rewrite. Include a planar compatibility fixture to demonstrate
  topology/attachment parity before testing the volumetric extension. Preserve
  the existing 2D review as a working regression/debugging tool.
- [x] Build attached, tapered wood with continuous-looking major junctions and
  readable secondary/finer levels. Simple trunk geometry and neutral material
  are sufficient for this pass. Inspect existing `junctions.py`, mesh adapters
  and saved-file audits before adding another meshing system.
- [x] Translate the root/base ownership into radial 3D placement. Keep roots tied
  to the actual trunk or cane anchors and distinguish full underground structure
  from surface exposure. The 2D soil section is not a radial root template or an
  inferred excavation profile.
- [x] Generate all five species with seeds 1, 31 and 92. Review the same specimens
  from front, side and two oblique viewpoints, with a clear branch-order/level
  diagnostic and isolated major-fork/branch-subtree close-ups. Compare each
  species with its own supplied references. Improve structural defects exposed
  by these views rather than selecting a single favorable seed or camera.
- [x] Use EEVEE for the Blender geometry review and save inspectable 3D sources
  plus graph/configuration exports. Verify saved geometry, not only in-memory
  paths or successful render completion. Keep leafless structure visible in the
  handoff. Existing leaf/petiole meshes, topology, UVs and materials are reusable
  assets; preserve their sources. Foliage must not become a substitute for this
  structural review or a separate leaf-redesign task.
- [x] Test determinism, parent attachment, taper/support, fork area, repeated
  terminal subdivision, basal ownership, direction symmetry and explicit
  budget handling in 3D. Check mesh normals, finite geometry and meaningful
  junction continuity using the existing saved-mesh validation where applicable.
  A projected crossing is not proof of a 3D collision; do not import the optional
  2D crossing-rejection rule as a blanket pruning policy.
- [x] Update relevant species/generator specs and bake documentation. Describe
  the final implementation, validation, review paths and remaining limitations.
  Treat visual judgment separately from passing numerical audits.

## Bake, artifact and workspace constraints

Use `node tools/bake.mjs` and the registered baking hierarchy. Extend the existing
`vegetation/enhanced-reference` workflow if appropriate, or register a new domain
leaf with the shared validation/publication framework. Reuse the gitignored
`tools/baking/blender.local.json`; do not add machine-specific standalone commands.
Do not guess that an existing phase accepts the new graph: inspect its contracts
and implement the necessary integration.

Keep this pass staged. Preserve installed vegetation, historical model files,
source references and accepted leaf/material assets. Do not publish or replace
gameplay assets as part of this handoff. Do not commit unless separately requested.

Store new captures, graphs, scenes and receipts under a fresh revision directory:

`tests/artifacts/screens/vegetation_enhanced_reference/650_3d_ramification/<revision>/`

Preserve earlier completed outputs. Prefer headed Blender through MCP when free;
check whether it is occupied before using it. If occupied, follow the project's
isolated headless fallback rules. Never interfere with another scene or render.
Report any Blender-dependent work that remains blocked. Never archive or remove
this worktree; project junctions point to shared assets.

## Existing validation baseline

The last 2D pass passed 45 Node tests and 3 browser tests. Fifteen species/seed
graphs reached their requested final tier with no budget omissions. All 132
manifest outputs and 11 reference identities were hash-verified. This does not
validate a future 3D port.

Relevant tests, run through `node tools/run_selected_test/run.mjs --set <path>`
followed by `node tools/run_selected_test/run.mjs`:

- `tests/node/unit/vegetation_branching_study.test.js`
- `tests/node/unit/vegetation_species_context.test.js`
- `tests/node/unit/vegetation_ramification.test.js`
- `tests/node/unit/vegetation_reference_import.test.js`
- `tests/headless/e2e/vegetation_branching_study.pwtest.js`

The final 2D bake receipt is
`tests/artifacts/screens/ai556_bake_framework/run-1792251873931-10220-12acf931/summary.json`.

## On completion

- Mark this AI document as DONE in the first line only after implementing and
  validating the required outcomes.
- Rename it in `prompts/` to
  `AI_DONE_graphics_650_MESHES_3d_ramification_from_current_2d_generator_DONE.md`.
- Do not move it to `prompts/archive/` automatically.
- Add a high-level one-line summary per completed change, actual tests and
  saved-model/render evidence, with clearly identified remaining limitations.
- Provide a review linking the five species, all three seeds, the reference
  images actually used and the inspectable 3D outputs. Do not claim visual parity
  merely because graph or mesh audits pass.

## Completed implementation — 2026-10-17

- Extended the current shared generation loop with branch-local 3D frames and seeded azimuths, preserving the working planar adapter and exact compatibility fixtures.
- Preserved ancestry, repeated daughter forks, actual parent-tangent attachment, taper/support sizing, deterministic omissions and independent radial root ownership.
- Kept arrowwood's eleven separately anchored canes and shared below-grade crown.
- Added shared leader-lateral and apical-family controls, with numeric spatial presets for all five species; corrected excessive leader/apex proportions exposed by pilots.
- Registered `vegetation/ramification-3d` with shared Blender configuration, fresh staged revisions, saved-file audits, EEVEE review and publication rejection.
- Saved fifteen leafless neutral Blender/GLB specimens, graphs/configurations, ten authenticated references and 210 rendered views; reviewed front, side, both obliques, stages, subtrees, junctions and roots.
- Corrected the isolated-junction selector to use an actual major attachment and connected saved surface; refreshed diagnostics while proving the exported geometry and unaffected images remained unchanged.
- Updated generator/species/bake documentation and added spatial/browser regressions; preserved installed assets, historical outputs and unrelated work.

Validation: 61 Node tests and four browser tests passed. The final spatial suite
rerun passed all sixteen tests without skips. All fifteen graphs reach their
requested final tier with zero budget omissions; reopened mesh checks and all
352 final output hashes pass. The previous 132-file 2D review and eleven source
reference identities remain unchanged.

Final review:
[all species, references, all three seeds and model downloads](http://127.0.0.1:4192/tests/artifacts/screens/vegetation_enhanced_reference/650_3d_ramification/r13_final/index.html).

Final artifacts are under
`tests/artifacts/screens/vegetation_enhanced_reference/650_3d_ramification/r13_final/`.
Each `<species>/seed-<1|31|92>/` folder contains `tree.blend`, `tree.glb`,
`graph.json`, `configuration.json`, `mesh-audit.json`, fourteen EEVEE images,
`views.png` and `diagnostics.png`. Each species also has `comparison.png`.
The final framework receipt is
`tests/artifacts/screens/ai556_bake_framework/run-1792260388865-7800-fa94bc55/summary.json`;
the original full-bake receipt is
`tests/artifacts/screens/ai556_bake_framework/run-1792258954797-28380-88b601c7/summary.json`.

Visual limits remain: uneven plane crown gaps; open linden/elm crowns; insufficient
plane/oak separation; an overly spreading, sparsely subdivided arrowwood silhouette;
faint outer twigs; simplified junction shoulders and roots. Fine tubes overlap
rather than forming one watertight solid, and no global collision solver or runtime
LOD optimization is claimed. These findings are documented per species in
`specs/graphics/vegetation_species_rules.md`. Numerical success does not establish
reference-level realism. No Blender work remains skipped or blocked. No assets
were published, no commit was created, and the worktree was left intact.
