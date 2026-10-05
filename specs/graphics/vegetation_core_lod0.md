# Mature canopy cores and 50K foliage budget

This review derivative follows AI590. Its foliage limit is **50,000 triangles
across all 15 mature specimens combined**. It does not replace gameplay assets.
The immutable detailed source is AI588; the preceding spatial LOD0 is AI590.
Generated packages, captures, counts and reports belong under
`tests/artifacts/screens/ai591_core_canopies/final/`.

## Crown construction

Five deterministic spatial partitions of each reference crown define five
interior centers. Three orthogonal flat planes intersect at each center; their
rotation differs by cluster and mature variant. The plates are fixed in world
space. Interior textures project the existing photographed/baked leaf patches
in depth order, allowing overlap and retaining irregular crown boundaries.
They contain unlit albedo, tangent normal and roughness, not baked sunlight.

Outer candidates come from the reference foliage. Farthest-point spacing keeps
cards from being concentrated in the same pocket. Their orientations blend
reference leaf direction with the local crown outward direction, then vary the
roll. Each exterior tile contains six reference leaves confined to separate
cells. Leaf photos and solid reference shells remain the material source.

Every plate is one surface with two indexed triangles and `doubleSided=true`.
There is no duplicated back geometry. The diffuse-transmission factor remains
0.17. The trade-off is shared front/back tissue color and loss of interior
parallax. The 45 unique core tiles and three shared exterior tiles per species
use a 4096×3072 atlas with alpha-coverage mipmaps. Projected normals are filtered
before compression to avoid subpixel orientation noise. The existing UASTC
PSNR, angular-error and coverage gates remain enabled.

## Wood and validation

The woody mesh targets half the exact preceding triangle count. Ground contact
and local branch endpoints are protected; surface samples that fail the error
limit protect their nearest original mesh neighborhood before retrying at the
same fixed budget. This uses Blender's weighted collapse: zero-weight vertices
cannot collapse, while weighted edge cost discourages long-edge loss.
[Blender implementation](https://github.com/blender/blender/blob/main/source/blender/bmesh/tools/bmesh_decimate_collapse.cc).

The original photographic material and geometric relief are rebaked into
2048² albedo, tangent normal and packed cavity/roughness maps on the new UVs.
Every model records its actual triangle counts, sampled surface error and
manifold check. Acceptance limits are 10 cm p99 and 18 cm maximum distance over
18,000 samples, with no non-manifold edges. The elm's exposed stem below 5 m
preserves the preceding mesh vertices; upper branches absorb the reduction so
large trunk facets do not introduce triangular self-shadow steps.
Diagrams import the final GLB and display actual triangle edges,
including otherwise transparent card boundaries. Gold is wood, orange is the
interior, and cyan is the outer shell.

Comparisons use the same cameras, HDRI, sun, ground, exposure, 1920×1080 output
and 64-sample Cycles settings as AI590. Wireframe diagrams use 32 samples and a
dark background; isolated core plates use a wider field of view so their full
rectangle bounds fit. Frame time and FPS remain not measured: these are staged
assets, without gameplay integration or wind. Texture memory and disk size
must be read alongside the triangle savings; large core atlases have a cost.

## Measured revision workload

The complete set contains 47,548 wood triangles and 50,000 foliage triangles:
450 interior and 49,550 exterior. Each model has 15 interior planes (30 triangles).
The set has 25,000 physical foliage planes versus the previous 135,005 cards.
Counts are verified from GLB index accessors and listed per model in the generated
`triangle-counts.csv` and `.json` files.

| All 15 models loaded | Previous spatial LOD0 | Core LOD0 |
| --- | ---: | ---: |
| Wood triangles | 95,098 | 47,548 |
| Foliage triangles | 540,020 | 50,000 |
| Total triangles | 635,118 | 97,548 |
| Material primitives before batching | 30 | 45 |
| Shared ASTC4×4/BC7 texture memory, full mips | 300.0 MiB | 480.0 MiB |
| Independent GLB texture memory, full mips | 420.0 MiB | 960.0 MiB |
| Shared RGBA fallback, full mips | 1,200.0 MiB | 1,920.0 MiB |
| Gameplay frame time / FPS | Not measured | Not measured |

These are measured exported workloads, not runtime speed estimates. Final
compressed package bytes are recorded in `summary.json` and the review gallery.
Large plates remain apparent from steep underside angles and reduce fine crown
parallax. Sky-region coverage is diagnostic: the London plane and linden keep
roughly 96–100% of reference coverage from the two driving views; oak and elm
lose more coverage and the exact silhouette differs. Shrub sky metrics are
unavailable because it is predominantly in front of the ground. The gallery
retains all comparisons, including these less favorable close-ups.
