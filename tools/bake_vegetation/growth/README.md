# Species trunk growth and bark relief

`vegetation/growth` is an explicit, stage-only bake leaf using the shared Blender
configuration. Pass `scene=<AI587 review directory>`, `phase=build|render|all`,
optional `models=london_plane/mature_01`, `views=<camera ids>`, `width=2560`,
`samples=128`. It never publishes or replaces gameplay assets.

The build recovers London plane height from the authenticated floating-point
photographic scan and rebuilds its fused wood at higher detail. Growth fields
apply nonperiodic sweeps and modest crown spreading with roots pinned. Leaf
anchors follow wood; leaf shape, count and scale remain unchanged. Twig lengths
and orientations follow their transformed endpoints. Rest-coordinate attributes
keep bark registered to the bent surface. Geometry, displacement, source hashes
and canopy-preservation gates remain mandatory.

Profiles are visual interpretations of documented growth habits, not empirical
species measurements. Research: `specs/trees/species_trunk_growth.md`.
Outputs: `tests/artifacts/screens/ai588_trunk_growth/` (gitignored).
