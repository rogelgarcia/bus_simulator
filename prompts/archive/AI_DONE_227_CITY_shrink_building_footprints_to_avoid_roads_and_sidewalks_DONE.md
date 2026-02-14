# DONE - Problem

In the city creation pipeline, roads are placed first and then buildings are placed afterward. Currently, buildings can end up rendered/placed on top of roads and sidewalks because the building footprint is not being adjusted to respect the street/sidewalk areas.

# Request

Update city building placement so building footprints are reduced when they overlap roads or sidewalks. The adjustment must preserve the building’s shape: when one corner is moved along an axis to reduce overlap, the corresponding corner(s) on the same edge must move by the same amount so edges stay straight and the footprint doesn’t warp.

Tasks:
- Detect overlap conditions during building placement:
  - Treat both roads and sidewalks as forbidden placement areas.
  - If any corner of a building footprint lies over a road or sidewalk, the footprint must be adjusted to eliminate the overlap.
- Adjust footprints by shrinking in X/Z:
  - Reduce the building footprint in the direction that reduces the building size and removes overlap.
  - Preserve the building shape:
    - If a corner is moved along the X axis, the other corner on that same X-aligned edge must move by the same X delta.
    - If a corner is moved along the Z axis, the other corner on that same Z-aligned edge must move by the same Z delta.
    - Maintain straight edges and consistent corner topology (no “bent” edges).
  - Propagate footprint changes vertically through the whole building definition:
    - When a ground-level footprint point/edge is moved, apply the same axis-aligned delta to all corresponding points on upper floors and roof layers.
    - Conceptually: for a given face, move that entire face (across all floors/roofs) along the adjusted axis so the building stays vertically aligned and proportions are maintained.
- Handle multiple overlaps robustly:
  - If multiple corners overlap, apply adjustments until no corners are over roads/sidewalks.
  - Avoid oscillation or “ping-pong” adjustments; results should be stable/deterministic for the same city seed/config.
- Respect constraints:
  - Enforce a minimum building footprint size so buildings don’t collapse to degenerate shapes.
  - If a building cannot fit after shrinking within constraints, fail gracefully (skip placement or choose a smaller building/footprint), without crashes.
- Validation/debuggability:
  - Ensure the logic works across varied road layouts (straight roads, curves, intersections) and sidewalk widths.
  - Ensure resulting footprints still align with any downstream building generation expectations (floors, belts, roofs, etc.).

Nice to have:
- Add a debug visualization to show the original footprint vs adjusted footprint and highlight which corners/edges triggered shrink.
- Add a small deterministic test (or debug scene) that places a building near a road/sidewalk and asserts no overlap after adjustment.

## Quick verification
- Generate a city with multiple dense blocks:
  - No buildings visibly overlap roads or sidewalks.
  - Adjusted buildings keep clean rectangular/edge-aligned shapes (no skewed corners).
- Place buildings near intersections/curves:
  - Shrinking still produces stable results and does not produce degenerate footprints.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_227_CITY_shrink_building_footprints_to_avoid_roads_and_sidewalks_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Shrinks building footprint loops when they overlap road/sidewalk forbidden areas (based on road centerlines + lane/shoulder/curb/sidewalk widths).
- Ensures deterministic, shape-preserving XZ insetting with minimum-size guard and graceful failure (skip rendering when it can’t fit).
- Adds a deterministic test for a wide-road + sidewalk overlap case.
