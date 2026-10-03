# Coastal import leaf

This entry selects `landscape/coastal-import` in the shared bake planner:

```sh
node tools/bake_landscape/coastal_import/run.mjs --set "landscape/coastal-import:source=<source.zip>" --publish
```

The preferred master command is `node tools/bake.mjs --target
landscape/coastal-import` with the same scoped source option. See the
[landscape preparation README](../README.md) for source authentication, retained
outputs, CPU-only configuration, validation and publication gates.
