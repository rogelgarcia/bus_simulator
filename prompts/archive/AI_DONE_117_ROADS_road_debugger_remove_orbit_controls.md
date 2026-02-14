# DONE

#Problem

The Road Debugger currently includes dedicated “Orbit” UI widgets (an Orbit panel/surface and reset button) that duplicate camera controls already provided by the shared tool camera controller. This extra UI adds clutter and creates multiple ways to do the same action.

# Request

Remove the Orbit UI widgets from the Road Debugger view and rely on the camera controller’s native controls instead, while preserving all existing Road Debugger interactions and workflows.

Tasks:
- Remove the Orbit widgets from the Road Debugger UI:
  - Remove the Orbit panel/surface and any related mouse/drag handlers that adjust orbit yaw/pitch.
  - Remove the Orbit reset button/widget (camera reset should remain accessible via existing keyboard shortcuts and/or any other non-orbit UI controls).
  - Update on-screen control hints/tooltips to reflect the camera controller’s native controls (do not refer to the removed Orbit panel).
- Preserve and keep consistent these behaviors:
  - LMB remains author/select (camera must not consume LMB by default).
  - Camera controls provided by the camera controller continue to work (orbit/pan/zoom as already supported), without requiring any dedicated Orbit UI widgets.
  - Pan remains available via mouse and via arrow keys if currently supported.
  - Zoom remains available via wheel and any existing keyboard zoom shortcuts.
  - `F` frames/focuses the relevant content/selection.
  - `R` resets the camera to a sensible “home” pose for the map.
- Ensure camera input is ignored when the pointer is over the Road Debugger UI panels/HUD (no camera movement while interacting with UI).
- Keep the app loading without console errors and avoid unrelated refactors.

Verification:
- Road Debugger loads with no console errors.
- LMB road/point/junction authoring and selection still works and is not captured by camera controls.
- The Orbit UI widgets are removed (no Orbit panel/surface interactions).
- Camera controls (orbit/pan/zoom) still work via the camera controller, and `F`/`R` behave as expected.
- Browser tests still pass (`tests/core.test.js`); add a minimal test only if needed to cover any new shared behavior.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_117_ROADS_road_debugger_remove_orbit_controls`
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Removed Road Debugger orbit UI and switched camera control to `ToolCameraController` (RMB/MMB/wheel, `F` frame, `R` reset), updating tests accordingly.
