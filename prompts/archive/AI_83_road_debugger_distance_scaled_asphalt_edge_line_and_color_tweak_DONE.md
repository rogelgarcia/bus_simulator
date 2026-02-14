# Problem [DONE]

In the Road Debugger viewport, asphalt edge lines appear too thick when viewed from a distance, making the road visualization noisy and overpowering other overlays. Additionally, the asphalt edge line color should be closer to the lane edge color (more yellowish) for better visual consistency.

# Request

Improve Road Debugger asphalt edge line readability by (1) scaling line thickness with camera distance (thinner when far) and (2) adjusting the asphalt edge color toward a yellowish tone similar to the lane edge color.

Tasks:
- Update the Road Debugger rendering of asphalt edge lines so they become thinner as the camera moves farther away:
  - Use a distance-based scaling strategy so near views remain readable while far views are not overly thick.
  - Ensure the behavior is stable (no flicker) and works with orbit/zoom changes.
  - Keep performance reasonable (avoid per-frame heavy allocations).
- Adjust the asphalt edge line color to a more yellowish tone that matches/compliments the existing lane edge color palette.
- Ensure the change applies consistently across:
  - Hover/selection highlights.
  - Segment-only highlights.
  - Debug toggles that enable/disable edge rendering.
- Add a small UI helper/setting under debug options:
  - Allow tweaking the distance scaling strength (optional, with sensible defaults).
  - Allow toggling “distance-scaled edge thickness” on/off (default on).
- Verification checklist:
  - Zoomed out: asphalt edges look thin and do not dominate the view.
  - Zoomed in: asphalt edges remain clearly visible.
  - Color matches lane edge style and remains readable on asphalt.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to AI_83_road_debugger_distance_scaled_asphalt_edge_line_and_color_tweak_DONE
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Added distance-scaled asphalt edge line thickness with UI controls and updated asphalt edge color to a more yellow tone.
