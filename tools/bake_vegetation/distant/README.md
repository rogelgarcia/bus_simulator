# Distant vegetation LODs

Use the registered shared entry point, in order:

```sh
node tools/bake.mjs --target vegetation/distant --set vegetation/distant:phase=prepare
node tools/bake.mjs --target vegetation/distant --set vegetation/distant:phase=diagnose
node tools/bake.mjs --target vegetation/distant
node tools/bake.mjs --target vegetation/distant --set vegetation/distant:phase=compress
node tools/bake.mjs --target vegetation/distant --set vegetation/distant:phase=render
node tools/bake.mjs --target vegetation/distant --set vegetation/distant:phase=gallery
node tools/bake.mjs --target vegetation/distant --set vegetation/distant:phase=validate
node tools/bake.mjs --target vegetation/distant --set vegetation/distant:phase=publish --publish
```

`species=london_plane`, `variants=mature_01` and `levels=3,4,5` bound a proof.
The defaults build all five species, all three forms, and levels 3,4,5,6. LOD2
was not requested. Headless Blender uses the shared ignored configuration and
defaults to two CPU threads to coexist with occupied interactive/GPU sessions.
The render-only option `reference=omit` refreshes selected distant frames without
repeating already authenticated LOD0 comparison images.

Outputs live in `tests/artifacts/screens/distant_lods/refined/`. The prior `final/`
folder supplies immutable silhouette measurements and unchanged LOD5/6 exports;
`prepare` copies these into a new output once and refuses to overwrite a prepared species.
Publication installs validated GLBs, shared KTX2 textures, directional metadata and provenance in
`assets/public/vegetation_distant/<species>/`, using the shared rollback publisher.
Editable Blender sources, captures, intermediate images and galleries stay in
artifacts. Source LOD0/1 files and their installed catalog are immutable inputs.

LOD3/4 foliage tiles are 512 pixels per side, twice the original dimensions.
Within each species, coarse alpha coverage, aspect ratio and projected area
select reusable card prototypes. The current 270 placements use 144 unique cards:
31 London plane, 29 silver linden, 41 red oak, 26 elm, and 17 Arrowwood.
Each six-model LOD3/4 family references the same three `shared_leaf_*.ktx2`
files; distribute the whole species directory with its GLBs. The loader shares
the corresponding GPU textures and releases them after their final user.
Changing a bank requires rebuilding all three variants at both levels.

Pale LOD3 stems came from a double sRGB conversion: Cycles encoded the floating
bake image and the PNG writer encoded it again. Stem targets now stay linear;
the diagnostic uses a known color swatch and validates the complete round trip.

| Level | Wood triangles | Leaf triangles | Combined plate triangles |
| --- | ---: | ---: | ---: |
| 3 trees | 30 | 30 | 0 |
| 3 Arrowwood | 6 | 30 | 0 |
| 4 | 6 | 6 | 0 |
| 5 | 0 | 0 | 2 per tree |
| 6 | 0 | 0 | 2 per ten-tree cluster (0.2/tree) |

These are literal mesh triangles. A double-sided material renders both sides
of each physical triangle without adding geometry. Wood and leaves share the same LOD5/6 quad and must not
be counted twice. Each species has nine single-tree assets (three variants at
three levels) and three cluster plates. The cluster manifests list all ten
member transforms, including gentle ground slope and three mature forms.

Five dedicated species agents measured source outer-card bounds and crown
centers in `species/*.json`. LOD3 partitions source foliage into those five
irregular lobes. Separate wood projections preserve the upper branches.
Tree stems use 24 geometry triangles following connected triangle/height
intersections, with six additional wood triangles for root-anchored branch
silhouettes above the lower stem, avoiding overlapping trunk shadows. Bark is
rebaked into fresh stem UVs and missing projection texels are extended from
nearby valid photographic samples. Shrubs use six alpha wood
triangles. LOD4 projects the complete wood and foliage into three
crossed planes each. LOD5/6 use eight azimuths and two elevations in the same
atlas; no extra triangles are added for the views.

Albedo, tangent-frame normals and roughness are reprojected from the existing
photographic PBR without baked sunlight. Coarse billboard normals receive a
small alpha-weighted filter to suppress subpixel detail. Guarded atlas tiles and
coverage-preserving color mips feed the existing UASTC encoder and quality gates.

`loadDistantVegetation` in `src/graphics/engine3d/vegetation/` loads these optional
assets. Call its returned `update(camera)` before rendering color/shadow passes,
then `dispose()` when removing an instance. LOD6 plates must replace their exact
recorded group. Automatic city grouping, placement and LOD switch distances are
not changed; templates do not substitute for unrelated existing tree positions.
Individual LOD5 quads rotate around the projected ground pivot. Cluster plates
collapse depth and are intended for distant views; nearby terrain intersections
and occlusion require full geometry or a future depth-aware impostor renderer.
