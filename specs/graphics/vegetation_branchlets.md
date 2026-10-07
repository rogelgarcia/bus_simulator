# Mature foliage branchlet revision

AI594 replaces exterior leaf grids in all fifteen LOD0 and fifteen LOD1 review
models. Trunks, roots and main branches are accepted immutable geometry. Core
card geometry and core atlas pixels remain unchanged. Preserve both old sets and
the installed LOD0 catalog.

Exterior cards depict connected branching twigs, petioles and original 3D leaf
shells carrying the existing photographic PBR. Vary internodes, shoot length,
leaf size, tilt, rotation and gaps. Leaves attach to the twig graph, rather than
being scattered in a texture grid. Three edge sprites per species and LOD have
different topology or density. LOD1 uses larger connected shoots instead of
repeating disconnected patches. Cards follow growth directions sampled from the
detailed reference, remain fixed double-sided planes and retain alpha MASK 0.5
and diffuse transmission 0.17.

Each exterior rectangle must match the physical width/height ratio of its
authored branchlet while preserving its chosen area. Reusing the previous
six-leaf-grid aspect stretches oak and elm foliage into narrow strips; a
regression test checks the actual exported layout against each sprite's authored
ratio. Normal vectors receive the corresponding inverse-transpose correction
after atlas projection so their tangent frame matches the physical rectangle.

Budgets remain 50,000 foliage triangles across all fifteen LOD0 models and
15,366 across all fifteen LOD1 models. Accepted wood remains 47,548 / 23,640.
Check actual exported attributes, wood and core fingerprints, photographic PBR
provenance, compression quality, and 24 canopy projections per model. Full-tree
comparisons show before/after for both levels, with identical bus-eye cameras,
HDRI, sun and soil. Isolated branchlet images expose the leaf organization.

The registered `vegetation/branchlets` leaf is stage-only and uses shared
configuration. Review outputs live under
`tests/artifacts/screens/ai594_branchlet_canopies/final/`. There is no gameplay
performance claim or catalog publication in this revision.

## Measured canopy revision

The thirty models retain their exact triangle counts. Across 720 alpha-mask
projections (24 per model), revised occupied coverage is 97.71–102.92% of the
corresponding previous LOD. At most 1.20% of occupied pixels lie outside the old
mask dilated by two pixels. These are silhouette/coverage measurements, not
visibility correctness or frame-time measurements.

| All 15 mature forms per LOD | Previous wood | New wood | Previous foliage | New foliage |
| --- | ---: | ---: | ---: | ---: |
| LOD0 | 47,548 | 47,548 | 50,000 | 50,000 |
| LOD1 | 23,640 | 23,640 | 15,366 | 15,366 |

LOD0 exterior sprites contain eight, nine and ten leaves on connected shoots.
LOD1 uses eight, eighteen and thirty-six leaves; silver linden uses eight,
twelve and eighteen. Sprite leaf counts are texture content, not extra geometry.
The accepted game atlas `assets/trees/Textures/T_Leaf_Realistic9.TGA` was inspected
for twig/leaf organization only. New sprites use the retained AI588 photographic
leaf shells and their original material provenance.

All thirty revised foliage maps pass UASTC quality gates: worst PSNR 29.15 dB,
worst mean normal error 3.70 degrees, and maximum base-level alpha coverage
change 0.0036 percentage points. Accepted compressed bark payloads are copied
byte-for-byte. Base-level interior atlas pixels and all wood/core geometry
attributes, including tangent frames, are independently compared with the
preserved inputs.

Final quality captures use Blender 5.2.1 Cycles, RTX 3060 OPTIX, 1200×1080,
32 samples, denoising, AgX and the inherited HDRI/sun/soil. Each mature form
has four matched full-tree images: previous LOD0, revised LOD0, previous LOD1,
revised LOD1. All four share a 2.2 m camera eye height and identical framing.
Gameplay FPS/frame time are not measured because the new models are isolated
review assets; unchanged triangle counts do not establish equal GPU cost.
