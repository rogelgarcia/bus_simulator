# Distant tree representations

The user confirms literal maximum wood/leaf triangle counts: LOD3 30/30,
LOD4 6/6, LOD5 2/2, and LOD6 0.2/0.2 amortized over ten trees. These are upper
limits. Preserve three mature forms for all five species and the accepted
LOD0/1 assets. Do not invent an intervening LOD2.

LOD3 uses five irregular crown partitions with three intersecting panels each
(30 foliage triangles). Three wood panels preserve major branches,
including elm vase forks. The four tree species receive a bent four-sided,
four-ring stem with 24 side triangles, plus six wood-panel triangles; its
ends are open and hidden at the ground/crown. Stem fitting traces connected
triangle/height cross-sections rather than branch-contaminated vertex bounds.
Arrowwood retains its many ground contacts on three crossed wood panels (six
triangles). Each species profile contains independently measured bounds and
five center seeds for all three variants.

The coarse geometric stem owns the lower trunk. Its accompanying wood panels
start above 45% of the fitted stem height to avoid artificial overlapping trunk
shadows. Shrub and LOD4 wood panels are anchored at their root depth.

Coarse stems use fresh cylindrical UVs with a selected-to-active PBR bake;
inheriting the source UV islands creates severe stretched bark. Missed rays are
filled by extending neighboring valid photographic texels. Every atlas tile
must be nonempty and have a clear alpha gutter. Atlas camera framing uses the
larger image dimension so portrait layouts retain all columns and rows.

LOD4 uses three complete foliage projections and three wood projections,
six triangles in each surface category. LOD5 uses one combined tree quad with
two triangles total. LOD6 uses one combined cluster quad with two triangles for
ten trees, or 0.2 triangles per represented tree. The shared quad is recorded as
`mixedTriangles`, never duplicated into both wood and foliage totals.

Eight azimuths and two elevation captures (-8 and +15 degrees) supply each
LOD5/6 atlas. A runtime updater chooses the nearest view, faces the same four
vertices toward the camera, updates UVs and the tangent frame, and preserves
the two-triangle count. The elevation range targets bus views across hills;
close overhead views are outside these distant representations. Sudden view
selection remains a limitation; these assets do not add crossfade geometry.
LOD5 uses the projected ground pivot when turning its quad, keeping the base
planted. LOD6 retains its cluster projection; its collapsed depth cannot match
individual terrain contacts or intervening objects at close distances.

PBR color/alpha, normals and roughness are projected from the accepted original
photographic materials in headless Blender. Capture emission records material
properties, without sunlight or cast shadows in color. Normal maps are encoded
in each panel's tangent frame; panel normal detail is filtered before
encoding to reduce subpixel shimmer. Six-pixel gutters and per-tile alpha mip
coverage preserve cutout silhouettes. Compression retains the existing PSNR,
normal-angle and alpha-error gates. No licensed game texture pixels are used.

The explicit `vegetation/distant` bake leaf uses the shared configuration,
authenticated inputs, isolated output paths and rollback publication. All
generation code resides in `tools/bake_vegetation/distant/`; runtime loading is
under `src/graphics/engine3d/vegetation/`. Publish the 60 final assets (45 trees,
15 ten-tree clusters) to `assets/public/vegetation_distant/`. Generation artifacts
and current comparisons stay under `tests/artifacts/screens/distant_lods/refined/`.
The original `final/` folder remains an immutable before-comparison and silhouette source.

Each cluster uses its recorded ten member positions, yaw angles, scales and
variants. The three generated groups per species are reusable group templates;
they must replace exactly those members. Arbitrary city clustering and distance
selection are not introduced in this asset-generation pass. Existing gameplay
trees remain unchanged. No gameplay frame-time improvement is claimed from the
triangle budget alone: alpha fill, texture residency and transitions still cost
rendering time.

Validation reads actual exported indices, attributes and material contracts,
authenticates GLB/texture hashes, checks exact member counts, and loads compressed
assets through the runtime loader. Full-tree Cycles comparisons use matching
framing and bus-height direction from two azimuths; cluster images expose the
ten-tree silhouettes. The public manifest records separate wood, leaf and mixed
triangles and amortized cluster counts.

The original set measured 45.74 MiB across 60 self-contained GLBs. The refined
LOD3/4 models reference three shared KTX2 foliage maps per species; geometry,
wood maps and LOD5/6 remain embedded. The refined 60 GLBs plus fifteen shared
maps total 61.47 MiB. All thirty LOD5/6 GLBs are byte-identical to the original
set. Aggregate exported triangles stay at
378 wood + 450 foliage at LOD3, 90 + 90 at LOD4,
30 mixed at LOD5, and 30 mixed across fifteen ten-tree LOD6 clusters. All three
variants of each tree species use 30/30 at LOD3; Arrowwood uses 6/30.

LOD3/4 foliage tiles increase from 256 to 512 pixels on each side (four times
the texels). An 8-by-8 alpha coverage descriptor compares crown masses without
requiring individual leaf pixels to coincide. Greedy prototype selection bounds
coarse silhouette overlap to at least 0.68 for LOD3 and 0.82 for LOD4, bounds
aspect differences to 30% and 10%, and alpha coverage differences to 30% and 12%.
Cards retain their measured center and orientation, scale uniformly, and preserve
projected leaf area; UV aspect is never stretched to fit. The 270 placements
share 144 prototypes: London plane 31, silver linden 29, red oak 41, elm 26,
and Arrowwood 17. The six LOD3/4 models of each species share the same three
atlas files and GPU texture objects, with reference-counted disposal. Distribute
each complete species directory, including its `shared_leaf_*.ktx2` files.

The pale LOD3 bark was a color-space defect. Cycles writes encoded color into
an sRGB float bake target; the PNG writer then applied a second sRGB conversion.
A controlled linear swatch of 0.18 measured 0.461 in that target. The corrected
production target is Non-Color, retains 0.18, and is encoded exactly once by the
PNG writer. The registered `diagnose` phase asserts the linear-to-PNG round trip.

`tests/node/assets/vegetation_distant.test.js` validates the budget contract and
all installed exports. `tests/headless/e2e/distant_vegetation.pwtest.js` loads all
60 models, verifies four directional views per billboard, checks visible pixels,
and saves runtime captures. It also verifies that simultaneous LOD3/4 instances
share the same three GPU maps, disposing one instance preserves the other's
maps, and disposing the last instance releases each map exactly once. The
revision passes nine asset tests, thirteen bake-framework tests and five browser
tests. The updater converts the manifest's Blender UVs to
glTF's flipped V axis; visibility checks catch a collapsed or wrongly mapped
quad even when its attributes are finite and its triangle count is correct.

Method references: SpeedTree documents
[360-degree normal-mapped billboard atlases](https://docs.speedtree.com/doku.php?id=compiler_testing).
NVIDIA discusses [larger leaf-clump billboards for distant trees](https://developer.nvidia.com/gpugems/gpugems2/part-i-geometric-complexity/chapter-1-toward-photorealism-virtual-botany).
