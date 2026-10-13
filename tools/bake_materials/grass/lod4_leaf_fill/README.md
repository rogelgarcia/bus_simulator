# Offline LOD4 missing-leaf experiment

Run through the shared bake framework:

```sh
node tools/bake.mjs --target materials/grass/lod4-leaf-fill
node tools/bake.mjs --target materials/grass/lod4-leaf-fill --publish
```

Uses the installed browser configured by `browserExecutable` in the shared,
gitignored `tools/baking/blender.local.json`. Blender is not required. This
explicit leaf is outside the default `materials` and master traversal.

The input is the authenticated `assets/public/grass/gameplay/` package. Match
each retained LOD4 leaf to its LOD3 tip, which survives width compensation.
Project the 525 omitted two-triangle leaves per repeating 2 m tile onto the
ground from eight azimuths at 20 degrees elevation. Retained LOD3 triangles
occlude the omitted triangles during capture. Rasterization replaces individual
CPU ray casts. The padded 3 m footprint preserves projections across tile edges.

Output is eight 512-square layers of premultiplied linear RGBA8 (8 MiB), plus a
manifest. The browser generates standard mipmaps once on texture upload; it
does not project or capture leaves at runtime. Mipmapped GPU storage is about
10.7 MiB. Publication authenticates source and payload hashes, all four leaf
counts, coverage, eight distinct layers, and a fresh runtime loader/all-LOD
render. The framework also checks input stability and preserves rollback data.
The separate `assets/public/grass/lod4_leaf_fill/` package does not replace the
gameplay package. Assets follow the repository's existing local asset policy.

Open `debug_tools/grass_debug_v2.html?grass=patches&leafFill=baked` and select
LOD4. LOD3 remains the reference. The surface shader follows the geometry's
tile rotations, interpolates neighboring directions and gathers up to four
overlapping tiles (up to eight texture samples). No geometry is added. The
ordinary lab and game keep their existing rendering path.

## Validation and limitations

Select `tests/headless/e2e/grass_patch_offline_leaf_fill.pwtest.js` using
`node tools/run_selected_test/run.mjs --set <path>`, then run the same command
without `--set`. The test compares all eight baked and eight intermediate
directions, checks missing-pixel recovery versus uniform brightening, verifies
stable GPU allocations/uploads during camera movement, and checks disposal.
Review artifacts stay under `tests/artifacts/screens/grass/lod4_offline_leaf_fill/`.

This is a visual experiment, not an accepted production replacement. At the
baked 20-degree views the measured luminance MAE improves by roughly 25%;
halfway between azimuths it worsens by roughly 13%. Linear image blending
does not move a leaf to its correct intermediate projection. A bus perspective
also sees different elevations across the ground, while these textures have
one elevation. Ground projections cannot reproduce silhouettes or full depth
occlusion. Denser direction/elevation sampling or depth-aware reprojection
would be needed before considering production adoption.
