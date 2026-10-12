# Gameplay grass runtime

Run `node tools/bake.mjs --target materials/grass/gameplay-runtime --publish`.
Without `--publish`, the shared runner stages and validates only. This explicit
browser leaf is excluded from production parent traversal. It uses the shared
`tools/baking/blender.local.json` browser setting and does not require Blender.

The current bus lab supplies the detailed baked appearance. The package retains
its central 2 m source tile for LOD0–2, exact reduced LOD3/4 templates, and prepared
canopy/litter color maps including mip chains. No authoring scene is loaded by
gameplay. SHA-256, bounded payload size, all six levels through a fresh loader,
input stability and rollback-preserving publication remain required gates.

Source dependencies include the retained 96,000-leaf lab export and installed
canopy layout. The package is generated under the shared bake stage and installed
in `assets/public/grass/gameplay/`; screenshots remain in test artifacts.
