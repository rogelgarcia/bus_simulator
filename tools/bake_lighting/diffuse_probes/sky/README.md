# Bake probe sky light

`node tools/bake_lighting/diffuse_probes/sky/run.mjs --samples 256` prepares its
dependencies and bakes sky diffuse illumination with static occlusion. Sunlight
is excluded from this pass. Results remain offline until the parent consolidates
and publishes both authenticated passes. See `../README.md`.
