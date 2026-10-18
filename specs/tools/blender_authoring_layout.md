# Blender authoring layout

AI 652 separates tracked authoring code, shared generated files and shared non-game inputs. The operational guide
and hero ID map are in [`blender/README.md`](../../blender/README.md).

## Ownership and resolution

- `blender/scripts/` and its JSON configuration are tracked; `blender/` contains no junction.
- Main owns real, ignored root folders `blender_files/` and `blender_inputs/`. Other worktrees use root junctions.
  No files inside either shared folder may be tracked. Setup validates all destinations before creating links;
  an existing conflicting path is an error and must be preserved.
- Python authoring roots come from `blender/scripts/common/paths.py`, relative to the checkout. The optional
  `BLENDER_FILES_ROOT` environment variable redirects generated-file reads and writes for isolated builds.
- Existing host launchers use the bake framework's `tools/baking/blender.local.json` executable configuration.
  New bake workflows register in the existing framework; see [`bake_framework.md`](bake_framework.md).
- Render evidence stays under ignored `tests/artifacts/screens/`. Do not write new inputs or blends under
  `tests/artifacts/blender/`.

## Files and linking

Use `bradbury` and `terramar` as authoring IDs. Each hero has `<hero>_building.blend`,
`<hero>_city_composition.blend`, and `parts/<hero>_part_<name>.blend`. The building entry contains one top collection,
`BRADBURY_BUILDING` or `TERRAMAR_BUILDING`; parts retain their existing collection names and wear namespaces.
Terra & Mar's shell is `terramar_part_shell.blend`; its entry links shell, props, interiors, wear and site.

The city uses `city/city.blend`, `city/city_site.json` and `city/city_context_library.blend`. Linked libraries and
external images in relocated active files must resolve from their new locations without the original artifact
tree. Library relinking must preserve geometry, materials, view-layer exclusions, wear controls and placement.
Bradbury's manifest uses paths relative to its `wear/` directory and hashes of the relocated sources. Migration
must preserve any pre-existing stale-source warning until wear is actually rebuilt.

## Safety and provenance

One writer per shared file. No worktree archival/removal or shared-target cleanup. Before mutation, create and
verify a new external backup under the project's dated backup root with `MANIFEST.md`. Never change a completed
backup. These rules are defined in `ai_rules/PROJECT_RULES.md` under Backups and Worktree cleanup safety.

Every downloaded source records origin, author, license, date and MD5 in a neighboring `source.json` whenever
available, with explicit unknown fields when not verified. Preserve original provenance separately from migration
receipts. Game-shipped inputs come from installed game assets. Building PBR sets must have tracked configs and
index registration before Blender uses them. `common/material_catalog.py` resolves the actual game catalog;
unregistered sets, missing declared maps and paths escaping a set are errors. No kit fallback is allowed.

## Acceptance

Validate script syntax/import paths, source preservation, ignored root ownership, entry collections, all active
library/image dependencies and geometry preservation. Both city compositions must open from `blender_files/` and
pass the existing AI 651 fixed-view parity renders against the original saved files before source removal. A
structural audit cannot replace that render gate. Baseline regeneration, PBR installation, an independent city and
full regeneration are separate AI 652 phases.

## Bradbury baseline reproducibility (AI 652 Phase 2)

Preserve the original GLB/parts JSON and original-export provenance. Store the current reproduction commit and
saved source snapshot separately from the unknown historical export commit; a dirty checkout requires its saved
source overlay. Record local dependency hashes and pinned remote module URLs. Installed binary assets remain in
the game store. The exporter refuses existing outputs and writes source/provenance beside each new export.

The registered `buildings/bradbury/baseline` leaf imports GLB, links installed textures by the existing pixel matcher,
and restores the measured inspection rig from tracked configuration. Its retained `expected-baseline.json` contract
checks every object/name, transform/bound, mesh topology/UV, material assignment/graph, image identity and rig before
save and after reopen. Geometry and image hashes must be exact; matrix scalars tolerate 0.00001. Unused render/viewer
buffers are outside the contract. Regeneration needs the contract/recipe/export/assets, not the old `.blend`.

Validation produces a fresh candidate in `blender_files/` and evidence under `tests/artifacts/screens/`. Refuse
existing destinations and publication; an explicit later replacement must first back up all affected files.
Semantic GLB equivalence resolves buffer references before comparison, because async image encoding changes buffer
order without changing payloads. Phase 2 does not rebuild wear, building entries, compositions, or other heroes.

## Catalog-backed material validation (AI 652 Phase 3)

The existing Terra & Mar limestone and two sign sets, plus Bradbury lettering, enter the catalog with their
provenance and original map bytes preserved. `tools/pbr_material_importer/building_sets.py` validates their retained
archives and stages metadata/opacity installation. Unknown license/author/URL fields remain explicit. Sign opacity
maps are installed auxiliary slots and must equal base-color alpha. Tracing from them must preserve glyph geometry.

`buildings/terramar/catalog-check` is an explicit candidate-only bake leaf, outside production parents. It reuses
the retained baseline and city, rebuilds all five parts through catalog consumers, composes the entry/city scene,
and reopens each result. Existing destinations and publication are refused. AI 651's three Terra & Mar view
comparisons remain the visual acceptance gate. Phase 4 city independence and Phase 5 full regeneration are separate.

## Independent city (AI 652 Phase 4)

`city/build_context.py` imports the installed game trees and street lamp directly into the city's context library.
`city/build_city.py` requires that library and has no fallback to a hero file. Neither city scripts nor city outputs
depend on hero scripts/generated data. Hero-aware diagnostics live separately in `blender/scripts/validation/`.

`city_site.py` owns the historic hull adjustments, fixed kerb rectangle, reference stand, sun azimuth, neighbour
tower recipe and clear wedges. These remain city defaults by design, preserving both existing compositions;
their photo-fit history is recorded in the city README. Compositions continue to read the site descriptor.

The explicit `city/standalone-check` bake leaf builds context, city and descriptor inside a new empty generated
root, verifies no hero data appeared, reopens both blends and authenticates all outputs/dependencies. Installed
game assets and city/common source are its only authoring inputs. Existing destinations and publication fail.
Current scenes remain intact. Acceptance additionally requires all six AI 651 composition views against current
renders, using fresh composition copies linked to the candidate. This does not regenerate either hero.

## Full regeneration (AI 652 Phase 5)

Each hero and the city own `rebuild_all.py`. The common orchestrator builds the city first, then each requested
hero from its preserved GLB/JSON baseline inputs and installed assets, without copying any existing `.blend`.
Bradbury regenerates its two ornaments, eight portal pieces, block, wear, entry and composition. Terra & Mar
regenerates sign contours, decoded vegetation, baseline, five parts, entry and composition. Derived data belongs
to the new output root; original inputs and active scenes remain unchanged.

Bradbury's frieze uses the explicit lettering span in `building/frieze_layout.json`, measured from its retained
authored geometry. Do not derive it from today's capital edge: the saved lettering and flower panels retain the
earlier layout. Preserve the recipe's measurement provenance; regeneration must not read the old scene.

The registered `buildings/rebuild-all`, `buildings/{bradbury,terramar}/rebuild` and `city/rebuild-all` leaves require
a new candidate directory, reject publication and use the shared Blender/Python configuration. City-only builds
must not declare hero sources or inputs. Reopen every generated blend, reject library dependencies outside the
candidate, require external images to resolve in installed assets or the candidate, check entry roots and
authenticate all output hashes. Retain failure evidence. Framework validation certifies generation/dependencies;
acceptance still requires AI 651's six fixed views against the active files.

Headless stages run sequentially with isolated config/cache/temp paths and two CPU threads. Building stages skip
intermediate previews while preserving the authored rigs. Parity renders retain their explicit fixed seed,
samples, denoising and OptiX-only policy. Existing historical files are moved only after an external verified
backup and any required exception to backup immutability; nothing is deleted automatically.
