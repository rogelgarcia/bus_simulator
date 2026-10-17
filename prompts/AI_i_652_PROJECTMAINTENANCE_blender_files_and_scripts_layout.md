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

- [ ] Before Phase 1 moves or renames anything: back up every .blend, json, mask, cache and input it will touch (the
  buildings worktree's `tests/artifacts/blender/` as a whole, and the scripts' untracked files) into
  `bus_simulator_backups\<date>_blender_layout\`, with its MANIFEST.md.
- [ ] Before each later phase that rebuilds, relinks or replaces files in `blender_files/` or `blender_inputs/`, or
  installs or changes PBR sets in `assets/public/pbr/`: back up what it touches into its own dated folder.
- [ ] Each phase's completion notes name its backup folder.

# Requirements, by phase

Each phase is implemented on its own `implement`. The order can change.

## Phase 1 -- the layout, the paths and the provenance rule

- [ ] Decided (user, 2026-10-17): only `blender/` is tracked (`blender/scripts/`, `blender/README.md`), and it holds
  no junction. `blender_files/` and `blender_inputs/` are root junctions, gitignored.
- [ ] Decided (user, 2026-10-17): `blender_files/` and `blender_inputs/` are SHARED. Their real folders live in the
  main checkout (`C:\Users\rogel\Projects\bus_simulator\blender_files`, `...\blender_inputs`), and every other worktree
  has a root junction to each, as `assets/`, `downloads/` and `docs/` do. Their safety rules:
  - Add it to the shared-junction list in `ai_rules/PROJECT_RULES.md` ("Worktree cleanup safety") and to the worktree
    setup. AGENTS.md's ban on worktree archival covers it.
  - One writer per file: two sessions never rebuild the same .blend at the same time.
  - A worktree whose scripts differ from main's writes into the same shared files, so a branch rebuild is visible to
    every worktree. Builds that must not reach main's files write to a scratch `out=` path.
- [ ] Record the junction rules in `ai_rules/PROJECT_RULES.md` ("Worktree cleanup safety") and `AGENTS.md`: root only,
  no tracked files inside, real folder in main.
- [ ] Decided (user, 2026-10-17): the hero ids are `bradbury` and `terramar` (folders and file prefixes). The link from
  a game config to its scripts (`configs/BradburyBlock.js` -> `bradbury`, `terramar_recessed` -> `terramar`) is an id
  table in `blender/README.md`.
- [ ] Create `blender/README.md` and `blender/scripts/` (tracked), and `blender_files/` and `blender_inputs/` (real
  folders in main, root junctions in this worktree), plus the `.gitignore` rules: `/blender_files/` and
  `/blender_inputs/` ignored.
- [ ] `blender/scripts/common/paths.py`. Replace every `tests/artifacts/blender` constant and
  every hardcoded absolute path: the Bradbury `pieces/*.py` (`LIB=`, `OUT=`, the save targets), `ornaments/capital.py`,
  `ornaments/arch_leaf.py` and `portal_lib.ORNAMENTS_DIR`.
- [ ] Move the scripts from `src/graphics/content3d/buildings/authoring/` into `blender/scripts/` with `git mv`
  (history kept), and fix the imports and sys.path setup. Render evidence stays under `tests/artifacts/screens/`.
- [ ] Move the .blend files into `blender_files/` with the agreed names. Relink the libraries inside them, or rebuild
  them from the scripts, and regenerate the Bradbury wear manifest (it stores source paths and hashes).
- [ ] Add `terramar_building.blend` (the entry file) and rename the Terra & Mar shell part to `terramar_part_shell`.
- [ ] Provenance rule, in `AGENTS.md`, `ai_rules/PROJECT_RULES.md` and `blender/README.md`: any downloaded source
  (a texture kit, a model, an HDRI, a photo) must record its origin and its license whenever possible (URL or source,
  author, license, date, md5), in a `source.json` beside it. This extends the existing CC0 `source.json` practice to
  every download.
- [ ] Update `AGENTS.md` and `ai_rules/PROJECT_RULES.md`: .blend files go in `blender_files/`, scripts in
  `blender/scripts/`, non-game inputs in `blender_inputs/`, never under `tests/artifacts/blender/` again.
- [ ] Gate: both compositions open from `blender_files/` and pass the AI 651 parity renders against the files before
  the move.

## Phase 2 -- the Bradbury baseline, reproducible

`assemble_building.py` starts from `before/bradbury_block_before.blend`, which came from a manual glTF import of the
game's export (`tests/headless/visual/specs/bradbury_blender_export.pwtest.js` writes only the .glb and .json), with
`link_game_textures.py` then run on it in place.

- [ ] Save the building's SOURCE as it was exported, into `blender_inputs/bradbury/baseline/`. This covers the game
  config (`configs/BradburyBlock.js`) and anything else the export depends on. Record the current commit hash in
  `source.json`, so the exact game state can be checked out again if ever needed.
- [ ] Keep the existing export (`bradbury_block_before.glb` + `.json`) there with its `source.json` (the spec, the
  command, the commit, md5).
- [ ] A script that regenerates `bradbury_block_before.blend` from the export: the glTF import plus
  `link_game_textures.py`, as Terra & Mar's `import_baseline.py` does. Verify it against the current file (object
  count, names, bounds, materials) before anything uses it.
- [ ] Document the round trip in `blender/README.md`: check out the recorded commit, run the export spec, run the
  import script.

## Phase 3 -- Terra & Mar's PBR through the game catalog

Today `make_terramar_kit_pbr.py` reads `~/Downloads/Terra_Mar_PBR_Kit.zip` and writes three sets
(`terramar_continuous_limestone`, `terramar_sign_coastal_kitchen`, `terramar_sign_terra_and_mar`) that are NOT in
`_catalog_index.js`, and `trace_sign.py` reads a hand-unzipped `pbr_kit_source/` folder.

- [ ] Rule: any PBR a building uses must be installed in the game catalog first (`assets/public/pbr/<set>/` with its
  `pbr.material.config.js`, listed in `_catalog_index.js`, through the project's PBR install path). The .blend reads
  the set from the catalog after it is properly installed.
- [ ] Install the three Terra & Mar sets properly, with their origin and license recorded, and `pbr.material.config.js`
  committed. The kit zip is a download: record where it came from.
- [ ] Refactor the Terra & Mar build (`layer_materials.py`, `layer_podium.py`, the soil and limestone users, the
  signs) to resolve every set through the catalog (one lookup helper that fails if a set is not installed), never from
  the kit or a hand-made folder.
- [ ] `trace_sign.py` reads the installed sign set (its opacity or alpha map as installed), so `pbr_kit_source/` is no
  longer needed. If the installed set lacks the map the tracer needs, the install keeps it.
- [ ] Decided (user, 2026-10-17): the Bradbury's `bradbury_lettering` set follows the same rule. Install it in the
  catalog with its origin and license (it is made from a zip in `downloads/`), and make the Bradbury's portal scripts
  (`08_frieze.py`) read it through the same catalog lookup.
- [ ] Gate: the Terra & Mar parts rebuild from the catalog and render as before (parity on the AI 651 views).

## Phase 4 -- a standalone city

- [ ] Extract everything the city needs so it depends on nothing of the Bradbury's:
  - The context library is built by the city's own script (today `BradburyBlock/build_context.py`, copied into the
    city's scripts) straight into `blender_files/city/city_context_library.blend`, not copied once from the Bradbury.
  - The site descriptor's constants (the kerb rectangle from the Bradbury hull, `SHRINK` / `BAY_GROW`, the reference
    stand `ref_3q` the city keeps its wedges clear of, the sun's +40 photo azimuth) are the city's own data, written
    in `city_site.py` with their history, not read from Bradbury code.
  - No import of, or path into, `blender/scripts/bradbury/` or `blender_files/bradbury/`.
- [ ] Decide which Bradbury-measured choices stay as the city's defaults (the sun azimuth, the neighbour tower placed
  for the photo's second shadow, the clear wedges) and write them down as city decisions.
- [ ] Gate: the city builds in an empty `blender_files/` with no Bradbury file present, and both compositions match
  the current renders.

## Phase 5 -- full regeneration

- [ ] A `rebuild_all.py` per hero and for the city, every step in order from the inputs and the game's assets.
  Register them in `tools/bake.mjs` if they fit that framework (AGENTS.md: new bake processes register there).
- [ ] Check whether `arch_leaf.py` already contains the edits recorded in `ornaments/arch_leaf_user_edit.json`; if not,
  apply them in the script.
- [ ] Gate: rebuild both heroes and the city into an empty `blender_files/` and pass the AI 651 parity gates against
  the current files.
- [ ] Move the legacy scenes and backups into `legacy/`; delete nothing without the user's approval.
