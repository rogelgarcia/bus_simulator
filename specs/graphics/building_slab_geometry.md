# Building slab and sidewalk junctions

`src/app/city/BuildingSlabPlan.js` owns the foundation outline; the graphics
generator triangulates its top and builds its skirt. The road sidewalk remains
a separate mesh. Scalar-field sampling determines aprons, connections and bridges.

Runs classified as flush must use exact sidewalk segments after contour
simplification. `BuildingSlabBoundary.js` projects the connected points within
the existing flush tolerance and reconstructs nearby finite segment intersections.
The reconstruction radius is bounded by one grid-cell diagonal plus the contour
simplification tolerance. It cannot extend disconnected sidewalk segment ends
or move unrelated apron edges. Intersections may belong to nonadjacent offset
segments: tightly rounded road corners can make those segments cross.
Remove redundant collinear outline vertices after alignment, before triangulating
the float32 mesh. The city geometry check rejects zero-area triangles on every
slab, including slabs away from the captured corner.

Do not fill a visible gap using lightmap color, a coordinate-specific patch or
extra overlapping faces. The shared outline must reach the physical junction so
its top triangles and skirt meet the sidewalk there. Unlit wireframe captures
must expose both meshes, and downward rays must find the walking surface across
the repaired junction. Generated evidence goes under
`tests/artifacts/screens/illumination_refinement/`.

Tests: `building_slab_boundary.test.js`, `building_slab_plan.test.js`, and
`receiver_corner_geometry.pwtest.js`. The latter captures the starting-block
corner and checks the previously missing triangle. Geometry changes require a
fresh compatible bake through `tools/bake.mjs` and its lighting hierarchy;
reprocessing unchanged raw lightmaps is insufficient.

The sidewalk offset must remove exhausted concave arcs before creating top faces.
When an offset exceeds a rounded corner's radius, its reversed lobe collapses to
the intersection of the bounding offset segments. Source-edge correspondence is
retained so the outer curved edge can connect to this point as an upward-facing
fan. Zero-area fan/skirt triangles are not emitted. This rule also defines the
boundary supplied to foundation and grass planning; rendering and baking consume
the same repaired geometry. Do not repair folded strips by flipping their faces,
which would leave overlapping top surfaces. Contour splits outside this local
arc-collapse case fail explicitly rather than returning intersecting geometry.

`sidewalk_corner_topology.test.js` checks tight/wide radii, rotation and translation,
upward winding, and single coverage through the corner interior. The city browser
test checks all sidewalk top triangles, in addition to the slab checks above.
