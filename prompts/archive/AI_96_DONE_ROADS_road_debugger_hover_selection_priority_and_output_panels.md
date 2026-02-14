# DONE

#Problem

Road Debugger hover/selection feedback is inconsistent and the output panels become noisy:
- Hovered items are not clearly reported separately from selected items.
- Hovering a segment should take precedence over “road selected” highlighting.
- Hovering should still visualize the hovered entity even if that visualization type is globally disabled.
- Clicking UI widgets can “steal focus” so map hovering/dragging stops working until extra clicks.
- Junction hover output is too verbose and causes output panel height to expand.

# Request

Make hover and selection behavior predictable and readable, and reorganize outputs so hovered context is always visible without overwhelming the UI.

Use the shared Road Debugger UI vocabulary and precedence rules defined in `AI_93_ROADS_road_debugger_ui_information_architecture_reorg`.
This prompt should rely on the unified picking service introduced in `AI_102_ROADS_road_debugger_unified_picking_service` (no ad-hoc hit-testing).

Tasks:
- Output panel behavior:
  - Show “Hovered” info above the “Selected” section in the output panel.
  - Hover output must be concise (just enough to identify what’s hovered); deeper details belong in the dedicated details/tree panel.
  - Ensure hover output does not force the output panel to expand excessively (use truncation/ellipsis or a compact layout).
- Hover/selection precedence:
  - Keep selected road/junction highlighted as selected.
  - When hovering a segment, highlight only that segment with a distinct hover color that overrides the selected-road color for that segment only.
- Hover visualization override:
  - Anything hovered (via table or viewport) must be shown in the map even if its visualization category is disabled.
  - This should be temporary and scoped to the hovered entity only (does not toggle global settings).
- Focus and interaction reliability:
  - Clicking UI widgets must not permanently disable map hover/drag interactions.
  - Moving the mouse over the map should immediately restore map hover + single-click-to-drag behavior (no extra click required).
- Junction hover verbosity:
  - On hover, show only basic junction identifiers (ID, approach count, approximate position).
  - Full junction tree/details are shown only in the dedicated details panel when selected.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_96_DONE_ROADS_road_debugger_hover_selection_priority_and_output_panels`
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Made hover vs selection output predictable, enforced hover precedence (point > segment > road), added hover visualization override, and improved focus robustness for map interactions.
