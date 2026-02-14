# Problem [DONE]

In Road Debugger, it’s not always visually clear which point is currently hoverable/draggable (e.g., a centerline control point). The current hover feedback is insufficient, especially when multiple debug overlays are enabled.

# Request

Add a clear 3D hover gizmo for draggable points in the Road Debugger viewport.

Tasks:
- When the cursor is hovering a point that can be moved (starting with centerline/control points), render a small **blue 3D cube** centered on that point.
- The cube should render even if other debug overlays are active and should not be hidden by the point marker itself.
- The cube should have a small padding so it slightly encloses the hovered point marker (not intersecting it visually).
- The cube should only be visible while that point is hoverable/draggable (hover state), and should update smoothly as hover target changes.
- Ensure the gizmo integrates with existing hover/selection sync:
  - Hovering the point in the viewport should highlight the corresponding road/segment/point in the left table (if applicable).
  - Hovering the corresponding entry in the table should also show the cube in the viewport.
- Keep the new hover cube purely visual (no additional hit-testing rules unless necessary).
- Add a toggle under Road Debugger debug options to enable/disable the hover cube gizmo (default on).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to AI_69_road_debugger_hover_draggable_point_blue_cube_gizmo_DONE
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Added a blue hover cube gizmo for hovered control points (with toggle), plus point rows in the roads table for hover/selection syncing and browser tests.
