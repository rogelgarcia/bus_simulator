# Material bakes

Use `node tools/bake_materials/run.mjs`, or run a single material's `run.mjs` in
its named child folder. See [`../baking/README.md`](../baking/README.md) for setup,
common options, dry-run, hashes and checkpoints.

Children: `burnt_cement_panel`, `bronze_anodized_panel`, `red_sandstone_block`,
`red_sandstone_noise`, `terracotta_smooth`, `rusticated_ashlar`, `limestone_smooth`,
`brownstone`, and `grass`. Each owns one existing material recipe, including its
material-space AO output. Cycles illumination samples do not affect these recipes.

The existing generator implementations now accept optional `--output` and
`--material` arguments, retaining their original no-argument compatibility behavior.
Framework calls always stage procedural output and validate map dimensions before
optional `--publish`. Previous material directories are retained for rollback.
Grass V2 is generated and authenticated as a proposal; its existing gameplay asset
review is not bypassed by `--publish`.

The explicit maintenance leaf `dry_litter` repairs the known truncated supplied
ORM map, preserving complete rows and the independent AO source. It is registered
outside the default material tree. Use `node tools/bake.mjs --target materials/dry_litter`
and add `--publish` to replace the validated map. See [its repair contract](dry_litter/README.md).

The explicit browser-only `materials/grass/lod4-layout` leaf compiles the debug
field's two compatible optimized 2 m leaf layouts, authenticates them against the source,
and validates ordinary scene loading before optional publication. It skips
both pattern searches at runtime while retaining the final texture bake.
See [the layout compiler](grass/lod4_layout/README.md).
