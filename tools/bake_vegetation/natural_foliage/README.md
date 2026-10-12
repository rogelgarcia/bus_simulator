# Natural reference foliage

Review-only reference shoot revision, called through `node tools/bake.mjs --target
vegetation/natural-foliage`. Uses the shared ignored Blender configuration and
authenticates the accepted source scene. All outputs must be in a dedicated
subdirectory of `tests/artifacts/screens/vegetation_natural_foliage/`.

Phases: `study` reads the existing game's foliage atlas and a legacy FBX;
`build` stages reference specimens; `render` compares staged specimens;
`all` builds and renders. `models` selects comma-separated species/variant IDs.
`consolidate` authenticates comma-separated `candidates` directories (last
candidate wins per model), then creates one gallery and reference index. It
links the preserved model, shoot and render files without copying or replacing
them, requires all sixteen paired renders per representative model, and raises
the minimum silhouette coverage gate to 95% per view. Use a fresh output folder.
No game asset publication or source replacement is supported.

`retain` sets the target leaf fraction before crowding rejection. Optional
`retention=silver_linden=0.90,american_elm=0.90` overrides that fraction
for individual species while using the common value for the others.
Root seating verifies that only root anchors move and every intended root
reaches its selected parent path before foliage growth starts.

The implementation keeps photographic leaf shells and existing wood unchanged,
verified with geometry/UV fingerprints. It replaces the old two-cylinder spray
with an outward-growing support and unequal curved laterals. Leaf stations
respect alternate or opposite arrangement, vary internode lengths and test
orientation candidates against nearby blades. Crowding metrics are proxies,
not exact triangle intersection counts. See the [research and acceptance
contract](../../../specs/graphics/vegetation_reference_foliage.md).

```sh
node tools/bake.mjs --target vegetation/natural-foliage --set vegetation/natural-foliage:output=tests/artifacts/screens/vegetation_natural_foliage/revision
```

Default `models=all` builds all fifteen mature forms. Rendering compares the
first mature form of each species using two canopy close-ups, four full-tree
azimuths and two isolated branchlet angles. `views=detail` skips full-tree renders
and gallery generation for fast shape iteration. The final gallery checks that
projected opaque area retains at least 90% of the source in each full-tree view;
reported measurements include unchanged wood and do not estimate physical volume.

Each model directory contains `reference.blend`, `model.json` and `shoots.json`.
Build refuses to overwrite an existing candidate. `phase=render` verifies its
saved hash and regenerates review images. Existing fixed-stride LOD consumers
need an adapter for the new `spray_id`, `shoot_id` and `node_id` attributes before
these candidates can become the next LOD source. No LOD changes occur here.

## Coverage calibration

`phase=coverage` reads a complete reviewed `baseline` directory and adds leaves
at exposed, uneven stations along its existing curved shoots. `gain=1.10` is
the projected coverage multiplier. It preserves existing leaves and all woody
geometry, checks four 768×576 silhouettes, and tunes the selected leaf count.
Arrowwood files are referenced unchanged. The output must be a separate folder.

```sh
node tools/bake.mjs --target vegetation/natural-foliage --set vegetation/natural-foliage:phase=coverage --set vegetation/natural-foliage:baseline=tests/artifacts/screens/vegetation_natural_foliage/final_review_v2_20261011 --set vegetation/natural-foliage:output=tests/artifacts/screens/vegetation_natural_foliage/coverage_20261011
```

Receipts contain before/after counts, silhouette ratios, search history, source
and algorithm hashes, preservation checks, and explicit per-shoot leaf indices.
Existing candidates resume only when their baseline, code identity and file hash
match. The complete output index can feed `vegetation/turntable` through its
`reference-index` setting. The coverage metric includes unchanged wood and is
not a measurement of physical crown volume or exact triangle intersections.
