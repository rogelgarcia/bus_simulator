# Problem [DONE]

In Road Debugger road drafting, it’s not clear which tile will be selected before the first click, and point placement during drafting is not consistently snapped to a predictable default. This makes road creation feel imprecise.

# Request

Improve Road Debugger road drafting UX by adding a hover preview marker before the first point is placed and snapping drafted points to the center of tiles by default.

Tasks:
- Pre-first-point hover preview:
  - When starting a new road draft (before the first point is placed), moving the mouse over the map should show a blue circle marker on the currently hovered tile (the tile that would be selected if clicked).
  - Once the first segment exists (i.e., once at least 2 points have been placed), this hover circle is no longer needed and should be hidden.
  - The hover circle should update smoothly as the mouse moves and should not interfere with other hover/selection behaviors.
- Tile-center snapping during drafting:
  - While drafting a road, each newly placed point must snap to the **center of the selected tile** (offsetX=0, offsetY=0) when initially created.
  - This should apply for all points placed during the draft (unless there is an explicit “free offset” editing action later via dragging).
  - Ensure snapping behavior is deterministic and consistent with the tile coordinate system.
- Integration requirements:
  - Ensure this works with the existing `New Road` / `Done` drafting flow and keyboard shortcuts (ESC/ENTER).
  - Ensure the hover marker respects map bounds and is hidden when the mouse is not over the valid map plane.
  - Ensure export/import and undo/redo preserve the snapped-to-center initial placement for newly created points.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to AI_86_road_debugger_road_draft_hover_circle_and_center_snap_DONE
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Added a pre-first-point hover ring and default tile-center snapping for new draft points (with map-bounds hiding/guarding).
