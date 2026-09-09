# Refresh comparisons

```sh
node tools/bake_lighting/experiments/lighting_configurations/review/run.mjs --set lighting/experiments/configurations:run=tests/artifacts/screens/illumination_560/runs/<run-id>
```

Sequentially verifies the saved Blender poses, captures/reuses native game display references, postprocesses both pilot/final EXRs, analyzes them and rebuilds the comparison pages. Requires completed pilot and final render manifests. It never exports geometry or traces rays. Each child remains runnable independently; unchanged image receipts are reused. The full experiment master performs these steps as part of its complete workflow.
