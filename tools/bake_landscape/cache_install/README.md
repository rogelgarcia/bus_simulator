# Landscape cache bundle installation

`landscape/cache-install` installs a **cache bundle** into the local, gitignored
landscape cache (AI 595). A bundle is a plain directory with the layout of one
landscape cache directory, e.g. a copy of `assets/public/landscape/coastal-city/`
from another machine or an extracted archive downloaded from an external cache
host. Bundles never travel through Git or Git LFS.

```sh
node tools/bake.mjs --target landscape/cache-install --set "landscape/cache-install:bundle=<bundle-directory>"
node tools/bake.mjs --target landscape/cache-install --set "landscape/cache-install:bundle=<bundle-directory>" --publish
```

`directory` defaults to `auto`: the bundle's own landscape id directory under the
cache root (`assets/public/landscape/<id>`, `landscapeCacheDirectory`), so a
`coastal-city` bundle installs into `assets/public/landscape/coastal-city` and a
`coastal-city-v3` bundle into `assets/public/landscape/coastal-city-v3` (AI 596 D4:
the city pins v3 while the viewer default stays v2). Set
`landscape/cache-install:directory=<path>` to install elsewhere; a directory that
already holds another landscape (a different manifest id) is refused before
anything is written. `node tools/bake_landscape/cache_install/run.mjs` is the
equivalent shared-planner entry. The leaf is Node-only (`configurationPaths: []`),
always re-verifies (`always: true`), and stays outside `all` and the `landscape`
import parent.

## Verification

Before anything is written, every file of the bundle must authenticate:

- content-addressed files (`payloads/<sha256>.*`, `pages/<sha256>.*`,
  `manifest.<sha256>.json`, `multiscale.<sha256>.json`) by their name;
- every other file through a `{url, sha256, byteLength}` record in a manifest,
  sidecar or `PROVENANCE.json` (this covers the retained source archive);
- current pointers (`manifest.json`, `appearance/manifest.json`,
  `appearance/multiscale.json`, `fields/manifest.json`, `geology/manifest.json`,
  `surround/manifest.json`), binding aliases and `PROVENANCE.json` by schema;
  `manifest.json` must validate as a landscape manifest, and so must the AI 596 D5
  far-field surround `surround/manifest.json` (its own saved landscape: payloads and
  `surround/manifest.<sha256>.json` snapshot content addressed), whose
  `provenance.preparation.surround` must name the terrain manifest's id, revision
  and current `manifest.json` SHA-256 (a surround of another terrain revision fails).

Links, devices, transient authoring state (`authoring.lock`, `*.partial`,
`authoring-interrupted-*.json`), unreadable JSON, dangling or mismatched records
and unauthenticated files fail the run. The report is written to the framework
stage and to `tests/artifacts/landscape_cache_history/cache-install-validation.json`.

## Publication

With `--publish`, installation runs under the landscape authoring lock:

1. A destination pointer that differs from the bundle's is replaced only when the
   bundle retains its bytes (for example as `manifest.<sha256>.json`); otherwise
   the run stops before writing, so local authored revisions are never lost.
2. Immutable files are written first (identical existing files are accepted, a
   different existing file is refused), then binding aliases.
3. Current pointers switch last: appearance, multiscale, field, geology and surround
   sidecars, then the terrain `manifest.json`. A failed switch restores the previous pointers.
4. The installed directory is re-verified with the same rules.

Reruns and resumed partial installs converge to the same authenticated result.
Tests: `tests/node/unit/landscape_cache_install.test.js` and the install step of
`tests/node/unit/landscape_cache_cold_checkout.test.js`.
