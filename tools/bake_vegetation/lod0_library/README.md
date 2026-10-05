# LOD0 catalog publication

Run `node tools/bake.mjs --target vegetation/lod0-library --publish` to install
the accepted AI591 set in `assets/public/vegetation_lod0/`. Without `--publish`
the same operation stages and validates a library. `source` must identify a
review directory under `tests/artifacts/screens/`.

The leaf preserves review-only `vegetation/lod0` publication guards, checks all
15 budgets, manifold/error reports, compression quality and texture hashes, then
uses the shared rollback publisher. Geometry and KTX2 texels are unchanged;
textures are externalized so all three forms reuse the same canopy URLs.
Per-variant wood maps remain separate. Library manifests authenticate all files,
retain CC0 credits and report actual wood/leaf counts. Reference/review masters
remain available for reproducible bakes. No installed city tree is replaced.
