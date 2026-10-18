# Blender authoring

Authoring sources live here, outside the game's runtime source tree. `scripts/common/paths.py` resolves roots from
this checkout. Generated files and inputs are shared between worktrees; see
[`specs/tools/blender_authoring_layout.md`](../specs/tools/blender_authoring_layout.md) for the layout contract.

| Location | Contents | Git |
| --- | --- | --- |
| `blender/scripts/common/` | Paths, existing-script launcher, shared collection helpers | Tracked |
| `blender/scripts/city/` | Independent city, context import and composition helpers | Tracked |
| `blender/scripts/validation/` | Hero-dependent composition and parity diagnostics | Tracked |
| `blender/scripts/<hero>/building/` | Building construction, parts and script-owned JSON | Tracked |
| `blender/scripts/<hero>/composition/` | Hero placement and city compositions | Tracked |
| `blender/scripts/<hero>/render/` | Still, flyover and comparison scripts | Tracked |
| `blender_files/` | Generated `.blend` files, masks and derived caches | Ignored, shared |
| `blender_inputs/` | Baseline exports, reference models, traced data and other non-game inputs | Ignored, shared |
| `tests/artifacts/screens/` | Renders, captures and validation reports | Ignored |

## Building IDs and files

| Game configuration | Authoring hero ID | Building entry |
| --- | --- | --- |
| `configs/BradburyBlock.js` (`bradbury_block`) | `bradbury` | `blender_files/bradbury/bradbury_building.blend` |
| `terramar_recessed` | `terramar` | `blender_files/terramar/terramar_building.blend` |

Each hero entry has one top collection: `BRADBURY_BUILDING` or `TERRAMAR_BUILDING`. Parts keep their existing
collections. A composition links the entry's contents and the reusable city; it owns placement and block finishing.

```text
blender_files/
  city/city.blend
       city_site.json
       city_context_library.blend
  bradbury/bradbury_building.blend
           bradbury_city_composition.blend
           parts/bradbury_part_{block,portal,portal_worn,wear_nodes,ornament_capital,ornament_arch_leaf}.blend
           baseline/bradbury_block_before.blend
           wear/
           legacy/
  terramar/terramar_building.blend
           terramar_city_composition.blend
           parts/terramar_part_{shell,props,interiors,wear,site}.blend
           baseline/terramar_recessed_before.blend
           wear/
           legacy/
```

The Terra & Mar entry links all five parts, including the site. Its city composition instances the relevant part
collections from that entry, preserving the existing placement and individual wear controls. Bradbury's entry is
the worn block; its wear manifest lives at `blender_files/bradbury/wear/wear_manifest.json`. Manifest source paths
are relative to that manifest. A `stale_before_layout` field records stale sources discovered during migration;
only a real wear rebuild clears that warning.

## Shared-folder safety

Main owns real `blender_files/` and `blender_inputs/` directories. Every other worktree has a junction to each at its
root. Neither contains tracked files. `blender/` contains no junction. Inspect or create missing links with
`node tools/worktree_setup/run.mjs` (add `--apply` to create); see that tool's README for older branches' ignore rules.

One writer may change a shared file at a time. Branch scripts see and overwrite the same files as main. Use an
explicit scratch `out=` or set `BLENDER_FILES_ROOT` to an isolated directory for a complete scratch build. Changing
the root changes both generated-file reads and writes; populate the required dependencies there first. Do not
archive or remove worktrees, traverse shared links during cleanup, or remove shared targets.

Older worktree branches must receive these layout changes before running their authoring scripts. Creating the
shared junctions alone does not update scripts that still point to the retired `tests/artifacts/blender/` tree.

Before moving, relinking or replacing untracked data, copy everything affected to a new
`C:\Users\rogel\Projects\bus_simulator_backups\<YYYY-MM-DD>_<topic>\` with `MANIFEST.md`, totals and restore
instructions. Verify the copy. Agents never modify or delete completed backups.

## Inputs and provenance

Read textures, vegetation and HDRIs shipped by the game from its installed `assets/` store. A new PBR set must be
installed through the game's catalog workflow before use. `scripts/common/material_catalog.py` reads the actual
game index through Node.js and resolves its declared map slots, failing on missing entries/maps. Node must be on
PATH in the Blender process. Never read a kit as a fallback for an uninstalled material.

Every downloaded texture kit, model, HDRI or photo needs a `source.json` beside it. Record the original URL/source,
author, license, acquisition date and MD5 whenever available. Use explicit null/unknown values with an explanation
when evidence is unavailable; never infer a license. Derived inputs should also record their generating command
and source commit when verified. Keep migration dates separate from acquisition dates. Relocation receipts do not
establish the unknown original generation commit. Preserve existing provenance.

Baseline GLB/JSON exports live in `blender_inputs/<hero>/baseline/`; imported `.blend` baselines live under
`blender_files/<hero>/baseline/`. Historical screenshot evidence retains its original game-ID folders.

## Full regeneration

Run `node tools/bake.mjs --target buildings/rebuild-all` to rebuild both heroes and the independent city from
preserved GLB/JSON exports, tracked authoring recipes and installed game assets. The opt-in leaves
`buildings/bradbury/rebuild`, `buildings/terramar/rebuild` and `city/rebuild-all` select a single hero with its city,
or the city alone. None belongs to production `all`; publication and existing destinations are rejected.

Each authoring family has `scripts/<family>/rebuild_all.py`. The shared host workflow uses the existing local
Blender/Python configuration and sequential isolated processes. It creates a fresh
`blender_files/rebuild-candidates/<target>/<run-id>/` root. No pre-existing `.blend` is copied into that root.
Terra & Mar sign contours and decoded vegetation are regenerated under its `derived/` folder. Stage logs,
validation receipts and previews use the framework's ignored evidence directory. Per-piece preview renders are
skipped during construction; the AI 651 composition comparisons remain a required separate gate.

Every generated blend is reopened. Linked libraries must remain inside that candidate root; external images must
resolve inside the candidate or installed assets. Building entries retain their single named root. Reports
authenticate all outputs and do not authorize replacing active scenes. Preserve an external dated backup before
any later replacement. See [`tools/bake_buildings/README.md`](../tools/bake_buildings/README.md).

`arch_leaf_user_edit.json` preserves the September 11 hand edit on an older dense mesh. The current `arch_leaf.py`
already expresses that nose adjustment through its easing and round-over (`NOSE_T`, `NOSE_DROP`, `TIP_T`,
`TIP_END`). Its stem now has 22 vertices; the old 45 vertex-index edits must not be applied literally to this
topology. Phase 5 regenerated identical stem/outer-leaf coordinates, including the linked `arch_leaf_068` in the
portal and block, against the active files. The historical JSON remains unchanged.

Bradbury's `building/frieze_layout.json` retains the measured lettering span from the active portal. The lettering
and flower panels were authored against an earlier capital edge; deriving their span from today's capital would
shrink the lettering by about 85 mm. The explicit span reproduces their saved bounds and faces without reading an
old `.blend` during generation. Its provenance records the measurement and original scene hash.

## Build order

These are the dependency orders used by the full workflows. Back up outputs
and check for a busy Blender session before running scripts. Authoring scripts run in separate Blender processes;
Pillow/numpy preprocessing scripts use a Python environment that provides those packages.

The orchestrator first runs `city/build_context.py` and `city/build_city.py` once, from installed game trees,
the street lamp and the city's own defaults. It then runs the requested hero chains below. Existing exports
and catalog installation are prerequisites; full regeneration reads them without exporting or installing assets.

Bradbury:

1. Existing baseline export from `tests/headless/visual/specs/bradbury_blender_export.pwtest.js`.
2. `node tools/bake.mjs --target buildings/bradbury/baseline`: verified glTF import and texture linking (see below).
3. `building/ornaments/capital.py`, `building/ornaments/arch_leaf.py`.
4. `building/rebuild_portal.py -- 01 02 03 04 05 06 07 08`.
5. `building/assemble_building.py`, then `building/wear_layer.py`.
6. `composition/build_composition.py`.

Terra & Mar:

1. Install/validate the catalog sets as described below, then `building/rebuild/trace_sign.py`.
2. `building/rebuild/decode_vegetation_glb.mjs` for derived vegetation input.
3. Existing `terramar_recessed_blender_export.pwtest.js`, then `building/import_baseline.py`.
4. `building/rebuild/build.py target=all`: shell precedes wear; `compose.py` creates the entry after parts.
5. `composition/build_composition.py`.

The city builds its own context directly from installed game trees and the street lamp. Run
`node tools/bake.mjs --target city/standalone-check` to build and reopen all three city outputs in a fresh root,
without any hero file. See [`tools/bake_city/README.md`](../tools/bake_city/README.md).
The full workflow includes baseline imports, ornament/part generation and wear. New bake processes must register in
`node tools/bake.mjs`; do not create a separate machine-specific bake command.

Host-side launchers read the existing ignored `tools/baking/blender.local.json` executable setting. The old portal
`.cmd` delegates to `scripts/common/run.py`, which only launches an existing script with canonical paths. It does
not replace the bake framework or reserve Blender: the caller must first check session ownership and resources.

## Bradbury baseline round trip

`blender_inputs/bradbury/baseline/` retains the original `bradbury_block_before.glb` and parts `.json` byte-for-byte.
Its `source.json` records their MD5/SHA-256, export command, current reproduction commit, source snapshots,
installed asset hashes and validation evidence. The original export's commit was never recorded and remains
explicitly unknown. The verified reproduction commit is `c27125cc9cc5ebc67f4c2d715bba2a021cfef015`.

`source/BradburyBlock.js` is the config snapshot; `source/working-source.zip` preserves 2,135 saved source files
with `source/inventory.json`. The more precise `source/captured-export/` snapshot and `source/export-source.json`
record 672 local dependencies actually read by the successful export plus its tooling, including installed
binary-asset hashes and 37 pinned remote module URLs. Source copies include saved uncommitted metadata;
the commit alone is insufficient to reproduce a dirty checkout. Game textures/models/HDRIs stay in the installed
asset store and must match the recorded hashes. Do not replace shared assets to force a match.

To reproduce the game export:

1. In a separately prepared source checkout, check out the recorded reproduction commit. Preserve current work
   first; never switch this dirty main checkout as part of an export. Apply the saved source snapshot there,
   overlaying `source/captured-export/` after the broad archive. Retain the current AI 652 authoring scripts/tools
   for the import stage: the reproduction commit describes game source and predates these authoring-layout edits.
2. Verify the installed asset hashes in `source/export-source.json` and make the recorded dependencies available.
   The saved harness import map pins Three.js CDN URLs; an isolated browser needs access to them.
3. Run the export spec with a NEW tag. For PowerShell:

   ```powershell
   $env:EXPORT_TAG = 'baseline-replay-unique'
   $env:EXPORT_MAX_TEXTURE = '1024'
   node node_modules/@playwright/test/cli.js test -c tests/headless/visual/visual.config.mjs bradbury_blender_export
   ```

   Set `PLAYWRIGHT_EXECUTABLE_PATH` to the installed browser if needed. The exporter writes a GLB, parts manifest,
   `source.json`, and the source text actually requested by the browser under `blender_inputs/bradbury/<tag>/`.
   Existing exports are refused. Use `EXPORT_TAG=before` only in a prepared empty baseline input directory.
4. In the authoring checkout containing that fresh export, import it through the shared framework:

   ```powershell
   node tools/bake.mjs --target buildings/bradbury/baseline --set buildings/bradbury/baseline:glb=blender_inputs/bradbury/baseline-replay-unique/bradbury_block_baseline-replay-unique.glb
   ```

   Omit the `glb` override to rebuild from the retained original export. `--dry-run` prints the plan.

`import_baseline.py` imports glTF without merging vertices, calls `link_game_textures.py`, and restores the four
inspection cameras, sun and scene settings from tracked `baseline_recipe.json`. It compares against
`expected-baseline.json`, measured from the original scene, before saving and again after reopening. Validation
covers all 2,737 objects (2,731 meshes), names, transforms/bounds, topology/UVs, material assignments and all 146
material graphs, 21 linked maps, four packed runtime images and the inspection rig. Generated viewer/render buffers
are excluded. Hashes are exact; matrix values allow 0.00001 for Blender's decomposition.

The result is a new candidate under `blender_files/bradbury/baseline/candidates/<run-id>/`, with its receipt in the
framework run folder. The original active `.blend` remains unchanged. `--publish` is rejected and no downstream
building is rebuilt. A later replacement requires its own verified external backup with `MANIFEST.md`.
`--set buildings/bradbury/baseline:output=blender_files/<new-path>.blend` selects a new destination; existing files
are refused. The retained contract and installed textures are required even when the old `.blend` is absent.

AI 652 Phase 2 verified both the retained GLB and a fresh game export against the original scene. The complete parts
manifest matched exactly. GLB image buffers finish asynchronously, so whole-file hashes can differ; resolving the
buffer references showed identical scene JSON semantics and every binary payload byte. Evidence:
`tests/artifacts/screens/ai_652_blender_layout/phase2/`. Backup:
`C:\Users\rogel\Projects\bus_simulator_backups\2026-10-17_bradbury_baseline_phase2\` (88 files, 62,052,568 bytes).

## Building PBR installation (AI 652 Phase 3)

The game catalog includes `terramar_continuous_limestone`, `terramar_sign_coastal_kitchen`,
`terramar_sign_terra_and_mar` and `bradbury_lettering`. Their configs are tracked; maps and `source.json` remain
in the ignored asset store. Retained archives and their provenance are under `blender_inputs/terramar/kit_source/`
and `blender_inputs/bradbury/lettering_source/`. The supplied packs do not specify a license or original URL;
their source records explicitly preserve that uncertainty.

Use the [building-set importer](../tools/pbr_material_importer/README.md) to validate preserved maps and stage
provenance/opacity installation. Historical `make_*_pbr.py` generators document the original transformation;
do not rerun them over installed sets, because they predate catalog registration. The three Terra & Mar sets
retain archive-exact map bytes. Bradbury retains its approved respaced lettering maps.

The Terra & Mar material/soil/podium consumers and Bradbury's `08_frieze.py` use the shared lookup helper.
`trace_sign.py` reads the installed sign opacity slot and writes traced JSON into `blender_inputs/terramar/sign/`;
`--output` selects a separate trace directory. The hand-extracted kit is no longer a build dependency; it is retained.

`node tools/bake.mjs --target buildings/terramar/catalog-check` builds all five Terra & Mar parts, the entry and a
city composition into a new `blender_files/terramar/catalog-candidates/<run-id>/` tree. It reuses the retained
baseline and existing city, reopens every candidate and checks external dependencies. It never replaces active
scenes or publishes. Follow it with the existing AI 651 `ref_3q,rear_3q,entrance` render comparisons; successful
construction alone does not establish visual parity. This is a Phase 3 material check, not Phase 5 full regeneration.

Phase 3 verified the three views with mean differences 0.0096-0.0114/255. Seven front-view pixels retain a maximum
16/255 residual from small rebuild tessellation/sampling differences; repeat/seed controls and geometry analysis
are recorded in `tests/artifacts/screens/ai_652_blender_layout/phase3/final-gate.json`. This is visual parity, not
byte-identical regeneration. The active scenes remain unchanged; candidates are retained separately.

## Layout migration verification

AI 652 Phase 1 passed all six AI 651 before/after views on 2026-10-17: Bradbury `ref_3q,hero_3q,st_corner`;
Terra & Mar `ref_3q,rear_3q,entrance`; 1280 px wide, 128 samples, OptiX only, seed 0 and denoising. Mean differences
were 0.007-0.011 levels out of 255; the largest difference was 5. Evidence is under
`tests/artifacts/screens/ai_652_blender_layout/parity_2026-10-17/`, generated with `scripts/validation/parity_render.py`
and `parity_compare.py` in isolated headless processes. All scene files remained unchanged during rendering.

The original 1,077-file buildings-worktree artifact tree was then preserved byte-for-byte under
`C:\Users\rogel\Projects\bus_simulator_backups\2026-10-17_blender_layout_phase1_retired_sources\source_tree\`,
with `MANIFEST.md` and a SHA-256 inventory in that backup's root. The old artifact directory is absent;
`blender_files/` and `blender_inputs/` are the active stores. Existing backups remain unchanged.

Historical snapshots in `legacy/` remain preserved; byte copies that have not been relinked are archival material,
not validated launch targets. The task's migration receipts identify the relinked active and retained legacy
entries. The retired-source backup preserves the complete original layout for restoring those snapshots by copying
out; never alter or delete that backup. Bradbury's pre-existing stale-wear warning remains until a real wear rebuild.
