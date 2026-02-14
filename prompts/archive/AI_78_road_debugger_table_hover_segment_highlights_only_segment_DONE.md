# Problem [DONE]

In the Road Debugger roads table, hovering a segment entry currently highlights too much geometry in the viewport (e.g., the entire road or multiple segments). This makes segment-level debugging and telemetry inspection inaccurate.

# Request

Update Road Debugger hover behavior so hovering a segment row in the table highlights **only that segment** in the viewport.

Tasks:
- When hovering a road segment entry in the left table:
  - Highlight only the hovered segment’s geometry in the viewport (centerlines, edges, asphalt outline/mesh, lane arrows — whichever overlays are currently enabled).
  - Do not highlight other segments of the same road.
  - Do not highlight the full road unless the hovered entry is the road row (not a segment row).
- Ensure hover behavior is consistent and reversible:
  - Moving the mouse off the segment row clears the segment-only highlight and restores the default hover state.
  - Hovering a different segment switches highlight to the new segment only.
- Ensure this works with selection logic:
  - Selection highlight (clicked) should remain distinct from hover highlight.
  - If a different segment is selected, hovering another segment should show hover highlight without losing the selected highlight.
- Ensure the bottom-right info panel reflects the hovered segment (telemetry for that segment only).
- Add a quick manual verification checklist:
  - Expand a road to show segments; hover segment 0, 1, 2 and confirm only the corresponding segment is highlighted each time.
- When hovering out, return the highlight to the previous state (if the hovering highlight overriden another highlight).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to AI_78_road_debugger_table_hover_segment_highlights_only_segment_DONE
- Provide a summary of the changes made in the AI document (very high level, one liner)

## Manual verification checklist
- Expand a road to show its segments; hover segment rows #0/#1/#2 and confirm only that segment turns green in the viewport each time.
- Hover the road row and confirm the full road highlights, then hover a segment row and confirm highlight narrows to that segment.
- Click-select a segment (blue), then hover another segment (green) and confirm both highlights are visible and distinct.

Summary: Fixed hover highlight matching so segment hover only affects primitives with the hovered `segmentId`, and added a regression test.
