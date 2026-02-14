# Problem [DONE]

In the Road Debugger viewport, the direction arrows used to indicate lane/traffic direction are currently rotated 180°, so they point opposite of the road segment’s forward direction (Pi → Pi+1).

# Request

Fix Road Debugger direction arrows so they always point in the correct direction for each road segment and per-direction centerline.

Tasks:
- Identify where direction arrow orientation is computed for the Road Debugger lane/direction overlay.
- Ensure the arrow forward vector matches the road segment “forward” definition: `Pi -> Pi+1`.
- Ensure the fix works for:
  - Both directions (forward lanes and backward lanes) with right-hand driving conventions.
  - Any segment yaw (arbitrary angles).
  - Multiple segments per road (including segments created by splitting/trim operations).
- Verify arrows remain correct under editing:
  - Dragging points.
  - Changing lane counts (`lanesF`, `lanesB`).
  - Toggling visibility or debug overlays.
- Add a quick visual sanity check method (documented in the AI prompt) to confirm correctness: create a simple horizontal road left→right and verify arrows point right for forward direction, left for backward direction.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to AI_71_road_debugger_fix_direction_arrows_rotated_180_DONE
- Provide a summary of the changes made in the AI document (very high level, one liner)

## Visual sanity check

1) Open Road Debugger and enable `Markings`.
2) Create a simple 2-point road where `P0` is left of `P1` (horizontal left→right).
3) Verify arrows on forward lanes point right (P0→P1) and arrows on backward lanes point left (P1→P0).

Summary: Added a regression test that validates lane arrow mesh geometry points along `Pi->Pi+1` for forward lanes and the opposite direction for backward lanes.
