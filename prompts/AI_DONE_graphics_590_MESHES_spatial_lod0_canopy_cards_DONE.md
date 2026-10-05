# DONE — Spatial LOD0 canopy cards

# Problem

The current LOD0 crowns look less full than the detailed references. Several
alpha cards occupy the same space, wasting geometry while leaving visible gaps.

# Request

Create separate improved LOD0 versions of all five species and their three
mature forms. Preserve the references and current LOD0 as comparison baselines.

Tasks:
- Fit cards to spatially distinct leaf groups and retain crown depth and coverage
  from bus-height views; remove redundant cards where measured coverage permits.
- Reuse the accepted baked trunks and retain photographic leaf PBR and undersides.
- Count trunk and leaf triangles separately for reference, current and new LOD0.
- Render matched three-way comparisons, including all mature forms and closeups.
- Save generated evidence under `tests/artifacts/screens/ai590_spatial_canopy/`.
- Keep this an explicit headless bake using the shared framework and configuration;
  do not replace gameplay trees.

## On completion
- Mark this standard prompt DONE and rename using standard DONE naming.
- Record the measured same-condition before/after geometry and coverage table.
- Report runtime frame time/FPS as not measured if the assets remain staged;
  offline ray tracing is not a runtime benchmark.

## Completion

- Built all 15 mature derivatives with compact spatial leaf groups, fitted planes,
  shape-matched atlas tiles, and alpha-aware removal of redundant cards.
- Retained every original spray and at least two patches per spray; 24-view
  projected coverage loss remains below 0.25% in each pruning diagnostic.
- Preserved all accepted trunks/maps byte-for-byte and left AI588 references,
  AI589 LOD0, and gameplay assets intact.
- Produced 30 matched three-way images, a five-species overview, compressed GLBs,
  editable Blender files, an interactive gallery and actual-index triangle CSV.
- Passed 27 checks: seven revised asset checks, seven baseline checks, and thirteen
  framework checks. Inspected full views, mature groups and leaf closeups.

| Metric, same complete 15-model inventory | Current LOD0 | New LOD0 |
| --- | ---: | ---: |
| Wood triangles (trunks, branches, roots) | 95,098 | 95,098 |
| Leaf triangles, both card sides | 599,988 | 540,020 |
| Alpha patches | 149,997 | 135,005 |
| Total triangles | 695,086 | 635,118 |
| Shared ASTC4x4/BC7 texture allocation, with mips | 300.002 MiB | 300.002 MiB |
| Compressed GLB files, all 15 | 244.926 MiB | 255.502 MiB |
| Runtime frame time | Not measured: staged assets | Not measured: staged assets |
| Runtime FPS | Not measured: staged assets | Not measured: staged assets |

Leaf triangles decrease 9.995%; total triangles decrease 8.627%. The new texture
content compresses to slightly larger files; GPU texture dimensions/allocation are
unchanged. These are actual exported index counts and file sizes, not timing
projections. No gameplay integration or runtime benchmark was performed.

Matched image conditions: Blender 5.2.1 Cycles/OPTIX, RTX 3060, 1920×1080,
64-sample limit, adaptive threshold 0.015 and denoising, original HDRI/sun/ground/
exposure. Each camera is a single quality capture, without runtime warm-up or a
frame-time distribution. Reference/current captures are authenticated reused
images with identical camera and sample metadata; new captures use final
UASTC-decoded texels. Cycles capture time is not a gameplay performance measure.

| Species | Bus-eye coverage, current → new | Opposite driving angle, current → new | Three mature forms, current → new |
| --- | --- | --- | --- |
| London plane | 96.26% → 96.61% | 95.66% → 97.08% | 93.23% → 95.82% |
| Silver linden | 90.87% → 93.18% | 89.99% → 93.87% | 86.11% → 93.36% |
| Northern red oak | 94.21% → 96.60% | 95.25% → 98.23% | 92.16% → 97.29% |
| American elm | 94.68% → 96.10% | 93.21% → 96.78% | 92.27% → 95.96% |

Coverage is foreground relative to reference against the sky, including visible
wood and foliage, excluding ground/shadows. Silhouette overlap improves in all
twelve measured views. Arrowwood is mainly against ground, so this diagnostic is
unavailable; it has matched visual review and the same 24-view pruning guard.
Cards still lose some individual-leaf depth and fine twig geometry at close range.

Artifacts: `tests/artifacts/screens/ai590_spatial_canopy/final/`.
The gallery includes every model's separate reference/current/new wood and leaf
counts. `triangle-counts.csv` and `triangle-counts.json` are calculated from actual
GLB indices, with reference instance counts retained from the authenticated source.
