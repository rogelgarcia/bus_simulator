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

Git-tracked asset configuration currently shares the `assets/` data store with ignored game assets and is exposed
through worktree junctions. AI 655 defines a separation into shared ignored asset data and checkout-local tracked
configuration, with `assets_config/` as the proposed root. Implement its final specification and catalog so branch
configuration no longer resides inside the shared junction while the game continues using the same binary assets.

# Request

Execute the migration defined by AI 655, update all affected consumers/producers and project rules, and verify
that the game and tools retain their behavior. Follow the chosen canonical contract rather than inventing a second
layout. This task does not authorize binary publication to Git/LFS, history rewriting, branch merges or worktree
cleanup. Any still-unmerged Graphics work remains deferred; integrated content in the execution checkout is in scope.

## Prerequisites and preservation

- [ ] Require AI 655's completed definition/catalog and AI 654's validated Blender migration in the execution
  checkout. Confirm both handoffs match the actual paths and code; prompt numbering or a DONE filename alone is
  insufficient evidence. Do not run alongside a migration or AI 652 phase that writes the same files.
- [ ] Read AI 655's `specs/assets/asset_storage_and_configuration.md` (or the canonical replacement it explicitly
  selected) and `specs/assets/asset_configuration_migration_catalog.md`, plus the project backup/junction rules.
  Reconcile the catalog with the actual working tree, including relevant tracked edits and untracked configuration.
  Missing decisions or unmapped files block the affected migration; do not infer them from filename extensions.
- [ ] Verify real folders, junction targets and active writers before mutation. Preserve main's shared asset store
  and its existing worktree junctions. The configuration destination must be a real per-checkout directory outside
  every junction. Do not repurpose or update unrelated worktrees, including Graphics, to make this migration pass.
- [ ] Before any affected shared/untracked data is moved, overwritten, renamed, relinked or removed, create and
  verify a fresh external backup under
  `C:\Users\rogel\Projects\bus_simulator_backups\<YYYY-MM-DD>_<topic>\`. Include affected configuration and any
  other touched data, not only files expected to change, with a `MANIFEST.md`, source mappings, sizes/checksums and
  restore instructions. Preserve modified/untracked configuration as well as committed versions. Completed backups
  are immutable and must never be deleted or updated by an agent.

## Migration

- [ ] Apply the catalog's mappings for all authored configuration, including JS catalog/material/correction modules
  and landscape JSON. Preserve values, IDs, ordering, exports, comments, local edits and existing formats unless
  the definition explicitly requires a change. Keep ignored binary assets in their current locations and verify
  their preservation; the migration must not regenerate or re-download them as a shortcut.
- [ ] Keep Blender-owned scene/build recipes and authoring scripts in the AI 654 layout. Only their dependencies
  on game asset configuration change here. Resolve game asset metadata from the selected configuration root;
  do not copy it into `blender/scripts/` or move unrelated gameplay configuration into the new asset root.
- [ ] Change tracked ownership without destroying shared files that older worktrees still need. Follow AI 655's
  staged transition, not a blanket move/delete through the junction. Any necessary Git index changes must be
  limited to the cataloged relocation paths and preserve unrelated staged work; do not stage binary data or commit.
  Retained legacy copies are ignored in the migrated checkout, have an explicit transition status and are never
  the new implementation's configuration authority. Report any older-branch tracking hazard that remains deferred.
- [ ] Update static and dynamic imports, catalog discovery, browser URLs, filesystem roots and relative map
  resolution so configuration comes from the new tracked root and binary maps/models still come from `assets/`.
  Update Node and Blender consumers as well as runtime code. Do not solve obsolete paths with a configuration
  junction or a silent fallback that keeps the shared config authoritative.
- [ ] Update every cataloged writer: asset installers, PBR generators, correction/calibration tools, catalog
  collectors, landscape preparation and applicable bake jobs. New/edit/save workflows must target the current
  checkout's configuration root and the correct shared binary destination, preserving existing staging,
  authentication and publication gates. Keep generated manifests, receipts and provenance where the spec assigns
  them; do not move every JSON file merely because it is text.
- [ ] Make `assets/` fully ignored in the migrated layout and remove its old configuration re-inclusion rules.
  Remove tracked ownership for all cataloged `assets/` files while preserving required physical data. Ensure the
  new configuration root is tracked normally and cannot introduce binary payloads or LFS pointers. Reconcile
  `.gitattributes`, storage tests and any rules that previously permitted asset binaries through LFS; do not rewrite
  history or treat existing binary fixtures elsewhere in the repository as permission for unrelated cleanup.
- [ ] Preserve byte-sensitive configuration/provenance contracts, including line endings and source checksums.
  Where references or bytes must change, revalidate dependent cache/manifest identities through their existing
  workflow. Never rewrite a recorded hash just to accept stale data or claim original provenance that is unknown.
  Preserve source/license records and their association with the unchanged asset data.
- [ ] Reconcile `AGENTS.md`, `ai_rules/PROJECT_RULES.md`, applicable coding/testing rules, the asset/PBR/landscape
  specs, README/tool documentation, worktree setup instructions and relevant Blender documentation with the
  implemented contract. Remove the current asset-metadata exception for the migrated layout and clearly document
  the transition status of older worktrees. Keep completed/archived prompt history and completed checklist text
  intact; correct active instructions without reopening unrelated AI 652-654 implementation work.
- [ ] Update the migration catalog by stable ID with final paths, dispositions, backups, consumer/writer changes
  and verification results. Update current dependency references in the maintained Blender catalog/spec where
  this migration changes them, preserving AI 654's historical validation results. Mark only still-unmerged Graphics
  work as deferred/uninspected. Later merges require a separately requested re-audit and migration under the same
  contract, not automatic reopening of DONE prompts.

## Verification and acceptance

- [ ] Verify the migrated Git index has no tracked files under `assets/` and the new configuration paths have the
  intended ignore/attribute behavior. Distinguish the migrated index/working tree from historical HEAD: a future
  commit is outside this task, and old committed paths do not justify rewriting history. Confirm configuration is
  plain version-controllable content, binary data remains ignored and no destination is inside a shared junction.
- [ ] Compare the catalog before/after: IDs, membership, texture URLs, map choices, correction values and landscape
  preparation parameters remain equivalent. Hash preserved configuration and relevant asset payloads before/after
  to detect unintended changes. Any intentional configuration-byte changes have documented, validated consequences.
- [ ] Run focused existing storage, catalog, calibration, landscape and loader tests through the standardized
  runner; adapt/add meaningful coverage for the split. Exercise actual runtime imports and asset requests, not
  just string searches. Verify representative materials/textures load with the same appearance and no missing
  configuration or asset errors; save any comparison captures under the evidence directory below.
- [ ] Exercise representative producer/save paths in isolated outputs so they demonstrate the new configuration
  destination without overwriting shared assets. Verify fresh-checkout behavior and independent checkout-local
  configurations against the same shared binaries using a safe isolated fixture or eligible test context; do not
  change the deferred Graphics checkout. Keep expected missing-binary handling distinct from configuration errors.
- [ ] Search for remaining active references/writers to the old configuration paths and resolve them or classify
  explicit historical/transition records. Verify all migrated consumers work without reading retained legacy
  configuration, without deleting/renaming shared originals as a test. Existing binaries and junction targets must
  remain intact, and no runtime/build output should repopulate tracked config in the shared asset folder.
- [ ] Recheck affected Blender generators/consumers after the configuration move, using AI 654's final paths and
  relevant existing gates. The combined result must satisfy both layout specifications; fixing asset lookup must
  not restore old Blender source locations or write game asset metadata back into a shared junction.
- [ ] Keep generated inventories, hashes, logs, test reports and screenshots gitignored under
  `tests/artifacts/screens/ai656_asset_configuration_migration/`. Record curated results and remaining blockers in
  the catalog. Report current-checkout completion separately from deferred branches; required failing or skipped
  migration gates remain incomplete. Follow project Blender occupancy rules for any necessary Blender validation.

## On completion

- Mark this AI document as DONE in the first line only when its current in-scope migration and gates are complete.
- Rename it in `prompts/` to `AI_DONE_656_PROJECTMAINTENANCE_asset_configuration_separation_migration_DONE.md`.
- Do not move it to `prompts/archive/` unless explicitly requested.
- Add a high-level one-line summary per completed change, link the implemented specification/catalog, report
  backup locations and validation results, and identify retained transition copies and deferred Graphics work.
- Do not commit, push, rewrite Git history, remove worktrees/junctions, delete backups or perform unrelated asset
  cleanup. Shared binary asset data must remain available to the game and existing worktrees.
