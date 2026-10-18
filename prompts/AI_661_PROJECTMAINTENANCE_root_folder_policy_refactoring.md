# Problem

The repository must make each root folder's Git and sharing policy apply to all of its contents. Mixed trees
(ignored files under tracked roots, tracked exceptions under ignored roots, or nested project junctions) obscure
ownership and make setup, maintenance and data preservation unreliable. AI 660 identifies the required changes
after the existing reorganization through AI 659.

# Request

Implement AI 660's root-folder policy refactoring and its associated producer/consumer/documentation changes.
The final root layout must communicate and enforce uniform folder policies without losing data or changing
application behavior. Each root must have the explicit content responsibility defined by AI 660, independently of
its Git and sharing policy. This is the execution task, following the completed audit; it is not general storage cleanup.

## Prerequisites and execution boundary

- [ ] Require `specs/maintenance/root_folder_policy_audit.md` and the applicable completed AI 652-659 handoffs.
  Read the current project/local rules and affected canonical specs. Refresh AI 660's mappings against the actual
  checkout, local changes, links, ignore rules and shared-store ownership. Resolve affected inventory gaps before
  mutation; do not guess destinations or treat AI 659 proposals as already implemented.
- [ ] Use AI 660's finding IDs and ordered batches. Record changes/new discoveries in the maintained plan before
  migrating them. Keep unrelated work and unmerged/deferred branch-only content intact. Do not automatically
  commit, push, rebase, merge, propagate edits to other worktrees or reopen DONE prompts.

## Implement the uniform root contract

- [ ] Implement AI 660's responsibility taxonomy and actual workflow mappings: authored source + authored
  configuration + acquired/previous-stage input -> generated output -> consumer. Give each root one primary
  responsibility and document allowed/forbidden contents. Separate mixed responsibilities even when they have
  identical Git policies; do not merely rename folders or combine everything into three catch-all roots.
- [ ] Separate executable authored source, declarative configuration, authored documentation and manually authored
  assets according to the audited mappings. Keep configuration in dedicated roots organized by owner/domain,
  with local/private settings separate from tracked recipes/defaults/catalogs. Preserve required tool-specific
  root files, keep implementation constants with code, and update all configuration resolution together.
- [ ] Preserve distinct contracts for acquired raw inputs/references, installed dependencies and externally supplied
  runtime assets. Retain acquisition provenance and authoritative edited derivatives. Keep generated code/bundles,
  generated assets, intermediate/checkpoint/cache data and generated evidence in their designated output roots.
  Preserve publication gates and distinguish working output from installed runtime output. Only introduce roots
  justified by the inventory; an output used by another stage does not need a duplicate in an input store.
- [ ] Implement the audited Blender responsibility split if `blender_files/` mixes generated scenes with manual
  sources/imported baselines. Preserve unique authored work and update the canonical Blender contracts and all
  consumers together. Never reclassify manual or unreproducible files as disposable to fit the target layout.
- [ ] Publish reproducibility and retention classifications independently of folder origin. Claim regenerability
  only with retained inputs/configuration, an identified producer/toolchain and recorded validation evidence.
  Preserve conditional, unknown and preserve-only data; do not run destructive regeneration experiments. This
  migration does not authorize deleting outputs merely because they are classified as generated.
- [ ] Establish the canonical root-visible policy manifest/table selected by AI 660. Declare every project-owned
  root directory's origin/responsibility, domain owner, allowed/forbidden content, Git policy, sharing/link policy,
  inputs/producers/consumers and reproducibility/retention contract, plus individual root-file policies.
  Document how a new root is registered. Keep the policy itself in Git and provide one authoritative definition.
- [ ] Separate mixed roots according to the audited mappings. Git-managed roots have no ignored descendants;
  wholly ignored roots have no tracked files or unignored exceptions. Preserve authored source/configuration in
  Git-eligible locations and generated binaries, private/local settings and data in appropriate ignored locations.
  Do not use Git LFS or encode generated payloads into source to circumvent the contract.
- [ ] Make shared stores ignored real root directories in main and root junctions in secondary worktrees, with no
  tracked content and no nested project-managed sharing links. Preserve checkout-local outputs/settings where the
  audited policy requires isolation. Use `tools/worktree_setup/run.mjs` for setup and extend its policy integration
  as needed, retaining conflict detection and refusal to overwrite unexpected existing paths. Treat Git metadata
  and dependency-manager internal links as infrastructure, not migration targets.
- [ ] Simplify effective ignore rules to match whole-root policies and explicit root-file policies. Remove obsolete
  descendant exclusions/re-inclusions and prevent broad patterns from silently excluding content under tracked
  roots. Check both index state and ignore behavior; changing `.gitignore` alone does not remove tracked data.
  Any necessary index-only untracking must be limited to cataloged paths, preserve working files, and be reported.
  Do not force-add ignored data or conceal violations through local/global excludes. Do not change a user's global
  Git configuration; report external policy conflicts and their impact explicitly.
- [ ] Update all cataloged producers and consumers together: imports, runtime/static-server URLs, asset catalogs,
  Blender path resolution, bake registries/settings, test selection/reporters, caches, CLI defaults and inventories.
  Preserve one authoritative machine configuration, existing bake registration, validation/publication gates,
  provenance, package identities and missing-data behavior. Prevent ordinary workflows from recreating local or
  generated files under tracked roots. Do not leave compatibility junctions that violate the new policy.
- [ ] Update `AGENTS.md`, applicable `ai_rules/` instructions, canonical specs, tool READMEs, `PROJECT_TOOLS.md`,
  setup docs and pending active-prompt instructions affected by relocated paths. Explicitly replace the old nested
  artifact and local-settings mandates. Preserve completed checklist text and completed/archived history; supply
  current-policy references separately. Preserve the Blender authoring/data separation and earlier asset/bake
  contracts except for the explicitly cataloged location changes required by this invariant.

## Data and worktree safety

- [ ] Before moving, renaming, relinking, overwriting, rebuilding in place or deleting untracked/ignored data, make
  a verified backup of everything affected under
  `C:\Users\rogel\Projects\bus_simulator_backups\<YYYY-MM-DD>_<topic>\`, with `MANIFEST.md` recording date, AI 661,
  source paths, copied contents, total size and restoration instructions. Every backup is immutable to agents.
  Restore only by copying out. Never put backups inside this repository or a shared store.
- [ ] Verify absolute source/destination paths, link targets, ownership, destination collisions and active writers
  before each batch. Preserve provenance and verify copied content before retiring exact cataloged source files.
  Do not delete shared targets, traverse links during cleanup, overwrite unrelated work or remove a parent with
  unrelated data. An ignored path is not permission to delete it. Unexpected links or live writers block the
  affected batch until safe; continue independent work and report any incomplete migration honestly.
- [ ] Never call `archive_worktree`, remove/prune a checkout, use task/UI archival to delete it, or substitute shell
  deletion/moves for prohibited worktree removal. Leave worktrees intact. Existing backups, unrelated duplicates
  and storage reclamation are outside scope. Necessary migration preserves content and is not blanket cleanup.

## Verification and acceptance

- [ ] Implement the audit's non-mutating policy validation in the established tooling structure, register it in
  `PROJECT_TOOLS.md`, and integrate with appropriate existing checks. Detect unclassified roots, nested ignore
  exceptions, index/policy contradictions, invalid project links and wrong shared owners. Inspect ignored/untracked
  content too; avoid traversing unknown links. Validate declared responsibilities and known producer destinations;
  report semantic classifications requiring inventory review rather than claiming extensions prove origin.
  Clearly distinguish incomplete coverage from a passing result.
- [ ] Test representative failure cases: an ignored descendant of a tracked root, a tracked/unignored exception
  inside an ignored root, an unknown root, and a nested or misdirected project junction. Also cover compliant local
  and shared roots. Cover a known output writer targeting an authored root and missing responsibility declarations.
  Use isolated fixtures without creating/removing real worktrees or touching live shared targets.
- [ ] Verify each batch's file preservation and updated consumer paths, then run affected checks through
  `node tools/run_selected_test/run.mjs` and relevant existing validation gates. Confirm fresh checkout/worktree
  setup expectations without prohibited checkout removal or automatic edits to other branches. Report checks
  requiring unavailable assets/tools rather than claiming they passed.
- [ ] Exercise representative test, authoring and bake entry points as appropriate, verifying output/config/cache
  placement and resource loading. Do not rebuild large datasets or republish assets solely to test path policy.
  Repeat the root-policy validation after workflows run to catch newly recreated mixed content.
- [ ] Every in-scope root is classified and uniform in responsibility and storage policy; every migration finding
  is resolved with verified outcomes. The final inventory distinguishes source, configuration, documents, authored
  assets, acquired inputs/dependencies and generated output subtypes, and records reproducibility honestly.
  No generated/private data has entered Git, no required data is lost, and no migrated consumer still depends on
  obsolete paths. Keep unresolved items visibly pending; do not mark the refactor complete with policy violations.
- [ ] Update the maintained audit and canonical root policy spec with final mappings, checks and remaining external
  limitations. Store generated receipts/evidence in the ignored evidence root selected by AI 660 and established
  in this migration, under an `ai661_root_folder_policy_refactoring/` topic. Until that destination is established,
  obey the current artifact rule and include those temporary evidence files in the verified relocation.

## On completion

- Mark this AI document as DONE in the first line only after the refactor and required verification are complete.
- Rename in `prompts/` to `AI_DONE_661_PROJECTMAINTENANCE_root_folder_policy_refactoring_DONE.md`.
- Do not move to `prompts/archive/` unless explicitly requested.
- Add a high-level one-line summary per completed change. Include the final root policy table or its link,
  migrated roots, verification results, backup locations, any external limitations and separate follow-up work.
  Do not claim other branches were migrated or prohibited worktree cleanup was performed.
