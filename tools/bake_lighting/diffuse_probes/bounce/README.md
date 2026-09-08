# Bake probe bounced light

`node tools/bake_lighting/diffuse_probes/bounce/run.mjs --samples 256` prepares its
dependencies and bakes indirect diffuse transport from static surfaces under the
resolved sun/sky profile. It excludes direct light at the receiver. Results remain
offline until parent consolidation and publication. See `../README.md`.
