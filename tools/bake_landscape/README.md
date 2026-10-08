# Landscape preparation

## Local landscape cache

Everything these leaves publish (manifests, snapshots, payloads, field and
appearance pages, binding aliases, the retained source archive and
`PROVENANCE.json`) is a **local cache** under `assets/public/landscape/<id>/`
(`LANDSCAPE_CACHE_ROOT` in `src/app/landscape/LandscapeCache.js`). The whole
directory is gitignored; it is never committed and never distributed through Git
or Git LFS (AI 595 removed it from the branch history). In worktrees,
`assets/` is a junction to the main checkout, so every worktree shares one cache.
`tests/node/unit/landscape_cache_tracking.test.js` fails if any cache publication
is tracked or staged, or if an ignore rule could re-include the root.

A missing, stale, incomplete or corrupt cache is an availability state, not a
boot failure: `probeLandscapeCache` / `resolveCityLandscape` report `missing`,
`stale`, `incomplete`, `invalid` or `unreachable` with the action to take; the Map
Debugger reference plan and Landscape Fabrication show that report, the landscape
server still serves the viewer (cache requests answer 404 with guidance), and the
bake/authoring tools stop with a `[LandscapeCache] … is not installed` message.

After a clean clone (run `npm ci` first: the bake planner loads every registered
domain), choose one way to obtain the cache. The first bake invocation creates the
shared ignored `tools/baking/blender.local.json` and stops once; the landscape
leaves below need no executable paths except `landscape/appearance`
(`pythonExecutable` with Pillow/NumPy).

1. **Install a cache bundle** (exact canonical data, including the snapshot the
   coastal city pins). A bundle is a copy of one landscape directory, for example
   an extracted archive downloaded from the project's external cache host, or a
   copy of another machine's `assets/public/landscape/coastal-city/`:

   ```sh
   node tools/bake.mjs --target landscape/cache-install --set "landscape/cache-install:bundle=<bundle-directory>"
   node tools/bake.mjs --target landscape/cache-install --set "landscape/cache-install:bundle=<bundle-directory>" --publish
   ```

   See [cache_install/README.md](cache_install/README.md). No external host is
   configured yet; until one is, bundles are shared out of band.
2. **Generate from the source ZIP** (deterministic; two independent runs are
   byte-identical). Obtain `coastal_city_terrain_v2.zip` (SHA-256
   `21702aab6210e2b576666b3fd5a4b6d48884e0372447357bee10dd8ea3d463ce`, the
   user-supplied design archive; conventionally kept in the ignored `downloads/`),
   then publish the terrain leaves in order:

   ```sh
   node tools/bake.mjs --target landscape/coastal-import --set "landscape/coastal-import:source=<source.zip>" --publish
   node tools/bake.mjs --target landscape/hierarchy --publish
   ```

   Then publish `landscape/appearance` (it reads the PBR source images under
   `assets/public/pbr` and needs the shipped `multiscale-v1.json` request; see
   [its README](appearance/README.md)) and `landscape/terrain-fields`
   ([README](terrain_fields/README.md)). AI 595 verified the import and hierarchy
   steps in a clean clone: their output is byte-identical to the canonical cache
   except the current terrain manifest's revision. A regenerated cache carries today's material
   bindings, so it does not contain the older terrain snapshot that
   `CoastalLandscapeCitySpec` pins (`manifest.58fc7471….json`, revision
   `hierarchy-afaf934f8eb8fe074a0affb0`): the city then reports its landscape as
   `stale` until a canonical bundle is installed or the city is explicitly rebound.
3. **Restore this machine's last committed cache** (one-time, local only): the
   pre-rewrite recovery ref `backup/codex-landscape-before-cache-removal-20261008`
   and the local LFS store still hold the published files. AI 595 exported them
   into the ignored cache and verified every hash; the ref and LFS objects stay
   until the user deletes/prunes them.

Validate an installed cache in place at any time with
`node -e "import('./tools/bake_landscape/CacheBundle.mjs').then(async m => console.log((await m.verifyLandscapeCacheBundle('assets/public/landscape/coastal-city')).passed))"`
or by running `landscape/cache-install` without `--publish` against it.

## Preparation leaves

AI577 D5 adds [global terrain fields](terrain_fields/README.md) through
`node tools/bake.mjs --target landscape/terrain-fields`. It analyzes the current
native grid as a whole (depressions, flow, wetness, deposition, rock exposure,
horizons, sky view, shore distance and the natural soil of planning-only samples)
before slicing mask-aligned pages into the additive `fields/` sidecar. It needs no
machine executable, never writes terrain or appearance files, and verifies
deterministic, validated output before an optional manifest-last publication.

D4 adds [independent PBR appearance preparation](appearance/README.md) through
`node tools/bake.mjs --target landscape/appearance`. It derives bounded texture
tiers from existing public material sources while preserving the global catalog,
calibration and current terrain. This separate leaf uses only the shared Python
configuration and does not run height preparation or unrelated bakes.

D3 adds explicit current-source hierarchy maintenance:

```sh
node tools/bake.mjs --target landscape/hierarchy --publish
```

This builds the complete 85-node coastal tree from current saved native chunks,
including authored edits. It preserves source/history and switches the manifest
only after validation. See [the hierarchy workflow](hierarchy/README.md) for
bounded reads, measured errors, snapshot preservation and scoped directories.
It is a separate maintenance leaf, excluded from `all` and the `landscape`
import parent; invoking it does not require the original ZIP.

The explicit `landscape/coastal-import` leaf authenticates the supplied coastal
v2 ZIP, preserves its original files, prepares native terrain chunks and a small
overview, validates every sample and border, and optionally publishes retained
application assets. It uses Node only. It never executes the archived generator,
starts Blender/a browser, or runs lighting/material/visibility bakes.

```sh
node tools/bake.mjs --target landscape/coastal-import --set "landscape/coastal-import:source=<source.zip>" --dry-run
node tools/bake.mjs --target landscape/coastal-import --set "landscape/coastal-import:source=<source.zip>"
node tools/bake.mjs --target landscape/coastal-import --set "landscape/coastal-import:source=<source.zip>" --publish
```

Replace `<source.zip>` with the existing package path. Paths may be absolute or
repository-relative and may contain spaces. The source location is invocation
configuration; no machine path is retained in the manifest or tracked defaults.
The domain entry `node tools/bake_landscape/run.mjs` and leaf entry
`node tools/bake_landscape/coastal_import/run.mjs` accept the same scoped option.
Both use the shared planner. No-argument production `all` excludes this importer.

The framework creates the shared ignored `tools/baking/blender.local.json` on
first use and stops once for setup. This leaf declares `configurationPaths: []`,
so running it again needs no Blender/Python/browser executable paths. Other
domains retain their existing configuration requirements. No separate machine
configuration is introduced.

## Source and retained output

Only SHA-256
`21702aab6210e2b576666b3fd5a4b6d48884e0372447357bee10dd8ea3d463ce`
is accepted by this v2 importer. The ZIP is opened read-only. It is designed,
user-supplied prototype terrain, not survey measurements; the supplied package
does not specify a license. `PROVENANCE.json` records those facts without
inventing attribution or license terms.

Publication owns the local, gitignored cache directory `assets/public/landscape/coastal-city/`:

- `manifest.json`: current schema-1 identity, spatial descriptors, channel
  hashes/sizes, soil mapping, and separate reference inventory.
- `payloads/<sha256>.f32le` and `.u8`: independently readable height and
  land-cover channels. Identical contents share a file.
- `source/<archive-sha256>/`: all 29 supplied files, copied byte for byte,
  including planning records, original rasters, images, OBJ previews, source
  metadata, and the unexecuted Python generator.
- `PROVENANCE.json`: the reproducible source/preparation/rights inventory.

The native 2049-square raster becomes 64 independent 257-square chunks, with
shared edge vertices duplicated exactly. Each native chunk spans 500 meters at
1.953125-meter spacing. A separate 257-square covering overview samples every
eighth native vertex at 15.625-meter spacing. Neither category IDs nor heights
are gamma-corrected, averaged, or taken from preview imagery. The D1 runtime
loads only the manifest and the two overview channels (330,245 payload bytes).
Retained originals are offline provenance, not startup requests.

## Validation and publication

Without `--publish`, the output remains a candidate in the framework run stage.
The importer validates source metadata/checkpoints, all float32 bits and class
IDs in every chunk, all 112 native shared borders, reference hashes, envelopes,
and measured overview error before publication. It writes immutable resources
first and atomically replaces `manifest.json` last through the shared publication
primitive. A corrupt candidate cannot switch the current source. Reimporting
identical data is safe; a changed/authored/hierarchy current manifest is rejected and must
be preserved for an explicit migration rather than overwritten.

Framework plans/checkpoints/logs remain under
`tests/artifacts/screens/ai556_bake_framework/`. The task-specific numeric receipt
is `tests/artifacts/screens/landscape/ai576/d1/import-validation.json`. Re-running
the same command authenticates a completed checkpoint; `--rebuild` repeats the
preparation. Source, importer code, domain contracts, options and published files
all participate in reuse validation.

See [the coastal contract](../../specs/landscape/COASTAL_IMPORT.md) and
[the model/payload contract](../../specs/landscape/LANDSCAPE_MODEL.md). The original
import remains a 65-node root/native preparation; the D3 hierarchy leaf extends
those same spatial IDs with direct intermediate parents. Native source queries
and saved edits use `tools/landscape_authoring`, while streaming owns rendering.

## Tests

Select each test through `tests/.selected_test`, then run
`node tools/run_selected_test/run.mjs`:

- `tests/node/unit/landscape_import.test.js`: PNG/ZIP failures, exact partitioning,
  retained source verification, deterministic rebuild and publication protection.
- `tests/node/unit/landscape_import_framework.test.js`: CPU-only explicit plan,
  scoped source paths, and importer-code checkpoint invalidation.
- `tests/node/unit/landscape_hierarchy.test.js`: all prepared levels, exact errors,
  immutable publication, authored history and all-ancestor edit/revert behavior.
- `tests/node/unit/bake_framework.test.js`: existing framework regression gates.
- `tests/node/unit/landscape_cache_tracking.test.js`, `landscape_cache_availability.test.js`,
  `landscape_cache_install.test.js` and `landscape_cache_cold_checkout.test.js`: the
  AI 595 local-cache guard, availability fallback, bundle installation, and a clean
  clone of the committed branch (fallback, tooling, install and regeneration).

Tests that read the installed coastal cache skip with the install/generate
guidance when it is absent (`tests/shared/landscapeCacheTest.js`).

Import tests reconstruct the original preparation from authenticated retained
source references, so later saved terrain revisions remain independent of that
oracle. Tests never require the original machine-specific ZIP path and write
diagnostic fixtures below the ignored D1/D3 artifact trees.
