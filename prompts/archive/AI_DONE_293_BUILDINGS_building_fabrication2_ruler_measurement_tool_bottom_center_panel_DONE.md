#Problem (DONE)

Building Fabrication 2 lacks an in-viewport measurement tool to quickly check distances (e.g., bay widths, building spans, offsets). We need a simple ruler tool that works on the BF2 map/viewport using raytraced points.

# Request

Add a `Ruler` measurement tool to BF2, accessible via a new bottom-center panel (similar to the Inspector Room bottom panel), allowing users to click two points in the viewport and see the measured distance.

Tasks:
- Bottom-center panel:
  - Create a bottom-center tool panel for BF2 (same general style as the Inspector Room bottom panel).
  - Add a `Ruler` icon button to this panel.
- Ruler activation behavior:
  - Clicking the `Ruler` icon toggles the ruler tool on/off.
  - When active:
    - Change the cursor to a crosshair when over the viewport/map area.
    - The `Ruler` icon remains visually selected while a measurement is in progress or displayed.
  - Clicking the `Ruler` icon again:
    - Dismisses any existing ruler line + distance label.
    - Deactivates the tool (icon no longer selected).
- Measurement interaction:
  - When the ruler tool is active:
    1) First click in the viewport sets point A.
    2) Moving the mouse shows a live preview line from point A to the current hit point B and displays the distance.
    3) Second click fixes point B and keeps the line + distance label visible.
  - After a measurement is fixed:
    - The ruler remains active/selected until the user toggles it off (click the ruler icon again).
    - Toggling off clears the measurement.
    - Toggling on again starts a new measurement (fresh point A).
- Raytraced points:
  - Both point A and point B MUST be computed via raytracing from the camera through the cursor to the scene.
  - Use the hit point where the ray intersects the map/scene (intended for measuring building distances).
  - Ignore clicks that do not hit a valid surface (no silent fallback to a plane unless that is already BF2’s standard).
- Display:
  - Draw a line segment between A and B in the viewport overlay.
  - Display the distance (meters) near the line (e.g., near the midpoint or near B), updated live during preview and stable when fixed.
- Scope:
  - BF2 only; do not affect other scenes/tools.

## Quick verification
- The bottom-center tool panel appears in BF2 with a `Ruler` icon.
- Activating the tool changes the cursor to crosshair over the viewport.
- First click sets A; moving mouse shows live line + distance; second click fixes B and keeps the measurement visible.
- Clicking `Ruler` again clears the measurement and deactivates the tool.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_293_BUILDINGS_building_fabrication2_ruler_measurement_tool_bottom_center_panel_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added a BF2 bottom-center tool panel with a `Ruler` icon toggle.
- Implemented raycast-based point picking with a 3D overlay line and a screen-space distance label.
- Added a headless Playwright test covering ruler activation + measurement flow.
