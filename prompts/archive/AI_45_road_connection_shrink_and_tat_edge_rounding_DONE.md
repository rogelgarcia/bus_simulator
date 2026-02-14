# Problem [DONE]

When two roads share the same tile (a connection/join), edge geometry can
overlap or cross, especially for non-orthogonal angles and multi-lane widths.
This creates broken asphalt/curb/sidewalk meshes and forces special casing by
angle.

# Request

Implement a robust connection strategy for road joins (where two roads share a
tile) that prevents edge crossings by trimming and then generates rounded
connections using tangent–arc–tangent rules on the *road edges* (not the
centerline), with curb/sidewalk rebuilt around the resulting boundary.

Tasks:
- Detect connection/join cases where two road segments share the same tile and
  must be connected without edge crossings.
- For each join between two roads:
  - Keep road width constant at all times (lane width constant, total width
    based on lane count).
  - Compute the two outer road edges (left/right boundaries) for each road at
    the join using the road centerline + width.
  - Determine whether any edge pair would cross near the join (line/segment
    intersection in local join space).
  - If edges cross, shrink/trim both roads equally from the join on both sides
    until no road edge crossings remain (compute the required trim distance via
    geometry; do not use ad-hoc thresholds).
- After trimming, generate a rounded connection for each edge:
  - For each corresponding outer edge pair, compute the intersection point of
    the *infinite* edge extensions and build a tangent–arc–tangent fillet that
    is tangent to both edges.
  - Apply this process to both outer edges so the full road boundary is
    connected cleanly.
  - Handle different angle types (acute/obtuse/near-parallel) robustly:
    - Clamp or fall back when a radius does not fit.
    - Avoid spikes/miter explosions.
- Use the resulting connected boundaries to rebuild:
  - Asphalt edge geometry for the join region.
  - Curb geometry and sidewalk geometry around the new boundary.
- Integrate the new join strategy into the road generator pipeline and ensure
  it works for diagonal roads and multi-lane roads.
- Add/update browser-run tests validating:
  - For representative join angles and widths, boundaries do not self-intersect
    and do not cross each other after trimming.
  - Trim distance is symmetric and width remains constant.
  - Rounded connections are continuous and tangent to both edges.
  - Curb/sidewalk meshes are generated without gaps for the join region.

Constraints:
- Use road centerlines as the source of truth for road placement/orientation.
- Keep app logic in `src/app/` and mesh generation in `src/graphics/`.
- Follow the comment policy in `PROJECT_RULES.md`.
- Keep the app compatible with the current static-web setup (no bundler).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Implemented geometric join trimming with rounded edge TAT fillets, rebuilt join asphalt/curb/sidewalk boundaries, and added join regression tests for tangency, symmetry, and non-self-intersection.
