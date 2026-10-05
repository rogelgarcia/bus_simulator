# DONE

# Problem

The five species and their three mature forms are high-detail references. Their
solid foliage and detailed bark geometry are too expensive for gameplay.

# Request

Create separate LOD0 versions with the greatest practical triangle reduction while
retaining the references' appearance. Bake real PBR maps from the reference wood
and solid leaves. Research canopy alpha cards and account for views from a bus.
Render matched full-tree and close-up comparisons for every species.

Tasks:
- [x] Preserve and authenticate all 15 current reference models.
- [x] Research card layout, transparency, shading, undersides, and driving views.
- [x] Bake wood PBR maps and retain trunk curves, bifurcations, and root transitions.
- [x] Build efficient canopy alpha cards from the existing solid leaves.
- [x] Export and validate 15 separate LOD0 models without replacing gameplay trees.
- [x] Render matching reference/LOD0 views, including bark and canopy close-ups.
- [x] Record measured triangle counts, texture costs, fidelity limits, and validation.

# Acceptance

Use isolated headless Blender through the existing bake framework. Keep screenshots
and generated derivatives under `tests/artifacts/screens/ai589_lod0_vegetation/`.
Do not modify the immutable reference scene or publish to the active game library.
Update `specs/graphics/vegetation_lod0.md` and the bake framework documentation.

# Measured workload

| Same 15 mature forms | Detailed references | LOD0 |
| --- | ---: | ---: |
| Effective triangles, including leaf instances | 7,561,745,518 | 695,086 |
| Wood triangles | 42,714,158 | 95,098 |
| Material draws per model | Not measured in gameplay | 2 exported primitives |
| Runtime frame time | Not measured | Not measured |
| Runtime FPS | Not measured | Not measured |

| Same 60 LOD0 textures, full mip chains | RGBA8 | ASTC4x4 / BC7 |
| --- | ---: | ---: |
| GPU texture bytes with shared canopy maps | 1,200 MiB | 300.002 MiB |

Independent GLB loads use 420.003 MiB unless the future loader deduplicates canopy
maps. All 15 compressed GLBs total 244.926 MiB on disk. These are measured payload
and block-format costs, excluding driver overhead; unsupported GPU formats differ.

Comparison conditions: Blender 5.2.1 / Cycles OPTIX, NVIDIA RTX 3060, 1920 × 1080,
64-sample limit, adaptive sampling and denoising, identical HDRI/sun/ground/exposure
and paired camera coordinates. Six poses per species include all three mature
forms, bus-height views, bark, roots and canopy undersides. Each is one offline
quality capture; no benchmark warm-up or frame-time statistic was collected.
Runtime frame time and FPS are unavailable because these staged assets have not
been integrated into or timed in the game. Effective reference triangle counts
include reused leaf instances, not billions of unique stored vertices.

Primary limitations: reduced bark silhouette relief at extreme close range,
flattened leaf depth inside each card, omitted fine spray twigs, and no wind rig.
Game integration must support the exported diffuse leaf transmission and texture
sharing. The current gameplay tree library is unchanged.

# Completion

- Authenticated the immutable reference scene and extracted actual instanced geometry counts for all 15 specimens.
- Baked photographic wood color, tangent normals and cavity/roughness maps onto reduced, closed trunks.
- Converted solid leaf sprays into three direction groups with separate top/underside alpha cards and coverage-preserving mip images.
- Exported 15 editable Blender models, PNG masters, compressed KTX2 GLBs and exact decoded review copies.
- Rendered 30 matched comparison pairs plus 15 background images, including corrected shrub root views, using the final compressed texels.
- Built `tests/artifacts/screens/ai589_lod0_vegetation/final/index.html` with species/view selectors, a comparison slider, model downloads, credits and measurements.
- Passed 7 asset-validation tests and 13 shared bake-framework tests; restored the previous selected-test setting.

Bus-height sky-region coverage ranges from 90.0% to 96.3% of the reference for the
four tree species. Group-view coverage ranges from 86.1% to 93.2%. Pixelwise
silhouette overlap is lower because leaf positions differ inside the cards.
This diagnostic excludes the ground and shadows; it is unavailable for the low
arrowwood shrub rather than being reported as a misleading zero. Visual review
confirms the expected loss of close-range bark relief and leaf/twig parallax.
