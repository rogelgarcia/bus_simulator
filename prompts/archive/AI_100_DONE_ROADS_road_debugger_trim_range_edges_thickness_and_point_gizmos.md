# DONE

#Problem

Several Road Debugger settings and visuals need adjustment:
- Global trim slider max is too low (caps at 0.5) and should go to 5.
- Asphalt edge line is still too thick from distance and should be thin/readable by default.
- Gizmo sizing/visibility and connection-point cues need improvement for segment-level debugging.

# Request

Adjust trim range and improve edge/gizmo visuals for clarity at different zoom levels.

Use the shared Road Debugger UI vocabulary and precedence rules defined in `AI_93_ROADS_road_debugger_ui_information_architecture_reorg`.
Use the unified picking service from `AI_102_ROADS_road_debugger_unified_picking_service` for any gizmo/segment hover behavior (avoid per-overlay hit-testing divergences).

Tasks:
- Trim range:
  - Increase the global trim control range to allow values up to 5.
- Asphalt edge thickness:
  - Ensure asphalt edge lines are thin and readable at distance by default.
  - Do not add user-facing controls for edge thickness scaling; use sensible automatic defaults.
- Gizmo improvements:
  - Increase point gizmo size when zoomed out (distance-aware) so they remain easy to see and interact with.
  - When hovering a segment, show gizmos for that segment’s connection points to make topology obvious.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_100_DONE_ROADS_road_debugger_trim_range_edges_thickness_and_point_gizmos`
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Expanded trim threshold range to 0..5, improved edge readability with distance-scaled line widths, and enhanced point gizmos (distance scaling + segment connection-point cues on hover).
