# Vehicle diffuse probes

Run `node tools/bake_lighting/diffuse_probes/run.mjs --publish` from the repository
root. The master `node tools/bake.mjs` also includes this domain. Without
`--publish`, validated results stay under the framework's ignored artifacts folder.

This uses the shared `tools/baking/blender.local.json`; missing configuration is
created with setup instructions by every entrypoint. No executable paths are stored here.

The dependency chain first runs `validate/run.mjs` to check constant-radiance
calibration and packed-image persistence, exports the current static BigCity2 city, prepares one reusable
Blender scene, runs independent `sky/run.mjs` and `bounce/run.mjs` passes, then
authenticates and consolidates their results. Sky measures occluded sky diffuse;
bounce measures indirect diffuse transport. Direct sunlight and reflections remain live.
The player bus and other runtime objects are excluded from the source export.

`defaults.json` is the tracked field layout and quality profile: four bounded regions
around the supplied comparison poses, 2,640 probes, six directional irradiance samples
and 64 directional visibility distances per probe. The same world-space field lights
moving vehicles without rebaking their poses. CPU baking uses four threads by default.

Use `--samples 512` or `--device OPTIX` on the parent or leaf entrypoints. Options
propagate to preparation; every dependent pass uses that authenticated profile.
`--timeout-seconds` is a hard workflow timeout, not a convergence target. Defaults,
source, scripts, toolchain and results participate in checkpoint authentication.

Publication writes immutable field data first and replaces
`assets/baked_lighting/diffuse_probes/index.json` last. Invalid grids, missing passes,
non-finite/empty results, altered inputs or mismatched hashes cannot publish.

Runtime contract and limitations: `specs/graphics/vehicle_diffuse_probes.md`.
