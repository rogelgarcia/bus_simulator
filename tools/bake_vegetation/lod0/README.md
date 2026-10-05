# Mature tree LOD0 derivatives

Use the registered `vegetation/lod0` leaf through `node tools/bake.mjs` and the
shared gitignored Blender configuration. This explicit review job never publishes
or replaces gameplay assets. AI588's packed growth scene is the immutable source.

```sh
node tools/bake.mjs --target vegetation/lod0 --set vegetation/lod0:phase=inspect
node tools/bake.mjs --target vegetation/lod0 --set vegetation/lod0:phase=atlas --set vegetation/lod0:models=london_plane/mature_01
```

Phases: `inspect`, `atlas`, `wood`, `cards`, `compress`, `render`, `gallery`, `build`,
`canopy`, `all`. `build` makes uncompressed models; `canopy` rebuilds cards and
renders; `all` builds, compresses, renders, and assembles the gallery. `models` is `all` or
a comma-separated list of `species/mature_0N` identifiers. `scene` selects an
authenticated complete AI588 reference directory; `output` must stay in a separate
directory beneath `tests/artifacts/screens/`. Default review output is
`tests/artifacts/screens/ai589_lod0_vegetation/final/`.

The pipeline preserves species, three mature forms, branch unions, root flares,
and trunk sweeps. Wood uses UV-space high-to-low baking. Canopies use small fixed
spray cards derived from the actual solid reference leaves, with distinct front
and underside textures. No camera-facing whole-tree billboards are used.

The `compress` phase uses the official portable Khronos KTX Software 4.4.2 Web
encoder, not a system installation. Place `libktx.js` and `libktx.wasm` from
[the official archive](https://github.com/KhronosGroup/KTX-Software/releases/download/v4.4.2/KTX-Software-4.4.2-Web-libktx.zip)
in `downloads/tools/ktx-4.4.2/`. The archive SHA-256 is
`1d4598a290ccb654d6a33c074c4ca96f0c5ccef99e042323eaa4d1230d4de63d`;
the module authenticates both extracted files before executing them. This is an
offline tool dependency, never a gameplay runtime dependency. Khronos's
[source and licenses](https://github.com/KhronosGroup/KTX-Software/tree/v4.4.2)
remain authoritative. The job does not download dependencies automatically.

Primary GLBs use KTX2/UASTC with full mip chains. `*_source.glb` preserves the
uncompressed PNG master; `*_review.glb` embeds the exact decompressed UASTC texels
for Blender comparison. Fine alpha coverage is preserved per tile through five
mip levels. Texture compression records PSNR, normal error, cutout coverage and
GPU block memory. The gallery compares all five species and links all 15 assets.

Roadside/drive-by cameras use the game's 55-degree vertical field of view. The
other cameras deliberately frame groups or close-ups. Cutout rendering restores
the glTF diffuse-transmission factor in Cycles because the Blender importer does
not reproduce that extension by itself.

See `specs/graphics/vegetation_lod0.md` for the research and acceptance contract.

## Spatial canopy revision

`placement=spatial` fits compact position/normal leaf clusters, chooses matching
atlas shapes, and removes redundant cards using 24 alpha-mask projections.
It retains at least two patches per original spray and bounds per-view projected
coverage loss to 0.25%. These diagnostic projections do not prove runtime speed.

Use `phase=spatial-build` with `baseline` pointing to the preserved original LOD0
directory and `output` pointing to a new review directory. This authenticates and
copies the accepted wood/maps, then rebuilds only atlases and canopies. Follow with
`compress`, `render` (`representations=lod0` avoids redundant reference rendering),
and `revision-gallery`. Carry the same `baseline`, `output`, and `placement=spatial`
options through every phase. The gallery authenticates and reuses matching old
captures, generates 30 labeled three-way images plus an overview, and reports
wood and foliage triangles separately. It uses the existing Playwright dependency
to capture the review presentation after Cycles has rendered the actual assets.

AI590 outputs live under `tests/artifacts/screens/ai590_spatial_canopy/final/`.
The original AI589 output remains intact. Neither directory is a gameplay catalog.
# Core canopy / combined 50K foliage revision

Use the same registered `vegetation/lod0` leaf with `placement=core`, the preserved
AI590 output as `baseline`, and a separate output directory. `atlas` builds all
three mature layouts per selected species, `wood` halves the preceding actual
wood counts with protected branch endpoints and ground contact, and `cards`
exports single-surface, double-sided GLB planes. `compress` retains the existing
UASTC quality gates; `render`, `wireframe`, and `core-gallery` produce matched
shaded comparisons and actual exported triangle diagrams.

```sh
node tools/bake.mjs --target vegetation/lod0 --set vegetation/lod0:phase=build --set vegetation/lod0:placement=core --set vegetation/lod0:baseline=tests/artifacts/screens/ai590_spatial_canopy/final --set vegetation/lod0:output=tests/artifacts/screens/ai591_core_canopies/final
```

The global allocation is 25,000 double-sided planes / 50,000 triangles across
all 15 specimens, never 50K per tree. Each model has five interior centers with
three orthogonal planes each. Exterior plates contain six separated individual
leaves. Layouts are fixed in world space, with no camera-facing rotation.
The 4096×3072 species atlas packs 45 mature-specific interior projections and
three shared exterior tiles. Large plate depth and independent underside color
are lost; texture memory rises relative to the 2048×1536 spatial atlas.

Wood keeps its 2048² photographic base color, tangent normal and cavity/roughness
maps rebaked from the immutable reference. At fixed half budget, failed surface
samples protect their nearest branch vertices before another collapse attempt.
The new derivative allows at most 10 cm p99 / 18 cm maximum sampled error;
historical direction/spatial wood gates remain 6 cm / 18 cm. Exact measured
errors, candidates and actual counts are recorded in each `wood.json`.

`wireframe` imports final review GLBs and shows triangle edges without alpha
clipping, including the 15 isolated core plates, three mature variants and a
wood close-up per species. It does not manufacture geometry from leaf pixels.
