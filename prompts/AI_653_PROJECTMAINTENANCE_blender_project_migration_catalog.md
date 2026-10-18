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

AI 652 (`AI_i_652_PROJECTMAINTENANCE_blender_files_and_scripts_layout.md`) establishes the new Blender layout for
City, Bradbury and TerraMar. The user's decision on 2026-10-17 makes that architecture the rule for the entire
project, superseding older folder-placement rules. Other Blender workflows, their files, generators and consumers
still need to be identified before the rest of the project can migrate safely.

The Graphics branch contains additional Blender work planned for a later merge. Any still-unmerged work remains
deferred at execution time; this task must not inspect, modify, migrate or merge that branch's separate worktree.
Already integrated graphics code in the execution checkout is in scope. Verify AI 652's current state rather than
treating its checklist alone as evidence of what exists or has passed validation.

# Request

Create a complete, evidence-based migration catalog for the current checkout. This is an inventory and planning
task: write the catalog without relocating files, changing scripts/rules, relinking scenes, rebuilding outputs or
altering junctions. AI 654 will update the specification/rules and migrate the cataloged items.

## Architecture to catalog against

- Tracked Blender authoring scripts, helpers, templates and script-owned configuration belong under
  `blender/scripts/`, organized by domain; `blender/README.md` explains the layout. `blender/` has no junctions.
- Blender scenes, libraries, building parts, imported Blender baselines, retained legacy scenes and derived caches
  belong under gitignored `blender_files/`. Non-game source inputs belong under gitignored `blender_inputs/`.
- Existing backup/recovery files are inventoried and preserved, not treated as disposable output or permission to
  create backups in these stores. Every new backup belongs only in the project's external dated backup root.
- Blender-owned scene/build recipes belong with their scripts. Game asset catalog/material/landscape
  configuration belongs to the AI 655/656 separation, even when a Blender script produces or consumes it.
  Catalog those cross-task dependencies; do not propose a second copy under `blender/scripts/`.
- Main owns the real root directories. Other worktrees use root-level junctions pointing to those directories.
  Neither Blender data store may contain tracked files. Preserve the project's worktree-cleanup prohibition.
- Game-shipped assets remain in the installed game asset stores. Renders and validation evidence belong under
  `tests/artifacts/screens/`. The Blender layout is not a reason to relocate runtime assets or unrelated test output.
- Preserve the bake framework: `node tools/bake.mjs`, its registered domain/leaf jobs, shared
  `tools/baking/blender.local.json`, validation and publication gates. Catalog the distinction between Blender
  authoring implementation and generic orchestration, browser exporters, tests or runtime consumers that retain
  their existing architectural homes while their references change.
- Start with `specs/tools/blender_authoring_layout.md`, `blender/README.md`, AI 652, `AGENTS.md`,
  `ai_rules/PROJECT_RULES.md`, `ai_rules/PROJECT_CODING_RULES.md`, `ai_rules/TESTING_RULES.md`,
  `tools/baking/README.md`, `specs/tools/bake_framework.md`, `tools/worktree_setup/README.md` and `PROJECT_TOOLS.md`.
  Record which requirements are already documented and where older instructions still conflict.

## Catalog requirements

- [ ] Record the checkout, branch, commit, inspection date, relevant uncommitted changes and search boundaries.
  Inspect tracked, untracked and ignored project data; a Git-only file listing is insufficient. Discover junctions
  before traversing them, inspect relevant shared targets once, and record unresolved/inaccessible locations.
  Do not crawl unrelated worktrees, external backups, dependencies or the Graphics branch.
- [ ] Find every in-scope `.blend` and Blender backup variant, associated cache/input set, and every script or
  embedded script/template that creates, opens, links, exports, renders or otherwise consumes these files. Include
  reusable modules, JSON/configuration, launchers, path resolvers, bake registrations, manifests and tests.
  Explicitly identify files with no known generator and workflows that cannot yet regenerate their saved scenes.
- [ ] Inspect the entire checkout, including already migrated `blender/scripts/`, former authoring locations,
  `tests/artifacts/blender/`, other ignored artifact locations, and relevant source/download stores. Known discovery
  leads include `tools/bake_vegetation/`, `tools/bake_lighting/`, `tools/illumination_bake_compiler/`,
  `tools/receiver_lightmaps/`, `tools/static_sun_depth/`, `tools/grass_material_baker/`, `tools/ornaments/` and
  `tools/baking/`. These are starting points, not an exhaustive inventory or automatic instructions to move whole tools.
- [ ] Produce a hand-maintained, tracked catalog at `specs/tools/blender_migration_catalog.md`. Give each item or
  explicitly enumerated coherent group a stable ID. Record its current paths, role/domain, tracked/ignored status,
  shared physical owner, proposed destination, producing command/script, consumers, linked libraries/images,
  input/provenance dependencies, regeneration gaps, migration action, verification gate and dependency order.
  Distinguish observations from proposals and unknowns. Include collision/duplicate candidates without assuming
  they are interchangeable; historical/manual edits and missing inputs must be preserved. Distinguish workflows
  with working generators from manual/preserve-only assets and pre-existing regeneration gaps, with an appropriate
  acceptance gate for each. Assign stable IDs to asset-configuration consumers for the AI 655/656 handoff too.
- [ ] Assign a disposition to every discovered item: migrate, already compliant, preserve as historical material,
  outside the Blender migration with a reason, blocked by a named dependency, or deferred until the Graphics merge.
  Grouped rows must retain a complete member list; broad folder names alone are not a migration catalog. Separate
  existing AI 652 responsibilities and incomplete gates from the remaining-project migration owned by AI 654.
- [ ] Catalog reference and documentation changes as well as moves: imports, relative/absolute paths, Blender
  library/image links, generated metadata, hash/cache identities, CLI defaults, source inventories, help text,
  README examples, project rules, specifications and active prompts. Identify the exact documents and conflicting
  instructions that AI 654 must reconcile. Completed/archived prompts remain historical evidence, not live policy.
- [ ] Order migration batches so producers, consumers and dependency chains remain coherent. Identify backup
  coverage, active-writer constraints, required source preservation, and meaningful structural/render or bake
  validation per batch. Record unavailable evidence instead of claiming Blender-dependent checks were performed.
- [ ] Record whether Graphics-only work is still unmerged at execution time. If so, mark it deferred/uninspected;
  already integrated content receives ordinary catalog coverage. A later authorized follow-up must repeat discovery
  against the merged checkout and append new items before migration. Do not invent the uninspected file list or
  automatically restart AI 653/654 after they are DONE.

## Deliverables and acceptance

- The catalog is a durable migration specification, with traceable current-to-target mappings and an ordered
  handoff to AI 654. Raw listings, hashes, generated reports and any evidence remain gitignored under
  `tests/artifacts/screens/ai653_blender_migration_catalog/`; reference them from the curated catalog as needed.
- Every discovered workflow has a disposition and all search limitations are explicit. Recheck relevant changing
  paths before finalizing so concurrent AI 652 work is not mistaken for missing or unmigrated content.
- Only this prompt's completion notes and the catalog/documentation necessary to deliver the inventory change.
  No migration, Blender launch, rebuild, asset publication, branch operation or existing-data mutation occurs.

## On completion

- Mark this AI document as DONE in the first line.
- Rename it in `prompts/` to `AI_DONE_653_PROJECTMAINTENANCE_blender_project_migration_catalog_DONE.md`.
- Do not move it to `prompts/archive/` unless explicitly requested.
- Add a high-level one-line summary per completed change, link the catalog and identify the scope, unresolved
  dependencies and deferred Graphics follow-up. Preserve AI 652 and its completed checklist history.
