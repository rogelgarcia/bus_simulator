# Problem [DONE]

In the city/map debugger, it is difficult to understand how road edges connect
to each other at joins/intersections. Road data already includes edge points
along the centerline (left/right edge points), but the debugger does not
visualize which edge is connected to which neighboring edge.

# Request

When hovering near road edge points in the city debugger view, visualize the
edge-to-edge connection mapping as straight debug lines:
- Each centerline point has two edge points (left/right) computed in road data.
- If the hovered edge point belongs to a road that connects to another road at
  that location, draw a straight line from the hovered edge point to the
  assigned connecting edge point on the other road.

Tasks:
- Identify where edge points are stored in road data (per centerline point),
  and where edge-to-edge connection assignments are stored (e.g., linked target
  info between roads at shared ends/collisions).
- In the city/map debugger state, add hover detection for edge points:
  - Detect when the pointer is within a small threshold of a left/right edge
    point.
  - Prefer edge-point hover only when not interacting with UI panels and when
    it does not conflict with existing road/building hover behavior.
- When an edge point is hovered and it has an assigned connection:
  - Render a straight debug line segment from that edge point to the assigned
    target edge point.
  - Ensure the line renders above the surface without z-fighting and is easy
    to see.
  - Clear/hide the line when the hover ends or when the hovered edge point has
    no connection.
- Ensure this only affects the city/map debugger view (do not change gameplay
  visuals) unless shared debug utilities are extracted for reuse.
- Add/update browser-run tests validating:
  - Hovering near a connected edge point produces exactly one debug line.
  - Hovering near an unconnected edge point produces no line.
  - Clearing hover removes the line.

Constraints:
- Keep state/logic in `src/states/MapDebuggerState.js` and debug rendering in
  `src/graphics/visuals/` if a reusable overlay is needed.
- Follow the comment policy in `PROJECT_RULES.md`.
- Keep changes minimal and focused on debugger visualization.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added hover-based edge-to-edge connection line visualization in MapDebugger using road2 join connection debug data, with browser tests.
