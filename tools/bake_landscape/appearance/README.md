# Independent landscape appearance preparation

This registered leaf prepares bounded texture pages from existing public game
PBR assets. It does not download materials, read terrain height/cover payloads,
reimport the coastal ZIP, or run unrelated bakes.

Configure `pythonExecutable` in the shared ignored
`tools/baking/blender.local.json` to an existing Python with Pillow and NumPy.
No Blender executable is required. The original source material folder is a
scoped invocation setting, not a tracked machine path:

```sh
node tools/bake.mjs --target landscape/appearance --set "landscape/appearance:source-root=<existing-public-pbr-folder>" --dry-run
node tools/bake.mjs --target landscape/appearance --set "landscape/appearance:source-root=<existing-public-pbr-folder>"
node tools/bake.mjs --target landscape/appearance --set "landscape/appearance:source-root=<existing-public-pbr-folder>" --publish
```

`source-root` defaults to `assets/public/pbr`; a metadata-only checkout must point
it to the existing folder containing the source images. `directory` defaults to
`assets/public/landscape/coastal-city` and can select another saved landscape.
`node tools/bake_landscape/appearance/run.mjs` enters the same registered leaf.
The leaf is excluded from production `all` and the landscape import parent.

The six bindings come from `manifest.soil.catalog`, retaining their stable global
PBR IDs and physical `tileMeters`. The exact global `_catalog_index.js`, its whole
config import closure, and the six used correction configs are retained in
`assets/public/pbr`. This preserves the shared material catalog rather than
creating a second registry. Only metadata is copied there; raw bounded pages
are published below `coastal-city/appearance/`.

Each material has independent 32, 128 and 512 pixel square baseColor, normal and
ORM pages. Each file is uncompressed RGBA8 with an explicit size and SHA-256.
The largest request is 1 MiB; the whole six-material tier is 73,728 bytes,
1,179,648 bytes or 18,874,368 bytes before GPU mip chains. The sidecar is limited
to 256 KiB. It records spatial binding, material identity, calibration source
hashes/adjustments, roughness input percentiles, converter versions and every
source hash. Existing source rights remain applicable; no new license is
asserted, and no machine path is published.

Source dimensions are inspected before image decoding: only square power-of-two
512..1024 images are admitted. One source channel/material is processed at a
time. The conservative offline working-array allowance is 96 MiB, covering
decoded source images, float conversion/filtering/normalization scratch and
output arrays; it is not process RSS. Source files are separately limited to
32 MiB. No terrain-sized array is allocated. The converter runs as an owned,
cancelable framework child process.

Base color is reduced with box averaging in linear light, then encoded as sRGB.
Normals use normalized vector averaging. ORM means AO/roughness/metalness in
linear RGB; separate scalar source maps are packed without inventing metal.
Calibration remains runtime metadata and is not baked twice. Pages are flipped
vertically once so GPU row zero is south and world UV `(X,Z)/tileMeters` has
east/north orientation with OpenGL normals. Alpha is opaque.

Preparation validates page hashes/sizes, normalized normals, opaque alpha and
exact catalog metadata. Optional publication installs immutable pages and a
saved sidecar, then atomically switches `appearance/manifest.json`; the terrain
manifest is unchanged. The authoring mutation lock and framework input-stability
gates prevent mixed source publication. An existing conflicting global config
is rejected instead of overwritten. Repeating unchanged inputs is deterministic.

The receipt is `tests/artifacts/screens/landscape/ai576/d4/appearance-validation.json`.
Focused tests are `landscape_appearance.test.js` and
`landscape_appearance_preparation.test.js`. The latter creates isolated synthetic
PNG/catalog fixtures; it requires the same shared Python dependencies and does
not depend on another checkout or modify retained source materials. The canonical
runtime/schema contract is [LANDSCAPE_APPEARANCE.md](../../../specs/landscape/LANDSCAPE_APPEARANCE.md).
