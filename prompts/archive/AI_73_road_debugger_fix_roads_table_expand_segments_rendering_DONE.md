#Problem [DONE]

In the Road Debugger left-panel roads table, expanding a road entry to show its segments is currently not working: clicking to expand does not render the road’s segments as a list (one segment per line).

This blocks segment-level inspection and selection/hover workflows that depend on the expanded view.

# Request

Fix the Road Debugger roads table expansion so road segments render correctly when a road is expanded.

Tasks:
- Reproduce the issue and identify why the road’s segments are not appearing on expand.
- Ensure each road row can be expanded/collapsed reliably.
- When expanded:
  - Render the road’s segments as a list with **one segment per line**.
  - Show a concise segment label (index or ID) and any key telemetry that already exists (or is already planned) for segments.
- Ensure expanded segment entries integrate with existing behaviors:
  - Hovering a segment in the table highlights that segment in the viewport.
  - Clicking a segment in the table selects it (and syncs selection to the viewport).
- Ensure the expansion state is stable across re-renders:
  - Editing points, changing lane counts, toggling visibility, and undo/redo should not randomly collapse all roads unless the road no longer exists.
- Keep styling consistent with the “single-line road rows” requirement (do not revert to multi-line road labels).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to AI_73_road_debugger_fix_roads_table_expand_segments_rendering_DONE
- Provide a summary of the changes made in the AI document (very high level, one liner)
