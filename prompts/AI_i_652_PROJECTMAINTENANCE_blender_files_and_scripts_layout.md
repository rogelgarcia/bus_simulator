# Problem

The user, 2026-10-17, after AI 651 (the reusable city and the two hero compositions): "we need to define folders for
.blend files outside the tests/ folder. we also need the blender scripts in their folders. the scripts can regenerate
both buildings fully? the blender files will be gitignored. the scripts will be in git. how should we reorganize the
project? the blender files organization is good. we can save that for now in an AI file (keep it open because we will
add more organization)".

Today the generated .blend files live under `tests/artifacts/blender/` (about 2.4 GB: bradbury 1.1 GB, terramar_recessed
1.3 GB, city 46 MB), mixed with screenshots and test output. The scripts live in the game's source tree under
`src/graphics/content3d/buildings/authoring/` (`BradburyBlock/`, `terramar_recessed/`, `city/`). Their folder names do not
match the data folders, and neither hero has one entry file for "the building".

Interactive file: conversation mode. Nothing is implemented until the user says `implement`, and the work is done
phase by phase (see Requirements), not all at once.

# Agreed: the Blender file organization (2026-10-17)

Pattern: `<hero>_<role>[_<part>].blend`, one folder shape per hero.

| Role | Name | Purpose |
| --- | --- | --- |
| Building entry | `<hero>_building.blend` | the one file a composition links for the building |
| Building parts | `parts/<hero>_part_<name>.blend` | what the entry is built from or links |
| Composition | `<hero>_city_composition.blend` | city + building + block finish |
| City | `city/city.blend`, `city_site.json`, `city_context_library.blend` | shared by every hero |
| Retired | `legacy/...` | old scenes, kept until the user deletes them |

```
blender_files/                          (repo root, gitignored)
  city/
    city.blend
    city_site.json                      (was site.json)
    city_context_library.blend          (was context_library.blend)
  bradbury/
    bradbury_building.blend             (was portal_project/wear/bradbury_block_worn.blend)
    bradbury_city_composition.blend
    parts/
      bradbury_part_block.blend         (was bradbury_block.blend, the unworn block)
      bradbury_part_portal.blend
      bradbury_part_portal_worn.blend
      bradbury_part_wear_nodes.blend
      bradbury_part_ornament_capital.blend
      bradbury_part_ornament_arch_leaf.blend
    legacy/   bradbury_scene*.blend, *_backup / *_before / *_gui_* files
  terramar/
    terramar_building.blend             (NEW: an entry file linking the five parts)
    terramar_city_composition.blend
    parts/
      terramar_part_shell.blend         (was terramar_building.blend)
      terramar_part_props.blend
      terramar_part_interiors.blend
      terramar_part_wear.blend
      terramar_part_site.blend
    legacy/   terramar_city_scene.blend
```

Inside the files:

- Each entry file has one top collection, `BRADBURY_BUILDING` or `TERRAMAR_BUILDING`.
- The parts keep their own collections.
- The wear-only collections keep their namespaced names.

# Findings: can the scripts regenerate both buildings fully? (2026-10-17)

Not fully. Every part, the city and both compositions are written by scripts. The gaps are inputs that no script
produces.

**Bradbury.** The chain:

1. `ornaments/capital.py`
2. `ornaments/arch_leaf.py`
3. `rebuild_portal.py -- 01..08`
4. `assemble_building.py`
5. `wear_layer.py`
6. `build_context.py`
7. `city/build_city.py`
8. `build_composition.py`

Gaps:

- `assemble_building.py` opens `before/bradbury_block_before.blend`. The Playwright spec
  (`bradbury_blender_export.pwtest.js`) writes only the .glb and .json. The .blend came from a manual glTF import, after
  which `link_game_textures.py` was run in place. No import script exists; Terra & Mar has one (`import_baseline.py`).
- Hardcoded absolute paths into this worktree:
  - every `pieces/*.py`, `ornaments/capital.py` and `ornaments/arch_leaf.py`: `LIB=`, `OUT=` and the save targets;
  - `portal_lib.py:716` (`ORNAMENTS_DIR`).
- The Bradbury PBR sets come from zips in `downloads/` (`make_*_pbr.py`). Those zips are gitignored and produced by no
  script.
- `ornaments/arch_leaf_user_edit.json` records the user's vertex edits. No script reads it, and whether `arch_leaf.py`
  already contains those edits is unverified.
- Capital stage 2 needs the system Python with numpy and PIL.

**Terra & Mar.** The chain:

1. `make_terramar_kit_pbr.py`
2. `rebuild/trace_sign.py`
3. `rebuild/decode_vegetation_glb.mjs`
4. Playwright export (`EXPORT_TAG=before`)
5. `import_baseline.py`
6. `rebuild/build.py target=all`
7. `city/build_city.py`
8. `build_composition.py`

Gaps:

- The kit zip is read from `~/Downloads/Terra_Mar_PBR_Kit.zip`, checked by md5. It is outside the repo.
- `trace_sign.py` reads `pbr_kit_source/Terra_Mar_PBR_Kit/<kit>/opacity.png`, a folder that was unzipped by hand.
- The baseline `before/terramar_recessed_before.blend` is script-made, but a `.blend1` beside it shows it was re-saved
  at least once.
- The wear part links `terramar_building.blend` from disk, so the building part must be built first.

**City.** `build_city.py` copies the Bradbury `context_library.blend` on its first run only, so the copy can go stale.

**Not in git anywhere:**

- `assets/public/{pbr maps, lighting, vegetation_lod0}`, `assets/trees`, `assets/props/street_lamp_01`
- `downloads/tools/ktx-4.4.2`
- `tools/baking/blender.local.json` (the Blender path)

`assets/`, `downloads/` and `docs/` are junctions into the main checkout.

# Agreed: repository layout (2026-10-17, second round)

The user: "use `blender/scripts/` for the sources. add a readme in the `blender/` folder. `blender_files/` for the .blend
file organization. use the `blender/inputs/` for things that are not in the game. keep the paths.py".

```
blender/                          repo root; only scripts/ and README.md are tracked
  README.md                       the layout, the rebuild order per hero, the inputs and their provenance
  scripts/                        tracked: every Blender authoring script, by area
    common/                       paths.py (the only place the roots are defined), runner, shared helpers
    city/                         build_city.py, city_site.py, city_neighbours.py, block_kit.py, city_compose.py,
                                  front_line.py, parity_*.py, weather_*.py, the context-library builder
    bradbury/
      building/                   assemble_building.py, portal_lib.py, pieces/, ornaments/, wear/, wear_layer.py,
                                  the baseline export + import
      composition/                build_composition.py
      render/                     render_composition*.py, the flyover
    terramar/
      building/                   today's rebuild/ and the baseline import
      composition/                build_composition.py, composition_wear.py
      render/                     render_city_shots.py, render_flyover.py
blender_files/                    repo root junction (shared), gitignored: the agreed .blend organization above
blender_inputs/                   repo root junction (shared), gitignored: things that are NOT in the game -- a hero's
                                  baseline export (glb, json, the source snapshot), traced data, references -- each
                                  with a source.json (origin, license, date, md5, the command or commit that made it)
```

Third round (user, 2026-10-17): "the problem with junctions is when the junction has git files. if we keep the git
files outside of junctions it seems to be ok ... i want any junction to be in the root ... blender input can also be a
junction". So `blender/inputs/` became the root junction `blender_inputs/`, and `blender/` holds only tracked files.

Junction rules (both new junctions, and the rule for any future one):
- A junction stands only at the repo root: never nested inside a tracked folder.
- A junction never contains git-tracked files; tracked files stay outside every junction.
- The real folder lives in the main checkout (`C:\Users\rogel\Projects\bus_simulator\<name>`); every other worktree
  has a junction to it.

- A script at `blender/scripts/<x>/` writes only into `blender_files/<x>/` and reads only `blender_files/`,
  `blender_inputs/` and the game's own assets (the PBR catalog, vegetation, lighting).
- `blender/scripts/common/paths.py` defines the roots, resolved from the repo root (through the junction in a
  worktree). No script hardcodes a path.
- Anything a building uses that the game ships (a PBR set, a vegetation model, an HDRI) is read from the game's
  installed assets, never from a kit or a download.

# Where this AI runs (user, 2026-10-17)

It is executed in the MAIN checkout (`C:\Users\rogel\Projects\bus_simulator`), on the `main` branch. It was written on
the `buildings` branch and cherry-picked to main with the backup rule.

Prerequisites, checked before Phase 1 (stop and ask the user if one fails):
- The `buildings` branch is merged into main. On 2026-10-17 main was 12 commits behind it (the Terra & Mar rebuild,
  its city and neighbours), and the AI 651 work (`authoring/city/`, both `build_composition.py`, the composition
  render scripts, the moved `city_neighbours.py`) was still uncommitted in the buildings worktree. Without them there
  is nothing to move into `blender/scripts/`.
- The .blend files to reorganize are NOT in main's checkout. On 2026-10-17 they lived only in the buildings worktree:
  `C:\Users\rogel\Projects\bus_simulator_worktrees\buildings\tests\artifacts\blender\` (`bradbury/`, `terramar_recessed/`,
  `city/`; about 2.4 GB). The move reads them from there into main's `blender_files/`.
- No other session is building or rendering from those files while they move (check running Blender processes).

# Backups (user, 2026-10-17)

Every backup goes under `C:\Users\rogel\Projects\bus_simulator_backups\<YYYY-MM-DD>_<topic>\` with a `MANIFEST.md`
(`ai_rules/PROJECT_RULES.md` → "Backups", added with this AI). The AI 651 backup
`2026-10-17_city_reuse` already exists there: never modify it.

- [x] Before Phase 1 moves or renames anything: back up every .blend, json, mask, cache and input it will touch (the
  buildings worktree's `tests/artifacts/blender/` as a whole, and the scripts' untracked files) into
  `bus_simulator_backups\<date>_blender_layout\`, with its MANIFEST.md.
- [x] Before each later phase that rebuilds, relinks or replaces files in `blender_files/` or `blender_inputs/`, or
  installs or changes PBR sets in `assets/public/pbr/`: back up what it touches into its own dated folder.
- [x] Each phase's completion notes name its backup folder.

# Requirements, by phase

Each phase is implemented on its own `implement`. The order can change.

## Phase 0 -- backup and verification

Added and authorized by the user on 2026-10-17 as a separate implementation pass before Phase 1.

- [x] Copy the buildings worktree's entire `tests/artifacts/blender/` directory and both checkouts' complete
  `src/graphics/content3d/buildings/authoring/` directories, including tracked, untracked and ignored files, into
  a new `bus_simulator_backups/2026-10-17_blender_layout/` backup. Preserve the original main-checkout AI 652,
  `AGENTS.md`, `ai_rules/PROJECT_RULES.md` and `.gitignore` there before updating this prompt.
- [x] Verify every copied file's size and SHA-256 against the source, then recheck the source inventory, sizes,
  last-write timestamps and hashes. Include `MANIFEST.md` with source mappings, totals and restore instructions,
  and `inventory.sha256.json` with the per-file hashes. Never modify or delete the completed backup.
- [x] Record the backup result and return to conversation mode without implementing Phase 1.

Completion, 2026-10-17:

- Backup: `C:\Users\rogel\Projects\bus_simulator_backups\2026-10-17_blender_layout\`.
- Verified 1,656 payload files across 231 directories, totaling 2,585,055,664 bytes (2.408 GiB), excluding the
  manifest and hash inventory. All copies matched; the source inventory and contents stayed unchanged during
  verification. No source junctions were traversed.
- The Blender artifact directory contributed 1,077 files; the buildings authoring snapshot 376 files; main's
  authoring snapshot 199 files; and the original prompt/rules/ignore snapshots four files.
- Source commit on main: `c27125cc9cc5ebc67f4c2d715bba2a021cfef015`. Main and buildings pointed to the same commit.
- Blender processes 16640 and 24428 were observed; neither was attached to or changed. This backup covers saved
  files on disk, not unsaved session state. Phase 1's no-active-writer prerequisite is still pending.
- Only this prompt was edited after the backup. The grass-debugger changes, shared assets, existing backups and
  original Blender/authoring files were left untouched. No move, relink, rebuild or commit was performed.
- Conversation mode resumed. Before Phase 1, recheck all prerequisites and source freshness against this inventory.
  Any changed or additional data that Phase 1 will touch requires a new dated backup; never update this one.

## Phase 1 -- the layout, the paths and the provenance rule

- [x] Decided (user, 2026-10-17): only `blender/` is tracked (`blender/scripts/`, `blender/README.md`), and it holds
  no junction. `blender_files/` and `blender_inputs/` are root junctions, gitignored.
- [x] Decided (user, 2026-10-17): `blender_files/` and `blender_inputs/` are SHARED. Their real folders live in the
  main checkout (`C:\Users\rogel\Projects\bus_simulator\blender_files`, `...\blender_inputs`), and every other worktree
  has a root junction to each, as `assets/`, `downloads/` and `docs/` do. Their safety rules:
  - Add it to the shared-junction list in `ai_rules/PROJECT_RULES.md` ("Worktree cleanup safety") and to the worktree
    setup. AGENTS.md's ban on worktree archival covers it.
  - One writer per file: two sessions never rebuild the same .blend at the same time.
  - A worktree whose scripts differ from main's writes into the same shared files, so a branch rebuild is visible to
    every worktree. Builds that must not reach main's files write to a scratch `out=` path.
- [x] Record the junction rules in `ai_rules/PROJECT_RULES.md` ("Worktree cleanup safety") and `AGENTS.md`: root only,
  no tracked files inside, real folder in main.
- [x] Decided (user, 2026-10-17): the hero ids are `bradbury` and `terramar` (folders and file prefixes). The link from
  a game config to its scripts (`configs/BradburyBlock.js` -> `bradbury`, `terramar_recessed` -> `terramar`) is an id
  table in `blender/README.md`.
- [x] Create `blender/README.md` and `blender/scripts/` (tracked), and `blender_files/` and `blender_inputs/` (real
  folders in main, root junctions in this worktree), plus the `.gitignore` rules: `/blender_files/` and
  `/blender_inputs/` ignored.
- [x] `blender/scripts/common/paths.py`. Replace every `tests/artifacts/blender` constant and
  every hardcoded absolute path: the Bradbury `pieces/*.py` (`LIB=`, `OUT=`, the save targets), `ornaments/capital.py`,
  `ornaments/arch_leaf.py` and `portal_lib.ORNAMENTS_DIR`.
- [x] Move the scripts from `src/graphics/content3d/buildings/authoring/` into `blender/scripts/` with `git mv`
  (history kept), and fix the imports and sys.path setup. Render evidence stays under `tests/artifacts/screens/`.
- [x] Move the .blend files into `blender_files/` with the agreed names. Relink the libraries inside them, or rebuild
  them from the scripts, and regenerate the Bradbury wear manifest (it stores source paths and hashes).
- [x] Add `terramar_building.blend` (the entry file) and rename the Terra & Mar shell part to `terramar_part_shell`.
- [x] Provenance rule, in `AGENTS.md`, `ai_rules/PROJECT_RULES.md` and `blender/README.md`: any downloaded source
  (a texture kit, a model, an HDRI, a photo) must record its origin and its license whenever possible (URL or source,
  author, license, date, md5), in a `source.json` beside it. This extends the existing CC0 `source.json` practice to
  every download.
- [x] Update `AGENTS.md` and `ai_rules/PROJECT_RULES.md`: .blend files go in `blender_files/`, scripts in
  `blender/scripts/`, non-game inputs in `blender_inputs/`, never under `tests/artifacts/blender/` again.
- [x] Gate: both compositions open from `blender_files/` and pass the AI 651 parity renders against the files before
  the move.

First implementation pass, 2026-10-17 -- stopped with Phase 1 incomplete; conversation mode resumed:

- The user authorized the next step after Phase 0, then confirmed that the open Blender session was busy with
  unrelated work. It was not attached to, modified or stopped. Main and buildings both pointed to
  `c27125cc9cc5ebc67f4c2d715bba2a021cfef015`; the source inventory matched the backup apart from this prompt's
  Phase 0 notes. Isolated, single-thread headless processes only opened/saved the new copies and checked geometry;
  no GPU render was started. The user must free Blender/GPU resources before the parity gate can run.
- Backups, all immutable under `C:\Users\rogel\Projects\bus_simulator_backups\`, each with `MANIFEST.md`:
  - `2026-10-17_blender_layout/` -- the completed Phase 0 backup above.
  - `2026-10-17_blender_layout_phase1/` -- 1,661 verified payload files, 2,585,115,741 bytes; original artifacts,
    scripts, prompt/rules, export specs, tool registry and local Blender configuration before this phase.
  - `2026-10-17_blender_layout_phase1_worktree_setup/` -- original shared Git `info/exclude` before adding the
    root ignore patterns for branches that do not yet have the updated `.gitignore`.
  - `2026-10-17_blender_layout_phase1_autosave/` -- verified copy of Blender's automatic 354,225-byte pre-save
    Terra & Mar composition snapshot. The composition save now disables automatic `.blend1` creation. The snapshot
    beside the composition is also retained unchanged; no backup was deleted or overwritten.
- Moved 199 tracked authoring files with `git mv`; fixed roots/imports and export targets; added shared paths,
  collection grouping, an existing-script launcher, `blender/README.md` and the canonical layout spec. The new
  real folders belong to main; fourteen root junctions in seven other registered worktrees point to them. The
  setup tool creates only missing links and refuses conflicting paths or tracked contents.
- Copied all 1,077 source artifact files into the agreed destinations. Relinked 18 active `.blend` files and eight
  retained legacy entry files using relative library/image paths. Created Terra & Mar's five-part building entry
  and rebuilt its city composition through that entry. Both building entries have their single named root.
- Rewrote Bradbury's manifest paths/hashes, preserving the pre-existing stale unworn-block warning in
  `stale_before_layout`. The original unworn block already differed from its recorded manifest hash; this phase
  does not rebuild wear or claim that warning is resolved.
- Validation: 190 Python modules parsed, five JavaScript modules passed syntax checks, all literal script targets
  exist, moved cross-directory imports resolve, and the Bradbury stale check reports exactly the preserved source.
  All 26 inspected blends reopen without missing images/libraries or dependencies on the original artifact tree.
  Existing object geometry, transforms and material assignments match. Terra & Mar adds 17 rig/site objects only
  to its excluded source collection; visible view-layer objects and scene controls match the original composition.
  Junction setup dry-run and Git whitespace checks passed.
- Final SHA-256/size/timestamp verification confirmed all 1,453 original files in the buildings artifact/authoring
  trees unchanged. All destination files exist; 1,050 remain byte-identical, with only the 26 relinked blends and
  the wear manifest intentionally changed. Evidence and per-file receipts live in
  `tests/artifacts/screens/ai_652_blender_layout/` (`source-validation.json`, `blend-validation.json`,
  `preservation-validation.json`, `migration-plan.json`, `relink-receipt.json`).
- Remaining Phase 1 work: run the six AI 651 before/after OptiX views and comparison gate, then finish the source
  relocation. Original files are still in the buildings worktree. Other historical snapshots in `legacy/` are
  byte-preserved copies, not validated relinked files; retain the originals/backups for them. Do not remove source
  data before parity succeeds. Phases 2-5 have not been implemented, and no commit was made. The grass-debugger
  changes and shared assets were not edited.

Completion of Phase 1, 2026-10-17:

- The user authorized a separate headless Blender instance to finish the remaining work. The occupied GUI session
  (PID 24428) remained untouched. One headless process ran at a time with two CPU threads and below-normal process
  priority. All twelve stills completed successfully; hashes confirmed the four source composition files were
  unchanged during rendering. The OptiX cache-access warning did not prevent any render from completing.
- Both heroes passed the six AI 651 view comparisons at 1280 px wide, 128 samples, OptiX only, seed 0, denoised.
  Mean differences match repeat-render noise; the isolated 5-level maximum is below the documented scene-order
  residual. No pixel differs by more than 8 levels in any view. Values below are 8-bit channel differences:

  | Hero | View | Mean | Max | 99th percentile | Verdict |
  | --- | --- | --- | --- | --- | --- |
  | Bradbury | ref_3q | 0.011219 | 2 | 1 | pass |
  | Bradbury | hero_3q | 0.009394 | 2 | 0 | pass |
  | Bradbury | st_corner | 0.006799 | 1 | 0 | pass |
  | Terra & Mar | ref_3q | 0.007978 | 5 | 0 | pass |
  | Terra & Mar | rear_3q | 0.009427 | 2 | 0 | pass |
  | Terra & Mar | entrance | 0.011060 | 1 | 1 | pass |

- Evidence: `tests/artifacts/screens/ai_652_blender_layout/parity_2026-10-17/`, including all twelve stills,
  six before/after/difference sheets, `comparison.json`, `render-jobs.json`, logs and `gate.json`.
- Before the final move, checked the complete original artifact inventory against both the migration plan and
  the independently verified `2026-10-17_blender_layout_phase1/` backup. All 1,077 files matched. No links were
  traversed, and the exact source and destination paths were checked before moving the directory.
- New immutable backup: `C:\Users\rogel\Projects\bus_simulator_backups\2026-10-17_blender_layout_phase1_retired_sources\`.
  Its `MANIFEST.md` and SHA-256 inventory were created before the move. The original artifact tree is preserved
  under `source_tree/` (1,077 files; 2,566,103,302 bytes); every file's hash was verified again afterward. No
  existing backup was modified. The old buildings-worktree `tests/artifacts/blender/` directory is now absent.
- Reopened both building entries and both city compositions after that old directory was absent: all four loaded,
  all library/image dependencies resolved, and both entries retained their single named root collection.
  Receipts: `source-retirement-receipt.json` and `after-retirement-validation.json` in the task evidence folder.
- `blender_files/` and `blender_inputs/` are now the active stores. Historical snapshots in `legacy/` retain their
  original bytes; use the retired-source backup to restore the complete old layout when needed. Older worktree
  branches must receive the script-layout changes before running their authoring scripts.
- Bradbury's pre-existing stale-wear-source warning is preserved. Grass-debugger changes and shared assets were
  not edited. No commit or worktree cleanup was performed. Phase 1 is complete; Phases 2-5 remain pending.
  Conversation mode resumed; the next phase requires the user's separate implementation request.

## Phase 2 -- the Bradbury baseline, reproducible

`assemble_building.py` starts from `before/bradbury_block_before.blend`, which came from a manual glTF import of the
game's export (`tests/headless/visual/specs/bradbury_blender_export.pwtest.js` writes only the .glb and .json), with
`link_game_textures.py` then run on it in place.

- [x] Save the building's SOURCE as it was exported, into `blender_inputs/bradbury/baseline/`. This covers the game
  config (`configs/BradburyBlock.js`) and anything else the export depends on. Record the current commit hash in
  `source.json`, so the exact game state can be checked out again if ever needed.
- [x] Keep the existing export (`bradbury_block_before.glb` + `.json`) there with its `source.json` (the spec, the
  command, the commit, md5).
- [x] A script that regenerates `bradbury_block_before.blend` from the export: the glTF import plus
  `link_game_textures.py`, as Terra & Mar's `import_baseline.py` does. Verify it against the current file (object
  count, names, bounds, materials) before anything uses it.
- [x] Document the round trip in `blender/README.md`: check out the recorded commit, run the export spec, run the
  import script.

Completion of Phase 2, 2026-10-17:

- Backup: `C:\Users\rogel\Projects\bus_simulator_backups\2026-10-17_bradbury_baseline_phase2\`, with
  `MANIFEST.md` and SHA-256 inventory. All 88 payload files (62,052,568 bytes) were verified before edits;
  no existing backup was changed.
- Preserved the historical GLB, JSON, baseline blend and baseline images byte-for-byte. Added source/provenance
  under `blender_inputs/bradbury/baseline/`: config snapshot, 2,135-file saved-source archive/inventory,
  672 captured local export dependencies, installed binary-asset hashes, and 37 pinned remote module URLs.
  The current reproduction commit is `c27125cc9cc5ebc67f4c2d715bba2a021cfef015`. The original export's commit
  was never recorded and remains explicitly unknown; current reproduction evidence does not invent that history.
  Saved uncommitted source/metadata overlays are retained separately from the commit identity.
- A fresh game export produced exactly the original parts manifest (2,731 meshes, 188,407 triangles).
  GLB comparison resolved asynchronous image-buffer ordering and found identical JSON semantics and every
  referenced payload byte. The exporter now refuses existing files and writes source/provenance for new tags.
- Added `building/import_baseline.py`, measured `baseline_recipe.json` and structural validation, registered as
  `node tools/bake.mjs --target buildings/bradbury/baseline` through the existing shared Blender configuration.
  It restores the four inspection cameras and sun, imports the GLB and links installed game textures.
  Both the retained GLB and a fresh game export passed the original structural contract before save and after
  reopen: 2,737 objects, 2,731 meshes, 146 material graphs, 21 linked images, four packed runtime images and
  183 V-mirrored texture nodes. Names, transforms/bounds, topology/UVs, assignments and rig matched.
- The fresh-export candidate is
  `blender_files/bradbury/baseline/candidates/run-1792284537720-12872-b0da49bb/bradbury_block_before.blend`.
  The active baseline was not replaced, and no downstream building or wear data was rebuilt. The import requires
  the retained contract/recipe/export/assets, not the old blend; existing outputs and `--publish` are refused.
- Validation: all 13 existing bake-framework tests passed; deliberate in-memory name, geometry and material
  changes were rejected; publication, blend overwrite and existing-export guards passed. Final hash checks
  verified all 88 backup payloads, seven original baseline/export/image files, 24 pinned import inputs,
  672 captured dependencies and 350 protected source/asset-metadata files. Evidence and logs are under
  `tests/artifacts/screens/ai_652_blender_layout/phase2/`, including `export-equivalence.json`,
  `round-trip-validation.json`, `negative-gate-tests.json` and the backup receipt. The first sandboxed browser
  could not reach the pinned CDN; an isolated network-enabled retry succeeded, and the stalled owned process tree
  was stopped. GUI Blender PID 24428 remained untouched.
- Updated the Blender guide, layout spec and bake/tool inventory. Grass-debugger changes, the shared asset store,
  existing backups and other prompts were not edited. No commit or worktree cleanup was performed.
  Phase 2 is complete. Conversation mode resumed; Phases 3-5 await separate implementation requests.

## Phase 3 -- Terra & Mar's PBR through the game catalog

Today `make_terramar_kit_pbr.py` reads `~/Downloads/Terra_Mar_PBR_Kit.zip` and writes three sets
(`terramar_continuous_limestone`, `terramar_sign_coastal_kitchen`, `terramar_sign_terra_and_mar`) that are NOT in
`_catalog_index.js`, and `trace_sign.py` reads a hand-unzipped `pbr_kit_source/` folder.

- [x] Rule: any PBR a building uses must be installed in the game catalog first (`assets/public/pbr/<set>/` with its
  `pbr.material.config.js`, listed in `_catalog_index.js`, through the project's PBR install path). The .blend reads
  the set from the catalog after it is properly installed.
- [x] Install the three Terra & Mar sets properly, with their origin and license recorded, and `pbr.material.config.js`
  committed. The kit zip is a download: record where it came from.
- [x] Refactor the Terra & Mar build (`layer_materials.py`, `layer_podium.py`, the soil and limestone users, the
  signs) to resolve every set through the catalog (one lookup helper that fails if a set is not installed), never from
  the kit or a hand-made folder.
- [x] `trace_sign.py` reads the installed sign set (its opacity or alpha map as installed), so `pbr_kit_source/` is no
  longer needed. If the installed set lacks the map the tracer needs, the install keeps it.
- [x] Decided (user, 2026-10-17): the Bradbury's `bradbury_lettering` set follows the same rule. Install it in the
  catalog with its origin and license (it is made from a zip in `downloads/`), and make the Bradbury's portal scripts
  (`08_frieze.py`) read it through the same catalog lookup.
- [x] Gate: the Terra & Mar parts rebuild from the catalog and render as before (parity on the AI 651 views).

Completion of Phase 3, 2026-10-17:

- Immutable backup: `C:\Users\rogel\Projects\bus_simulator_backups\2026-10-17_building_pbr_catalog_phase3\`,
  with `MANIFEST.md` and SHA-256 inventory: 351 payload files, 1,479,020,071 bytes, verified before changes.
  A separate `2026-10-17_building_pbr_catalog_phase3_runtime/` backup preserves the shared local Blender config
  before filling its empty Python executable setting. Existing backups were not modified.
- The user explicitly approved only four additions to the shared catalog index. Added four imports and four
  entries; removing these additions reproduces the previous index byte-for-byte, including the landscape edits.
  The four per-set configs were already tracked; updated the Terra & Mar metadata and retained all original maps.
  No commit was made, following the project rule.
- Extended `tools/pbr_material_importer/` with `building_sets.py`: validates both retained archive checksums,
  checks Terra & Mar's installed maps byte-for-byte, stages source metadata and the two sign opacity maps, and
  refuses conflicting opacity. All four sets have provenance; unknown author/URL/license remain explicit.
  The original archives are copied into `blender_inputs/terramar/kit_source/` and
  `blender_inputs/bradbury/lettering_source/` with source records. Original downloads are unchanged.
- Added one shared catalog lookup (`common/material_catalog.py` plus its Node bridge), reading the actual
  `_catalog_index.js` and failing on unregistered sets or missing/invalid map paths. Terra & Mar's material,
  limestone, soil, podium/sign consumers and Bradbury's `08_frieze.py` now use it. No extracted-kit fallback remains
  in these consumers. The old extracted kit is retained; deleting it is not part of this phase.
- Installed opacity equals base-color alpha exactly. Both catalog-driven sign traces preserve every glyph/contour
  value; only their source paths change. Their provenance retains the Phase 1 migration history. Bradbury lettering
  and flower materials preserve identical shader graphs, image sizes and alpha data through the shared helper.
- Registered `node tools/bake.mjs --target buildings/terramar/catalog-check` as an explicit candidate-only leaf.
  It rebuilt all five parts, their entry and the city composition, then reopened all seven with no missing
  images/libraries. The candidate root is
  `blender_files/terramar/catalog-candidates/run-1792293826690-27332-e57eff53/`.
  It reuses the retained baseline and city; it does not implement Phase 4 or Phase 5. Publication and existing/outside
  output destinations are refused. Active scenes were not replaced.
- The AI 651 three-view visual parity gate passed at 1280x720, 128 samples, OptiX only, seed 0, denoised.
  The conservative initial max-difference <=8 screen failed in seven front-view pixels; that result is retained
  in `gate.json`. The final assessment explicitly explains the residual rather than claiming exact pixel parity:

  | View | Mean channel difference | Max | Pixels over 8 | Assessment |
  | --- | --- | --- | --- | --- |
  | ref_3q | 0.009618 | 16 | 7 (0.00076%) | visual parity; small regeneration/sampling residual |
  | rear_3q | 0.011038 | 5 | 0 | visual parity; repeat-noise residual |
  | entrance | 0.011442 | 2 | 0 | visual parity; repeat-noise residual |

  A repeat of the candidate front view measured mean 0.007994/max 3; changing the seed measured mean 1.488044/max
  100 with 5.086% of pixels over 8. All comparison sheets were visually inspected. Object names/counts, bounds,
  transforms and material slots match. Most changed mesh hashes are vertex/face ordering only; two slab Boolean
  meshes have small tessellation differences (maximum nearest-vertex distance 0.126 mm), and four wear overlays
  differ by about one micrometre. The render residual is documented; the rebuilt meshes are not byte-identical.
- Validation: 19 Node catalog/storage/framework tests passed; catalog missing-entry/map/path guards and the
  candidate overwrite/publication guards passed. Final preservation checks verified all 351 backup payloads,
  all 27 pre-existing generated files, 16 original PNG maps and 346 protected source/asset metadata files.
  Grass-debugger changes, unrelated shared assets and GUI Blender PID 24428 were untouched. Headless render
  processes ran sequentially with two CPU threads and below-normal priority.
- Evidence: `tests/artifacts/screens/ai_652_blender_layout/phase3/`, including `final-gate.json`, the retained
  initial `gate.json`, `validation-1792294217/parity/`, noise controls, geometry reports, sign/material parity,
  importer receipts under `blender_files/phase3-material-install/`, and preservation checks. Updated the rules,
  Blender guide, material/layout specs and tool inventory. No worktree cleanup was performed.
- Phase 3 is complete. Conversation mode resumed; Phases 4 and 5 require separate implementation requests.

## Phase 4 -- a standalone city

- [x] Extract everything the city needs so it depends on nothing of the Bradbury's:
  - The context library is built by the city's own script (today `BradburyBlock/build_context.py`, copied into the
    city's scripts) straight into `blender_files/city/city_context_library.blend`, not copied once from the Bradbury.
  - The site descriptor's constants (the kerb rectangle from the Bradbury hull, `SHRINK` / `BAY_GROW`, the reference
    stand `ref_3q` the city keeps its wedges clear of, the sun's +40 photo azimuth) are the city's own data, written
    in `city_site.py` with their history, not read from Bradbury code.
  - No import of, or path into, `blender/scripts/bradbury/` or `blender_files/bradbury/`.
- [x] Decide which Bradbury-measured choices stay as the city's defaults (the sun azimuth, the neighbour tower placed
  for the photo's second shadow, the clear wedges) and write them down as city decisions.
- [x] Gate: the city builds in an empty `blender_files/` with no Bradbury file present, and both compositions match
  the current renders.

Completion of Phase 4, 2026-10-18:

- Immutable backup: `C:\Users\rogel\Projects\bus_simulator_backups\2026-10-18_standalone_city_phase4\`,
  with `MANIFEST.md` and SHA-256 inventory. All 26 payload files (49,465,181 bytes) were verified before edits.
  Existing backups remain untouched.
- Added city-owned `build_context.py`: imports fifteen game trees and the installed street lamp directly into
  `city/city_context_library.blend`. Removed the Bradbury-library fallback. `city_site.py` now owns the measured
  hull adjustments, reference stand, +40-degree sun, neighbour tower/wing recipes and clear wedges. These remain
  city defaults to preserve both compositions; their AI 574 photo-fit history and rationale are documented.
- Moved five hero-dependent diagnostics into `blender/scripts/validation/` and updated their callers/docs.
  The city source contains no hero path/import. The original Bradbury context builder is unchanged.
- Registered `node tools/bake.mjs --target city/standalone-check` (also the explicit `city` parent), outside
  production `all`, using shared local configuration and existing framework gates. It starts with an empty root,
  builds context/city/site, reopens both blends, verifies dependencies and authenticates all three output hashes.
  No hero file was present. Existing/unsafe destinations, publication and a deliberately corrupt receipt were rejected.
- Clean city candidate: `blender_files/city-candidates/run-1792298257802-27300-b287f475/`.
  Fresh copies of the two current compositions link that city under
  `blender_files/phase4-composition-candidates/run-1792298257802-27300-b287f475/`.
  Active files were not replaced; neither hero was rebuilt. Context (16 objects), city (7,181), Bradbury composition
  (10,486) and Terra & Mar composition (9,218) match their originals in names, geometry hashes, transforms,
  material slots, visibility and scene controls. The site descriptor differs only in its build timestamp.
- All six AI 651 comparisons passed at 1280 px wide, 128 samples, OptiX only, seed 0, denoised. All six comparison
  sheets were inspected. Differences are repeat-render noise; no pixel differs by more than 3 levels:

  | Hero | View | Mean channel difference | Max | 99th percentile |
  | --- | --- | --- | --- | --- |
  | bradbury | ref_3q | 0.011253 | 3 | 1 |
  | bradbury | hero_3q | 0.009340 | 3 | 0 |
  | bradbury | st_corner | 0.006842 | 1 | 0 |
  | terramar | ref_3q | 0.007906 | 2 | 0 |
  | terramar | rear_3q | 0.009321 | 1 | 0 |
  | terramar | entrance | 0.011020 | 1 | 1 |

- Validation: 13 existing bake-framework tests passed; 12 Python modules parsed; JavaScript syntax and scoped
  Git whitespace checks passed. Final SHA-256 checks verified all 26 backup payloads, six original generated files
  and 99 protected uncommitted source/asset files. Grass-debugger changes, shared assets and GUI Blender PID 24428
  were untouched. Headless jobs ran sequentially; renders used two CPU threads and below-normal process priority.
- Evidence: `tests/artifacts/screens/ai_652_blender_layout/phase4/`, including `final-gate.json`, `structure.json`,
  preservation/guard reports and `validation-1792298325/` with twelve stills and six comparison sheets. The framework
  receipt is in `tests/artifacts/screens/ai556_bake_framework/run-1792298257802-27300-b287f475/city/standalone-check/`.
- Phase 4 is complete. Conversation mode resumed; Phase 5 requires a separate implementation request.
  No commit, worktree cleanup or legacy-file removal was performed.

## Phase 5 -- full regeneration

- [x] A `rebuild_all.py` per hero and for the city, every step in order from the inputs and the game's assets.
  Register them in `tools/bake.mjs` if they fit that framework (AGENTS.md: new bake processes register there).
- [x] Check whether `arch_leaf.py` already contains the edits recorded in `ornaments/arch_leaf_user_edit.json`; if not,
  apply them in the script.
- [x] Gate: rebuild both heroes and the city into an empty `blender_files/` and pass the AI 651 parity gates against
  the current files.
- [x] Move the legacy scenes and backups into `legacy/`; delete nothing without the user's approval.

Phase 5 implementation and validation, 2026-10-18 -- one snapshot move remains pending:

- Immutable backup: `C:\Users\rogel\Projects\bus_simulator_backups\2026-10-18_full_regeneration_phase5\`,
  with `MANIFEST.md` and SHA-256 inventory. All 2,612 payload files (2,783,059,682 bytes) were verified before edits.
  It includes the authoring sources/configuration, tools/docs, preserved inputs, active scenes and legacy data.
  Existing backups were not modified.
- Added `rebuild_all.py` for Bradbury, Terra & Mar and the independent city, plus the shared sequential orchestrator.
  Registered `buildings/rebuild-all`, `buildings/bradbury/rebuild`, `buildings/terramar/rebuild` and `city/rebuild-all`
  in `node tools/bake.mjs`, using the existing local configuration. These explicit leaves remain outside production
  `all` and the existing parent jobs. They refuse publication and existing/unsafe destinations.
- The full chain starts empty, builds city/context/site, imports both GLB baselines, rebuilds ornaments/portal/block/
  wear, traces signs and decodes vegetation, and builds both entries/compositions. No existing `.blend` is an input.
  Terra & Mar derived data stays inside the candidate. Fixed texture paths in unsaved Bradbury scenes, prepared
  baseline report directories, suppressed intermediate previews and prevented automatic `.blend1` snapshots.
- `arch_leaf.py` already represents the historical nose edit through its easing and round-over parameters. The
  saved JSON records 45 edits on an obsolete dense mesh; the current stem has 22 vertices. Regeneration reproduced
  the current stem/outer-leaf coordinates exactly, including the linked portal/block leaf. Neither source was edited.
- A first full-build comparison exposed a real frieze-layout mismatch. The saved lettering retained an earlier
  authored span, whereas the script recalculated it from today's capital edges. `building/frieze_layout.json`
  now records that span (2.637562331390381 m), its measurement method and the original scene hash. The final rebuild
  reproduces lettering/flower bounds, vertex/face counts and canonical faces exactly without reading the old blend.
- Final clean candidate: `blender_files/rebuild-candidates/all/run-1792303537574-12216-53d95aad/`.
  The complete registered job passed in 867.2 seconds: 19 blends reopened, 140 generated file hashes authenticated,
  847 declared inputs and all 136 output dependencies covered. Libraries stay inside the candidate; images resolve
  in it or installed assets. Both entry roots are correct. City-only and Terra & Mar-only entrypoints also passed.
  Bradbury's 2,737-object baseline contract and Terra & Mar's 696-object/26,760-triangle contract passed. All 77
  derived sign/vegetation files match retained inputs, and every decoded vegetation model matches the installed index.
- All 19 scene comparisons preserve object membership, visibility and controls. City/context and both ornaments
  match exactly; the city descriptor differs only in its build timestamp. Changed Bradbury mesh hashes are ordering
  differences. Terra & Mar Boolean slabs retain unchanged bounds but have up to 0.111 mm nearest-vertex differences;
  roof wear has up to 0.001067 mm coordinate differences. Nine Bradbury masks match exactly; mortar differs at 27 of
  10,197,200 values. These are documented regeneration residuals, not byte-identical output.
- All six AI 651 visual comparisons passed at 1280 px wide, 128 samples, OptiX only, seed 0 and denoising. Every
  comparison sheet and the enlarged Terra & Mar residuals were inspected. The raw stricter repeat-render heuristic
  remains false for the two noted Terra & Mar views; it is preserved rather than silently relaxed. Front residuals
  lie at roof/glass details, as in Phase 3; rear has one isolated glass-detail pixel. No visible layout/material
  change remains. Repeat/seed controls and geometry/mask measurements support the explanation in `final-gate.json`.

  | Hero | View | Mean channel difference | Max | Pixels >8 | Current / rebuilt seconds |
  | --- | --- | --- | --- | --- | --- |
  | bradbury | ref_3q | 0.011777 | 4 | 0 | 96.4 / 39.3 |
  | bradbury | hero_3q | 0.009804 | 4 | 0 | 36.5 / 35.3 |
  | bradbury | st_corner | 0.007182 | 4 | 0 | 32.1 / 31.8 |
  | terramar | ref_3q | 0.010228 | 16 | 7 | 32.9 / 33.2 |
  | terramar | rear_3q | 0.013590 | 12 | 1 | 32.5 / 32.7 |
  | terramar | entrance | 0.011743 | 2 | 0 | 37.8 / 37.6 |

- Current-scene captures from the first comparison were reused after checking their scene hashes and preserved
  original dependencies. All 111 external asset files predate those captures and were hashed around final validation.
  The first Bradbury current render includes cold-cache overhead. All 140 candidate file hashes still match after
  rendering; active files were not replaced. Headless jobs ran sequentially with two CPU threads, isolated caches/
  configuration and below-normal priority; the occupied GUI Blender PID 24428 was left alone.
- Validation: 13 existing bake-framework tests, 202 Python parse checks, JavaScript syntax, output guards,
  deliberately corrupt receipt rejection and scoped whitespace checks passed. Final preservation checks verify
  all 2,612 backup payloads, 2,373 original data files and 99 protected uncommitted grass-debugger/asset files.
  Previously completed checklist items remain unchanged.
- Evidence: `tests/artifacts/screens/ai_652_blender_layout/phase5/`, especially `final-gate.json`,
  `corrected-validation-1792304408/`, `derived-equivalence-final.json`, `legacy-review.json` and preservation/guard
  reports. Initial failed comparisons and candidates are retained. The framework receipt is under
  `tests/artifacts/screens/ai556_bake_framework/run-1792303537574-12216-53d95aad/buildings/rebuild-all/`.
- Legacy status: 172 original scenes/snapshots already reside under `legacy/`. The only remaining snapshot outside
  it is `blender_files/terramar/terramar_city_composition.blend1` (354,225 bytes), verified in this phase's backup.
  The proposed destination is `terramar/legacy/snapshots/terramar_city_composition.blend1`. Its move is pending the
  already-requested explicit exception to the user's “Never modify existing backups” instruction and
  `PROJECT_RULES.md` → Backups (“A backup is never modified or deleted by an agent”). No snapshot was moved or deleted.
- Conversation mode resumed. Phase 5's rebuild and parity work is complete; its final legacy-move checkbox remains
  open pending that answer. No commit, worktree cleanup, backup mutation or active-scene replacement was performed.

Phase 5 completion addendum, 2026-10-18:

- The user explicitly approved: “Move this snapshot into legacy.” Moved only
  `blender_files/terramar/terramar_city_composition.blend1` to
  `blender_files/terramar/legacy/snapshots/terramar_city_composition.blend1`.
- Rechecked the snapshot against the existing Phase 5 external backup and its manifest before moving. Its
  354,225 bytes and SHA-256 `8cc20734315db597b055f33b730af32a6325da26e59c8171512a1fe45f4fb72d` are unchanged.
  Verified the destination and the absence of the former path. The external backup remains untouched.
- Receipt: `tests/artifacts/screens/ai_652_blender_layout/phase5/snapshot-move.json`. This resolves the pending
  approval recorded above. All four Phase 5 checklist items are complete. No deletion, rebuild or active-scene
  change was needed. Conversation mode resumed; the interactive prompt remains under its existing filename.

Completion audit, 2026-10-18:

- All phases (0-5) and both cross-phase backup requirements are complete. Each recorded phase backup has its
  `MANIFEST.md`, and the phase notes name the applicable folder. No further implementation phase is defined.
- The user requested a commit of AI 652. Its scope is the authoring migration, shared-folder setup, baseline and
  catalog integration, independent city, full-regeneration workflows, exporter paths and their documentation.
  Unrelated grass-debugger work, landscape catalog/config edits and separate prompt files remain outside this scope.
- The interactive filename remains unchanged because the user has not requested `make final`.
