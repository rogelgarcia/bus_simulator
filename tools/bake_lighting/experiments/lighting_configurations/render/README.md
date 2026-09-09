# render

Runs Cycles from an explicit saved scene and run. Produces raw multilayer EXRs, previews, named source passes, separate calibration cards/sphere and a ready-to-render reference Blender file. `quality`, `samples`, `resolution`, `poses`, `lights`, `device`, `diagnostic` and `time-limit` control only this stage. Completed images have authenticated receipts.

See the [workflow README](../README.md) for commands, configuration, provenance and limitations.

```sh
node tools/bake_lighting/experiments/lighting_configurations/render/run.mjs --set lighting/experiments/configurations:run=tests/artifacts/screens/illumination_560/runs/<run-id> --set lighting/experiments/configurations/render:quality=pilot
```

The run's `scene.json` is the default input; `render:scene=<scene_manifest.json>`
selects an explicit export. Outputs are `linear/pilot/` or `linear/final/`, with
`render_manifest.json` as the next stage's input. Final quality requires the pilot
shortlist unless explicit light IDs are supplied. Missing scene/resources, changed
hashes, a reached render time limit or invalid EXR cause a nonzero exit; the script
does not launch the game to repair a missing export.
# Camera isolation

Each fresh render enables one view layer, without Blender's single-layer
**re-render** operator argument (which retains earlier results). Before accepting
an image, the script checks its camera-channel prefix and decodes every scanline.
An incomplete or mixed-camera EXR fails the stage and receives no valid receipt.
