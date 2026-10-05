# Solid species leaves

AI582 replaces the original twig alpha cards with individual modeled leaves for
all twelve mature library plants. Current revisions are London plane v6, silver
linden v5, northern red oak v5 and arrowwood viburnum v6. This is an authoring
pass for later alpha-plate baking and optimization, not a production performance
budget. Existing gameplay vegetation remains on its original loader.

AI583 extends this contract to [American elm](american_elm.md), adding three
mature forms and eight editable leaf specimens. Elm blades have an asymmetric
base, short petiole and double-serrated margin. The twelve-model measurements
below remain the historical AI582 inventory; elm results are recorded separately.

## Geometry and surfaces

Each leaf has a closed upper/lower blade, a thin edge and a closed modeled
petiole. Eight deterministic forms vary longitudinal curl, twist and asymmetry.
Leaf dimensions come from the species recipes. Placement adds independent size,
orientation and color variation within the existing mature crown structures.
Trees use alternate nodes; viburnum uses opposite nodes. Narrow support twigs
connect the new leaf clusters to retained branch attachment positions.

London plane has broad palmate lobes; northern red oak has a longer pointed,
lobed blade. Linden has a heart-shaped base and toothed margin; viburnum has an
ovate toothed margin. Separate tissue coordinates give each species a greener
upper surface and paler reverse, with the strongest silver underside on linden.
Venation is fine normal and color detail; the blade curvature, outline, edge
thickness and stalks are actual geometry. These are authored botanical
approximations, not scanned specimens.

The leaf shell thickness is 0.25% of blade length. Analytic surface normals avoid
triangle-strip banding and swollen edges from averaging opposite shell surfaces.
Opaque 1024px tissue maps contain no silhouette mask: every alpha pixel is 255.
The material uses `OPAQUE`, front-face culling, depth writes and no alpha test,
blending or alpha-to-coverage. Both bark and leaves carry vertex colors. There
are still two material primitives per plant, one wood and one foliage.

Upper/lower color and roughness, geometric orientation, normal maps, HDRI and
sun shadows govern appearance. No leaf transmission, subsurface scattering,
wind or real-time performance result is claimed. The retained AO coverage
texture is uniformly white for these opaque surfaces and remains shared.

## Sources and publication

`tools/bake_vegetation/authoring/leaf_geometry.py` builds the shells and connected
leaf clusters; `leaf_surfaces.py` creates tissue maps. The original deterministic
tree generator records attachment frames before its temporary cards are replaced.
Its random sequence remains intact, preserving the accepted woody generation.

Use the existing registered commands:

```sh
node tools/bake.mjs --target vegetation --publish
node tools/bake.mjs --target vegetation/prototype-plane
node tools/bake.mjs --target vegetation/prototype-shrub
```

Publication keeps the three full packed Blender sources and adds
`leaf_study.blend` / `leaf_study.glb` per species. The specimen scene contains
eight forms, four showing their upper surfaces and four their undersides.
These editable originals are the source for a future alpha-plate pass; no alpha
plates are created by AI582. Source/map/payload hashes and the compiler identity
are retained in the v3 manifest.

`accepted_wood.json` freezes positions, indices, normals, UVs, vertex colors and
the three bark maps from the accepted preceding revisions. Each new publication
must match these fingerprints. `accepted_foliage.json` is historical; the user
explicitly superseded its card geometry and maps in this leaf-authoring pass.
The existing staged validation, input stability and rollback publisher remain
mandatory. A generous failure ceiling guards runaway authoring; it is not a
runtime budget.

## Verification and renders

The author checks all template edges and triangle areas. An independent Node
test reconstructs exported specimen topology, verifies closed edges, opposite
edge winding, sixteen blade/petiole components and positive enclosed volumes.
The framework also checks hashes, embedded opaque maps, finite geometry, unit
normals and unchanged accepted wood. Browser checks authenticate imported leaf
attributes, distinct mature forms, fullness, materials, resource sharing,
Inspector loading and unchanged legacy gameplay requests.

`harness_urban_vegetation_leaves_capture.pwtest.js` produces UHD 3840×2160 captures
under the established HDRI environment/background. Each species has three whole
plant views, a lineup, upper/lower canopy details, and textured front/oblique and
clay specimen views. Evidence belongs in
`tests/artifacts/screens/ai582_solid_leaves/final/` and stays ignored.

Botanical references consulted for this pass:

- [NC State: London plane](https://plants.ces.ncsu.edu/plants/platanus-x-acerifolia/)
- [NC State: silver linden](https://plants.ces.ncsu.edu/plants/tilia-tomentosa/)
- [NC State: northern red oak](https://plants.ces.ncsu.edu/plants/quercus-rubra/)
- [NC State: arrowwood viburnum](https://plants.ces.ncsu.edu/plants/viburnum-dentatum/)

Their photographs are not texture inputs. New foliage is original procedural
work; existing bark provenance, including CC0 shrub bark, remains unchanged.


## Published inventory (2026-10-03)

Actual exported indices and embedded GLB byte sizes, including preserved wood.
These are detailed source models; no frame-rate or GPU memory claim is made.

| Species | Mature form | Individual leaves | Total triangles | GLB MiB |
| --- | --- | ---: | ---: | ---: |
| London plane | 01 | 43,680 | 8,848,116 | 302.61 |
| London plane | 02 | 46,592 | 9,530,056 | 325.49 |
| London plane | 03 | 43,316 | 9,151,944 | 312.69 |
| Silver linden | 01 | 39,500 | 11,768,256 | 398.13 |
| Silver linden | 02 | 36,440 | 11,212,272 | 379.61 |
| Silver linden | 03 | 37,240 | 11,434,826 | 386.84 |
| Northern red oak | 01 | 57,120 | 12,906,612 | 439.59 |
| Northern red oak | 02 | 60,928 | 13,903,240 | 472.81 |
| Northern red oak | 03 | 55,488 | 12,540,342 | 427.41 |
| Arrowwood viburnum | 01 | 12,012 | 4,608,238 | 171.01 |
| Arrowwood viburnum | 02 | 14,196 | 5,538,696 | 201.88 |
| Arrowwood viburnum | 03 | 16,380 | 6,109,230 | 220.99 |

All twelve retain two material draws per plant per color pass. Future alpha
plates and mesh reduction are required before any game-scale performance claim.

## Canopy coverage correction

The first solid-leaf pass fell below the established coverage floors for two
lindens, one oak and one shrub. Additional natural-size leaves per cluster
restored coverage without changing wood or lowering those regression floors.
The deterministic front orthographic foliage-only mask uses a 256px height,
normalizes plant height to one, and divides occupied pixels by their convex hull.
This is a projection measurement, not volumetric density or a performance result.
Forms are listed 01 / 02 / 03.

| Species | First solid-leaf pass | Final solid leaves |
| --- | --- | --- |
| london-plane | 72.5% / 71.5% / 72.1% | 72.5% / 71.5% / 72.1% |
| silver-linden | 48.7% / 46.9% / 46.7% | 54.7% / 53.3% / 52.7% |
| northern-red-oak | 62.3% / 66.1% / 65.3% | 65.4% / 69.5% / 68.8% |
| arrowwood-viburnum | 67.4% / 60.2% / 66.5% | 70.5% / 65.0% / 70.0% |

## Final verification and receipts

- Catalog tests: 3 passed.
- Independent exported specimen closure, winding and enclosed-volume tests:
  4 passed; specimen GLB hashes stayed identical through the density correction.
- Complete runtime import and legacy-loader isolation: 2 passed. All twelve
  final manifests match independently measured browser evidence.
- Actual Inspector framing/material/readiness check: 1 passed on the final linden.
- Final capture: 1 passed, 36 showcase images plus the Inspector image, all UHD
  3840×2160. Captured in Chrome/ANGLE D3D11 on the NVIDIA GeForce RTX 3060,
  with the existing HDRI background/environment and fixed sun/exposure.
- Accepted wood and bark hashes passed staged and published validation for
  every form. Whitespace checks passed. No gameplay model migration was made.

The final bake receipts are under `tests/artifacts/screens/ai556_bake_framework/`:

- Plane: `run-1791054280622-42584-5a420ff3/summary.json`.
- Linden density correction: `run-1791055460533-41868-d1c763d4/summary.json`.
- Oak density correction: `run-1791055699026-43512-102d6910/summary.json`.
- Shrub density correction: `run-1791056004403-26144-7b140936/summary.json`.

Final images and authenticated inventories are under
`tests/artifacts/screens/ai582_solid_leaves/`. Earlier prototype and candidate
renders remain separately labeled. All source foliage is original procedural
work; the models deliberately remain detailed authoring assets for later baking.
