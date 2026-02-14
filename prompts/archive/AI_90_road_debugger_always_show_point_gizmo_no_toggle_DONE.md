# Problem [DONE]

In Road Debugger, point gizmos (hover/selection markers used to indicate draggable points) are an essential interaction affordance. Adding UI toggles to show/hide the gizmos makes the workflow more confusing and increases the chance users accidentally hide important interaction cues.

# Request

Ensure Road Debugger point gizmos are always visible when relevant and remove/avoid any UI controls that toggle gizmo visibility.

Tasks:
- Do not add any “show/hide gizmo” toggle to the Road Debugger UI.
- If a gizmo visibility toggle already exists (or was recently introduced), remove it.
- Ensure gizmo visibility follows only interaction state:
  - Hoverable/draggable points show the gizmo on hover.
  - Selected points keep their gizmo visible while selected.
  - Gizmos should not be suppressible via UI preferences.
- Verify this remains consistent across:
  - Road drafting.
  - Point dragging/editing.
  - Hover/selection sync with the table.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to AI_90_road_debugger_always_show_point_gizmo_no_toggle_DONE
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Removed the hover-cube UI toggle and made the point hover cube show automatically on hover and persist for selected points.
