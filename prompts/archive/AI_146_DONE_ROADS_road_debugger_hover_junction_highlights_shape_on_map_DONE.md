# DONE

#Problem

In the Road Debugger screen, it’s difficult to correlate a junction entry in the left panel with its physical location and shape on the map. There is no hover feedback that highlights the corresponding junction geometry, which slows down debugging and editing.

# Request

When hovering a junction entry in the left panel of the Road Debugger, highlight/show the shape of that junction on the map (overlay), so users can immediately see which junction they are inspecting.

Tasks:
- Identify where junctions are listed/rendered in the left panel UI and add hover handlers for each junction row.
- On hover:
  - Determine the hovered junction id.
  - Render a visual overlay of the junction shape on the map (the asphalt/junction surface polygon or boundary).
  - Use a clear highlight style (e.g., bright outline + semi-transparent fill) that stands out over asphalt/ground.
- On hover end:
  - Remove the overlay (or fade it out) and restore the default map view.
- Ensure the overlay uses existing derived/debug primitives if available (prefer reusing the junction boundary/surface debug data rather than recomputing geometry).
- Handle edge cases:
  - Junction has no shape data (fallback to highlighting endpoints or a bounding circle/marker).
  - Multiple junction overlays should not stack; only the currently hovered junction should be shown.
- Performance:
  - Avoid rebuilding the full road mesh; use lightweight overlay objects or debug primitives.
  - Cache overlay geometry where appropriate.
- Verification:
  - Hovering different junctions updates the overlay correctly and quickly.
  - No console errors.
  - Works alongside existing selection/click behaviors in the junction list.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_146_DONE_ROADS_road_debugger_hover_junction_highlights_shape_on_map_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner)

## Summary
Hovering junction rows now highlights the junction surface polygon on the map using the existing junction pick overlay.
