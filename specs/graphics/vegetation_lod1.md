# Mature vegetation LOD1

AI593 derives all 15 mature forms from the installed AI591/AI592 LOD0 set.
Each complete form must use at most 40% of the corresponding LOD0 triangles,
rounded down to valid faces. Wood receives the triangles needed to preserve
exposed stems and branch ends; foliage receives the remaining budget. LOD0 and the detailed reference remain
immutable. This is an explicit review asset generation step, without automatic
city placement, catalog replacement or commit.

The canopy keeps its five interior centers and 15 double-sided core planes.
Their PBR is reprojected from nearby LOD0 leaves to retain the internal density
that would be lost with simple card deletion. Exterior cards are regrouped with
spatial farthest-point seeds and local clustering, preserving the outer centers
while grouping 6–54 leaves per patch according to the available card budget.
Patch size also follows local leaf density, so isolated silhouette tips do not
inherit the area of distant members of their spatial cluster. Their normals
follow the source patches.
Cards are fixed 3D geometry, not camera-facing whole-tree billboards. New alpha
atlases use 2048×1536 maps with tile-aware coverage-preserving mips; the existing
photographic albedo, normals and roughness supply every texel. A normalized
five-tap normal prefilter suppresses subpixel orientation aliasing before UASTC.

Wood reduction preserves tree vertices below five metres and shrub vertices
below ten centimetres. Quadric edge collapse constrains candidates to the edge,
checks endpoint alternatives and rejects inverted faces, topology changes and
triangles bridging empty branch forks. Source-point lineage limits branch-tip
shrinkage; reverse surface samples catch protruding fins that a source-to-LOD
distance test alone misses. New
UV charts reserve 76% of the map width for the roots, trunk and first forks.
Cycles selected-to-active baking reprojects LOD0 albedo, packed cavity/roughness
and tangent normals onto the actual LOD1 geometry. This prevents edge collapse
from stretching the old UV charts or leaving normals in the old tangent basis.
Require manifold wood, finite exported attributes, no more than
15 cm p99 and 35 cm maximum sampled displacement from LOD0, and a maximum
9 cm reverse face-centroid distance. Sampling is a quality
diagnostic, not a mathematical surface-distance bound. Fine bark remains in PBR.

Record 24 alpha-mask projections (eight azimuths, elevations -12°, 15°, 40°),
coverage ratios, tolerance-envelope spill and opaque fragment samples. These
measure canopy coverage independently from triangle count; they do not measure
GPU time. Check actual exported triangle indices, double-sided alpha MASK and
the preserved 0.17 leaf transmission. UASTC compression uses existing quality
and mip gates. Full-tree Cycles comparisons use decoded final exported textures.

Outputs and full-tree comparison boards belong under
`tests/artifacts/screens/ai593_lod1_canopies/final/`. All 15 forms must be compared
against LOD0 with identical full-tree framing, inherited HDRI/sun/soil and render
settings. No close-ups are needed. Runtime FPS/frame time are not measured
because this pass generates review assets without gameplay integration.

## Measured workload

### Branch reduction investigation

The deterministic failure case was `american_elm/mature_02`, using the registered
geometry and render phases at fixed camera/lighting. Unconstrained Blender
decimation met forward error checks but made visibly stretched upper branches.
Reverse face-centroid measurements exposed the protrusions. Projecting only
vertices back onto LOD0 did not fix triangles spanning empty gaps between limbs.
Pinning their neighborhoods exhausted the whole-tree budget before preserving
enough outer canopy. Bounded edge collapse with endpoint alternatives and
source-point lineage removed those artifacts in the geometry checks while
preserving enough budget for exterior cards. The regression gate measures
reverse face distance in addition to the existing forward and manifold checks.

### Final asset measurements

The 15 complete LOD1 models total **39,006 triangles**, 39.99% of LOD0's 97,548.
Wood contributes 23,640 and foliage 15,366. Foliage uses 7,683 physical planes,
including the unchanged 225 interior planes; leaf triangles decrease by 69.27%.
Counts below aggregate all three mature variants of each species.

| Species | LOD1 wood | LOD1 leaves | LOD1 total | LOD0 total |
| --- | ---: | ---: | ---: | ---: |
| London plane | 4,608 | 3,542 | 8,150 | 20,380 |
| Silver linden | 3,122 | 3,160 | 6,282 | 15,714 |
| Northern red oak | 4,858 | 3,478 | 8,336 | 20,842 |
| American elm | 8,236 | 3,278 | 11,514 | 28,792 |
| Arrowwood viburnum | 2,816 | 1,908 | 4,724 | 11,820 |

Across 360 alpha projections, occupied canopy coverage is 97.04–109.91% of
LOD0. Some crowns are slightly denser. The largest fraction outside
the two-pixel-dilated LOD0 alpha mask is 1.92%; this includes filled internal gaps
as well as silhouette changes. Opaque projected fragment samples total 99.47%
of LOD0: triangle savings do not establish reduced pixel work or better FPS.
Maximum per-model sampled p99 wood displacement is 11.58 cm; maximum individual
sample displacement is 17.00 cm. Maximum reverse face-centroid distance is
8.45 cm. All wood meshes pass the manifold check.

| All 15 models | LOD0 | LOD1 |
| --- | ---: | ---: |
| Material draws | 45 | 45 |
| Standalone embedded GLBs on disk | 366.245 MiB | 203.309 MiB |
| Shared atlas ASTC4x4/BC7 texture blocks, including mips | 480.002 MiB | 300.002 MiB |
| Texture blocks without cross-model sharing | 960.003 MiB | 420.003 MiB |
| Gameplay FPS/frame time | Not measured | Not measured |

These disk numbers compare standalone review GLBs, not the externalized installed
LOD0 package. GPU figures assume compatible block formats and exclude geometry,
framebuffers and driver overhead. Bark is rebaked from authenticated LOD0 PBR
into fresh charts. Every final PBR map passes PSNR ≥28 dB, normal error ≤6° and alpha
coverage error ≤1.5 percentage points; measured worst cases are 29.168 dB, 3.690°
and zero base-level alpha coverage change.

Final comparisons use Blender 5.2.1 Cycles on four bounded CPU threads,
1024×922, 32 samples, denoising, AgX and the inherited HDRI/sun/soil. The first
London plane pair was rendered at 1440×1296 and 64 samples on two CPU threads;
the gallery scales it to the same display size. Each full-tree pair
shares an identical camera at 2.2 m bus eye height, including the shrubs.
These are quality captures, not timed gameplay benchmark samples.

Both LOD sets resident together require approximately 780 MiB of texture blocks,
before geometry/render targets; the rebaked wood does not share UVs or textures
with LOD0. The per-LOD memory figures assume separate residency, not simultaneous
loading. Streaming and runtime LOD switching are outside this review pass.
