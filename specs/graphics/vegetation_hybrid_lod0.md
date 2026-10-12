# Hybrid foliage LOD0

The October 2026 natural reference collection, including its additive coverage
pass, is the source for all fifteen mature hybrids. This derivative has three
spatial roles: detailed curved opaque leaves at exposed silhouettes, simpler
curved opaque leaves in the transition layer, and reusable two-sided alpha
branchlets inside the canopy. The earlier combined 50K foliage triangle cap is
relaxed by the user to improve edges and near-camera depth.

Variable `spray_id` groups replace the obsolete fixed-stride source adapter.
Multi-direction exposure scoring favors low and level views, including the
bus-height underside. Connected groups are assigned once: geometry leaves and
cards never intentionally duplicate the same source group. The original leaf
transforms are retained for both mesh detail levels. Internal cards are fixed
in space, aligned to the source shoots and slightly inset. Exposure is an
approximation; cards are not guaranteed to remain occluded from every camera.

Eight connected branchlets per species are laid out in a plane before baking:
curved stems, unequal internodes, attached petioles, alternate tree leaves and
opposite arrowwood pairs. Original photographic reference leaf materials supply
unlit color, normal and roughness. Eight single leaf forms share the atlas with
the branchlets. Leaf mesh detail levels simplify the source's curved top blade;
two-sided rendering supplies the reverse face without a duplicated shell.
Fine serration and reverse tissue color are compromises. Sunlight is not baked.

The accepted structural LOD0 wood and its photographic PBR maps are preserved.
Exposed geometric leaf groups also receive reduced curved connecting branchlets;
their triangles are reported separately from structural wood and leaf tissue.

`vegetation/hybrid-lod0` uses the shared framework, authenticates references and
accepted wood, and writes only a fresh ignored review directory. It cannot
publish or change installed models. All exported GLB index counts must agree
with model receipts. Alpha cards require MASK and double-sided rendering;
individual leaf meshes require OPAQUE and double-sided rendering. The existing
UASTC compression and alpha-coverage mip gates remain enabled.

CPU Cycles captures use matched full-tree, reverse, leaf and bus-height cameras.
GPU benchmarking is explicitly deferred because the GPU is occupied. Triangle
counts, rectangle occupancy and estimated transparent footprint are workload
diagnostics, not measured frame time. A later pass may exchange some individual
leaf meshes for trimmed leaf cards after target-device profiling.

The hybrid choice follows the distinction between leaf-card geometry and leaf
meshes in [NVIDIA's SpeedTree rendering chapter](https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-4-next-generation-speedtree-rendering).
Less geometry does not alone establish a faster foliage representation.

## Validated review output — 2026-10-12

The fifteen staged models and gallery are in the ignored directory
`tests/artifacts/screens/vegetation_hybrid_lod0/20261012_final/`. Its `summary.json`
and `triangle-counts.csv` report actual exported index counts. Combined totals
are 47,548 structural wood triangles, 181,740 connecting branchlet triangles,
93,312 card triangles, 248,668 detailed leaf triangles and 510,964 simple leaf
triangles: 1,082,232 triangles across all fifteen models. Foliage alone totals
852,944 triangles. No production assets were replaced.

All fifteen exports passed the existing UASTC quality gates and material/count
validation. The gallery verifies fifty CPU-rendered image files and their source
hashes, including twenty matched reference/hybrid pairs. In the two full-tree
views of mature_01, projected alpha coverage is approximately 94% of reference
for London plane, 98% for silver linden, northern red oak and arrowwood, and
101–102% for American elm. These include wood and describe only the sampled
views, not physical canopy volume or runtime performance. London plane retains
a measurable coverage deficit. Shared front/back albedo also makes silver
linden's undersides greener than the reference. Wind remains unrigged.
