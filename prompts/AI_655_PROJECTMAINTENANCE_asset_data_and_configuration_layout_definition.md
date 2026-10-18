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

The shared `assets/` store contains both ignored game data and Git-tracked configuration. Other worktrees access
that store through a junction, so checkout-specific configuration lives inside shared data. Git operations or
configuration edits in one worktree can affect the others. The user wants these responsibilities separated:
game asset data continues under ignored `assets/`, while authored configuration lives in a separate tracked folder
outside every junction. Game binary assets must not be committed or distributed through Git/LFS.

The user suggested `assets_config/` as the configuration root. Define the exact layout after reviewing the project,
then hand it to AI 656 for execution. At prompt creation, main owns a real `assets/` directory, and the tracked
inventory includes JavaScript catalog/material/correction modules as well as landscape JSON configuration.
This is not a JSON-only migration.

# Request

Review asset storage and configuration across the current checkout, write the target specification, and catalog
the migration. This task defines the change; AI 656 carries it out. Do not relocate data, edit runtime/tool behavior,
change Git tracking/ignore rules, replace junctions or modify another branch/worktree during this definition pass.

## Review and definition

- [ ] Require AI 654's completed in-scope migration and validated final-path catalog before this definition pass.
  Use `specs/tools/blender_migration_catalog.md` to locate Blender asset-configuration readers/writers after their
  relocation. Preserve the Blender layout contract; asset separation changes their configuration dependencies,
  not their authoring source locations. If prerequisite validation is incomplete, report it rather than proceeding.
- [ ] Inspect `AGENTS.md`, `ai_rules/PROJECT_RULES.md`, `.gitignore`, `.gitattributes`, relevant asset/material/
  landscape specifications, asset installation and correction tools, worktree setup, runtime loaders and tests.
  Include the Blender asset consumers and the layout work in AIs 652-654, whose scope deliberately left this
  shared-asset metadata problem for a separate task.
- [ ] Inventory every tracked file under `assets/`, relevant modified/untracked configuration and ignored metadata,
  and their readers/writers. Record checkout/commit/date, physical root/junction ownership, current paths, file role,
  tracking state, proposed destination, dependencies and verification needs. Use stable catalog item IDs and
  explicit file lists for grouped entries. Preserve local edits and identify divergent or duplicate definitions.
- [ ] Cover authored JSON, JavaScript modules, catalog indexes and any other configuration format discovered.
  Known examples are `_catalog_index.js`, `pbr.material.config.js`, `pbr.material.correction.config.js` and
  `pbr.landscape.config.json`. Inspect imports, dynamic configuration loads, filesystem discovery, URL/path
  resolution, generators/installers, calibration writers, Blender consumers, HTTP serving and test fixtures.
- [ ] Distinguish authored configuration from the asset payload and its generated package manifests, receipts,
  caches, download provenance and license files. A JSON extension alone does not decide ownership. Define which
  text sidecars must remain beside ignored data, and which metadata is version-controlled outside the junction.
  Preserve the `source.json` provenance rule and avoid two editable sources of truth for the same configuration.
- [ ] Keep Blender-owned scene/build recipes under `blender/scripts/`; put authored game asset configuration in
  the selected asset-configuration root regardless of whether its writer is a Blender, Node or browser tool.
  Scope this migration to the cataloged shared-asset metadata, not unrelated gameplay configuration elsewhere.
- [ ] Write the canonical target contract at `specs/assets/asset_storage_and_configuration.md`, or extend an
  equivalent existing canonical spec if one is discovered and record its path. Prefer a real root directory
  `assets_config/` for tracked, checkout-local configuration; validate and choose its exact subfolder scheme,
  IDs/names and relationship to `assets/`. Document the decision and rationale, not an unresolved list of options.
- [ ] Specify that `assets/` remains the ignored shared game-data store, with real storage in main and root
  junctions in other worktrees. The configuration root is ordinary per-checkout Git content, contains no binary
  payloads and has no junctions or symlinks into shared data. No tracked file may remain under `assets/` in the
  migrated layout. Keep binary locations and game asset URLs stable wherever possible.
- [ ] Define independent configuration and binary roots for browser, Node and Blender consumers. Preserve material
  IDs, catalog membership/order, calibration values, map selections and relative texture semantics. Moving a
  config must not make its relative image names resolve beside the new config file. Preserve existing JS/JSON
  formats unless a necessary format change is justified by repository evidence.
- [ ] Define how configuration generation, installation, correction saves and bake publication write to the
  current checkout's configuration root while binaries still target the shared asset store. Preserve the existing
  bake framework and validation/publication gates. Specify behavior for missing optional configuration and missing
  installed binaries, including fresh checkouts; configuration discovery must not silently depend on old copies.
- [ ] Review `.gitignore` re-inclusions, `.gitattributes` LFS/text rules and the current PBR storage tests. Define
  their replacement so all asset data is ignored and configuration is ordinary Git content, never LFS pointers.
  Account for byte-sensitive SHA-256 provenance and line-ending behavior before moving configuration; identify
  when relocation alone can preserve bytes and when dependent identities need legitimate revalidation.
- [ ] Define a staged, backup-first transition that preserves the shared binary store and other worktrees.
  `.gitignore` alone does not untrack existing files. Blind `git mv` or removal through a junction can remove a
  file still needed elsewhere. Specify how tracked ownership changes while required shared bytes remain safe,
  and how any temporary legacy copies are labeled, prevented from becoming current authority and retired later.
  Do not require old worktrees to migrate by editing their checkout or deleting their shared dependencies.
- [ ] Catalog every affected rule/spec/README/test and state which old folder-placement instructions the target
  contract supersedes. In particular, reconcile the PBR catalog, normalization and correction specifications and
  their assumption that configuration sits beside textures. Describe the compatibility boundary with AIs 652-654.
- [ ] If Graphics-only work remains unmerged at execution time, keep it deferred/uninspected; include already
  integrated content normally. Define a re-audit for an explicitly requested later follow-up so newly merged
  configuration/callers cannot restore tracked files inside shared assets. Do not automatically reopen DONE prompts
  or claim the present catalog covers unmerged work.

## Deliverables and acceptance

- [ ] Deliver a curated, tracked migration catalog at `specs/assets/asset_configuration_migration_catalog.md`,
  linking the chosen canonical spec. Include explicit current-to-target mappings, all producer/consumer changes,
  ordered batches, blockers, required backups, rollback approach and meaningful acceptance checks for AI 656.
- [ ] Mark the specification as the target design awaiting implementation. Separate observed current behavior
  from the new contract; rules and working software are reconciled by AI 656. The handoff must settle the folder
  choice and ownership boundaries sufficiently for migration without inventing missing mappings.
- [ ] Keep raw inventories, generated reports and any inspection evidence gitignored under
  `tests/artifacts/screens/ai655_asset_configuration_definition/`. Record scope limitations and concurrent changes.
  No live asset/configuration data, Git index, junction or implementation is changed in this definition pass.

## On completion

- Mark this AI document as DONE in the first line.
- Rename it in `prompts/` to `AI_DONE_655_PROJECTMAINTENANCE_asset_data_and_configuration_layout_definition_DONE.md`.
- Do not move it to `prompts/archive/` unless explicitly requested.
- Add a high-level one-line summary per completed change, link the specification/catalog, state the selected
  folder layout and identify unresolved dependencies and the deferred Graphics follow-up for AI 656.
