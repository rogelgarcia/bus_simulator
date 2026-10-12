# Reference foliage revision

## Problem and evidence

The accepted AI588 reference retains the original `foliage_instances` layout:
two straight cylinder instances per spray, fixed stem radii of 1.0–1.7 mm,
the same leaf count per cluster and evenly spaced attachment stations. Each
cluster is generated independently. Random leaf roll does not resolve the
regular stem layout or interpenetration between neighboring sprays.

Some source spray roots also lie on the straight chord between secondary
branch endpoints while the meshed parent branch follows a bent path. Thicker
replacement stems expose that old mismatch. Seat new roots on the retained
deformed parent centerline, cross-check proximity to the actual wood surface,
and limit stem radius by the supporting branch radius. Preserve the original
reference and record how far the new attachment moves.

The current game's `assets/trees/Textures/T_Leaf_Realistic9.TGA` and
`assets/trees/Models/Mobile/SM_M_Tree_1.FBX` are inspection references only.
The atlas shows an uneven hierarchy of curved laterals, a thicker supporting
stem, short terminal shoots and useful negative space between leaf groups.
Its visible organization is a connected branch structure, rather than uniformly
scattered leaves. No licensed mesh, texture pixels or UV layout is incorporated
into the new models.

## Research and application

- [Runions, Lane and Prusinkiewicz: space colonization (2007)](https://algorithmicbotany.org/papers/colonization.egwnp2007.pdf)
  models competition for unoccupied space. Apply this locally to shoot groups:
  move crowded destinations toward nearby openings while keeping the original
  attachment to the tree. This revision is a constrained local approximation,
  not an implementation of their complete branching algorithm.
- [Palubicki et al.: self-organizing tree models (2009)](https://algorithmicbotany.org/papers/selforg.sig2009.html)
  combines light/space competition and internal growth controls. The useful
  lesson is to allocate growth to exposed shoots and suppress redundant growth,
  rather than inserting a fixed number of leaves everywhere. Full physiological
  light simulation is outside this first revision.
- [SpeedTree generation properties](https://docs9.speedtree.com/modeler/doku.php?id=generation_properties)
  distinguishes phyllotaxis and branching at bends from fixed absolute counts.
  Keep a connected parent/child hierarchy and vary internode length, shoot
  length, lateral vigor and terminal leaf size. Randomness should be correlated
  along a shoot; independent noise on every coordinate destroys growth structure.
- [SpeedTree branch properties](https://docs8.speedtree.com/modeler/doku.php?id=branch_generator)
  separates bending, noise and directional pruning. Use smoothly curved paths,
  tapering radii and unequal lateral directions. Avoid exaggerated sinusoidal
  twigs or an identical bend on every branchlet.
- [NC State: London plane](https://plants.ces.ncsu.edu/plants/platanus-x-acerifolia/),
  [silver linden](https://plants.ces.ncsu.edu/plants/tilia-tomentosa/),
  [red oak](https://plants.ces.ncsu.edu/plants/quercus-rubra/),
  [American elm](https://plants.ces.ncsu.edu/plants/ulmus-americana/) and
  [arrowwood](https://plants.ces.ncsu.edu/plants/viburnum-dentatum/)
  provide botanical morphology and photographs. The four trees have alternate
  leaves; arrowwood has opposite leaves. Retain those arrangements. Linden and
  elm use a predominantly two-ranked shoot appearance, while plane and oak
  allow more rotation around the shoot. These angular tuning choices are visual
  modeling approximations, not measured species constants. Arrowwood's natural
  straight shoot habit should receive gentler variation rather than forced knots.

## Review-only bake contract

`vegetation/natural-foliage` authenticates the accepted scene fingerprint before
loading it and writes new per-specimen Blender files only into a dedicated
ignored artifact directory. The source reference, installed game LODs, textures
and existing recovery copies remain unchanged. Publication is rejected.

The first revision preserves the original wood mesh and photographic closed
leaf shells. Geometry/UV fingerprints are checked before saving. Foliage uses
curved tapered 3D branchlets, unequal lateral shoots and variable internode
lengths. Leaves remain rooted at petiole nodes while orientation candidates
are evaluated against a spatial crowding proxy. Moderate overlap is allowed;
severe redundancy may be culled. The proxy does not guarantee triangle-level
nonintersection.

Variable shoot topology replaces fixed-stride spray indexing. New point
attributes `spray_id`, `shoot_id` and `node_id` and explicit path records support
a future LOD baking adapter. Do not pass these new references through the old
fixed-stride LOD leaf bake until that adapter is implemented and reviewed.

Every generated shoot places its last leaf station within the terminal 20%
of its length. An opposite-leaved shoot with only one pair uses a terminal
station, avoiding a long bare extension beyond leaves attached near its base.
Root seating separately verifies that non-root anchors remain untouched and
each intended root reaches the selected attachment before new growth starts.

## Evidence required

Keep matched before/after close-ups and full-tree views. Compare four azimuths,
including silhouette coverage, leaf counts and crown bounds. Projected opaque
pixel coverage measures the rendered whole-tree silhouette, including unchanged
wood; it is not canopy biomass, leaf area index or physical crown volume. A
reduction in leaves must be reported together with any coverage loss. Preserve
the mature silhouette and useful gaps instead of maximizing uniform screen fill.

Do not claim that fewer leaves preserve volume solely because the bounding box
is similar. Inspect the actual paired images for leaf clumps, regular ladders,
unsupported petioles, overly thick stems and a hollow crown.

Candidate selection may retain different leaf fractions by species. A uniform
24% reduction was suitable for plane and oak, but visibly reduced linden and
elm coverage, so those species require a denser candidate. Consolidation
authenticates the selected Blender files and source fingerprints, links their
preserved shoot records and renders, and requires at least 95% of the original
opaque projected coverage at every one of the four representative views.
The gallery renders mature form 01 of each species; all fifteen staged models
receive geometry-preservation, attachment and finite-position checks.

## Reviewed candidate artifacts

The October 11, 2026 reference revision is indexed by
`tests/artifacts/screens/vegetation_natural_foliage/final_review_v2_20261011/summary.json`.
Its sibling `index.html` contains eighty matched renders assembled into fifteen
comparison sheets. The index links preserved specimens in
`final_connected_20261011` and the terminal-pair refinement in
`final_arrowwood_20261011`; earlier experiments are not selected.

All fifteen models together use 705,720 leaves versus 833,332 in the source.
The representative four-view opaque coverage ranges are 100.3–101.2% for plane,
96.4–97.9% for linden, 100.6–101.2% for oak, 95.7–96.2% for elm and
113.5–118.3% for arrowwood. These are rendered coverage measurements with the
limitations above. Linden and elm lose some coverage despite retaining more
leaves than the initial reduction trial. These candidates are reference assets;
the existing game LODs have not been rebuilt from them.

## Additive coverage pass

The `coverage` phase increases visible reference coverage by approximately 10%
relative to the reviewed natural foliage index. It applies to all three mature
forms of plane, linden, oak and elm. Arrowwood keeps its exact existing Blender
files and hashes. The baseline, historical candidates and installed LODs remain
untouched; outputs use another ignored artifact directory.

Candidate leaves attach at unused, unevenly spaced stations on existing curved
shoots. Four fixed geometry silhouettes prioritize visible gaps; a spatial
crowding score rejects closely aligned redundant leaves. The pass preserves all
existing leaf positions, orientations, scales and forms and the complete wood
and branchlet meshes. It adds growth rather than reshuffling the accepted canopy.
The placement heuristic reduces redundancy but is not an intersection solver.

Coverage is calibrated with four 768×576 opaque geometry silhouettes. The mean
target is 1.10 times baseline, with a two-percentage-point acceptance tolerance
and a six-percent minimum gain per view. This includes unchanged woody pixels,
so it is a projected coverage measurement, not a physical canopy-volume claim.
Receipts preserve before/after counts, cameras, search history, source hashes
and explicit per-shoot leaf indices. Resumption requires matching source,
algorithm identity and saved-file hash.

`vegetation/turntable` accepts `reference-index` for these per-model references.
It authenticates the complete index and all fifteen specimens, then appends the
selected detailed wood, curved branchlets and solid leaf instances. Four full-tree
Eevee previews per species precede labeled 360-degree clips. Assembly validates
movie hashes, frame counts, dimensions and preview/source identity, and produces
a video gallery and overview sheet. The legacy fixed-stride close-up adapter
does not accept the revised index.

The completed coverage index is
`tests/artifacts/screens/vegetation_natural_foliage/coverage_20261011/summary.json`.
The twelve revised tree models add 123,465 leaves; the complete fifteen-model
collection contains 829,185 leaves. Four-view mean gains across the three mature
forms are 9.4–9.6% for plane, 9.8–10.0% for linden, 9.3–10.1% for oak and
10.0–10.7% for elm. All existing leaf transforms/forms and woody meshes passed
preservation checks. Arrowwood retains the exact three baseline hashes.

The full-tree preview and rotating-video output is
`tests/artifacts/screens/vegetation_turntable/20261011_fuller_showcase/`.
It shows mature form 01 of each species with the complete reference geometry.
The other mature forms are staged and measured but not separate video chapters.
