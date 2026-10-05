# Installed mature vegetation LOD0 catalog

AI592 publishes the accepted AI591 geometry and PBR maps into
`assets/public/vegetation_lod0/`. This is a shared, gitignored asset directory,
available from the main checkout and its asset-junction worktrees. Code and
publication recipes are committed; copying this folder is required on another
machine unless the ignored review outputs are available to republish it.

## Catalog and runtime

Inspector Room → Meshes exposes London plane, Silver linden, Northern red oak,
American elm and Arrowwood viburnum collections labeled **(LOD0)**, each with
Mature 01–03. Stable collection IDs are `mesh_collection.lod0_<species_folder>`;
entry IDs are `tree.lod0.<species-slug>.mature_01` through `mature_03`.
The shrub retains its shrub classification. There is a single representation per
form, without desktop/mobile tiers. Existing city placements are unchanged.
Detailed reference entries and their IDs remain available.

Installed model data totals 9.18 MiB and the shared external maps total
213.61 MiB (222.79 MiB combined, versus 366.25 MiB with duplicated embedded
canopy textures). Credits and the manifest add a small amount beyond this.

`UrbanVegetationLod0Loader` takes a species slug and the active WebGL renderer.
The renderer determines KTX2 GPU support. One renderer-scoped decoder and URL
cache share the three canopy maps across mature forms. Bark maps/materials stay
distinct because each form has its own baked UVs. The returned metre-unit
templates share geometries/materials; clones must not dispose shared resources.
`disposeUrbanVegetationLod0(renderer)` releases library resources once all users
have been removed. The Inspector clones materials for its editable display.

The local Apache-licensed Basis decoder matches Three.js 0.183.2. The engine
still uses its existing Three.js import map. No runtime reads use `downloads/`
or `tests/artifacts/`. Serve GLBs alongside their relative `textures/` folders.

## Surfaces and budgets

All 15 forms together have **50,000 foliage triangles** and **47,548 wood
triangles**. Each has three mesh primitives: wood, inner cards and outer cards.
The inner canopy has five centers with three intersecting planes each; exterior
cards retain the accepted silhouette arrangement. Double-sided rendering does
not duplicate geometry. Counts are also exposed as `treeMetrics` on templates.

Six maps are used per form: base color/alpha, normal and ORM for leaves and bark.
The 60 unique external KTX2 textures comprise three 4096×3072 canopy maps per
species and three 2048×2048 wood maps per form. They preserve the reviewed
UASTC bytes and mip coverage. Leaves use alpha testing at 0.5, depth writing,
double-sided color/shadows and base-color alpha for AO coverage. No transparent
sorting is used. Standard color spaces, tangents and roughness maps are retained.

Three.js r183 does not implement `KHR_materials_diffuse_transmission`. The
dedicated leaf shader uses the authored 0.17 factor for shadowed direct diffuse
light through the opposite face and reduces reflected direct diffuse by the
same fraction. Standard specular and environment lighting are retained. This
is a thin-leaf direct-light approximation, not full volumetric transport or a
replacement for separate silver-linden underside scans.

Shared block-compressed texture allocation is approximately **480 MiB** if all
five species and all three bark sets are resident (ASTC 4×4/BC7). Catalog loading
is lazy by species. This is not a measured gameplay frame-rate certification:
texture residency/streaming, lower LODs, wind and dense-city placement remain
future work. Devices without suitable GPU compression can require more memory.

## Publication and validation

Run `node tools/bake.mjs --target vegetation/lod0-library --publish`. Without
`--publish`, it only stages and validates. The default source is
`tests/artifacts/screens/ai591_core_canopies/final/`. It requires all 15 accepted
forms, combined budgets, half-budget wood, manifold/error reports, compression
quality, source hashes, CC0 credits and material-approximation provenance.
The review masters remain intact for comparisons and regeneration.

The library `index.json` authenticates model/map bytes and reports counts.
Node tests compare every geometry accessor against the accepted source and
validate the published package. Browser tests load all forms through the actual
Inspector, check GPU compression, shared canopy/distinct bark maps, alpha and
lighting, and capture each form under
`tests/artifacts/screens/ai592_lod0_catalog/`.

Sources: [Three GLTFLoader r183](https://github.com/mrdoob/three.js/blob/r183/examples/jsm/loaders/GLTFLoader.js),
[KTX2Loader r183](https://github.com/mrdoob/three.js/blob/r183/examples/jsm/loaders/KTX2Loader.js).
