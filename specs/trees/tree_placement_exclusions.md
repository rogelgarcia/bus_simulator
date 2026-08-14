# Tree Placement Exclusions

Procedurally spawned trees use their trunk position and trunk footprint for hard-surface and building placement checks. The foliage canopy is not included in road, curb, sidewalk, or building clearance, so leaves may overhang a sidewalk while the trunk remains on valid terrain.

## Required exclusions

- A trunk must not intersect the exact asphalt polygons produced by the road engine.
- A trunk must remain beyond the generated curb and sidewalk widths, including its configured trunk radius.
- A trunk must not intersect a generated building footprint or its configured trunk-radius boundary.
- A tree must retain canopy-scale clearance around traffic-light and stop-sign placements so foliage does not obscure or intersect traffic controls.
- When exact road polygons are unavailable in an isolated tool, placement falls back to the CityMap road-tile clearance rule.

All exclusion inputs and candidate tests are renderer-independent and deterministic for a given city seed.
