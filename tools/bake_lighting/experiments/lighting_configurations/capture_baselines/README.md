# Capture game baselines

Run `node tools/bake_lighting/experiments/lighting_configurations/capture_baselines/run.mjs`.
The shared planner includes preparation, then this stage captures the five resolved
poses from the actual game with its installed baked lighting. See the
[workflow README](../README.md) for setup, resolution, readiness checks, manifests,
timing and process cleanup. Blender stages are not invoked.
