# DONE — Remove the landscape cache from Git history (AI 595)

# Problem

The local `codex/landscape` branch (20 landscape commits on top of `main`) commits the generated landscape cache under `assets/public/landscape/**` as Git LFS content: manifests, field/appearance pages, payloads, the coastal source archive and its material masks. The landscape implementation has to be rebased into `main` later, but the cache must never be committed to or distributed through Git or Git LFS. Deleting the files in a commit at the branch tip is not enough, because the earlier commits would still carry the LFS pointers and objects.

In this prompt, "landscape cache" means the generated publication data under `assets/public/landscape/**`. It does not mean the AI577 runtime GPU surface cache (`src/graphics/engine3d/landscape/LandscapeSurfaceCache.js`), which is source code and stays.

# Request

Rewrite `codex/landscape` so the landscape implementation looks as though `assets/public/landscape/**` had never been committed. Make the cache a gitignored local/runtime artifact produced by the existing bake framework. Make a missing cache a supported runtime condition. Enforce all of this with tests. Push nothing.

Tasks:

1. Rewrite the branch history.
   - Remove every generated landscape manifest, page, payload, source archive, preview, raw terrain file and other cache/publication output from every commit in `main..codex/landscape`.
   - Preserve the landscape source code, tools, tests, specifications, prompt completions and intended small authored configuration. This includes the PBR-side changes the landscape commits made under `assets/public/pbr/` (see the hazards section).
   - Before rewriting, create a clearly named local-only recovery ref pointing at the current tip, for example `backup/codex-landscape-before-cache-removal-20261008`. Never push it.
   - Rewrite deterministically in an isolated clone, scoped to the landscape commits only. `main`'s commits and hashes must stay unchanged, and `bc8669d2` must remain the merge base. Prefer `git-filter-repo`, or use another deterministic method that removes the paths from every commit.
   - Pass the repository identity on every commit-producing rebase, amend or commit: `git -c user.name="rogelgarcia" -c user.email="idrogelgarcia@gmail.com" ...`.
   - Keep the logical commit history when practical. Squashing is acceptable only if it is materially safer, and the final commit message must then clearly record the rewritten landscape implementation.

2. Make the cache local-only.
   - Keep generated landscape data in a gitignored local/runtime cache location. It may stay at `assets/public/landscape` only if that entire directory is ignored and no file beneath it can be staged. Otherwise, introduce one documented external/local cache root and update runtime and tool resolution to use it.
   - Keep using `node tools/bake.mjs` and the hierarchy in `tools/baking/README.md` and `specs/tools/bake_framework.md`. Do not add another standalone bake command.
   - Preserve manifest-last publication, hashing, validation, locking, rollback and resumability.
   - Treat a missing or incomplete cache as an availability/fallback condition (for example, the city boots without the coastal landscape and reports why), not as a boot failure.
   - Document how a developer or a deployment restores, generates, installs or externally downloads the cache and its source inputs after a clean clone. Do not rely on Git LFS for landscape cache distribution.
   - Update the specs and READMEs that currently describe the cache as tracked content (see the list under "Verified current state").

3. Add enforcement.
   - Make sure `.gitignore` cannot unignore `assets/public/landscape/**` (or the new cache root). Remove the existing `!/assets/public/landscape/` re-include.
   - Add a validation/test that fails when any landscape cache payload, page, source archive, generated manifest, raw terrain file or similar publication is tracked or staged.
   - Verify that a clean checkout of the rewritten branch contains no landscape cache and can still run the appropriate fallback and tooling paths.
   - Verify that the bake workflow can generate or install the ignored cache locally.
   - Keep test fixtures minimal. Put generated evidence (logs, reports, inventories) under `tests/artifacts/landscape_cache_history/`.

4. Validate the rewritten history.
   - Every commit in `main..codex/landscape` has zero tracked paths under `assets/public/landscape/**`.
   - `git log main..codex/landscape -- assets/public/landscape` returns nothing.
   - `git ls-files assets/public/landscape` returns nothing.
   - No generated landscape cache object appears in the rewritten branch's Git or LFS object inventory: check the objects reachable from `main..codex/landscape`, not `--all`, because the recovery ref still holds them on purpose.
   - The unrelated PBR/Bradbury working files remain byte-identical (see the hazards section).
   - Run the focused tests for the landscape framework, runtime fallback, cache publication and cold checkout.

5. Commit the repaired implementation without cache files.
   - Commit the `.gitignore`, runtime, tooling, test and documentation changes on the rewritten branch, following `ai_rules/PROJECT_RULES.md` commit rules and the identity above.
   - Include this prompt file, renamed to DONE, in the repair commit. It is untracked when this prompt is created, so make sure the branch move does not lose it.

## Constraints

- Do not push anything: no `git push`, no `git lfs push`, and no new remote refs. The user will rebase and push later.
- Do not drop or pop the stash `30047fb0` ("On main: preserve PBR catalog before landscape history rollback"). The stash stack is shared by all worktrees.
- Do not stage, discard, restore, stash or clean the unrelated PBR/Bradbury working files.
- Do not delete the recovery ref, and do not prune LFS objects. Leave both for the user.
- If an authored file under `assets/public/landscape/**` turns out to be needed source of truth (for example, authored terrain edits or history that the bake cannot regenerate) and is not clearly small configuration, stop and ask the user before deciding where it lives.

## Verified current state (2026-10-08)

- `main` = `origin/main` = `bc8669d20bd6e2ac15569f209f526c1e88e64ee2`, and it is an ancestor of `codex/landscape`.
- `codex/landscape` = `0a47e2c02a501650178d34ad69913d477eb5a2cc`, local-only, 20 commits from `5303585b` ("add validated coastal terrain viewer (D1)") to `0a47e2c0` (AI577 D7). All 20 are authored by `rogelgarcia <idrogelgarcia@gmail.com>`.
- 417 files under `assets/public/landscape/coastal-city/` are tracked at the tip: 150 in `payloads/`, 112 in `fields/pages/`, 109 in `appearance/pages/`, 29 in `source/21702aab…/` (including `material_masks/`), plus `PROVENANCE.json` and the hashed and pointer `manifest*.json`, `binding.*.json` and `multiscale*.json` files.
- 7 commits touch those paths: `5303585b`, `891212eb`, `0053346e`, `0517c185`, `ddb707b2`, `de6e01c3` and `15ed6c97`. Each also changes code, so none should become empty. Expect 20 → 20 commits unless you choose to squash, and report any commit that does become empty.
- `.gitattributes` routes `assets/public/** filter=lfs`. Line 7 of `.gitignore` re-includes `!/assets/public/landscape/` and only ignores locks, partials and interrupted markers beneath it.
- `git-filter-repo` is not installed (`git: 'filter-repo' is not a git command`). Installing it is a download, so ask the user first, or use an equivalent deterministic method in the isolated clone. `git-lfs` 3.7.1 is available.
- Runtime and tools hard-code the cache location:
  - `src/app/city/specs/CoastalLandscapeCitySpec.js:9` pins the content-hashed `manifest.58fc7471….json`.
  - `src/app/landscape/LandscapeCityBinding.js:19` requires the `assets/public/landscape/` prefix.
  - Defaults point there in `src/graphics/gui/landscape_fabrication/LandscapeView.js:32`, `tools/bake_landscape/jobs.mjs:15`, `AppearanceJob.mjs`, `HierarchyJob.mjs`, `terrain_fields/TerrainFieldsJob.mjs`, `tools/landscape_authoring/run.mjs` and `tools/landscape_server/Server.mjs:10`.
  - Decide how a source-tracked hash pin coexists with a regenerated, ignored cache: deterministic regeneration to the same hash, or resolution through a pointer manifest, with a mismatch reported as unavailable.
- Docs that describe the cache path: `specs/landscape/{COASTAL_IMPORT,LANDSCAPE_AI577_SURFACES,LANDSCAPE_APPEARANCE,LANDSCAPE_CITY_BINDING,LANDSCAPE_HANDOFF,LANDSCAPE_MODEL,LANDSCAPE_VIEWER}.md`, `tools/bake_landscape/README.md` and the `appearance`, `hierarchy` and `terrain_fields` READMEs under it. The bake leaves are `landscape/coastal-import`, `landscape/hierarchy`, `landscape/appearance` and `landscape/terrain-fields` in `tools/baking/README.md`.

## Hazards found while preparing this prompt

- **`assets/` in this worktree is a junction into the main checkout** (`C:\Users\rogel\Projects\bus_simulator\assets`), and so are `docs/`, `downloads/` and `node_modules/`. The shared store currently has no `assets/public/landscape/` directory at all, which is why all 417 tracked cache files show as ` D`. The other ~151 status lines (` M assets/public/pbr/_catalog_index.js`, ` D`/`??` PBR configs, untracked `bradbury_*` materials) are the user's unrelated material state in the shared store compared against this branch's index.
  - Any `git reset --hard`, `checkout -f`, `checkout -- <path>`, `restore`, `clean` or `stash` in this worktree writes into the main checkout's assets and can destroy that work.
  - Move `codex/landscape` to the rewritten tip in a way that leaves every working-tree file untouched (index-only).
  - Before and after the move, record a path + hash inventory of `assets/public/pbr/` and prove the two inventories are identical.
- **The landscape commits also change about 90 PBR files.** These are catalog-wide `pbr.material.config.js` edits, `pbr.landscape.config.json` files, the new `landscape_*_v1` materials and `_catalog_index.js`. They are authored configuration outside the rewrite path and must survive the rewrite unchanged. Because they overlap with the user's uncommitted PBR changes, never stage any of them from the working tree.
- **The cache only exists in Git/LFS right now.** The coastal source archive (`coastal-city/source/21702aab…/`, including `material_masks/`) and the last published cache exist only as objects in the old history; the shared LFS store `C:\Users\rogel\Projects\bus_simulator\.git\lfs` is about 269 MB.
  - Before rewriting, export the source inputs and the published cache from `0a47e2c0` into the new ignored cache/source location, or into a documented local backup outside Git.
  - Verify the exported files against `PROVENANCE.json` and the manifest hashes, so the cache can still be regenerated or installed after the rewrite.
- **Content-hashed manifest names make regeneration observable.** If a regenerated cache does not reproduce `manifest.58fc7471….json`, the city spec pin breaks. Cover that case with a test and with the fallback.

## Completion record — 2026-10-08

### Summary (one line per change)

- **History rewrite:** removed `assets/public/landscape/**` from all 20 commits of `main..codex/landscape` with `git filter-branch --index-filter` in an isolated bare clone (20 → 20 commits, none empty, author/committer/date/message byte-identical, `bc8669d2` unchanged as `main` and merge base; two independent runs produced the same tip).
- **Recovery ref:** local branch `backup/codex-landscape-before-cache-removal-20261008` → `0a47e2c0` (never pushed; LFS objects not pruned).
- **Branch move:** `codex/landscape` moved `0a47e2c0` → `37257b9d` index-only (`git update-ref` + `git read-tree`); no working-tree file was written. The repair commit sits on top.
- **Cache export:** the 417 published files of `0a47e2c0` (234.2 MiB) were copied from the local LFS store into the ignored cache `assets/public/landscape/coastal-city/` (shared store) and authenticated: 380 by content-addressed name, 29 source files by `PROVENANCE.json` records, 8 pointers/aliases by schema, 1,700 hashed records. No manifest holds authored operations/regions, so nothing needed a user decision.
- **Ignore rules:** `.gitignore` drops the `!/assets/public/landscape/` re-include and the lock/partial rules and ignores `/assets/public/landscape/` as one directory.
- **Runtime fallback:** new `src/app/landscape/LandscapeCache.js` (`LANDSCAPE_CACHE_ROOT`, `LANDSCAPE_DEFAULT_DIRECTORY`, `probeLandscapeCache`, `describeLandscapeCacheAvailability`) and `resolveCityLandscape`; the Map Debugger reference plan, Landscape Fabrication and the landscape server report `missing` / `stale` / `incomplete` / `invalid` / `unreachable` with the action instead of failing.
- **Tooling:** landscape bake/authoring/server defaults come from the shared constant; a missing manifest stops tools with `[LandscapeCache] … is not installed` guidance; new registered leaf `landscape/cache-install` (`CacheBundle.mjs`, `CacheInstallJob.mjs`, `cache_install/run.mjs`) authenticates a bundle and installs it under the authoring lock, immutable files first and pointers last, never over an unretained local revision, with pointer rollback.
- **Enforcement and tests:** `landscape_cache_tracking`, `landscape_cache_availability`, `landscape_cache_install`, `landscape_cache_cold_checkout`; 20 existing cache-reading node tests now skip with install/generate guidance via `tests/shared/landscapeCacheTest.js`.
- **Docs:** "Local landscape cache" in `tools/bake_landscape/README.md` (install / download / regenerate / restore), `cache_install/README.md`, framework README + `specs/tools/bake_framework.md`, `PROJECT_TOOLS.md`, the seven landscape specs and the leaf/authoring/server READMEs.

### Branch tips and commit map

- Old tip: `0a47e2c02a501650178d34ad69913d477eb5a2cc` (recovery ref `backup/codex-landscape-before-cache-removal-20261008`).
- Rewritten tip: `37257b9df5bbabae91e991cb3defc73fee9fb7fc`; the AI 595 repair commit (this file) is its child and the new `codex/landscape` tip.
- No commit was dropped or squashed. "landscape paths removed" counts the cache paths each original commit carried.

| # | old | new | landscape paths removed | other diff | metadata | empty | subject |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 5303585b | 5f861c47 | 143 | 0 | same | no | feat(landscape): add validated coastal terrain viewer (D1) |
| 2 | 31bfb8f5 | 3d42cef8 | 143 | 0 | same | no | feat(landscape): add bounded native terrain authoring (D2) |
| 3 | 891212eb | dacead4c | 183 | 0 | same | no | feat(landscape): stream terrain detail within resource budgets (D3) |
| 4 | 0053346e | 6d0eeffd | 239 | 0 | same | no | feat(landscape): stream soil appearance and coastal water (D4) |
| 5 | e68d47d5 | 759f6819 | 239 | 0 | same | no | feat(landscape): add bounded polygon grading and smoothing (D5) |
| 6 | 63740d3c | a2e9dc5f | 239 | 0 | same | no | feat(landscape): add city binding and terrain planning tools (D6) |
| 7 | ca028901 | 1375aab7 | 239 | 0 | same | no | test(landscape): validate coastal workflow and streaming budgets (D7) |
| 8 | b0d85dc2 | 02b89d47 | 239 | 0 | same | no | Add landscape free-flight navigation and game POV |
| 9 | 0517c185 | 2dfdaf9f | 252 | 0 | same | no | Add natural landscape materials and distance-aware blending |
| 10 | a092a0d6 | e9bf98b9 | 252 | 0 | same | no | feat(landscape): add continuous surface coverage |
| 11 | ddb707b2 | 4b43f3f2 | 285 | 0 | same | no | feat(landscape): add uniform materials and height transitions |
| 12 | 92e3881a | afd08161 | 285 | 0 | same | no | fix(landscape): serve the junctioned shared asset store from the workt |
| 13 | 8f1bcf8f | 04ec6223 | 285 | 0 | same | no | feat(landscape): add generated fine surface coverage pages (AI577 D2) |
| 14 | 5a8ca5cf | a2da6863 | 285 | 0 | same | no | feat(landscape): add stochastic hex-tiled material sampling (AI577 D3) |
| 15 | de6e01c3 | c4547971 | 303 | 0 | same | no | feat(landscape): add distinct macro, local and micro detail (AI577 D4) |
| 16 | 15ed6c97 | 22e43d75 | 417 | 0 | same | no | feat(landscape): add terrain-driven natural appearance and lighting (A |
| 17 | 3993a90d | cf2ba169 | 417 | 0 | same | no | perf(landscape): compile inspection and terrain appearance as program  |
| 18 | 7ce1b19f | bca3158f | 417 | 0 | same | no | feat(landscape): add runtime surface cache core, off by default (AI577 |
| 19 | 7889ba76 | 5a01cd3c | 417 | 0 | same | no | feat(landscape): complete the opt-in runtime surface cache (AI577 D6) |
| 20 | 0a47e2c0 | 37257b9d | 417 | 0 | same | no | feat(landscape): complete integrated acceptance and enable the surface |

### Final cache location and how to obtain it

- Location: `assets/public/landscape/<id>/` (default `assets/public/landscape/coastal-city/`), gitignored as a whole; in worktrees it lives in the shared junctioned store, so every worktree sees one cache.
- Install a bundle (exact canonical data, keeps the city pin): `node tools/bake.mjs --target landscape/cache-install --set "landscape/cache-install:bundle=<bundle-directory>" --publish`.
- Download: no external host exists yet; a deployment downloads and extracts a copy of `coastal-city/` and installs it with the command above.
- Generate: `npm ci`, then `landscape/coastal-import` (with `downloads/coastal_city_terrain_v2.zip`, SHA-256 `21702aab…`) and `landscape/hierarchy` with `--publish`, then `landscape/appearance` and `landscape/terrain-fields` as their READMEs describe. Import + hierarchy were verified in clean clones: deterministic (two runs byte-identical, 183 files) and identical to the canonical cache except the current terrain manifest's revision (`hierarchy-0f0832804030201d7cabeec2` vs `materials-bfcf20f7e27aa79db4d9983b`), because the importer now emits the uniform material bindings. A regenerated cache therefore never contains the city pin `manifest.58fc7471….json`; the city then reports `stale` (tested) until a canonical bundle is installed or the city is explicitly rebound. Appearance/terrain-field regeneration was not run, to avoid writing PBR catalog metadata into the user's shared `assets/public/pbr`.
- Restore on this machine: done; the recovery ref and LFS store remain as backup.

### Commands used

Rewrite (scripts kept under `tests/artifacts/landscape_cache_history/scripts/`):

```sh
git clone --quiet --bare /c/Users/rogel/Projects/bus_simulator <isolated>
git -C <isolated> config core.longpaths true
git -C <isolated> update-ref refs/heads/main bc8669d20bd6e2ac15569f209f526c1e88e64ee2
git -C <isolated> update-ref refs/heads/codex/landscape 0a47e2c02a501650178d34ad69913d477eb5a2cc
FILTER_BRANCH_SQUELCH_WARNING=1 GIT_LFS_SKIP_SMUDGE=1 git -C <isolated> -c user.name="rogelgarcia" -c user.email="idrogelgarcia@gmail.com" \
  filter-branch --index-filter 'git rm -r --cached --ignore-unmatch --quiet -- assets/public/landscape' -- main..codex/landscape
git branch backup/codex-landscape-before-cache-removal-20261008 0a47e2c02a501650178d34ad69913d477eb5a2cc
git fetch --no-tags --quiet <isolated> refs/heads/codex/landscape
git update-ref -m "AI595: rewrite codex/landscape without assets/public/landscape (filter-branch index-filter)" \
  refs/heads/codex/landscape 37257b9df5bbabae91e991cb3defc73fee9fb7fc 0a47e2c02a501650178d34ad69913d477eb5a2cc
git read-tree 37257b9df5bbabae91e991cb3defc73fee9fb7fc
```

Verification: `verify_rewrite.sh` (pairwise tree diff, metadata hash, emptiness, parent), `verify_objects.sh` (objects reachable from `main..codex/landscape` vs every historical landscape blob and LFS oid), `git log main..codex/landscape -- assets/public/landscape`, `git ls-files assets/public/landscape`, `export_cache.sh` + `verify_cache.mjs` (export authentication), and path + SHA-256 inventories of `assets/public/pbr` (`find … | sha256sum`).

### Verification results

- Every rewritten commit: 0 paths under `assets/public/landscape`; `git log main..codex/landscape -- assets/public/landscape` and `git ls-files assets/public/landscape` are empty.
- Object inventory of `main..codex/landscape` (excluding the recovery ref): 1,388 objects, 93 LFS pointers (PBR configs); overlap with the 409 historical landscape blobs / 409 landscape LFS oids: 0.
- PBR working files: 799-file path + SHA-256 inventory identical before and after the branch move (inventory hash `55e8702d…`); the 151 `git status` lines for `assets/public/pbr` identical. Stash `30047fb0` untouched.
- `landscape_cache_tracking` 3/3, `landscape_cache_availability` 9/9, `landscape_cache_install` 5/5; the tracking guard was also shown to fail against the old `.gitignore` and against an index loaded from `0a47e2c0`.
- Landscape node suite (64 files + `bake_framework`), cache installed: 448 tests, 445 pass, 3 fail — pre-existing `ERR_MODULE_NOT_FOUND` for `assets/public/pbr/{landscape_sand_micro_v1,aerial_beach_01,landscape_soil_uniform_v1}/pbr.material.config.js`, which are deleted in the user's shared PBR store (not changed by AI 595).
- Same suite with the cache hidden by an fs preload (and the missing PBR modules stubbed): 452 tests, 361 pass, 0 fail, 91 skipped with guidance, zero cache reads.
- Clean checkout (`landscape_cache_cold_checkout`, 3/3 on a scratch commit with this exact tree, 14.5 s): no cache checked out; the cache tests pass and skip with guidance in the clone; the server serves the viewer and answers cache requests with 404 guidance; `landscape/hierarchy` and the authoring CLI stop with `[LandscapeCache] … is not installed`; `landscape/cache-install --publish` installs into the clone's ignored cache (clean `git status`, nothing skipped afterwards, byte-exact city pin); import + hierarchy regenerate the cache and the city reports `stale`. The run against the repair commit writes `tests/artifacts/landscape_cache_history/cold*.txt`.
- Browser: Landscape Fabrication cannot boot from the shared store because ~90 PBR configs are missing there (pre-existing). In the browser against the landscape server, `probeLandscapeCache`/`resolveCityLandscape` authenticated the pinned manifest and overview with Web Crypto (`available`) and reported an uninstalled landscape as `missing` with the guidance.

Evidence: `tests/artifacts/landscape_cache_history/` (commit map, object inventories, export verification, PBR inventories, generation check, suite logs, rehearsal log, scripts).

### Deployment work still required

- Choose and provision an external host for cache bundles (for example an archive of `coastal-city/` per canonical revision) and document its URL; until then bundles move out of band.
- After the user approves and the rewritten branch is rebased and pushed: delete `backup/codex-landscape-before-cache-removal-20261008` and prune LFS objects (`git lfs prune`); both were deliberately left.
- Restore the ~90 `assets/public/pbr/*/pbr.material.config.js` files missing from the shared store (user state; blocks Landscape Fabrication and three landscape asset tests).
- Optionally rebind `CoastalLandscapeCitySpec` to a regenerated revision if regeneration (not bundles) becomes the distribution path.
- Original commit messages are unchanged and still describe the data they used to publish.

### Follow-up: PBR configuration out of Git LFS — 2026-10-08

A review found that the branch still stored its small authored PBR configuration as Git LFS pointers (because of
the `assets/public/** filter=lfs` rule), while `main` tracks nothing under `assets/` and has no LFS files.

- **Second rewrite:** `main..codex/landscape` was rewritten again in an isolated bare clone with a filter-branch
  index filter. Each of the 93 PBR pointer versions became its exact content blob (every one verified against its
  LFS oid and size), and from the first commit that tracks PBR configuration (D4) onward `.gitattributes` lifts the
  LFS rule for `_catalog_index.js`, `pbr.material.config.js`, `pbr.material.correction.config.js` and
  `pbr.landscape.config.json` (`!filter !diff !merge -text`). Two independent runs produced the same tip.
- **Exact bytes:** three configs are CRLF (`bradbury_top_band_terracotta_ornament`,
  `bradbury_wall_terracotta_brick_tileable`, `dry_litter`); the published appearance bindings record their SHA-256,
  so `-text` keeps every config byte-identical instead of normalizing line endings.
- **Result:** 0 LFS pointers reachable from `main..codex/landscape`, `git lfs ls-files` empty at the tip, commits 1–3
  unchanged, 19 commits rewritten with identical author/committer/date/message; still no landscape cache path.
- **Hashes:** the hashes earlier in this record predate the follow-up: rewritten D7 `37257b9d` → `f132da48`, AI 595
  repair `7ec55f13` → `1fc9f1e4`, cold-checkout cleanup `59f38ab8` → `38293972`. Full map:
  `tests/artifacts/landscape_cache_history/pbr_plain_git/rewrite_commit_map.md`. Recovery ref (local only):
  `backup/codex-landscape-before-pbr-plain-git-20261008` → `59f38ab8`.
- **Safety:** the branch moved index-only again; `git status` (161 lines) and the 799-file `assets/public/pbr`
  inventory are identical before and after.
- **Guards:** `tests/node/unit/pbr_config_storage.test.js` (no pointer in index or HEAD; tracked and future config
  paths resolve to no LFS filter and `-text`); the clean-checkout test imports the committed PBR catalog without LFS.
- **Remote `main` and tags:** reviewed and left unchanged. They hold 11 raw binary blobs (10.6 MiB): 3 current files
  (`favicon.ico`, the basis transcoder `.wasm`, a precomputed bigcity2 bake) and 8 history-only January 2026 files
  (7 textures and an old Rapier `.wasm`) that predate the landscape work; purging them would mean rewriting `main`
  and its tags, which this prompt forbids.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to `prompts/AI_DONE_codex_landscape_595_PROJECTMAINTENANCE_remove_landscape_cache_from_git_history_DONE.md`
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change
- Report:
  - the old and new branch tips and the recovery ref name
  - an old → new commit map, listing rewritten, dropped or squashed commits
  - the final cache location, with restore/generate/install instructions
  - the exact rewrite and verification commands used
  - test results
  - the before/after PBR inventory comparison
  - the deployment work still required (for example, an external cache download host, or LFS pruning and recovery-ref deletion once the user approves)
