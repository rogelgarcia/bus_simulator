# Problem [DONE]

At road crossings/intersections, curb and sidewalk geometry can incorrectly
render across the intersection interior instead of respecting the road interval
(the open space where asphalt/intersection surface should be). This causes
sidewalks to cut through crossings and produces invalid curb loops.

# Request

At crossings, ensure curb/sidewalk geometry is clipped to the road interval and
is built only after road boundary edges are stitched together in a consistent
clockwise pattern.

Tasks:
- Identify intersection regions (where multiple roads meet/cross) and compute a
  stable intersection boundary in world coordinates.
- For each incoming road at an intersection:
  - Compute the road boundary edges (left/right) near the intersection using
    the road centerline + constant road width.
  - Trim/clip those edges so they stop at the intersection boundary (do not let
    curb/sidewalk extend into the intersection interior).
- Connect road boundary edges around the intersection in a clockwise order:
  - Sort incoming road directions by angle around the intersection node.
  - Stitch the appropriate boundary endpoints between neighboring roads to
    produce a single, non-self-intersecting outer boundary loop.
  - Ensure the stitching respects lane-based widths and works for diagonal
    approaches.
- After the road boundary loop is built:
  - Generate the curb along the stitched boundary only (no curb across the
    intersection interior).
  - Generate sidewalk geometry outside the curb, also respecting the clipped
    boundary and maintaining continuity around the corner transitions.
- Ensure this integrates with the existing road rendering pipeline and does
  not regress non-intersection road segments.
- Add/update browser-run tests validating:
  - Curb/sidewalk geometry is not generated inside the intersection interval.
  - Boundary stitching is clockwise and consistent across runs.
  - The resulting curb loop is continuous and does not self-intersect for
    representative multi-angle crossings.

Constraints:
- Use road centerlines as the source of truth and keep road width constant.
- Keep app logic in `src/app/` and mesh generation in `src/graphics/`.
- Follow the comment policy in `PROJECT_RULES.md`.
- Keep the app compatible with the current static-web setup (no bundler).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Made intersection boundary stitching consistently clockwise, masked road-mouth edges when generating curb/sidewalk so nothing spans the intersection interior, and added intersection clipping/stability tests.
