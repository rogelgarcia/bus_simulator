# Problem [DONE]

In Road Debugger, when hovering over a draggable point gizmo (e.g., the blue cube/marker for a centerline control point), the system also highlights road segments underneath. This makes hover feedback noisy and can interfere with selecting/dragging points.

Additionally, selecting the point gizmo is difficult when zoomed out because the hit area is too small at distance.

# Request

Improve Road Debugger point gizmo interaction by prioritizing gizmo hover/selection over segment highlighting and by making gizmo hit-testing easier from a distance (zoomed out).

Tasks:
- Hover priority rules:
  - When the cursor is hovering a point gizmo (a draggable/hoverable point), suppress road/segment hover highlighting for that frame/state.
  - Only one hover target should be active at a time, with priority: `point gizmo` > `segment` > `road` > `background`.
  - Ensure the bottom-right info panel reflects the active hover target (point data, not segment data).
- Distance-aware gizmo hit-testing:
  - Increase the effective hit area of the point gizmo when zoomed out so it remains easy to select.
  - The hit radius should be stable in screen space (or otherwise scale with camera distance) so usability is consistent across zoom levels.
  - Ensure this does not accidentally select points that are far away in screen space; the behavior should feel predictable.
- Selection behavior:
  - Clicking/dragging a point gizmo should always select that point (not the segment beneath it).
  - While a point is selected, keep the gizmo visible and clearly distinguish selection vs hover.
- Integration:
  - Ensure this works with hover/selection sync between viewport and table.
  - Ensure this does not break segment-only highlighting behavior when hovering segments in the table (segment hover should still work when not hovering a point gizmo).
- Add a quick manual verification checklist:
  - Zoomed out: points are still easy to hover/select and do not require pixel-perfect clicking.
  - Hovering a point does not trigger segment highlight.
  - Hovering empty segment area still highlights the segment as before.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to AI_88_road_debugger_point_gizmo_hover_priority_and_distance_scaled_hit_area_DONE
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Added screen-space point picking with larger hit radii and suppressed segment/road hover while hovering a point gizmo.
