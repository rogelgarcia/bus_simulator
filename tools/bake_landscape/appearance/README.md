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
east/north orientation with OpenGL normals. Alpha is opaque except when explicit
source-height metadata assigns ORM alpha to normalized linear relative relief.

Preparation validates page hashes/sizes, normalized normals, channel alpha and
exact catalog metadata. Optional publication installs immutable pages and a
saved sidecar, then atomically switches `appearance/manifest.json`; the terrain
manifest is unchanged by default. The authoring mutation lock and framework input-stability
gates prevent mixed source publication. An existing conflicting global config
is rejected instead of overwritten. Repeating unchanged inputs is deterministic.

Publication also retains the previous current sidecar under its deterministic
`binding.<sha256>.json` compatibility alias, publishes the new binding alias,
then switches current. Aliases share the appearance directory with snapshots
and `pages/`, preserving relative URL resolution. Alias writes are atomic;
content-addressed snapshots/pages are immutable. The key covers landscape ID,
required bounds/grid values and ordered soil/material IDs, not terrain revision.

To migrate one older retained sidecar that predates aliases, add this scoped
option to the normal registered invocation:

```sh
node tools/bake.mjs --target landscape/appearance --set "landscape/appearance:compatibility-snapshot=manifest.<sha256>.json" --publish
```

The filename must be one `manifest.<64 lowercase hex digits>.json` in the selected
landscape's appearance directory. The leaf admits at most 256 KiB of metadata,
authenticates the filename digest and every referenced page sequentially, and
includes them in input-stability checks. Other landscape IDs are refused at
publication. There is no arbitrary history scan, terrain reimport, or temporary
switch back to the older sidecar. Default runtime lookup can resolve a compatible
alias after a valid binding mismatch; explicit URLs and corrupt/network failures
remain strict. See [LANDSCAPE_APPEARANCE.md](../../../specs/landscape/LANDSCAPE_APPEARANCE.md).

The receipt is `tests/artifacts/screens/landscape/ai576/d4/appearance-validation.json`.
Focused tests are `landscape_appearance.test.js` and
`landscape_appearance_preparation.test.js`. The latter creates isolated synthetic
PNG/catalog fixtures; it requires the same shared Python dependencies and does
not depend on another checkout or modify retained source materials. The canonical
runtime/schema contract is [LANDSCAPE_APPEARANCE.md](../../../specs/landscape/LANDSCAPE_APPEARANCE.md).

## Uniform materials and source height

An optional per-material `pbr.landscape.config.json` is retained and hashed with
catalog metadata. `baseColor.algorithm: periodic-log-microdetail-v1` removes
broad tonal drift only from an explicitly selected homogeneous source. The
bounded 8..128-pixel radius controls three wraparound box passes in log-linear
RGB; each channel retains its original mean linear reflectance. Fine detail is
preserved without changing the original images, normals, roughness or AO.
This cannot turn a mixed grass/soil/stone mosaic into a suitable source: choose
one material first and inspect both the prepared albedo and full shaded PBR
response at 1× and repeated tiling. The current uniform recipe uses radius 16.

`mapFiles.displacement` supplies source-authored height. Supplemental matching
height for an immutable existing material can instead be declared by
`displacement.file` in its landscape config, including URL/license/hash metadata.
Integer height precision is retained through normalization; 16-bit PNG data is
never converted through an 8-bit luminance image. Source median and the larger
distance to its 1st/99th percentile set a centered relative range, with a flat
source becoming 0.5. Linear box reduction precedes UNORM8 encoding in ORM alpha.
The manifest declares `height: {encoding:'orm-alpha-unorm8',
interpretation:'relative-relief',neutral:0.5}`. Historical materials without this
metadata retain opaque alpha. The source-height normalization and color recipe
are recorded per material in appearance provenance. Height is material relief,
not new terrain geometry or a claim of physically measured depth.

All source/filter arrays remain under the existing 96 MiB working allowance.
At maximum 1024² input and 128-pixel radius, processing one RGB component at a
time keeps the conservative typed-array peak below 88 MiB: source/linear RGB,
log/residual fields, padded scalar fields, float64 prefix/slice arithmetic,
and output. This is an allocation estimate, not a process-RSS measurement.
Runtime pages, request bounds and texture byte accounting remain unchanged.

The six uniform bindings are declared in `uniform-materials-v1.json`. To apply
them through the same registered leaf:

```sh
node tools/bake.mjs --target landscape/appearance --set landscape/appearance:material-bindings=tools/bake_landscape/appearance/uniform-materials-v1.json
node tools/bake.mjs --target landscape/appearance --set landscape/appearance:material-bindings=tools/bake_landscape/appearance/uniform-materials-v1.json --publish
```

The bounded JSON must provide every soil ID exactly once for the selected
landscape. Only `soil.catalog[*].materialId` and the content-derived terrain
revision may change; samples, classifications, source records and authoring
history remain identical. Publication authenticates unchanged current input,
installs immutable pages and both terrain snapshots, publishes the old/new
appearance aliases, switches current appearance, then switches current terrain
last. During that handoff the old terrain resolves its retained compatible
alias. Reapplying identical bindings does not create another terrain revision.
The authoring lock and existing source-stability gates cover this transaction.

Current replacements retain CC0 ambientCG Grass008 (procedural with bitmap
elements), Ground006 (approximation), and Granite005A (procedural) source maps.
Their four-meter display periods and matte calibration are authored values,
not measured source dimensions. Sand retains the accepted Aerial Beach 01
response and 30-meter scale; the same material also supplies seabed. The new
matching sand displacement affects only ORM alpha, preserving every RGB byte,
normal page and calibration setting from the previous sand publication.

## Multiscale companion (AI577 D4)

The optional `multiscale` input adds finer data without touching the schema-1
sidecar. The shipped request is `multiscale-v1.json`:

```sh
node tools/bake.mjs --target landscape/appearance --set landscape/appearance:multiscale=tools/bake_landscape/appearance/multiscale-v1.json
node tools/bake.mjs --target landscape/appearance --set landscape/appearance:multiscale=tools/bake_landscape/appearance/multiscale-v1.json --publish
```

The request (`landscape-appearance-multiscale-request`, schema 1) names the
landscape, `extraTiers: [1024]` and micro layers as `{materialId, soilIds}`.
The converter adds a native 1024 tier for every bound material in the same
decode and with the same filters as the 32/128/512 tiers; a source smaller than
1024 pixels fails instead of being upsampled. Micro materials are landscape-local
folders under the source root with `pbr.material.config.js` (CC0 provenance,
real `tileMeters`, `baseColor`/`normal`/`displacement` maps) and a
`pbr.landscape.config.json` `micro` recipe (`micro-periodic-highpass-v1`,
`radiusPixels`, `luminanceRangePercentiles`); they are not registered in the
global catalog. Three wrapped box passes separate scales: log luminance, tangent
slopes and height each lose their low-frequency part, so the micro layer carries
only detail finer than the recorded half-power wavelength. Micro pages exist at
32/128/512/1024 so each pairs with one base tier: RG are OpenGL detail normal XY,
B is median-centered p01/p99 relative height, and A is
`0.5 + 0.5 * (L / mean - 1) / luminanceRange`, clamped. All pages keep the
schema-1 orientation and filtering rules.

The companion is written as `appearance/multiscale.json` plus an immutable
`multiscale.<sha256>.json` and content-addressed pages. Its revision is content
derived; it records the extended appearance revision and binding key, every
page-affecting source hash and the recipes. Validation checks hashes, sizes,
alpha, normalized base normals, the unit-disc micro normals and neutral micro
means. Publication installs pages and the snapshot first, switches the schema-1
sidecar, then `multiscale.json`, and only then terrain. Publishing a different
appearance revision without the multiscale input is refused while a current
companion exists, so a schema-1 republish cannot silently orphan it. Repeated
inputs produce byte-identical companion bytes. A converter allocation peak
(Python tracemalloc, not RSS) is reported in the receipt
`tests/artifacts/screens/landscape/ai577/d4/appearance-multiscale-validation.json`
and kept out of the sidecar. Runtime loading is in `src/app/landscape`
(`loadLandscapeAppearanceMultiscale`, `loadLandscapeAppearanceMultiscalePage`).

The shipped micro layer is `pbr.landscape_sand_micro_v1` (CC0 ambientCG Ground054,
surface photogrammetry, stated capture ca. 3.5 x 3.5 m, so 3.42 mm per texel at
1024) for sand and seabed, with a 9-pixel radius (half-power wavelength about
17 cm). Its originals and download receipts are retained under `downloads/`.
