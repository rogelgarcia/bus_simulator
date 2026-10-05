# Detailed original vegetation trunks

The accepted wood revisions are London plane v5, arrowwood viburnum v5, silver
linden v4 and northern red oak v4. AI582 preserves this wood exactly in the newer
revisions documented in [solid_species_leaves.md](solid_species_leaves.md).
The manifest schema remains v3. The inventories and receipts below describe the
preceding trunk passes; their foliage-preservation rule applied to those passes.

## Scope and precedence

AI578 supersedes the low-sided wood and triangle budgets recorded for the v2
library in `urban_vegetation_assets.md`. This is a detail-first modeling pass;
optimization follows separately. The library still has one implementation and
three mature forms per species, with no device tier or age selection. Original
gameplay trees and production lighting/visibility bakes remain unchanged.

The twelve models comprise London plane, silver linden, northern red oak and
arrowwood viburnum. Foliage geometry, atlas pixels, materials and card behavior
are retained, including the paired green/silver linden surfaces. Wood changes
must not consume the foliage generator's random sequence or alter its grounding.

## Woody form

Real geometry must carry the silhouette and depth of mature root flares,
buttresses, trunk irregularities, branch collars and bark relief. Connected
trunk/branch volumes must merge into continuous junctions without visible end
caps or intersecting tube rims. Shrubs retain a cluster of distinct arching stems.

Species guide both form and surface. London plane has irregular exfoliating
patches with shallow raised edges; it must not acquire oak-like deep furrows.
Silver linden has aged longitudinal, interlaced ridges. Northern red oak has
broad ridges and irregular longitudinal furrows. Viburnum has finer stem-scale
fissuring. Relief must scale down with branch radius and remain coherent with
the bark material. Smooth young branch tips should not look like rough ropes.

The inspection standard includes map-free neutral clay under oblique light:
changing color or normal maps alone cannot satisfy this requirement. Detail
should survive inspection of roots, trunk sides and major branch forks.

Botanical descriptions checked on 2026-10-03:

- [Morton Arboretum: London planetree](https://mortonarb.org/plant-and-protect/trees-and-plants/london-planetree/):
  exfoliating gray-brown scales and pale mottled exposed patches.
- [Morton Arboretum: silver linden](https://mortonarb.org/plant-and-protect/trees-and-plants/silver-linden/):
  gray bark becomes ridged with age.
- [NC State: northern red oak](https://plants.ces.ncsu.edu/plants/quercus-rubra/):
  broad hard scaly gray ridges with shallow furrows and smooth young stems.
- [NC State: arrowwood viburnum](https://plants.ces.ncsu.edu/plants/viburnum-dentatum/):
  gray-brown bark, reddish tissue in fissures and small surface protrusions.

These descriptions guide original procedural modeling; no photographs from
those pages are incorporated into runtime maps or redistributed as new assets.

## Authoring and delivery

Use the registered `vegetation/<species>` leaves of `node tools/bake.mjs` and
the shared ignored `tools/baking/blender.local.json`. Blender runs headless in
an isolated process, without attaching to an occupied interactive session.
Preserve input authentication, staged validation and rollback publication.

Publish three GLBs, editable per-form Blender sources, map files, authenticated
metadata and provenance per species. Revision v3 identifies this detailed wood
pass. Models remain metric, Y-up, grounded and compatible with the existing
bark/foliage material pair. Do not add runtime shaders solely for the detail.

Validation must cover finite geometry and normals, valid bounds, actual woody
topology and relief, source/payload integrity, unchanged foliage and successful
runtime imports. UV and normal splits are not geometric holes: topology checks
must account for coincident positions. Historical v2 triangle caps are not v3
acceptance criteria. Record costs without claiming optimized performance.

The authoring process records branch paths independently of the foliage random
sequence, constructs higher-resolution wood, then fuses it with voxel remeshing.
Branch starts are buried within parent wood. Five asymmetric lobes extend the
basal trunk rings into an integrated root flare; separate capped root tubes are
not used. The flare decays smoothly with height and reaches the ground plane.
The ground cut is capped without translating the tree or foliage. Terminal
shafts have a recorded minimum radius relative to the union grid so meaningful
branches remain connected. Only bounded sub-resolution remeshing debris may be
removed; substantive disconnected wood fails generation.

Bark uses coherent branch charts: the nearest centerline segment is chosen
within each branch before selecting surface ownership. Buried branch-start cap
projections cannot take ownership of unrelated trunk regions. Sample the two
nearest valid branch fields separately, then blend their scalar relief and linear
color across a narrow surface-distance transition. Never interpolate the angular
UV coordinates of different branch axes: that creates rings and pinched swirls.
A stable frame prevents grain direction from flipping at reference-axis thresholds.
Macro bark color is baked into standard glTF `COLOR_0`; the 2048px bark maps
carry fine residual detail, normals and roughness. Blender sources
multiply their authored color layer by that texture. The exporter normalization
promotes Blender's authored bark layer from `COLOR_1` to `COLOR_0`, leaving the
accepted foliage attributes unchanged. No additional runtime shader is needed.
Species relief and color share a deterministic field. Physical
relief tapers on slender branches and at collars. Geometric scar rims and
recesses add localized age detail. No decimation is applied.

Gates include connected, closed tree wood, ground-connected shrub stems,
structural branch coverage samples and checks for reversed displaced faces.
The browser independently checks exported topology using exact coincident
positions, so UV seams do not count as holes and nearby distinct microedges do
not merge. `tools/bake_vegetation/accepted_foliage.json` stores canonical hashes
for positions, normals, colors, UVs, indices and foliage maps, allowing an empty
asset installation to reproduce the accepted foliage.

## Evidence

AI581 corrects the arrowwood shrub stems in all three mature variants. Lower
stems have independent deterministic bends of 25–55mm, varied diameters and
gently oval cross-sections. Changes affect wood only and preserve foliage hashes.
Each basal stem extends 75mm below the authoring ground cut and grows five
irregular lobes. Flares taper within 180mm of the soil plane and flatten toward
the outer ground intersection; the final closed mesh is capped exactly at zero.

The shrub uses Rob Tuytel's [Bark Brown 02](https://polyhaven.com/a/bark_brown_02)
from Poly Haven under [CC0](https://polyhaven.com/license), checked 2026-10-03.
The 1m source is adapted to narrow shrub stems with a 0.32m vertical repeat,
independent stem phases and one circumference per main stem. This is generic
photographic bark, not a species-specific Viburnum scan. Source URLs, date and
SHA-256 hashes are tracked in `tools/bake_vegetation/arrowwood_viburnum/source/`;
original PNGs live in `assets/public/vegetation_sources/bark_brown_02/` and are
copied into each publication's `sources/bark_brown_02/`. Powered by Poly Haven.

Photographic macro color is separated from residual luminance and sampled into
linear vertex colors, blending sampled colors at unions. Fine photographic
detail, reduced-strength OpenGL normals and roughness remain in the maps.
Height drives shallow geometric displacement. Main stems use a continuous
height-based chart around their curved centerline, avoiding the horizontal bands
caused by switching between short segment frames. A restrained basal stain is
material color, not baked ambient occlusion. The existing two materials suffice.

AI581 evidence is under `tests/artifacts/screens/ai581_shrub_stems/`: matching
before/after cameras, a foliage-visible ground close-up for every variant, and
native/clay bark, root and branch inspection. Shrub preview shadows use a tighter
frustum and 3mm normal bias for close contact; the same settings are used for
before and after. This affects the showcase only. Independent browser topology
checks require every exported woody component to touch ground, with zero open,
non-manifold or degenerate edges/faces and unchanged foliage fingerprints.

### AI581 published shrub inventory and validation

Published on 2026-10-03 through `vegetation/arrowwood-viburnum --publish` in
192.6 seconds. Framework receipt:
`tests/artifacts/screens/ai556_bake_framework/run-1791051346289-32948-5b6255d0/summary.json`.
Three editable Blender sources, GLBs, six derived maps, original CC0 source maps,
hashes and provenance accompany the v5 family. Other species manifests are unchanged.

| Form | Triangles | GLB MiB | Blender MiB | Grounded stem groups |
| --- | ---: | ---: | ---: | ---: |
| mature_01 | 1,553,494 | 70.16 | 61.33 | 2 |
| mature_02 | 1,928,544 | 82.65 | 71.59 | 7 |
| mature_03 | 1,943,670 | 83.38 | 72.33 | 2 |

Counts include foliage. Adjacent stems may join at their basal flares. Every
group touches ground; the three variants retain 11, 13 and 15 source stems.
These remain detailed source assets; no optimization or performance claim is made.

`tests/artifacts/screens/ai581_shrub_stems/publication_verification.json` confirms
23 UHD final images, zero open/non-manifold/degenerate geometry, 15 unchanged
foliage attribute hashes, three unchanged shared foliage maps and nine matching
embedded leaf maps. Before/after camera and exposure records match. The catalog
suite passed three tests, and the runtime suite passed both twelve-model imports
with Inspector selections and legacy-only gameplay loading. Runtime log:
`tests/artifacts/screens/ai581_shrub_stems/runtime_checks.log`.

The runtime material-isolation assertion now compares Three.js numeric object
IDs. A focused reproduction showed the deterministic harness can assign the
same random UUID to two distinct materials after a seed reset; numeric IDs and
object identity remain distinct. This test correction changes no runtime material.

### Historical AI578 evidence

All generated evidence belongs under
`tests/artifacts/screens/ai578_tree_trunks/`. Compare a preserved v2 baseline
with the v3 result under matching cameras and light. Include textured and clay
close-ups, root flares, branch collars and raking light. Record all twelve forms
and evidence that foliage was preserved. Use the existing HDRI-backed showcase
and actual Inspector loading checks. Evidence is ignored, not a committed visual
regression baseline.

## Historical AI578 published inventory

The final family was published on 2026-10-03 through
`node tools/bake.mjs --target vegetation --publish`. All four species leaves
and the parent job completed successfully in 583.7 seconds. The authenticated
framework receipt is
`tests/artifacts/screens/ai556_bake_framework/run-1791040604966-34768-0e4a8c6b/summary.json`.
Each species directory under `assets/public/vegetation/` contains its three
GLBs, packed `authoring/mature_*.blend` sources, six maps, provenance and v3
metadata. The source geometry has not been decimated.

Costs below are actual published totals including preserved foliage. MiB means
1,048,576 bytes; GLBs embed their maps and Blender sources pack their textures.

| Species | Form | Triangles | GLB MiB | Blender MiB |
| --- | --- | ---: | ---: | ---: |
| London plane | mature_01 | 1,568,818 | 47.83 | 39.68 |
| London plane | mature_02 | 1,756,302 | 53.01 | 43.67 |
| London plane | mature_03 | 1,930,034 | 57.78 | 47.47 |
| Silver linden | mature_01 | 1,743,526 | 58.32 | 49.36 |
| Silver linden | mature_02 | 1,961,086 | 64.12 | 54.27 |
| Silver linden | mature_03 | 1,980,124 | 64.59 | 54.56 |
| Northern red oak | mature_01 | 2,707,900 | 84.96 | 71.35 |
| Northern red oak | mature_02 | 3,017,464 | 93.38 | 78.43 |
| Northern red oak | mature_03 | 2,630,628 | 83.00 | 68.90 |
| Arrowwood viburnum | mature_01 | 1,065,126 | 34.89 | 29.69 |
| Arrowwood viburnum | mature_02 | 1,366,488 | 43.11 | 36.41 |
| Arrowwood viburnum | mature_03 | 1,369,834 | 43.32 | 36.74 |

Each form retains two material primitives. Tree wood has one connected component;
viburnum retains three, nine and four connected stem groups respectively. The
authoring gates report zero boundary and non-manifold edges for every form.
The manifest's `measuredReliefMetres` includes localized scar and knot accents;
it must not be interpreted as the depth of every bark groove. Plane peeling is
shallow while the ridged species use stronger relief.

These are detailed source assets. Retopology, normal/displacement baking to
lighter wood, texture/mesh compression and production scene measurements belong
to the later optimization pass. No frame-rate, GPU-time, overdraw or device
performance claim follows from this publication.

## Validation receipts

The focused selected-test runs passed on 2026-10-03:

- `tests/node/unit/urban_vegetation_catalog.test.js`: 3/3.
- `tests/headless/e2e/urban_vegetation_assets.pwtest.js`: 2/2. This loads all
  twelve detailed models and separately confirms that the default gameplay
  loader still requests only the existing fifteen FBX trees.
- `tests/headless/visual/specs/harness_urban_vegetation_trunk_capture.pwtest.js`:
  1/1, producing 64 independently verified 3840 x 2160 images.
- `tests/headless/e2e/inspector_urban_vegetation_assets.pwtest.js`: 1/1,
  checking the actual Inspector's v3 selection, full-size framing, loaded bark
  maps and preserved linden front-face/underside material behavior.

Logs are under `tests/artifacts/screens/ai578_tree_trunks/checks/`. The final
`checks/summary.json` records seven passed tests and zero failures. The final
`capture_report.json` under `tests/artifacts/screens/ai578_tree_trunks/final/`
records all cameras, appearance modes, manifest identities and geometry metrics.
The same directory's `foliage_preservation_and_geometry.json` independently
compares against preserved v2 evidence: all 60 foliage attribute hashes and all
36 embedded foliage PNG hashes match exactly. All twelve exported wood meshes
have zero boundary edges, non-manifold edges and degenerate triangles after exact
position welding. The nine trees are single connected surfaces; every shrub
stem group remains grounded.

The final captures include every mature form, each species' three-form lineup,
low angles, bare wood, bark macros, root flares and textured/clay branch forks.
The showcase uses `german_town_street_2k.hdr` for the visible background and
environment, fixed exposure and raking light. Neutral clay has no texture maps,
so the visible relief comes from geometry. The actual Inspector image and its
load/framing metadata are under `final/inspector/`. These checks establish asset
integrity and inspectability; they are not full-game performance measurements.

The gameplay `TreeGenerator.js`, `StaticVisibilityCityHash.js` and
`BakeSourceScene.js` remain unchanged from the pre-library base. The detailed
family is available through the separate original asset collections in the
Inspector; production tree placement is unchanged.

Visual review found the textured and clay surfaces continuous in the inspected
views. Broad collar charts still stretch some bark into curved grain bands,
most visibly on linden forks. This is a remaining surface-mapping limitation;
the old hard ownership seams and unrelated annular trunk patches are resolved.

## London plane bark-patch correction (AI579)

The v3 plane field assigned one flat palette color to each approximately even
Voronoi cell. At normal viewing distance this produced conspicuous geometric
camouflage blocks. V4 uses a warped multiscale field to expose overlapping
peeling layers, with different patch sizes and irregular edges. Continuous
variation within each layer and a narrower buff/gray-green color range reduce
the painted-block appearance. The same masks drive shallow physical relief,
roughness and color; this does not add deep furrows to plane bark.

The botanical description linked above remains the guide. Only original
procedural authoring is used; reference photographs are not incorporated into
maps. Foliage authoring, the other species' fields, trunk structure and gameplay
trees are unchanged. All three plane forms and their packed Blender sources are
rebuilt through `node tools/bake.mjs --target vegetation/london-plane --publish`.
Runtime revision v4 invalidates old plane GLB URLs.

Matching native/clay evidence and the user's supplied crop are under
`tests/artifacts/screens/ai579_plane_bark/`. The final publication passed on
2026-10-03 in 129.7 seconds; its authenticated receipt is
`tests/artifacts/screens/ai556_bake_framework/run-1791046609832-37472-3e315530/summary.json`.
The final capture test passed (16 UHD images), and both asset-import/default
gameplay-loader tests passed. Logs are `final_capture.log` and
`import_checks.log` under the AI579 evidence directory.

`field_verification.json` confirms periodic continuity, finite scalar/vector
sampling, exact equality of the other species' fields and unchanged foliage
authoring. `publication_verification.json` confirms fifteen plane foliage
attribute hashes and all three leaf-map hashes match v3, other species' manifest
hashes are unchanged, and all three wood surfaces are connected, closed,
manifold and nondegenerate. Textured and clay close-ups were visually reviewed.
The existing broad collar-chart stretching is still visible at some forks;
this correction targets the flat, regularly sized patch pattern.

Triangle counts are unchanged from the AI578 plane inventory. Updated payloads:

| Form | Triangles | GLB MiB | Blender MiB |
| --- | ---: | ---: | ---: |
| mature_01 | 1,568,818 | 48.27 | 40.13 |
| mature_02 | 1,756,302 | 53.44 | 44.12 |
| mature_03 | 1,930,034 | 58.22 | 47.92 |

## Junction seams and integrated roots (AI580)

The reported oak had ring-like mapping transitions at major branch attachments
and a short root tube that read as a projecting toe. AI580 removes the separate
root volumes and forms the root flare directly from the trunk rings. Sampled
branch color/height fields blend across the fused surface; angular UV blending
is removed. This resolves the broad stretched bands without adding a material,
draw call or runtime shader. Fine grain remains texture-based. This is still
original procedural bark; the previously discussed photographed-material change
remains separate.

All twelve forms and their packed Blender sources were published through
`node tools/bake.mjs --target vegetation --publish` on 2026-10-03. The complete
run took 589.4 seconds and preserved authentication and publication gates:
`tests/artifacts/screens/ai556_bake_framework/run-1791049060326-36880-04342b13/summary.json`.
Plane is v5; linden, oak and viburnum are v4. Runtime catalog revisions match.
The foliage implementation and production gameplay selection remain unchanged.

Final costs include foliage and embedded maps. The extra surface-color attribute
increases payload size; these remain detailed authoring assets awaiting optimization.

| Species | Form | Triangles | GLB MiB | Blender MiB |
| --- | --- | ---: | ---: | ---: |
| London plane | mature_01 | 1,583,796 | 59.98 | 49.79 |
| London plane | mature_02 | 1,781,448 | 66.65 | 55.49 |
| London plane | mature_03 | 1,948,160 | 72.09 | 59.85 |
| Silver linden | mature_01 | 1,758,956 | 67.40 | 56.70 |
| Silver linden | mature_02 | 1,978,376 | 74.53 | 62.74 |
| Silver linden | mature_03 | 1,998,210 | 75.06 | 63.15 |
| Northern red oak | mature_01 | 2,752,692 | 101.01 | 84.50 |
| Northern red oak | mature_02 | 3,072,392 | 111.62 | 93.46 |
| Northern red oak | mature_03 | 2,676,534 | 98.52 | 82.31 |
| Arrowwood viburnum | mature_01 | 1,065,126 | 42.22 | 35.74 |
| Arrowwood viburnum | mature_02 | 1,366,488 | 52.29 | 44.00 |
| Arrowwood viburnum | mature_03 | 1,369,834 | 52.54 | 44.32 |

Evidence is under `tests/artifacts/screens/ai580_tree_junctions/`. The `before/`
folder preserves the supplied annotation, generator and prior manifests. Three
successful capture runs produced 80 UHD views, including textured/clay root and
fork close-ups for every variant. `final/capture_report.json` collects those
unchanged images and records the source reports and matching manifest identities.
The showcase ground is at the same zero height as the meshes. An additional
actual Inspector screenshot and metadata are in `final/inspector/`.

Nine focused checks passed: three catalog tests, two asset/gameplay import tests,
one actual Inspector test and three capture runs. Runtime checks include enabled
bark vertex colors. The bake rejects absent, invalid or unpainted bark colors.
`publication_verification.json` independently confirms 60 unchanged foliage
attribute hashes, all 12 shared leaf-map hashes and all 36 embedded leaf PNGs.
Every exported wood surface is closed, manifold and nondegenerate; all nine
trees are single components and shrubs preserve their grounded stem groups.

Visual review covered all mature fork views and tree root flares, with neutral
clay confirming the shape. The ring-like color discontinuities and toe stubs
are removed in those views. Procedural pattern repetition, photographed bark
replacement and later retopology remain separate work; this pass makes no
photorealism or production-performance claim.
