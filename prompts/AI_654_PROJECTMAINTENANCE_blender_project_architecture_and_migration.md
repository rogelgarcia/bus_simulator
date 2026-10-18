# Mandatory prerequisite: synchronize all branches

Do not start this AI until all project branches/worktrees, including buildings, graphics, grass, landscape and
machine learning, are up to date and synchronized by rebasing onto the latest main. Before any cataloging,
specification work or migration, perform read-only readiness checks: resolve the actual branch names, verify the
current main/upstream state, confirm each branch includes the latest main revision, and confirm there are no
unfinished rebases or unresolved conflicts. If any branch is stale or readiness cannot be verified, stop and report
the blocking branches; do not begin partial task work. Rebasing is a separate prerequisite, not an action to run
automatically from this prompt. Preserve uncommitted work and shared data under the project's backup and junction
rules. This gate applies to Graphics too, regardless of its migration deferral below.

Record the verified main revision, branch/upstream revisions and readiness result before execution; stale local
remote-tracking refs alone do not prove freshness. Rebasing onto main does not merge branch-only work into main
or synchronize uncommitted/ignored data. Catalog only the execution checkout and its explicitly identified shared
inputs. Unmerged branch-only content remains outside coverage; already integrated Graphics content is in scope.
This gate permits branch metadata checks, not an inspection or modification of the deferred Graphics worktree.

## Sequence and shared ownership

Execute these tasks in order: AI 653 (Blender inventory), AI 654 (Blender specification and migration), AI 655
(asset/configuration definition), then AI 656 (asset/configuration migration). Do not run their implementation
passes concurrently. Recheck branch readiness at each start and refresh affected catalog entries after intervening
changes. Commits, rebases, merges and propagation to other worktrees are separate operations, not automatic steps
between these tasks. Later merges require an explicitly requested follow-up using the maintained specs/catalogs;
do not automatically reopen DONE prompts or rewrite their completion history.

# Problem

AI 652 introduces the City, Bradbury and TerraMar Blender layout, and AI 653 catalogs the rest of the project.
The user's decision on 2026-10-17 makes the new layout the project-wide standard, replacing conflicting older
folder-placement rules. Blender scripts and saved files outside those initial domains must follow the same
architecture, with their consumers and documentation updated together.

`specs/tools/blender_authoring_layout.md` already exists when this prompt is written. Extend the canonical contract
if it still exists at execution time; create it at that path only if absent. Do not introduce a competing spec.

# Request

After AI 653 delivers `specs/tools/blender_migration_catalog.md`, update the project-wide specification and rules,
then migrate the in-scope catalog through verified batches. Preserve behavior, authored data and established
validation/publication gates. Any still-unmerged Graphics work remains deferred; do not inspect, change or merge
its separate worktree. Already integrated graphics workflows in the execution checkout remain in scope.

## Prerequisites and scope

- [ ] Require AI 653's completed inventory/catalog handoff; an unfinished inventory does not authorize migration.
  Read that catalog, AI 652's current state, `AGENTS.md`, `ai_rules/PROJECT_RULES.md` and the canonical
  layout/bake specifications. Reconcile the catalog with the actual checkout and concurrent work before mutation.
  The catalog is required: missing inventory or unknown source/destination mappings block the affected migration
  rather than authorizing guesses. Record newly discovered items and changed paths before migrating them.
- [ ] Keep already compliant City/Bradbury/TerraMar content in place. Distinguish layout leftovers from AI 652's
  separate baseline-regeneration, PBR-installation, standalone-city and full-regeneration phases. Preserve its
  pending work and completed checklist history; do not silently implement or claim completion of those phases.
- [ ] Scope migration to Blender authoring and its dependencies. Generic bake orchestration, browser exporters,
  runtime code, tests and installed game assets retain their appropriate existing homes, with consumers updated as
  needed. Do not relocate unrelated assets or redesign the bake framework or authored scenes.
- [ ] Keep Blender-owned scene/build recipes with their scripts, but leave game asset catalog/material/landscape
  configuration at its current authoritative location until AI 656. This applies even when Blender generates or
  consumes it. Record the final script paths and configuration readers/writers in AI 653's catalog for AI 655;
  AI 656 owns the later configuration-root change. Do not duplicate this metadata under `blender/scripts/`.

## Canonical specification and rules

- [ ] Extend `specs/tools/blender_authoring_layout.md` into the project-wide contract. Define domain ownership,
  naming, entry points, dependency ordering, source/input/output separation, path resolution, provenance, sharing,
  scratch builds and migration acceptance. Cover every domain identified by AI 653, not only the two heroes and City.
- [ ] Require tracked Blender scripts, reusable authoring modules, retained script templates and script-owned
  configuration under `blender/scripts/<domain>/`, with genuinely shared support under `blender/scripts/common/`.
  Keep `blender/` free of junctions and generated data. Use the catalog to distinguish Blender implementation from
  its host orchestration and tests, and document those boundaries explicitly.
- [ ] Require Blender scenes, libraries, parts, imported Blender baselines, retained legacy scenes and
  derived caches under gitignored `blender_files/<domain>/`. Keep non-game inputs under gitignored
  `blender_inputs/<domain>/`. Preserve AI 652's established `city`, `bradbury` and `terramar` IDs and role-based names;
  other domains receive explicit cataloged mappings rather than being forced into building-specific names.
  Preserve existing backup/recovery files without relocating or altering backups; create any new backup only in
  the external dated backup root. Retained legacy scenes are not a substitute for verified external backups.
- [ ] Require both data stores to be real root folders in main and shared root junctions in other worktrees,
  containing no tracked files. Preserve one-writer-per-file ownership and isolated scratch output support.
  Use `tools/worktree_setup/run.mjs` for necessary setup; preserve conflicting existing paths for resolution.
  Existing unrelated shared-asset metadata arrangements are outside this migration.
- [ ] Keep game-shipped textures, vegetation, HDRIs and published runtime outputs in their installed asset stores.
  Keep screenshots, videos, render comparisons and diagnostic reports under `tests/artifacts/screens/`. New
  Blender scenes/inputs must not return to `tests/artifacts/blender/` or another obsolete artifact/source location.
- [ ] Use the shared path definitions in `blender/scripts/common/paths.py` for Python authoring roots, with a
  consistent contract for other callers. Eliminate cataloged hardcoded checkout paths. Retain the shared ignored
  `tools/baking/blender.local.json` machine configuration and `node tools/bake.mjs` domain/leaf registration.
  Do not add another machine-specific bake command or bypass validation, staging or publication controls.
- [ ] Reconcile `AGENTS.md`, `ai_rules/PROJECT_RULES.md`, applicable coding/testing rules, `blender/README.md`,
  `PROJECT_TOOLS.md`, affected domain specs/tool READMEs, bake-framework docs, ignore rules and active prompt
  instructions with the canonical contract. State that this layout supersedes conflicting prior location rules.
  Keep completed/archived prompt history and completed checklist items intact; add a correction or current-spec
  reference where needed instead of rewriting historical completion claims.

## Catalog migration

- [ ] Before moving, renaming, relinking, overwriting, rebuilding in place or deleting any untracked/ignored data,
  copy everything affected to a fresh `C:\Users\rogel\Projects\bus_simulator_backups\<YYYY-MM-DD>_<topic>\`
  with `MANIFEST.md`, source-to-backup mappings, sizes and restore instructions. Verify the copies and record the
  backup for each batch. Never modify/delete a completed backup. Missing backup verification blocks data mutation.
- [ ] Recheck active writers and Blender-session ownership before each batch. Prefer the project's headed/MCP
  workflow when available; use a separate headless process only under the project's occupied-session fallback
  rules, with isolated outputs and safe resource use. Never interrupt or repurpose another session.
- [ ] Migrate every cataloged in-scope item in dependency order. Preserve tracked source history where possible,
  script-owned data, manual edits, original input/provenance records and retained legacy material. Resolve naming
  collisions explicitly. Do not overwrite duplicates, discard unknown scenes or delete original data merely
  because it is ignored. Keep originals until the applicable migration gates pass; cleanup is not this task's goal.
- [ ] Update generators and all consumers together: Python imports, embedded scripts, launcher arguments, job
  registrations, defaults, fixtures, external library/image paths, manifests and source inventories. Active scenes
  must open with the new dependencies, and previously working generators must still regenerate their outputs,
  without obsolete paths or compatibility junctions inside tracked folders. Manual/preserve-only scenes use their
  cataloged integrity/visual gates; this migration does not invent missing generators or implement AI 652's separate
  regeneration phases. Clearly label historical snapshots that are preserved but not runnable migration targets.
- [ ] Preserve original source URLs, author/license/date/checksum records and verified generation metadata.
  Add missing `source.json` fields with explicit unknown/null explanations where evidence is unavailable; never
  infer a license or original generation commit. Migration receipts are separate from original provenance.
  Revalidate changed path/hash/cache identities through the existing authentication rules; do not erase stale
  warnings or bless a receipt by rewriting hashes without the corresponding required validation.
- [ ] Update each catalog item's disposition, final path, backup, validation result and any remaining dependency.
  Record blocked items honestly. If Graphics-only work is still unmerged, retain a deferred/uninspected section;
  include content already integrated at execution time. Later merges require an explicitly requested follow-up
  that refreshes the catalog before migration, without automatically reopening a DONE prompt.

## Verification and acceptance

- [ ] Verify syntax/imports, affected entry-point and bake dry-run resolution, shared configuration, ignore/tracking
  boundaries and root-junction targets. Run relevant existing tests using the standardized test runner and add
  focused coverage only for meaningful migration risks, such as incorrect path resolution or lost dependency links.
- [ ] For each migrated workflow, verify saved-file dependencies and exercise existing working generators through
  a representative build/export/bake into fresh isolated output. Validate manual/preserve-only assets by opening
  them and applying the catalog's structural/visual checks; report their pre-existing regeneration limitations.
  Preserve required geometry, collections, materials, placement, counts and runtime formats.
  Use the catalog's existing visual/parity gates where appearance can be affected; retain AI 651/652's required
  composition parity gates for any affected hero/city files. A structural check alone does not satisfy a render gate.
- [ ] Exercise the path contract from main and a safe non-main/scratch context without changing the deferred
  Graphics worktree or touching occupied shared files. `BLENDER_FILES_ROOT` changes generated-file reads as well
  as writes: prepare the isolated dependency set before testing. Do not rename/delete originals to simulate this.
- [ ] Verify no active migrated caller depends on obsolete locations. Classify remaining old-path references as
  preserved history, migration records, explicit diagnostics or pending work instead of blindly replacing strings.
  Save generated validation evidence and receipts under
  `tests/artifacts/screens/ai654_blender_project_migration/`, gitignored. Keep curated results in the catalog/specs.
- [ ] Deliver the final-path catalog to AI 655 and identify Blender consumers of asset configuration. Keep their
  current behavior working at this handoff; the separate asset migration must not rely on pre-move script paths.
- [ ] Report current-checkout completion separately from deferred Graphics work and AI 652-owned pending phases.
  Required checks blocked by Blender occupancy or unavailable inputs remain incomplete with their exact purpose
  and required follow-up stated. If Blender cannot safely run, complete independent work and ask the user to free
  it for the outstanding checks. Do not declare an unverified migration complete.

## On completion

- Mark this AI document as DONE in the first line only when its current in-scope migration and gates are complete.
- Rename it in `prompts/` to `AI_DONE_654_PROJECTMAINTENANCE_blender_project_architecture_and_migration_DONE.md`.
- Do not move it to `prompts/archive/` unless explicitly requested.
- Add a high-level one-line summary per completed change, link the canonical specification and reconciled catalog,
  and report migrated domains, backups, verification results, remaining AI 652 work and the deferred Graphics scope.
- Preserve all checkouts, junction targets, existing backups and unrelated work. Do not commit, merge, publish
  assets or clean up worktrees as part of this migration.
