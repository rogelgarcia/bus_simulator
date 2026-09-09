# export city

Exports the complete visible source geometry, including off-camera city and scene-owned traffic signals, into a packed Blender scene. Five cameras bind four linked bus placements; view layers exclude unrelated buses from every ray type. Run `export_city/run.mjs` with the shared `:run=` option. `export-city:source=` rebuilds from an explicit hash-verified GLB manifest without opening the game.

See the [workflow README](../README.md) for commands, configuration, provenance and limitations.

```sh
node tools/bake_lighting/experiments/lighting_configurations/export_city/run.mjs --set lighting/experiments/configurations:run=tests/artifacts/screens/illumination_560/runs/<run-id>
```

Without `run`, preparation creates a new run from the tracked poses. Required
tools are configured Chrome and pinned Blender. Outputs live under
`scene/<export-id>/`; the run's `scene.json` points to the authenticated manifest.
Source changes, missing assets, incompatible source manifests or projection errors
fail the stage. A lighting-config change alone does not rebuild city geometry.
