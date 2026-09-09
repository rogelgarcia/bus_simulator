# analyze

Measures saved linear transport and display images, extracts material regions and reproducible crops, writes CSV/JSON and chooses a provisional shortlist. This heuristic does not establish photorealism. Uses configured Python only; it never launches the game or Blender.

See the [workflow README](../README.md) for commands, configuration, provenance and limitations.

```sh
node tools/bake_lighting/experiments/lighting_configurations/analyze/run.mjs --set lighting/experiments/configurations:run=tests/artifacts/screens/illumination_560/runs/<run-id> --set lighting/experiments/configurations/analyze:quality=pilot
```

Defaults consume the run's `linear/<quality>/render_manifest.json` and
`postprocess/<quality>/postprocess_manifest.json`. Explicit `analyze:renders=` and
`analyze:processed=` manifest paths must remain inside the experiment artifact
root and agree on source, camera, light, image hash and dimensions.
`config/analysis.json` owns thresholds and crop definitions. Outputs include
`analysis/<quality>/analysis_manifest.json`, `analysis.json`, `metrics.csv` and
`crops/`. Missing/corrupt images and inconsistent manifests fail explicitly;
threshold changes only require rerunning this stage and the report.
