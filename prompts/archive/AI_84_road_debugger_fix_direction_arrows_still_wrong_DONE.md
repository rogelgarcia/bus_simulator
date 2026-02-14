# Problem [DONE]

In the Road Debugger viewport, direction arrows are still pointing the wrong way (even after prior attempts to fix a 180° rotation issue). This makes it hard to validate forward/backward lane directions and right-hand driving conventions.

# Request

Fix Road Debugger direction arrows so they consistently point in the correct direction for each segment and lane direction.

Tasks:
- Reproduce the issue and identify the root cause (e.g., sign inversion, tangent direction mismatch, mesh/arrow geometry facing direction, coordinate system mismatch, or using the wrong segment endpoint order).
- Ensure the arrow direction matches the authoritative definition:
  - Segment forward direction is `Pi -> Pi+1`.
  - Backward direction is `Pi+1 -> Pi`.
  - Right-hand driving: forward lanes are on the right side of the center divider when looking along `Pi -> Pi+1`.
- Validate arrow orientation for a set of explicit test cases:
  - A straight horizontal road left→right.
  - A straight vertical road bottom→top.
  - A diagonal road.
  - A multi-segment road with a corner (ensure arrows follow each segment direction).
  - A one-way road (`lanesB=0`) where only forward arrows exist.
- Ensure arrows remain correct under dynamic editing:
  - Dragging control points.
  - Changing `lanesF/lanesB`.
  - Segment splitting/trimming.
  - Hover/selection highlighting.
- Add a debug overlay option to help validate orientation:
  - Render a short “forward tangent” line at the arrow spawn location so it’s obvious what vector the arrow should align with.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to AI_84_road_debugger_fix_direction_arrows_still_wrong_DONE
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Added arrow tangent debug overlay and expanded lane-arrow direction tests (vertical/diagonal/multi-segment/one-way) to validate correct orientation.
