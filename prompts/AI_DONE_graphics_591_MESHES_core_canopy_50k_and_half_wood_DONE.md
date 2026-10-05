# DONE

# Problem

The 15 mature LOD0 specimens still use 540,020 foliage triangles and 95,098 wood triangles. Local leaf cards overlap without supplying enough efficient canopy volume.

# Request

- Limit foliage to 50,000 actual triangles across all 15 models combined.
- Use at most five interior canopy centers per model, each with three flat, double-sided planes. Their baked leaves may overlap and supply the canopy mass.
- Shape the outside with flat, double-sided cards containing separate individual leaves laid side by side.
- Attempt a 50% reduction of trunk, branch and root triangles, rebaking photographic PBR detail and measuring geometric error.
- Preserve the immutable detailed references and both earlier LOD0 versions. Do not replace gameplay trees.
- Render the revised models, matched reference/current/new comparisons and close-ups, and actual exported-geometry wireframes.
- Put all generated evidence under `tests/artifacts/screens/ai591_core_canopies/`.

## On completion

- Mark this document DONE and rename to `AI_DONE_graphics_591_MESHES_core_canopy_50k_and_half_wood_DONE.md`.
- Report separate wood, interior foliage and exterior foliage triangles for every specimen.
- Include comparable before/after workload metrics, texture memory and package size. Report frame time/FPS as not measured unless tested in the game; identify render hardware, settings and cameras separately.

## Completed changes

- Built all 15 mature specimens with five interior centers, three orthogonal double-sided planes per center, and spaced exterior cards with six non-overlapping leaves each.
- Baked interior projections and exterior leaf PBR from the existing photographic reference materials, with corrected linear-color handling and alpha-preserving mipmaps.
- Halved all woody meshes and rebaked their PBR; protected the elm's exposed lower-stem curvature to remove a triangular self-shadow defect without increasing its budget.
- Exported compressed KTX2/UASTC GLBs, exact decoded review GLBs, PNG masters and editable packed Blender models.
- Generated 30 matched three-way shaded comparisons, 20 actual exported-geometry wireframes, five wireframe boards and one all-species shaded overview.
- Preserved AI588 references, AI589 and AI590 derivatives, and current gameplay trees; kept all new assets and captures in the gitignored AI591 review directory.

## Measured before / after

| All 15 mature models | Previous spatial LOD0 | New core LOD0 |
| --- | ---: | ---: |
| Wood triangles, including branches and roots | 95,098 | 47,548 |
| Foliage triangles | 540,020 | 50,000 |
| Total triangles | 635,118 | 97,548 |
| Physical foliage planes | 135,005 | 25,000 |
| Material primitives before renderer batching | 30 | 45 |
| Shared ASTC4×4 / BC7 textures, full mips | 300.0 MiB | 480.0 MiB |
| Independently loaded GLB textures, full mips | 420.0 MiB | 960.0 MiB |
| Shared uncompressed RGBA fallback, full mips | 1,200.0 MiB | 1,920.0 MiB |
| Combined compressed GLB files | 255.502 MiB | 366.245 MiB |
| Gameplay frame time / FPS | Not measured | Not measured |

The 50K limit applies to the complete set. One single-surface double-sided plane
uses two indexed triangles, including both visible sides. Geometry counts come
from the actual GLB index accessors. Texture memory is calculated from encoded
dimensions, block format and every mip, not a driver allocation measurement.
Draw counts are exported material primitives, not measured runtime submissions.

Shaded captures use Blender 5.2.1 Cycles / RTX 3060 OPTIX, 1920×1080, 64 samples,
denoising and a 0.015 adaptive threshold. Reference HDRI, sun, dirt ground,
exposure and cameras match the previous version. Six views per species cover
three mature forms, 2.2 m roadside and 3.2 m opposite driving views, trunk, roots
and canopy underside. Both driving views use 55° vertical FOV. Wireframes use
32 samples and a dark background; isolated core diagrams widen the FOV to show
all rectangular bounds. Gameplay warm-up, timing samples and timing statistics
are not applicable: these assets remain outside the gameplay renderer.

## Actual triangles per model

| Model | Wood | Interior leaves | Exterior leaves | Total |
| --- | ---: | ---: | ---: | ---: |
| London plane 01 | 3,000 | 30 | 3,378 | 6,408 |
| London plane 02 | 3,000 | 30 | 3,490 | 6,520 |
| London plane 03 | 4,048 | 30 | 3,374 | 7,452 |
| Silver linden 01 | 2,500 | 30 | 2,764 | 5,294 |
| Silver linden 02 | 2,500 | 30 | 2,666 | 5,196 |
| Silver linden 03 | 2,500 | 30 | 2,694 | 5,224 |
| Northern red oak 01 | 3,500 | 30 | 3,410 | 6,940 |
| Northern red oak 02 | 3,500 | 30 | 3,490 | 7,020 |
| Northern red oak 03 | 3,500 | 30 | 3,352 | 6,882 |
| American elm 01 | 4,500 | 30 | 5,032 | 9,562 |
| American elm 02 | 4,500 | 30 | 5,136 | 9,666 |
| American elm 03 | 4,500 | 30 | 5,034 | 9,564 |
| Arrowwood viburnum 01 | 2,000 | 30 | 1,758 | 3,788 |
| Arrowwood viburnum 02 | 2,000 | 30 | 1,914 | 3,944 |
| Arrowwood viburnum 03 | 2,000 | 30 | 2,058 | 4,088 |
| **Total** | **47,548** | **450** | **49,550** | **97,548** |

## Validation and limits

35 checks pass: bake framework (13), original LOD0 (7), preserved spatial LOD0
(7), and core revision (8). Final compression meets the unchanged PSNR ≥28 dB,
mean normal-angle error ≤6°, and alpha-coverage error ≤0.015 gates. All woody
meshes are manifold before UV splitting. Over 18,000 reference samples per
model, the worst model p99 is 7.18 cm and the largest measured error is 16.11 cm.

The large plates lose local depth, reveal their intersections at steep angles,
and share front/back tissue color. Some crowns are thinner and their precise
outlines differ from the reference. Larger atlases increase texture residency
despite the geometry savings. Fine spray twigs and wind are absent; integrating
leaf transmission and shared texture loading into gameplay remains separate.

Review: `tests/artifacts/screens/ai591_core_canopies/final/index.html`.
Per-model counts: `triangle-counts.csv` / `triangle-counts.json` in that directory.
Exact resource measurements: `summary.json` / `revision.json`.
