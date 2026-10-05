# Historical first London plane implementation

This records the first prototype and its measurements. The user's 2026-10-03
scope supersedes its young/mature forms, Desktop/Mobile split and gameplay hook.
The current contract is [Original urban vegetation library](urban_vegetation_assets.md):
one low-cost implementation and three mature variants per species, available in
the asset library/Inspector Room without replacing current city trees. The old
API, filenames and source-identity integration described below are retired.

## Scope

AI 577's first implementation covers London plane (*Platanus × acerifolia*):
young street, mature full-canopy and spreading park forms, each with Desktop and
Mobile geometry. The user's "bold leaves" means abundant leaves and canopy
coverage. Leaf dimensions remain natural. Silver linden, northern red oak and
arrowwood viburnum remain future work in the same active prompt.

This is a selectable first-species integration. The existing city's default tree
family remains `legacy` while its authenticated production lighting and visibility
assets still describe that family. Selecting `london-plane` changes the source
identity. Old-pack bakes cannot certify it; full-city replacement/bake publication
is a later migration step.

## Asset and authoring contract

The reproducible source is `tools/bake_vegetation/london_plane/`, including a seeded
recipe and original procedural geometry/texture authoring. The entry point is:

```sh
node tools/bake.mjs --target vegetation/london-plane
node tools/bake.mjs --target vegetation/london-plane --publish
```

The first command stages and validates; the second explicitly installs validated
assets. Both use the shared `tools/baking/blender.local.json`. User instructions
for this implementation require **headless Blender**. No existing interactive
session is used, and the authoring process uses isolated output paths.

Runtime assets live in the gitignored `assets/public/vegetation/london_plane/`:

- `{young,mature,spreading}_{desktop,mobile}.glb`
- `textures/` containing original bark and foliage maps
- `index.json` with asset inventory, geometry counts, dimensions and provenance
- `PROVENANCE.md` with ownership and texture-channel information

Each GLB uses metres, Y up and trunk-base Y=0, with two materials/primitives named
`bark` and `foliage`. Both are standard metallic/roughness materials with zero
metalness. Base-color maps use sRGB; normal and packed material maps are linear.
The texture recipe uses a 1024px bark set and a four-cell leafy-twig atlas.
Maps are embedded for self-contained loading and retained separately for authoring
inspection. Runtime templates share one material pair per quality tier.

The crown is built around irregular trunk/scaffold/secondary/twig structure.
Desktop combines flat cards with approximately 55% folded cards and a small
number of shallow bark-peel fins. Mobile uses simpler branch geometry and flat
cards with a deterministic 72% retention probability.
The fins are authored geometry, not geometry-shader silhouette extrusion or
parallax ray marching. Mottled bark maps provide most surface detail.

### Published geometry budget

| Variant | Desktop triangles | Mobile triangles | Desktop dimensions W × H × D (m) |
| --- | ---: | ---: | --- |
| Young street | 11,508 | 3,772 | 7.284 × 8.932 × 8.110 |
| Mature full canopy | 28,824 | 8,690 | 13.617 × 12.804 × 12.845 |
| Spreading park | 30,660 | 9,354 | 12.526 × 11.522 × 14.143 |

Each variant has two material draws per color pass. The structural publication
caps are 35,000 Desktop / 12,000 Mobile triangles; these caps alone are not a
claim of improved frame rate. Desktop GLBs range from 3.15–4.21 MB and Mobile
from 2.79–3.20 MB, including embedded copies of the same six 1024px maps. The
runtime deduplicates decoded materials/textures across variants within a tier.
The manifest records exact bytes, bounds, card counts, hashes and seeds. Mobile
retains the corresponding crown, with minor bounds differences from removed cards.

The mature Desktop uses 3,360 cards: 1,470 flat and 1,890 folded. Its Mobile
counterpart uses 2,409 flat cards. The fork hierarchy supports a broad irregular
crown with layered clusters, fine twigs and natural gaps; foliage was redistributed
through several native-render reviews rather than enlarged to fill empty space.

## Runtime and catalog

`src/graphics/engine3d/vegetation/LondonPlaneTreeLoader.js` loads the three variants
as a cached, all-ready family. Errors reject explicitly and permit a later retry.
The loader validates material roles, texture readiness, ground alignment and
finite bounds; foliage and trunk remain separately identifiable.

Stable collections:

| Collection | Entries |
| --- | --- |
| `mesh_collection.london_plane_desktop` | `tree.london-plane.desktop.young`, `.mature`, `.spreading` |
| `mesh_collection.london_plane_mobile` | `tree.london-plane.mobile.young`, `.mature`, `.spreading` |

The Inspector Room exposes both collections. Existing legacy IDs keep their
meaning. The game and Lab Scene accept `?treeSpecies=london-plane`, with existing
`treeQuality=desktop` or `treeQuality=mobile`; explicit `config.trees.species`
can also select the family. `loadTreeTemplates(quality, {species})` and
`loadTreeMaterials({quality, species})` support explicit family selection.
The original-family path does not request `/assets/trees/` geometry or textures.

City placement still follows `tree_placement_exclusions.md`, seeded variant
selection, existing height/scale settings and ground alignment. This pass does
not introduce automatic distance LOD switching: Desktop and Mobile remain quality
tiers. Every tier has corresponding source variants.

Placed trees share geometry and materials through ordinary object clones; this
pass does not add GPU instancing. Existing city height settings scale the entire
tree, while the catalog/showcase can display its authored metre dimensions.
Placement exclusions remain trunk-based with the existing traffic-control canopy
clearance; they do not introduce general crown-to-building collision detection.

## Lighting and bake identity

Foliage retains hard alpha cutoff 0.5, double-sided visible/shadow rendering,
depth writes, `transparent=false`, `alphaToCoverage=false`, `isFoliage`,
`preserveShadowSide` and a dedicated AO coverage texture. Texture alpha denotes
leaf coverage. The material uses normal/roughness detail for sunlight response.

This pass uses the supported standard material path. It does not claim a custom
thickness-dependent leaf transmission shader, dynamic wind, or baked canopy AO.
Front/side/back sunlight captures document its actual response. Dedicated leaf
transmission remains an explicit later material task requiring bake parity.

`createStaticVisibilityCityHashInput`, resolved-city source records and tree
provenance include `species` and `assetRevision` for nonlegacy trees. Omission and
explicit `legacy` preserve previous identities exactly. Increment the authored
revision and matching runtime `LONDON_PLANE_ASSET_REVISION` when changing this
asset family's geometry or maps. The evaluated geometry/material hashes remain
authoritative for lighting channels as before. Asset publication alone does not
publish new city lighting or visibility data.

## References and ownership

All runtime geometry and textures are newly authored from the deterministic
recipe. No existing licensed tree mesh or map is a generation input.

- [Morton Arboretum: London planetree](https://mortonarb.org/plant-and-protect/trees-and-plants/london-planetree/)
  supplies botanical crown, leaf and bark guidance.
- [Woodland Trust: London plane](https://www.woodlandtrust.org.uk/trees-woods-and-wildlife/british-trees/a-z-of-british-trees/london-plane/)
  supplies supplemental botanical guidance and linked visual references; those
  photographs are not packaged as runtime textures.
- [Lynn Greyling: Plane Tree Trunk, CC0](https://www.publicdomainpictures.net/en/view-image.php?image=78912&picture=plane-tree-trunk)
  is the local reference for mottled pale bark and peeling edges. The unmodified
  reference copy is `tests/artifacts/screens/ai577_urban_vegetation/london_plane/references/plane_trunk_lynn_greyling.jpg`.
- [George Hodan: Bark of plane tree, CC0](https://www.publicdomainpictures.net/en/view-image.php?image=247478&picture=bark-of-plane-tree)
  was inspected as a coarse basal-bark comparison, not used as the all-over bark
  texture. Its reference copy is alongside the Greyling image.
- [GPU Gems 3, Chapter 4](https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-4-next-generation-speedtree-rendering)
  informed the selective silhouette-detail concept; its old geometry-shader
  implementation is not incorporated.

## Validation

The deterministic `london_plane_showcase` harness and its capture test own visual
evidence under `tests/artifacts/screens/ai577_urban_vegetation/london_plane/`.
They use an HDRI for background and reflections, fixed sunlight and camera poses,
and capture native UHD 4K output. Geometry, material, quality and legacy-dependency
checks accompany the render comparison. Hardware/renderer, sampling and workload
must accompany performance results; isolated rendering does not establish full
city gameplay performance.

Focused regressions cover source identity changes, legacy hash preservation,
catalog compatibility, asset loading/readiness and foliage material semantics.
Run them with `node tools/run_selected_test/run.mjs` after selecting the relevant
test. Generated evidence and asset binaries remain gitignored.

The actual Lab city reached 73/73 ready trees with no `/assets/trees/` requests or
browser errors. The field regression also verifies deterministic placements,
transforms, configured heights, base alignment, shared resources and provenance.
Node checks pass for catalog mapping (2), species/revision identity (3), static
visibility (11), placement exclusions (4) and legacy orientation (1).

Three existing AO/bloom fixture tests fail in this environment and also fail
against pre-change commit `de7af7ffb200d98ea4785cd43c8e38d69a280f82`. A serial
baseline served the six changed runtime/harness modules from `git show HEAD`
through an isolated HTTP overlay; test assertions were verified unchanged and
the working source/assets were not modified. These are not claimed as passing
compatibility tests, and their thresholds/shaders were not changed.

| Existing fixture assertion | Pre-change baseline result | Expected |
| --- | ---: | ---: |
| GTAO excluded foliage changed-pixel ratio | 0.018301 | <0.01 |
| Sun-aligned green leaf pixel count | 332 | >1000 |
| Bloom selective building probe luminance | 0 | >0.02 |

Baseline evidence lives under
`tests/artifacts/screens/ai577_urban_vegetation/london_plane/compatibility_baseline/`.
The London-plane-specific check independently compares every decoded leaf alpha
pixel with its linear AO coverage texture and validates cutoff, sidedness,
orientation and the presence of both solid leaves and transparent gaps.

## Final capture and performance evidence

The final asset test passes (1/1), field/Lab tests pass (2/2), and the capture
test passes with 14 images at 3840×2160. Front, three-quarter, low-angle, bark,
leaf, variant lineup and front/side/back sun views were inspected in the native
game renderer. The showcase uses the same HDRI for visible background and
environment, ACES exposure 1 and alpha-tested PCF shadows. It bypasses the city
compositor/postprocessing and does not establish baked-lighting parity.

The final manifest SHA-256 before and after capture is
`87e5c845e76249e8098f3acc7c07aaf44a64545e317f0a8663d92230dda77495`.
The authoring compiler identity is
`300b39852bc4628028c302de2783db687a14cbeb99e93607b5cb499603c478d3`.
`capture_report.json` records the exact published inventory and measurements.

At the fixed 256px silhouette probe, Mobile retains 84.4% / 90.2% / 91.3% of
Desktop projected occupied area for young / mature / spreading, with intersection
over union 81.2% / 87.1% / 87.7%. This is visible silhouette area, including bark,
not an overdraw metric or proof of coverage at all gameplay distances.

### Same-condition isolated comparison

Hardware: AMD Ryzen 5 9600X (6 cores / 12 threads), NVIDIA RTX 3060 via Chrome
ANGLE Direct3D 11. Each subject renders 12 clones at a normalized height of 12m,
with identical 4×3 placements, camera `(24,18,70)` looking at `(0,7,-8)`,
1280×720 target, zero target MSAA samples, ACES exposure 1, environment intensity
0.52 and sunlight intensity 2.7. Ground, shadow passes, AO and city postprocessing
are absent equally. Each subject receives 60 synchronized warmup frames and
60 measured frames in each of three balanced-order rounds.

Timings measure CPU wall time around render plus synchronous one-pixel readback,
including GPU completion, driver/readback overhead and scheduling. They are not
GPU timer-query measurements. FPS-equivalent below is `1000 / mean render ms`
for this isolated workload, **not full-game FPS**. Every row has 24 draw calls.

| Tier / subject | Mean ms | Median of run means (ms) | Worst run p95 (ms) | Isolated FPS-equivalent | Total triangles |
| --- | ---: | ---: | ---: | ---: | ---: |
| Desktop legacy #1 | 0.318 | 0.308 | 0.50 | 3,141 | 115,188 |
| Desktop legacy #9 | 0.296 | 0.302 | 0.40 | 3,377 | 116,556 |
| Desktop legacy #15 | 0.305 | 0.302 | 0.40 | 3,279 | 74,088 |
| Desktop London plane mature | 0.786 | 0.473 | 3.40 | 1,272 | 345,888 |
| Mobile legacy #1 | 0.370 | 0.327 | 0.60 | 2,703 | 29,448 |
| Mobile legacy #9 | 0.308 | 0.330 | 0.50 | 3,243 | 31,080 |
| Mobile legacy #15 | 0.336 | 0.357 | 0.50 | 2,975 | 27,024 |
| Mobile London plane mature | 0.549 | 0.437 | 0.90 | 1,820 | 104,280 |

Residual startup variance remains even with the longer warmup: Desktop London
plane round means span 0.447–1.438ms; Mobile spans 0.433–0.778ms. The outlier is
retained. The earlier six-warmup report is preserved as
`candidate_canopy_v5/benchmark_short_warmup.json`; it is not the final table.

The new model is more expensive than these legacy examples. At equal height its
projected area is also larger: 9,590 Desktop pixels versus 3,254–5,248, and 8,732
Mobile pixels versus 3,334–5,064. Crown size/coverage were not matched, so this
comparison does not isolate efficiency per equivalent visual quality. The mature
Mobile removes about 70% of Desktop triangles while preserving about 90% of its
projected area. It is the lower-cost option, not a demonstrated overall speedup
over the old pack.

Measured mature geometry-buffer storage is 1,560,132 Desktop / 595,188 Mobile
bytes, shared among clones. Texture GPU allocation, true fragment overdraw,
timer-query GPU time, cold network loading time and full-city frame time/FPS are
**not measured**. The isolated harness does not instrument those quantities;
production route profiling and regenerated city bakes remain migration work.
