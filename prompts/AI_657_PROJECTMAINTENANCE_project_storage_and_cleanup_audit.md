# Problem

The Bus Simulator project occupies substantial disk space across its main checkout, worktrees, shared stores,
test output and backups. There may be duplicate or obsolete files, but directory names do not establish whether
data can be deleted. Blender authoring files previously lived under test artifacts, and registered Git worktrees
also exist beneath `tests/artifacts/`. Test sources, committed baselines, unique authoring data and recovery copies
must be distinguished from disposable generated results before cleanup.

The user also wants Bus Simulator worktrees left under the Codex folder identified, and misplaced graphics,
grass and shared-folder backups consolidated into the official `bus_simulator_backups` root. This AI enumerates
and evaluates the work. AI 658 performs the eligible cleanup and backup relocation from the verified catalog.

# Request

Audit storage across the complete project footprint and produce an actionable cleanup catalog with evidence,
retention decisions, dependencies and honest space estimates. This is a read-only audit of existing data: do not
delete, move, rename, relink, rebuild, prune Git state, alter junctions or execute any cleanup.

## Scope and relationship to the other AIs

- [ ] Read `AGENTS.md`, `ai_rules/PROJECT_RULES.md`, `ai_rules/TESTING_RULES.md`, the Blender layout specification
  and available AI 652-656 catalogs/results. Record the actual branch/commit, worktree state and inspection date.
  This read-only audit may precede those migrations; note their pending dependencies and refresh affected entries
  after they run. Do not execute, reopen or mark those prompts complete as part of this audit.
- [ ] Include the main checkout `C:\Users\rogel\Projects\bus_simulator`, its registered and discovered project
  worktrees, shared data, dependencies/downloads, Git storage, test output and project backups. Inspect
  `C:\Users\rogel\Projects\bus_simulator_worktrees` and the official
  `C:\Users\rogel\Projects\bus_simulator_backups` root. Inventory backup data read-only; never modify it.
- [ ] Inspect the configured Codex worktree storage, starting with `C:\Users\rogel\.codex\worktrees`, for checkouts
  attributable to this repository. Verify ownership using Git common-directory/worktree metadata and available
  project identity, not just a directory basename. Do not scan unrelated Codex chats, credentials or projects.
  Record access failures and uncertain ownership instead of treating an uninspected location as empty.
- [ ] This storage audit explicitly includes the buildings, graphics, grass, landscape and machine-learning
  worktrees, including untracked/ignored data. It does not migrate their sources, synchronize branches or change
  the separate Graphics deferral in AIs 653-656. Read only the metadata/content needed to classify project storage.

## Audit requirements

- [ ] Map physical roots, junctions/symlinks/reparse points and hard-linked files before recursive enumeration.
  Count each shared physical target once, detect cycles and stay within identified project storage. Report both
  apparent per-checkout sizes and unique physical storage; do not multiply the same assets by the worktree count.
  Distinguish logical file bytes from allocated disk space, marking unavailable measurements explicitly.
- [ ] Report totals and largest consumers by root, directory, file type and individual large files, with file counts,
  measurement time and coverage limits. Include ignored/untracked content, `node_modules`, downloads, archives,
  shared assets, Blender stores, hidden project directories, Git objects and unusual/malformed directory names.
  Do not infer that unfamiliar names, age, Git-ignore status or large size make a file disposable.
- [ ] Audit `tests/` in detail: test code, fixtures, helper data, harnesses, committed visual baselines/performance
  budgets, generated screenshots/videos/traces/logs/reports, bake outputs, authoring sources, inputs, recoveries,
  temporary caches and embedded Git checkouts. Include root `test-results/` and output paths outside `tests/`.
  Preserve `screens/` as source unless specific evidence establishes otherwise; it contains tracked HTML entries.
- [ ] Treat the known registered worktrees under
  `tests/artifacts/git-integration/20261014-grass-buildings/rebase` and
  `bus_simulator_worktrees/graphics/tests/artifacts/git-integration/20261014-graphics-main/rebase` as discovery leads
  to reverify. A parent `tests/artifacts/` cleanup must never encompass these checkouts or their shared targets.
- [ ] For each cleanup candidate, identify its owner/purpose, producer and consumers, active use, Git status,
  references from code/specs/prompts/manifests, and whether it is unique, manually edited or reproducible. For
  reproducible output, name the generator and verify the required source inputs/toolchain exist without running an
  expensive rebuild during this audit. Missing generators/inputs, unresolved references or uncertain value mean keep.
- [ ] Cross-reference Blender files, baselines, inputs and old authoring paths with AI 652-654's migration and parity
  gates. A copied/moved file is not proven obsolete merely because another version exists in `blender_files/`.
  Preserve originals needed for migration validation, manual edits, retained reference images and required evidence.
- [ ] Identify byte-identical duplicate candidates using size/content checksums and physical-file identity; group
  related variants separately. Record a proposed keeper, all members, references and the reason each other copy
  is or is not redundant. Identical content can serve separate required paths or recovery histories. Do not count
  junction aliases/hard links as reclaimable duplicates or propose automatic new links as a deduplication shortcut.
- [ ] Inventory every discovered Bus Simulator checkout in Codex storage and elsewhere, including unregistered,
  detached, nested, missing or apparently abandoned entries. Record exact path, ownership evidence, branch/HEAD,
  registration, unique commits/local changes, ignored authoring data, shared targets and known active use. Do not
  assume that an unregistered or old folder is safe to remove. Report stale Git registrations separately from bytes.
- [ ] Mark worktree/check-out removal as prohibited under the current project rule. The desired absence of project
  worktrees under Codex is a goal to track, not permission to bypass the prohibition with archival, chat/UI actions,
  `git worktree remove`, pruning or shell deletion. Leave all checkouts intact and specify the unresolved follow-up.
- [ ] Inventory `graphics_backups/`, `grass_backups/` and `shared_folders_backups/` under
  `C:\Users\rogel\Projects\bus_simulator_worktrees`, plus any other positively identified misplaced project backups.
  Distinguish actual backup copies from live shared folders or worktrees. Record original manifests, creation dates
  where known, contents, sizes, links, hashes and restore dependencies. Plan unique dated destinations under the
  official backup root with an outer `MANIFEST.md`, preserving original payload/manifests and provenance.
- [ ] Define the user-requested backup relocation as a narrow exception for relocating the cataloged misplaced
  copies, not permission to discard backup history. Plan copy, verification and retirement of the old copy only
  after the official copy is complete and protected. Existing official backups remain immutable. Moving a backup
  on the same drive is organization, not reclaimed disk space; do not include it as a deduplication saving.

## Catalog and acceptance

- [ ] Write the curated, tracked catalog at `specs/maintenance/project_storage_cleanup_catalog.md`. Give each item
  or fully enumerated coherent group a stable ID, exact source/physical path, bytes, class, evidence, keeper or
  destination, proposed action, dependencies, backup requirement, verification/restore plan and readiness status.
  Use dispositions such as keep, candidate deletion, candidate deduplication, relocate backup, await migration,
  prohibited worktree removal, or unresolved. No open-ended wildcard or whole artifact-root deletion is eligible.
- [ ] Provide prioritized batches and a retention proposal for sources, baselines, authoring inputs, required
  evidence, reproducible caches and disposable test output. Separate proven facts from recommendations. Every
  proposed removal must explain why the remaining project still works; a filename/hash match alone is insufficient.
- [ ] Estimate workspace reduction, unique bytes potentially released, backup overhead, peak temporary space and
  actual net disk benefit separately. Required external backups may cancel same-drive savings. Record protected
  backup storage and blocked worktree storage separately, without promising that agents can reclaim them.
- [ ] Keep raw inventories, hash lists and generated reports under
  `tests/artifacts/screens/ai657_project_storage_audit/`, gitignored. Exclude/count the audit's own outputs separately
  so they do not distort baseline totals. Keep sensitive file contents out of the reports.
- [ ] Recheck unstable/changing candidates before the handoff, identify active writers and inspection gaps, and
  deliver a concrete plan to AI 658. Audit completion means coverage and decisions are documented, not that storage
  has been cleaned or that blocked worktree removals are resolved.

## On completion

- Mark this AI document as DONE in the first line.
- Rename it in `prompts/` to `AI_DONE_657_PROJECTMAINTENANCE_project_storage_and_cleanup_audit_DONE.md`.
- Do not move it to `prompts/archive/` unless explicitly requested.
- Add a high-level one-line summary per completed change and link the catalog. Report measured storage hotspots,
  eligible and uncertain cleanup, protected authoring data, misplaced backups, Codex worktree findings and blockers.
- Do not delete, relocate, archive, prune or modify existing project data; AI 658 owns the eligible execution.
