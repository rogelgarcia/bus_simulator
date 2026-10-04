# Final LOD4 maps

Run `node tools/bake.mjs --target materials/grass/lod4-maps --publish`.
Uses `browserExecutable` and `pythonExecutable` (Pillow with BCn encoder) from
the shared `tools/baking/blender.local.json`; no Blender or downloaded encoder.

Captures the two compiled periodic 2 m tiles using the existing 8192² shadow bake.
Only the game `All` layer is exported: 1024² linear albedo/height, normal/coverage,
roughness/litter contribution in BC3; 4096² self-shadow visibility in BC1.
All data channels are retained. Mips average each linear channel independently;
packed alpha is data, not opacity, and filtered normals are not renormalized.
DDS mip chains upload directly to supported S3TC hardware; unsupported hardware
fails explicitly. This is a desktop experiment, not a universal mobile format.

The job stages files, verifies hashes and full mip chains, loads them in a fresh
scene with no runtime canopy bake requests, captures three poses, and checks input
stability before publication. Source bytes and detailed metadata remain staged;
only eight DDS files, manifest and validation publish. Current source inputs still
include the lab's existing GLB/manifest under its ignored capture directory.

`grass_transition_scene.html?assets=compressed` exercises offline-only loading.
The `compressed` experiment in an ordinary scene retains both map sets for A/B.
Memory comparisons count the active game set, not both debug alternatives.

## Experiment outcome

The initial BC3 / BC1 candidate reduces active map allocation including mips from
78.29 MB to 30.76 MB, but causes visible color/lighting differences, particularly
in the packed normal and litter-contribution channels. It is **not accepted as a
game default**. Passing publication validates integrity and loading, not image
fidelity. Keep the uncompressed baseline for normal use; a future quality pass
should evaluate a better encoder/format or retain sensitive maps uncompressed.
Three-pose A/B images and timings are under
`tests/artifacts/screens/grass_debug_v2/transition_lab/experiments/compression/`.
