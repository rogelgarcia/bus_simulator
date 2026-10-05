# Mature vegetation LOD0

## Spatial canopy revision (AI590)

The direction-grouped AI589 LOD0 remains an immutable comparison baseline. New
derivatives use `placement=spatial` under the same explicit `vegetation/lod0` leaf.
Reuse the accepted wood geometry and baked bark maps byte-for-byte; rebuild only
the foliage. Store revisions under `tests/artifacts/screens/ai590_spatial_canopy/`.

Cluster each spray by actual leaf centers with a smaller leaf-normal term, fit
the patch plane to its real leaf geometry, and match atlas tiles by shape and leaf
count. Do not inflate whole crowns or shift leaves beyond their source branches
to manufacture fullness. After placement, rasterize the actual front/underside
alpha masks from eight azimuths and three elevations (-20, 15, 50 degrees) at
512 square. Remove at most 15% of patches, preserve at least two per spray, and
allow at most 0.25% total silhouette loss in each diagnostic projection. This
orthographic sample is a guard; matched perspective renders remain required.

Deliver reference/current/new triptychs for all mature groups, both driving
angles, and trunk/root/canopy closeups. Reusing old captures is valid only with
the same authenticated reference, camera, dimensions, sampling and lighting.
Report wood (trunk, branches and roots) separately from foliage for all 15
models. Verify actual GLB indices rather than relying only on intended budgets.
Report projected coverage and geometry savings independently of unmeasured
runtime frame time/FPS. Fewer triangles and fewer opaque sample overlaps are not
a measured GPU performance improvement.

Measured AI590 geometry (wood is unchanged; leaf counts include both card sides):

| Species | Wood 01 / 02 / 03 | Current leaves 01 / 02 / 03 | New leaves 01 / 02 / 03 |
| --- | --- | --- | --- |
| London plane | 6,000 / 6,000 / 8,098 | 40,320 / 43,008 / 39,984 | 34,272 / 36,560 / 34,164 |
| Silver linden | 5,000 / 5,000 / 5,000 | 23,700 / 21,864 / 22,344 | 23,012 / 21,440 / 21,880 |
| Northern red oak | 7,000 / 7,000 / 7,000 | 40,320 / 43,008 / 39,168 | 34,916 / 36,560 / 33,760 |
| American elm | 9,000 / 9,000 / 9,000 | 79,968 / 84,672 / 82,320 | 75,616 / 78,752 / 75,668 |
| Arrowwood viburnum | 4,000 / 4,000 / 4,000 | 11,088 / 13,104 / 15,120 | 9,428 / 11,140 / 12,852 |

All 15 specimens: wood 95,098; foliage 599,988 → 540,020; total
695,086 → 635,118. These counts describe the fixed complete asset inventory,
independent of camera or render settings. Runtime frame time and FPS remain
**not measured**, because the assets have not been integrated into gameplay.

Final matched bus-eye/drive-by sky-region coverage improves in all eight measured
tree views: 89.99–96.26% of the reference becomes 93.18–98.23%. All three-form
group views also improve: plane 93.23→95.82%, linden 86.11→93.36%, oak
92.16→97.29%, elm 92.27→95.96%. These diagnostics include wood and foliage
against sky and exclude ground/shadows. Arrowwood remains visually reviewed
because its sky-region diagnostic is unavailable. This is not a claim of exact
reference equivalence: individual-leaf parallax and fine twig geometry are lost.

The final 30 triptychs use 1920×1080 Cycles captures at 64 samples, OPTIX on RTX
3060, identical source cameras/HDRI/sun/ground/exposure, and decoded final UASTC
textures. Actual new compressed GLBs total 255.502 MiB versus 244.926 MiB for the
baseline; denser atlas content compresses less. Shared GPU texture allocation
remains 300.002 MiB in ASTC4x4/BC7. The gallery emits actual-index counts as CSV/JSON
and validates camera identity before reusing old comparison captures. All 27
framework/baseline/revision checks pass; assets remain outside gameplay.

AI588's species-growth scene is the immutable high-detail reference: London plane,
silver linden, northern red oak, American elm, and arrowwood viburnum, each with
three mature forms. LOD0 is a separate derivative; this task does not replace the
current gameplay catalog. Reference scene SHA-256 and exact geometry counts must
accompany the outputs. Never equate the old pre-instancing manifest count with
the evaluated high-detail foliage count.

## Research and representation

- [Blender Cycles baking](https://docs.blender.org/UATEST/manual/en/4.5/render/cycles/baking.html)
  supports selected-to-active high-to-low baking, UV targets, tangent normals and
  cage/ray distances. Bake unlit color, normal and roughness separately; keep
  illumination out of albedo and reserve gutters around islands.
- [SpeedTree card generator](https://docs9.speedtree.com/modeler/doku.php?id=card_generator)
  documents card deformation and outward-facing leaf normals. This implementation
  chooses fixed small spray surfaces, so turning the driving camera does not rotate
  entire pieces of the canopy. The layout is our design decision, not a claim that
  one card layout is optimal for every species.
- [NVIDIA's SpeedTree rendering chapter](https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-4-next-generation-speedtree-rendering)
  explains cutout alpha testing and alpha-to-coverage for edge aliasing. Export
  alpha MASK, not sorted transparency. Alpha-to-coverage requires MSAA and is a
  later runtime choice, not a property guaranteed by the GLB.
- [SpeedTree's discussion of cutouts and overdraw](https://discussions.unity.com/t/in-depth-explanation-of-speedtree-vs-unreal5-nanite-issues-and-workarounds/1617606/2)
  identifies the tradeoff between very low polygon cutouts and empty transparent
  area. Report atlas occupancy and triangle count together; fewer triangles alone
  do not prove improved frame time.
- [NVIDIA texture mipmap discussion](https://forums.developer.nvidia.com/t/nvidia-texture-tools-exporter-scaling-alpha-for-mipmaps-grass/155854)
  explains alpha coverage scaling and its grazing-angle limitations. Check canopy
  edges and undersides instead of assuming ordinary averaged alpha stays dense.

## Driving review

`GameplayState.computeChaseParams` sets camera distance to at least 8.5 m or 1.35
times vehicle extent, and height to at least 3.2 m or 0.55 times that extent. Review
both elevated chase views and a 2.2 m eye-height roadside view (an explicit review
assumption), changing azimuth, full mature groups, bark/root/fork close-ups, and
upward canopy views. Retain the reference HDRI, sun, ground and exposure.
`GameEngine` uses a 55-degree vertical perspective field of view; the roadside
and drive-by comparisons use that field of view. Close-up studies use longer
lenses, explicitly separate from driving views.

## Original LOD0 representation (AI589)

Wood budgets begin at 4,000–9,000 triangles per specimen. Relax only sub-bark
detail, protect ground-contact vertices, and increase a budget when sampled
surface distance exceeds 6 cm at the 99th percentile or 18 cm maximum. These
18,000 deterministic samples are a diagnostic, not a mathematical Hausdorff bound.
Require closed manifold wood. Reserve more UV space for visible lower trunks;
repack thin islands if occupied area is below 25%. Bake 2048-square color,
tangent-space normal and packed cavity AO/roughness/metalness maps from the actual
source material and final detailed geometry.

Each original spray becomes three fixed patches grouped by leaf-facing direction,
preserving its position and extent. Eight source sprays per species provide
variation. Front and underside are separately captured from the solid leaves into
a 2048 × 1536 atlas (48 tiles). Separate, oppositely wound faces permit distinct
underside shading with backface culling: 12 triangles per spray, two materials per
model. Alpha uses MASK at 0.5. Small group parallax and fine spray twigs are lost;
normal maps preserve surface shading but do not recreate geometric thickness.

Atlas color is captured in linear light and explicitly encoded to sRGB PNG;
normal/ORM channels remain linear. Color edge padding takes opaque interior
texels, avoiding bright premultiplication fringes. Mip levels 1–5 filter in linear
light and preserve alpha coverage per tile. Terminal tiny levels use conventional
filtering and require inspection if used beyond LOD0 distances.

The compressed package uses [Khronos KTX Software](https://github.com/KhronosGroup/KTX-Software/releases/tag/v4.4.2)
UASTC inside KTX2 with Zstd and embedded mipmaps, via
[`KHR_texture_basisu`](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_texture_basisu).
Decode the final compressed texels for Blender review rather than comparing only
the uncompressed master. Report actual package bytes and ASTC4x4/BC7 block memory
with and without sharing the canopy atlas across variants. These memory figures
depend on device support; they do not promise a particular mobile GPU's format.

The 0.17 thin-leaf diffuse transmission from the reference is preserved through
[`KHR_materials_diffuse_transmission`](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_diffuse_transmission).
Current gameplay integration must add support for it and reuse canopy textures
across variants. No gameplay catalog or material loader is modified by this bake.

## Output and validation contract

`vegetation/lod0` is explicit and stage-only. It uses shared Blender configuration,
declares source files and immutable scene inputs, verifies stable inputs, and
rejects gameplay publication. Store generated assets, maps, measurements and Cycles
comparisons under the prompt-specific gitignored artifact directory. Require finite
geometry, correct UVs and tangent maps, valid glTF alpha MASK materials, consistent
scales, exact counts, all three mature forms, and matched camera/light settings.
Document measured quality limitations and texture memory; do not claim device
performance without a device measurement.

## Original LOD0 workload (AI589)

All 15 final mature forms use 695,086 triangles total (95,098 wood). Reference
wood totals 42,714,158 triangles; reference solid foliage contributes
7,519,031,360 effective triangles including repeated leaf instances. Count the
instances explicitly: this is not a claim that the reference stores billions of
unique vertices or that triangle reduction directly predicts frame time.

| Species | Mature 01 | Mature 02 | Mature 03 |
| --- | ---: | ---: | ---: |
| London plane | 46,320 | 49,008 | 48,082 |
| Silver linden | 28,700 | 26,864 | 27,344 |
| Northern red oak | 47,320 | 50,008 | 46,168 |
| American elm | 88,968 | 93,672 | 91,320 |
| Arrowwood viburnum | 15,088 | 17,104 | 19,120 |

The 60 unique maps consume 1,200 MiB as RGBA8 with mips, or 300.002 MiB as
ASTC4x4/BC7 blocks. Independent GLB loads consume 420.003 MiB unless the game
shares identical canopy textures. The 15 compressed GLBs total 244.926 MiB on
disk; GPU and file costs are different measurements. Texture compression's
lowest base-level PSNR is 29.076 dB, greatest mean normal error is 3.586 degrees,
and greatest whole-image alpha coverage change is 0.0211 percentage points.

Runtime frame time and FPS are **not measured**: these derivatives are staged
outside the gameplay renderer. Offline comparison settings are Blender 5.2.1,
Cycles OPTIX on RTX 3060, 1920 × 1080, 64 samples with denoising and adaptive
sampling. Each image is one quality capture, without a benchmark warm-up or a
frame-time distribution. Cycles capture duration is not a gameplay FPS proxy.

There are 30 matched pairs and 15 background-only diagnostic captures. On the
four tree species, bus-height sky-region coverage is 90.0–96.3% of the reference;
group views retain 86.1–93.2%. These image diagnostics include foreground wood
and leaves against sky, exclude ground/shadows, and are not perceptual equivalence
scores. Mark them unavailable when too little of the object crosses the sky, as
with arrowwood, rather than reporting a misleading zero. The interactive gallery
and raw captures remain under `tests/artifacts/screens/ai589_lod0_vegetation/final/`.
