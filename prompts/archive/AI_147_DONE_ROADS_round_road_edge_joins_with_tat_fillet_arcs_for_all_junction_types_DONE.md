# DONE

#Problem

Junctions currently create straight-line joins between road edges:

1) Same-road junctions (a bend / degree-2 join):
- The join connects inner edges with a straight segment and outer edges with a straight segment.
- This effectively narrows the road at the join (the smaller the angle, the narrower the connection), which looks wrong.
- Desired behavior: use a tangent–arc–tangent (TAT) style fillet so the road retains full width and produces a smooth curved connection for both inner and outer edges.

2) Other junction types (T junctions, crossings, etc.):
- Edge connections are also straight lines between road boundaries.
- Desired behavior: for each boundary join, cast tangents on each edge and connect them with a rounded arc (fillet), producing curved corners instead of sharp/straight joins.

# Request

Update junction geometry so all road edge joins (inner and outer boundaries) use tangent + arc (fillet/TAT) rounding instead of straight-line connections, preserving road width and improving visual quality across all junction types.

Tasks:
- Identify where road edge joins for junctions are built (both:
  - degree-2 “same road” bends/joins
  - degree-3+ junctions: T junctions, 4/5/6-way crossings)
- Implement TAT/circular fillet joins for road boundaries:
  - For each join between two boundary segments, compute tangent points on each segment and a circular arc connecting them (fillet).
  - Apply this to both the inner edge and outer edge connections (so both sides of the road curve properly).
  - Ensure the join preserves the intended road half-width and does not pinch/narrow at shallow angles.
- Add/extend configuration:
  - Add a junction/turn fillet radius parameter (or reuse an existing one) that controls the curvature.
  - Provide sensible defaults and clamp ranges; support fallback when geometry is too tight (reduce radius rather than exploding).
- Robustness:
  - Handle near-colinear segments gracefully (no arc needed).
  - Avoid self-intersections and degenerate arcs for very small angles or very short segments (fallback to safe behavior).
- Apply consistently across junction types:
  - Degree-2 joins: both inner/outer boundaries must be rounded with tangents + arc.
  - Degree-3+ junctions: corners/edge joins must be rounded similarly (no straight-line corner connections by default).
- Verification:
  - Road width remains constant through bends; no pinching at shallow angles.
  - Junction corners are visibly rounded (arcs), not straight segments.
  - No gaps/overlaps in asphalt surface; normals and UVs remain valid.
  - No console errors.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_147_DONE_ROADS_round_road_edge_joins_with_tat_fillet_arcs_for_all_junction_types_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner)

## Summary
Rounded junction edge joins using tangent–arc–tangent fillets across degree-2 and degree-3+ junctions, plus a fillet radius control and TAT debug primitives/UI.
