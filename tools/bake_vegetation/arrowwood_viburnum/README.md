# Arrowwood viburnum authoring

Run `node tools/bake.mjs --target vegetation/arrowwood-viburnum` to stage and validate
three mature forms, or add `--publish` to install them with a retained rollback.

`recipe.json` owns botanical shape, original texture parameters, deterministic
structural variants and detail-first woody settings. Optimization is deferred;
the safety ceiling guards failed generation rather than setting a runtime budget.
Shared implementation lives in
`../authoring/`; the [domain README](../README.md) documents the full contract.
Output: `assets/public/vegetation/arrowwood_viburnum/mature_{01,02,03}.glb`.
Packed editable sources accompany them in `authoring/mature_{01,02,03}.blend`.

Revision v5 adds varied basal curves, thickness and oval sections, and integrated
root flares ending flush at ground zero. `vegetation/prototype-shrub` stages
only `mature_01` for review and rejects publication. Foliage is unchanged.

`assets/public/vegetation_sources/bark_brown_02/` retains Rob Tuytel's
[Bark Brown 02](https://polyhaven.com/a/bark_brown_02) 2K color, height,
OpenGL normal and roughness PNGs under
[CC0](https://polyhaven.com/license). Powered by Poly Haven.
`source/source.json` records retrieval date, original download URLs and SHA-256 hashes.
The original tile covers approximately 1m; it is adapted to fine shrub-scale
bark with a 0.32m vertical repeat and one circumference per stem. This is generic
photographed bark, not a botanical scan of Viburnum dentatum. The staged and
published sources are authenticated as well as the derived runtime maps.
