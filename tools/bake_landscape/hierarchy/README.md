# Current-source hierarchy preparation

Run this explicit Node CPU leaf through the shared bake framework:

```sh
node tools/bake.mjs --target landscape/hierarchy --dry-run
node tools/bake.mjs --target landscape/hierarchy
node tools/bake.mjs --target landscape/hierarchy --publish
```

The default source and optional publication directory is
`assets/public/landscape/coastal-city`, the gitignored
[local landscape cache](../README.md#local-landscape-cache). Use the scoped setting
`--set "landscape/hierarchy:directory=<saved-landscape-directory>"` for another
saved landscape. `node tools/bake_landscape/hierarchy/run.mjs` is the equivalent
shared-planner entry point. This maintenance leaf is excluded from `all` and the
`landscape` import parent, so requesting it never reimports a ZIP or starts
unrelated bakes. It uses the shared local configuration with no executable paths.

Preparation authenticates the **current native channels**, including saved edits,
then creates every missing intermediate level and measures all derived errors.
It preserves native float32 bits, category IDs, operation/soil history, references,
and stable spatial IDs. No original download is needed. The coast contains 85
nodes: 1 + 4 + 16 + 64, each with 257-square height and category channels.

Native chunks are read sequentially, with at most one resident native chunk and
one derived node's fixed arrays. There is no full source-grid allocation. Working
array admission is 4 MiB; the coastal estimate is 1,585,176 bytes, excluding
bounded manifest metadata, process overhead and filesystem caches. Each node's
exact maximum vertical error compares its NW-SE triangulation against every
descendant native vertex. The receipt records repeated reads, comparisons,
native seams, per-level errors and admitted bytes.

Without `--publish`, candidates remain in the framework stage. With it, the same
exclusive authoring lock protects preparation/publication. Source identity and
framework input checks must still match before switching. All staged channels
and an upgraded prior-batch snapshot are authenticated before immutable files
are installed, and the validated current manifest is replaced atomically last.
Both old and new saved manifests remain available. A changed hierarchy receives
a new revision; an identical repeat preserves the revision. Native authority is
unchanged in either case.

If the last batch predates complete hierarchy preparation, its saved pre-batch
snapshot is upgraded too. Last-batch revert therefore restores a complete tree
without losing accepted batch IDs. Subsequent edits rebuild all affected
ancestors with conservative errors; rerun this leaf to measure tight errors.

The validation receipt is
`tests/artifacts/screens/landscape/ai576/d3/hierarchy-validation.json`.
`tests/node/unit/landscape_hierarchy.test.js` covers exact samples/errors,
repeatability, corrupt current/revert candidates, affected/unaffected ancestors,
and authored pre-hierarchy snapshot migration using isolated fixtures. See
[the hierarchy contract](../../../specs/landscape/LANDSCAPE_HIERARCHY.md).
