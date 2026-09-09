# Verify saved scene poses

```sh
node tools/bake_lighting/experiments/lighting_configurations/verify_scene/run.mjs --set lighting/experiments/configurations:run=tests/artifacts/screens/illumination_560/runs/<run-id>
```

Reopens the authenticated Blender project without rendering. Each camera's view
layer is evaluated before reading its associated bus transform: an excluded
object's cached world matrix can be stale. All five camera/bus matrices must
match the supplied transforms within the declared float tolerance. Outputs are
`pose_validation.json` and `scene_verification.json` in the run directory. A
mismatch fails explicitly. The source `.blend` file is never overwritten.
