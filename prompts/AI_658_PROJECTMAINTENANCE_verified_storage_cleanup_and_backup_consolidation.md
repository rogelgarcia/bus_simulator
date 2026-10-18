# Problem

AI 657 audits the Bus Simulator storage footprint and distinguishes disposable generated output from test sources,
baselines, authoring data, backups and worktrees. The user wants verified redundant/obsolete data cleaned up and
misplaced backups moved into the official backup root. Cleanup must preserve the game, tests, original authoring
work, shared asset targets and recovery history, including data currently under misleading artifact directories.

# Request

Execute the eligible actions from `specs/maintenance/project_storage_cleanup_catalog.md`, consolidate the cataloged
misplaced backups, verify the remaining project and report actual storage changes. Do not invent deletion targets
from age, file extension, folder name or Git-ignore status. This prompt is not authorization to remove project
worktrees under the standing prohibition, or to delete any backup history in the official backup store.

## Prerequisites and boundaries

- [ ] Require AI 657's completed audit/catalog and read the current project backup, junction and testing rules.
  Revalidate each candidate against the actual filesystem, Git state, references, active writers and physical
  ownership. Record new/changed items for analysis instead of silently extending an old removal list.
- [ ] Before mutating project storage, verify the branch-readiness prerequisite established for AIs 653-656:
  buildings, graphics, grass, landscape and machine-learning branches are current with the latest main through
  completed rebases, with no unfinished rebase/conflicts. Verify real branch names and current upstream/main state.
  Synchronization is separate work; do not run rebases/merges automatically. Rebasing does not integrate branch-only
  work or preserve unsaved/ignored files, so those still require independent inventory and protection.
- [ ] Do not run cleanup concurrently with writers to the affected data. A deletion dependent on AI 652-656 must
  wait for that item's migration, consumer updates and required parity/integrity gates. Refresh its catalog entry
  after migration. Independent, fully verified disposable output may be cleaned without implementing unrelated
  pending phases. Do not reopen DONE prompts or treat their filename as proof that a particular source is obsolete.
- [ ] Protect test source, fixtures, committed baselines/budgets, game assets/configuration, Blender authoring files,
  unique inputs, manual edits, provenance, live manifests and evidence required by unfinished tasks. Unknown or
  inaccessible data stays in place. No Git history rewriting, garbage collection, LFS pruning, blanket `git clean`,
  branch deletion, baseline regeneration or unrelated package/cache removal is part of this cleanup.

## Verified cleanup

- [ ] Turn eligible catalog entries into exact action batches with resolved absolute paths, expected identities/
  hashes, byte counts, keepers, required backups and validation steps. Verify containment within the named scope
  and inspect reparse points/embedded checkouts before every batch. Any unexpected path, target or changed content
  blocks that item. Never use a recursive parent operation that could traverse a junction or remove a checkout.
- [ ] Before any move, rename, relink or deletion of untracked data, create and verify the required immutable backup
  under `C:\Users\rogel\Projects\bus_simulator_backups\<YYYY-MM-DD>_<topic>\`, with `MANIFEST.md`, exact source
  mappings, size/hash verification and restore instructions. Include everything touched. Confirm sufficient space
  for the backup and operation; do not delete first to make room. Do not substitute an unverified existing copy.
- [ ] Remove only cataloged output proven obsolete or safely reproducible and not needed by active work. For
  duplicates, preserve the chosen keeper and confirm all path-specific consumers still resolve before retiring
  another copy. Exact byte equality is necessary evidence for exact deduplication, not sufficient deletion authority
  by itself. Do not deduplicate backups, replace data with new junctions/hard links or remove required independent
  copies just to reduce reported bytes. Preserve tracked source and baseline files.
- [ ] Handle mixed directories at the enumerated item level. In particular, never clear `tests/artifacts/`,
  `tests/artifacts/screens/`, `test-results/` or an authoring folder wholesale. Preserve any nested Git checkout,
  migration source, hand-edited `.blend`, retained input/reference or protected report identified by the audit.
  Removing the last file in a directory does not authorize removing a protected parent or junction.
- [ ] Record each completed or skipped action by catalog ID, including the verified backup, keeper/destination,
  actual bytes and reason. Preserve unexpected data and report it. Do not broaden scope to chase a target saving.

## Consolidate misplaced backups

- [ ] Use the audited mappings for `graphics_backups`, `grass_backups` and `shared_folders_backups` under
  `C:\Users\rogel\Projects\bus_simulator_worktrees`, plus any other cataloged misplaced project backups. Verify
  each is an inactive backup copy, not a live registered checkout, shared target or unresolved recovery location.
  Preserve original payloads, inner manifests, original dates and restore provenance; never merge over an existing
  official backup or deduplicate its contents.
- [ ] For each relocation, populate a fresh uniquely named `<YYYY-MM-DD>_<topic>` directory in the official root.
  Add an outer `MANIFEST.md` recording original location, relocation date, AI/catalog IDs, content verification and
  restore instructions without editing an original manifest. Verify the complete source inventory and hashes
  against the copy and recheck that the source stayed stable. The verified official copy supplies pre-mutation
  recovery protection; once complete, it is immutable.
- [ ] The user's request specifically authorizes relocation of these misplaced copies. After verification and
  confirmation that no active consumer, live worktree or shared-target dependency would be broken, retire only the
  exact cataloged original copy to complete the move. This is a narrow relocation exception, not permission to
  delete backup history or alter/delete any existing or newly completed official backup. Unexpected links or
  ownership stop the affected relocation. Never retire a parent containing unrelated data.
- [ ] Report backup relocations separately from duplicate cleanup. If a source cannot safely be retired, report
  the verified copy and remaining original as an incomplete relocation; do not claim it was moved or that space
  was reclaimed. Update current documentation references where needed without rewriting historical records.

## Worktree findings and prohibited removal

- [ ] Reconcile the audit's registered/unregistered/nested Bus Simulator checkouts and any Codex leftovers. Preserve
  their committed, uncommitted and ignored data and record exact outstanding paths. The desired result is no
  leftover Bus Simulator worktrees under Codex, but the project currently forbids agent worktree removal.
- [ ] Never call `archive_worktree`, use chat/UI archival to remove a checkout, invoke `git worktree remove`, prune
  registrations or recursively delete/move a checkout as a substitute. This includes worktrees inside test output.
  Leave them intact. A removal requires a separately validated procedure and an explicit user change to the
  prohibition; this cleanup request does not itself supply that change. Complete independent eligible actions and
  report precisely what remains blocked, without claiming that all Codex/project worktree leftovers are gone.

## Verification, retention and accounting

- [ ] Re-measure the same roots with AI 657's physical deduplication rules. Report before/after logical workspace
  bytes, unique physical/allocated bytes where measurable, backup bytes added/relocated, audit/test output created
  and net disk-space change. Use measurements, not sum-of-file estimates presented as free space. Same-drive backup
  relocation does not free space, and backup-before-deletion may only shift storage out of the workspace.
- [ ] Verify preserved file identities, shared targets, game/configuration lookups and affected test/authoring
  consumers. Run the relevant existing checks through the standardized runner; capture new test output separately
  and account for it. Do not rebuild large datasets or overwrite visual baselines to conceal missing dependencies.
  If a check fails because of cleanup, stop that batch and restore by copying out of the verified backup, without
  modifying it or overwriting newly changed user work.
- [ ] Document the implemented storage/retention contract at `specs/maintenance/project_storage_retention.md` and
  reconcile relevant project/testing/tool documentation. Clearly distinguish test source, committed baselines,
  protected authoring data, required evidence and eligible generated artifacts. Folder placement alone must never
  imply permission to delete. Preserve the Blender and asset/configuration contracts from AIs 653-656.
- [ ] If durable audit/cleanup tooling is needed, follow the project's tool structure/registration rules. Default
  to a non-mutating plan, require explicit cataloged targets for execution and enforce the same path/junction/
  backup guards. Do not introduce automatic scheduled cleanup or a blanket artifact-directory deletion command.
- [ ] Keep generated action receipts, inventories, hashes and verification evidence gitignored under
  `tests/artifacts/screens/ai658_storage_cleanup/`. Update the curated catalog with measured results, completed
  relocations and every preserved/deferred/prohibited item. Protect this task's evidence from its own cleanup.

## On completion

- Mark this AI document as DONE in the first line only when all permitted in-scope catalog actions and their gates
  are resolved. Keep prohibited worktree removals as explicit excluded/blocked follow-up; completing the permitted
  scope must never be described as achieving the unresolved goal of zero Codex worktree leftovers.
- Rename it in `prompts/` to
  `AI_DONE_658_PROJECTMAINTENANCE_verified_storage_cleanup_and_backup_consolidation_DONE.md`.
- Do not move it to `prompts/archive/` unless explicitly requested.
- Add a high-level one-line summary per completed change. Link the reconciled catalog and retention spec, report
  measured before/after storage and actual net benefit, list official backup destinations, and identify unresolved
  authoring/migration questions, incomplete relocations and prohibited worktree removals.
- Do not commit/push, remove worktrees/shared targets, modify/delete official backups or perform uncataloged cleanup.
  The only backup-source retirement allowed is the verified misplaced-backup relocation explicitly defined above.
