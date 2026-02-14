# Problem [DONE]

In Road Debugger, there are UI controls related to edge distance scaling (edge visibility/scale controls). These controls are not useful:
- They add complexity to the UI.
- They do not appear to have a visible effect (edges remain thick when zooming out).

# Request

Remove the edge distance scale/visibility controls from Road Debugger UI and replace them with an automatic, sensible default behavior so edge thickness adapts correctly without user tuning.

Tasks:
- Remove the UI controls that allow adjusting edge distance scaling / edge visibility scale.
- Implement automatic distance-aware edge thickness with sensible defaults:
  - Edges should be clearly visible when zoomed in.
  - Edges should become noticeably thinner when zoomed out so they don’t dominate the view.
  - The behavior should be stable and should not require manual calibration.
- Ensure the change applies consistently across all edge-like overlays (asphalt edge, lane edge, etc.) and respects existing toggles (render edges on/off).
- Verify and fix the underlying cause of “no visible difference when zooming out”:
  - Ensure the thickness scaling code path is actually being used.
  - Ensure line rendering supports variable thickness in the project’s chosen approach (and pick an approach that works reliably in WebGL).
- Keep selection/hover highlights readable while still respecting the automatic thickness behavior.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to AI_89_road_debugger_remove_edge_distance_scale_controls_and_auto_thickness_DONE
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Removed manual edge distance-scale controls and made edge line thickness auto-scale with camera zoom for both asphalt and lane edges.
