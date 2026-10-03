# LOD4 compiled leaf layout

Regenerate the debug field's two compatible, periodic 2 × 2 m source layouts:

```sh
node tools/bake.mjs --target materials/grass/lod4-layout --publish
```

The equivalent standalone entry is `node tools/bake_materials/grass/lod4_layout/run.mjs`.
Use `--dry-run` to inspect the job, or omit `--publish` to stage and validate only.
Configure `browserExecutable` in the shared gitignored `tools/baking/blender.local.json`.
This browser-only job requires an existing Chrome/Chromium installation and the
existing exported field (`scene.json` and `96000_leaves.glb`) under
`tests/artifacts/screens/grass_debug_v2/ninety_six_thousand_leaves_12m/`.
It does not require Blender or install any tools. This explicit debug asset job
is outside the default production material tree and does not change the existing
grass V2 gameplay asset publication policy.

The compiler owns a separate browser and loopback server. It uses the scene's
explicit `compileLod4Layout=1` entry to run placement, material
feedback and rendered feedback passes. Existing density, grass/background color,
48-view pattern and 4096²/8192² final validation gates remain in force. It writes
the final Float32 vertex positions to `layout.json`, retaining source identity
and optimizer reports. Normals, UVs, leaf shapes and topology come from the
original source and are not duplicated into the layout asset. The first variant
is optimized over the full periodic domain. The second varies and optimizes only
interior shoots; leaves and projected sun shadows within 8 cm of a boundary are
identical in both variants. Every candidate move must preserve that shared band.
Runtime validates both variants and their shadow-aware boundary compatibility.

Before publication a fresh page loads the staged layout through the ordinary
runtime path. Source identity, counts, finite positions and horizontal-only
per-leaf translations are checked. Loading must request no optimizer modules,
report compiled mode and produce no browser errors. Missing or incompatible
assets fail with regeneration instructions; runtime never reruns optimization
as a hidden fallback. Shared input-stability, checkpoint and atomic publication
gates apply. Publication installs `assets/public/grass/lod4/layout.json`.

The 4K texture and self-shadow bake still run when opening the scene; this job
compiles the expensive leaf-arrangement search, not the texture maps. LOD3's
camera-dependent captures are unaffected. Stage reports, timings and compiled /
loaded screenshots are gitignored under the shared bake run directory. The
browser executable, source implementation, exported scene, litter repair and
calibrated environment assets are authenticated inputs.
