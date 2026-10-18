# Problem

After the existing project reorganization through AI 659, the repository still needs one uniform storage policy
per root folder. Looking at the root must reveal whether each folder's entire contents belong in Git, are ignored,
and are checkout-local or shared through a root junction. A tracked folder must not contain ignored descendants;
an ignored folder must not contain tracked exceptions. Nested junctions must not introduce another policy boundary.

# Request

Identify all remaining work required to enforce this invariant across the project, and deliver an actionable
refactoring plan for AI 661. Each root must also have one explicit content responsibility: what we author, what
we acquire as input, or what our workflows produce. This task is audit and planning only; do not perform the refactor.

## Root responsibilities and data flow

- [ ] Classify responsibility independently from Git policy and sharing. Use three primary origins: authored,
  acquired input, and generated output. Subdivide these into concrete responsibilities rather than making three
  catch-all folders. Multiple roots may share a category when they serve distinct domains or lifecycles. Each root
  gets one primary responsibility and an explicit allowed-content contract; subfolders must remain within it.
- [ ] Distinguish authored executable source (application code, scripts, tools and test code), authored declarative
  configuration (recipes, presets, schemas and catalog definitions), authored documents (specifications, rules and
  prompts), and manually authored assets (models, scenes, drawings and other irreplaceable creative work).
  Plan dedicated configuration roots separate from executable source; organize configuration by owner/domain
  rather than making one unstructured folder. Document format/tool constraints that require specific root files.
  Local/private configuration remains separate from tracked configuration because its storage policy differs.
  Implementation constants are code; file extensions alone do not distinguish code, configuration or output.
- [ ] Distinguish acquired raw inputs/references from installed third-party dependencies and externally supplied
  runtime assets. They all have external origin but different consumers, installation and retention contracts.
  Preserve provenance/licenses/checksums and identify which inputs cannot reliably be downloaded again. Inputs
  may come from the internet, another person, an external tool or another project, not only downloads.
- [ ] Distinguish generated compiled/bundled code, generated assets, intermediate working data/checkpoints/caches,
  and generated evidence/reports. Record whether outputs are candidates or validated/published runtime products.
  Do not create empty categories or hypothetical roots for compilation workflows that do not exist. A runtime
  package may bundle generated payloads and required generated metadata, but must not hide authoritative authored
  configuration or unique source inputs inside an output root.
- [ ] Map actual workflows as authored source + authored configuration + input -> generated output -> consumer.
  An output consumed by another stage remains generated in origin; record that dependency rather than duplicating
  it into an input folder. Imported files that are manually edited become authored derivatives; preserve original
  acquisition provenance and distinguish the untouched input from the authoritative edited source.
- [ ] Record reproducibility separately from origin: verified regenerable, conditionally regenerable, preserve-only,
  or unknown. Generated does not by itself mean disposable. For a regenerable item, identify retained inputs,
  configuration, producer command, toolchain/version requirements and a validation gate proving usable equivalent
  output (byte identity only when required by the consumer). Missing inputs, manual edits or unavailable tools
  prevent a claim of safe regeneration. Classification never authorizes deletion or bypasses backups.
- [ ] Inspect `blender_files/` specifically: identify generated scenes versus manual authoring, imported baselines,
  retained legacy scenes and mixed edited outputs. Do not label all `.blend` files regenerable merely because of
  their current directory. Plan root separation for different responsibilities where necessary, explicitly
  reconciling earlier Blender layout rules and preserving every authoritative/manual source.
- [ ] For each root, record primary origin/responsibility, domain owner, allowed/forbidden content, Git and sharing
  policy, authoritative inputs, producers, downstream consumers, reproducibility evidence and retention contract.
  Audit mixed responsibilities even when all contents share the same ignore policy. Identify infrastructure such
  as Git administration and tool-managed dependency stores explicitly; backups remain external protected recovery
  copies, never an ordinary generated-output category. Avoid a generic miscellaneous root.

## Prerequisites and scope

- [ ] Run after the existing reorganization sequence through AI 659 has delivered its applicable results. Read
  AI 652's current state and AI 653-659's completion handoffs and canonical specs/catalogs. Verify actual outcomes,
  not merely DONE filenames. Report outstanding prerequisite work before issuing an execution-ready plan.
  AI 659 is an audit, not evidence that its proposed changes have been implemented. Map its relevant unresolved
  findings into this plan; do not absorb unrelated algorithm or architecture redesign.
- [ ] Read `AGENTS.md`, `ai_rules/PROJECT_RULES.md`, `ai_rules/PROJECT_CODING_RULES.md`,
  `ai_rules/TESTING_RULES.md`, `ai_rules/AI_PROMPT_INSTRUCTIONS.md`, `PROJECT_TOOLS.md`, the worktree setup docs,
  and the current Blender, asset-configuration, bake-framework and storage-retention contracts.
- [ ] Record date, execution checkout/branch/revision, relevant local changes and inspection boundaries. Inspect
  this checkout and its identified shared stores. Do not merge, rebase, reopen DONE tasks, inspect deferred
  branch-only work or mutate other worktrees. Explicitly identify uninspected scope and unavailable evidence.

## Required policy

- [ ] Define each project-owned root directory as wholly Git-managed or wholly ignored, independently specifying
  whether it is checkout-local or shared. Git-managed means its project content is eligible for version control;
  newly authored untracked files are not automatically an ignore-policy violation. No ignored subtree/file is
  permitted within a Git-managed root, and no tracked or unignored exception is permitted within an ignored root.
- [ ] Shared data roots contain no tracked files. Main owns their real directories; other worktrees use root-level
  junctions to those directories. No nested junctions or symlinks may conceal mixed ownership/policies. Inventory
  existing links safely and distinguish package-manager internals from project-managed sharing; do not restructure
  dependency internals. Git administration (`.git`, whether directory or worktree pointer) is infrastructure, not
  project content to migrate, ignore or expose through a shared root.
- [ ] Include hidden project folders and individually classify root-level files, including local settings. Root
  files may have explicit individual policies because they are not descendants of a root directory. Distinguish
  physical link state from intended policy, and record both main-checkout and secondary-worktree behavior.
- [ ] Resolve mixed content by separating whole root ownership domains, preserving source, configuration, data and
  runtime behavior. Do not solve the problem by ignoring source, tracking generated/private data, introducing Git
  LFS, hiding exceptions in another ignore mechanism, or using compatibility links that recreate mixed hierarchies.

## Audit and migration plan

- [ ] Inventory every root entry and its current effective tracking/ignore/link policy, purpose, physical owner,
  producers, consumers and proposed policy. Inspect tracked, untracked and ignored content; a tracked-file listing
  alone is insufficient. Discover links before traversal and inspect physical targets once without following
  unknown links or crawling unrelated data. Preserve official backups and worktree checkouts.
- [ ] Examine root/nested `.gitignore` files, negations, broad extension/basename rules, `.git/info/exclude`,
  accessible global excludes and relevant attributes/LFS rules. Compare the Git index with effective ignore rules
  even for already tracked files. Record inaccessible sources rather than treating them as empty. Identify rules
  that could create future exceptions, such as global ZIP/cache patterns matching beneath tracked roots.
- [ ] Give every violation a stable ID and exact source-to-proposed-destination mapping (or an explicitly enumerated
  coherent group). Record affected readers/writers, reference changes, policy/rule conflicts, backup needs,
  migration order, collision handling, rollback and validation gates. Include concrete cases still present after
  earlier migrations: asset metadata exceptions, generated test artifacts under `tests/`, local test selection,
  machine-specific bake settings under `tools/`, Python caches and other tool-generated output in source trees.
- [ ] Plan how producers avoid recreating ignored files under tracked roots: test runners/reporters, Blender/Python,
  bake tools, dependency installation, local settings and temporary/cache writers. Preserve shared versus local
  behavior deliberately; moving a machine config must retain its single authoritative configuration contract.
- [ ] Reconcile prior location mandates with the new invariant. In particular, ignored screenshots/artifacts cannot
  remain under a tracked `tests/` root, and ignored machine settings cannot remain under tracked `tools/`. Propose
  explicit replacement locations and enumerate updates to rules, specs, tools, active prompts and documentation.
  Preserve completed checklist items and completed/archived prompt history. Existing path rules remain in effect
  until AI 661 updates the contract and consumers together; do not silently waive the new invariant.
- [ ] Specify a canonical root policy manifest/table readable from the repository root, with each root's purpose,
  content class, Git policy, sharing/link policy, owner and production paths. Propose a non-mutating validator that
  detects unknown roots, nested policy exceptions, tracked data in ignored/shared stores, and invalid project
  links. Keep authoritative configuration outside ignored/shared stores and avoid competing policy definitions.
- [ ] Define ordered migration batches with complete member coverage, handling of existing destinations and active
  writers, validation for fresh checkouts/worktrees, and meaningful regression checks for affected consumers.
  Distinguish already compliant, required, blocked and out-of-scope findings. Resolve decisions from evidence where
  possible; clearly identify genuinely unresolved decisions that prevent safe execution.

## Deliverables and acceptance

- [ ] Write the curated plan at `specs/maintenance/root_folder_policy_audit.md`, marked as a proposal until
  implemented. Include current/target root matrices, stable finding IDs, traceable migration mappings, exact
  conflicting authorities, ordered batches and AI 661 acceptance gates. Include the responsibility taxonomy,
  actual source/configuration/input/output chains and reproducibility classifications. Reuse earlier catalogs by reference.
- [ ] Every root entry is classified and every discovered mixed-policy case has a disposition. Coverage limitations
  and unresolved prerequisites are explicit. Do not describe an incomplete inspection as a complete audit.
- [ ] Only this prompt's completion notes and the curated audit/specification proposal change. No moves, cleanup,
  ignore/configuration/code changes, junction creation, tracking changes or bakes occur. If raw evidence is needed,
  use the currently authorized ignored `tests/artifacts/screens/ai660_root_folder_policy_audit/` location and include
  its eventual relocation in the plan; generated evidence does not belong in Git.

## On completion

- Mark this AI document as DONE in the first line after completing the audit and documented handoff.
- Rename in `prompts/` to `AI_DONE_660_PROJECTMAINTENANCE_root_folder_policy_audit_DONE.md`.
- Do not move to `prompts/archive/` unless explicitly requested.
- Add a high-level one-line summary per completed change, link the plan, and summarize required root separations,
  unresolved gates and the execution order for AI 661. Do not execute AI 661 automatically.
