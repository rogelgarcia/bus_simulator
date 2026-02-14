# DONE

#Problem

Road drafting feedback is inconsistent:
- The hover circle shows correctly at first, but after placing the next tile the circle disappears; it should remain visible throughout drafting.
- Draft points should initially snap to tile centers for consistent placement during authoring.

Note: This supersedes any earlier prompt that hid the hover circle after the first segment; the desired behavior is to keep it visible until drafting is finished.

# Request

Improve road drafting feedback and placement defaults.

Use the shared Road Debugger UI vocabulary, precedence rules, and action button pattern defined in `AI_93_ROADS_road_debugger_ui_information_architecture_reorg`.
Use the unified picking service from `AI_102_ROADS_road_debugger_unified_picking_service` to resolve the hovered tile and draft preview target consistently (avoid duplicate raycast math).

Tasks:
- Hover circle persistence:
  - While drafting a road (from `New Road` until `Done`/`Cancel`), always show a blue circle preview on the currently hovered tile.
  - The preview should update smoothly and remain visible after the first segment is created.
  - Hide the preview when not drafting or when the mouse is not over the map.
- Tile-center snapping on placement:
  - When placing a new draft point by clicking a tile, store it initially at the tile center (offsetX=0, offsetY=0).
  - Dragging later can move it within the tile as usual; this change only affects initial placement.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_99_DONE_ROADS_road_debugger_drafting_hover_circle_persistence_and_center_snap`
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Kept the drafting hover marker visible throughout road drafting and defaulted new draft point placement to tile centers (UV offset 0,0) while preserving later dragging.
