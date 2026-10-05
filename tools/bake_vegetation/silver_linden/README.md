# Silver linden authoring

Run `node tools/bake.mjs --target vegetation/silver-linden` to stage and validate
three mature forms, or add `--publish` to install them with a retained rollback.

`recipe.json` owns botanical shape, original texture parameters, deterministic
structural variants and detail-first woody settings. Optimization is deferred;
the safety ceiling guards failed generation rather than setting a runtime budget.
Shared implementation lives in
`../authoring/`; the [domain README](../README.md) documents the full contract.
Output: `assets/public/vegetation/silver_linden/mature_{01,02,03}.glb`.
Packed editable sources accompany them in `authoring/mature_{01,02,03}.blend`.
