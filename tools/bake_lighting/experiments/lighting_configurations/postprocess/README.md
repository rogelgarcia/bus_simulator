# postprocess

Transforms saved Linear Rec.709 EXRs to the named sRGB display. T0 is Three.js r183 ACESFilmic; T1 is AgX; T2 is real ACES 2.0 through the pinned OCIO config. Exposure and grades do not launch Blender. Inputs and per-image transformation receipts remain in the run.

See the [workflow README](../README.md) for commands, configuration, provenance and limitations.

```sh
node tools/bake_lighting/experiments/lighting_configurations/postprocess/run.mjs --set lighting/experiments/configurations:run=tests/artifacts/screens/illumination_560/runs/<run-id> --set lighting/experiments/configurations/postprocess:quality=pilot
```

The default input is `linear/<quality>/render_manifest.json`. The explicit
`postprocess:renders=<render_manifest.json>` override must identify compatible
authenticated images under the experiment artifact root. Outputs are PNGs,
per-image receipts and `postprocess/<quality>/postprocess_manifest.json`.
`config/color_management.json` supplies the transforms, exposure and grades.
Missing OCIO/image dependencies, mixed camera layers or changed input hashes fail
without starting upstream stages. Matching completed PNGs are reused.
