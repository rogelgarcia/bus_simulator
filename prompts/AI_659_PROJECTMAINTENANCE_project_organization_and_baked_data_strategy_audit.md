# Problem

The project's organization rules were established before many current source types and offline workflows existed.
The repository now includes shadow compilation, sky occlusion and illumination bakes, visibility data, material
preprocessing, landscape packages and other generated products. We need a coherent account of where their
algorithms, authored configuration, inputs, intermediate files and installed game data belong, and what else in
the project's organization needs to change. Generated binary bake products must remain outside Git and Git LFS.

AIs 653-656 already cover Blender organization and separation of shared assets from tracked asset configuration.
AIs 657-658 cover storage auditing, safe cleanup and misplaced backups. This review must identify the remaining
organization gaps and connect those efforts, rather than duplicate their migrations or assume they are complete.

# Request

Review the whole project's organization and propose a concrete, evidence-based strategy for its source and data
categories, with particular attention to offline baking. Deliver an organization audit and prioritized follow-up
plan. This AI is review and documentation only: do not migrate files, edit implementation or live rules, run bakes,
change Git tracking, delete data, publish assets, create junctions or execute the proposed reorganization.

## Scope and existing authority

- [ ] Read `AGENTS.md`, `ai_rules/PROJECT_RULES.md`, `ai_rules/PROJECT_CODING_RULES.md`,
  `ai_rules/TESTING_RULES.md`, `PROJECT_TOOLS.md`, `tools/baking/README.md`, `specs/tools/bake_framework.md`,
  `specs/tools/blender_authoring_layout.md`, relevant domain specifications and the available AI 652-658 results.
  Separate implemented contracts, pending decisions and historical rules. Record exact conflicting authorities.
- [ ] Review the actual execution checkout, including tracked sources and relevant ignored/local data locations.
  Record branch/commit, significant local changes, date and inspection limits. This read-only review may precede
  planned migrations; flag findings that need refreshing afterward. Do not start/reopen other AIs or perform their
  branch synchronization. Rebasing does not integrate branch-only work; identify unmerged/uninspected scope rather
  than claiming complete coverage of other branches. Use AI 657's storage findings when available.
- [ ] Discover existing roots/junctions before traversing shared data and inspect each physical target once.
  Do not crawl unrelated user or Codex data, modify backups or remove worktrees. No expensive regeneration is
  necessary to establish the organization proposal; record missing evidence and required later validation.

## Project-wide organization review

- [ ] Map existing file families and ownership: application/domain code, rendering/runtime adapters, shaders,
  offline algorithms and launchers, Blender authoring, authored recipes/configuration/schemas, installed game
  assets, non-game source inputs, generated packages/caches, tests/fixtures/baselines, developer tools/experiments,
  documentation/specifications and downloaded dependencies. Include any other category actually discovered,
  including training/model data if present; do not invent new top-level folders for hypothetical future systems.
- [ ] Identify unclear placement, duplicated responsibilities, domain code inside shared orchestration, runtime
  imports of offline-only code, tools hidden in runtime/tests, generated data treated as source, scattered config,
  overlapping path resolvers, obsolete compatibility layers and documentation that no longer matches consumers.
  Each finding needs concrete paths, references and an explanation of the maintenance or correctness impact.
- [ ] Give each category a recommended owner, authoritative source, directory convention, Git policy, shared versus
  checkout-local policy and lifecycle. Prefer established suitable locations; propose a new root only for a
  demonstrated gap. Distinguish necessary corrections from optional tidying, and do not prescribe a wholesale
  rewrite of working modules solely for naming consistency.

## Bake algorithms and configuration

- [ ] Inventory the real bake entry points and producer-consumer chains, starting with `node tools/bake.mjs`,
  `tools/baking/registry.mjs`, the `tools/bake_*` domains and their underlying compilers. Explicitly cover compiled
  static shadow/depth data, offline sky occlusion, direct/indirect receiver lighting, visibility, material maps,
  vegetation and landscape processing where present. Keep runtime SSAO/GTAO/contact shadows and material-map AO
  distinct from the offline sky-occlusion pass; similar names do not imply the same algorithm or data product.
- [ ] Preserve the existing framework ownership: `tools/baking/` owns scheduling/configuration/process lifecycle,
  validation/checkpoint/publication primitives; registered domains own algorithms and adapters. Recommend exact
  homes for domain algorithms and shared modules, with Blender-specific authoring under `blender/scripts/` per
  AIs 653-654 and runtime loaders under their existing runtime layer. Do not propose a second master bake framework,
  machine-specific launcher or duplicated algorithm solely to fit a new folder scheme.
- [ ] Distinguish tracked algorithm source, tracked tool recipes/defaults, Blender scene/build recipes, authored
  game asset configuration, generated metadata and ignored machine settings. Respect AI 655/656's selected
  asset-configuration root rather than placing every JSON/JS file there. Reuse `tools/baking/blender.local.json`
  and the established configuration contract; do not scatter executable paths or introduce secrets into Git.
- [ ] Record the registrations, imports, source inventories, checkpoint identities, scripts, tests and docs that
  a proposed relocation would affect. Preserve authentication of algorithm/toolchain/input changes, existing
  validation and release gates, runtime formats and fallback behavior. Organizational changes must not redefine
  rendering algorithms, weaken certification or silently certify old outputs as current.

## Generated data strategy

- [ ] Classify every discovered bake product by role: source export/snapshot, authoring scene, raw pass, temporary
  intermediate, restart checkpoint, validated candidate, installed runtime package, required diagnostic evidence,
  or recovery/backup. Distinguish data the game loads from output used only during authoring or validation. Neither
  a `tests/artifacts/` path nor the fact that something is generated establishes that it is disposable.
- [ ] Recommend explicit destinations and naming/identity conventions for each role and domain, including city,
  scene, variant/profile and package version where applicable. Preserve the agreed Blender stores and installed
  game-asset separation. Keep rendered evidence in `tests/artifacts/screens/`; determine a durable home for
  operational non-Blender bake inputs/intermediates instead of using prompt-specific evidence folders as permanent
  authority. Do not invent a new shared junction unless the existing roots cannot meet a documented requirement.
  Any proposed shared store must be ignored, contain no tracked files and follow the root-only junction convention
  with real storage in main. Tracked source/configuration remains outside all shared junctions.
- [ ] Define the boundary between working/staged data and published data. Include writer ownership, isolated
  branch experiments, shared-store collisions, validated promotion, atomic activation/index updates where already
  required, rollback, interrupted runs and incomplete outputs. A successfully written candidate is not necessarily
  a validated or released asset. Preserve domain-specific restrictions on shadow certification and publication.
- [ ] Make generated binary payloads ignored and untracked, including compiled maps, compressed textures, raw
  numeric arrays and packaged bake data. No Git LFS or embedding generated blobs in source files to bypass this
  policy. Classify generated JSON/manifests/receipts by ownership and lifecycle rather than extension: package-bound
  metadata may stay with ignored payloads, while authored schemas/recipes/catalog definitions remain tracked.
  Identify any tracked-output or attribute/ignore exceptions requiring a later migration; do not untrack them here.
- [ ] Define reproducibility and acquisition for a fresh checkout/worktree: what source inputs and compatible
  toolchain are required, which data can be rebuilt, which must be retained or separately installed, and how its
  provenance/checksums/version compatibility are verified. Describe any required external artifact distribution
  as a proposal with explicit dependencies, not an assumed service or an upload to perform during this review.
- [ ] Define expected behavior for missing, incomplete, stale or incompatible packages and preserve existing
  runtime fallback contracts. Runtime loading must not rely on another worktree, a user's Downloads folder or
  an undocumented test-artifact path. Identify current exceptions and their consumer dependencies precisely.
- [ ] Propose retention/invalidation rules distinguishing reconstructible caches, reusable expensive raw bakes,
  reference evidence, unique authoring inputs and immutable external backups. Link cleanup implications to AI 657's
  catalog and AI 658's gates; do not authorize deletion or infer reproducibility from a generator filename alone.

## Deliverables and handoff

- [ ] Write the curated review at `specs/maintenance/project_organization_audit.md`, clearly marked as a proposal
  awaiting implementation. Include a current-versus-recommended layout/ownership matrix, concrete representative
  bake chains, the generated-data lifecycle, identified rule/spec conflicts and a prioritized follow-up backlog.
- [ ] Give findings stable IDs and actionable current-to-proposed mappings, with affected consumers/producers,
  dependencies, data-preservation requirements and acceptance criteria. Classify each as already correct, owned
  by AI 653-658, additional required organization work, optional improvement or unresolved pending evidence.
  Link existing catalogs instead of maintaining a competing copy of their migration inventory.
- [ ] Explicitly map ownership: AI 653/654 handles Blender source/data migration; AI 655/656 handles asset metadata
  separation; AI 657/658 handles storage classification/eligible cleanup. This AI owns the remaining organization
  review and bake-data strategy. Flag proposed changes to their contracts for reconciliation rather than silently
  overriding them. Any new implementation scope belongs in a separately requested future task.
- [ ] Audit beyond the examples supplied by the user and summarize what else needs reorganization, with evidence
  and priority. Recommend an execution order that avoids moving the same source/data twice and names migration
  gates that must precede cleanup. Record open decisions and coverage limitations without claiming uninspected
  branches are organized or generated data has been moved.
- [ ] Keep raw scans and generated evidence gitignored under
  `tests/artifacts/screens/ai659_project_organization_audit/`. Only this prompt's completion notes and the curated
  review document are deliverables; do not change live rules, code, storage, tracking or any other AI's checklist.

## On completion

- Mark this AI document as DONE in the first line.
- Rename it in `prompts/` to
  `AI_DONE_659_PROJECTMAINTENANCE_project_organization_and_baked_data_strategy_audit_DONE.md`.
- Do not move it to `prompts/archive/` unless explicitly requested.
- Add a high-level one-line summary per completed change and link the review. Summarize the recommended algorithm
  and generated-data locations, non-Git binary strategy, additional organization gaps and proposed follow-up order.
- No implementation, migration, cleanup, branch operation, binary publication or automatic creation/execution of
  follow-up AI prompts occurs in this task.
