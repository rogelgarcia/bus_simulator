# DONE
#Problem

Multiple tool scenes implement their own camera controls (OrbitControls vs custom top-down controls), leading to inconsistent UX and duplicated input logic. This also blocks creating shared “room” concepts (e.g., CityRoom), because camera behavior is not standardized.

# Request

Implement a reusable camera controller module that can be used across tool scenes, with a consistent control scheme optimized for click-to-author tools.

Recommended standard controls (must be implemented as the default behavior):
- LMB = select/author (camera controls must not consume LMB by default)
- RMB drag = orbit (or look/orbit-style rotation)
- MMB and/or Shift+RMB drag = pan
- Wheel/pinch = zoom
- `F` = frame/focus (fit camera to the active content/selection)

Tasks:
- Create a shared camera controller that:
  - Works with the existing engine camera/canvas and integrates cleanly with scene update loops.
  - Consumes pointer/keyboard input only when appropriate so tool interactions keep LMB behavior for authoring/selection.
  - Handles UI hit-testing so interactions over HUD/panels do not move the camera.
  - Supports framing/focus (`F`) via a caller-provided focus target (bounding sphere/box, center+radius, or equivalent).
  - Supports mouse + trackpad (wheel zoom + pinch where feasible in the browser environment).
  - Provides a small, consistent API suitable for adoption by other scenes later (Road Debugger, Connector/Dubins debugger, Map Debugger, etc.).
- Migrate **Building Fabrication** to use the new camera controller first:
  - Replace its direct OrbitControls usage with the shared controller while preserving tool behavior (tile selection, hover, road/building authoring).
  - Ensure the new controls match the standard above (RMB orbit, pan, zoom, frame).
  - Keep existing UI flows intact and avoid regressions in interactions when the pointer is over UI elements.
- Keep existing scenes building and running:
  - Do not migrate other scenes yet unless a small shared helper is required; focus on Building Fabrication as the pilot.
  - Avoid large refactors unrelated to camera unification.
- Verification:
  - Confirm Building Fabrication loads and camera controls work as specified (orbit/pan/zoom + `F` frame).
  - Confirm existing selection/authoring still works with LMB.
  - Confirm no console errors on load.
  - If appropriate, add a minimal browser-run test in `tests/core.test.js` that validates the controller’s pure logic (e.g., focus math and input consumption rules) without requiring real DOM pointer events.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_114_REFACTOR_unified_camera_controller_for_tool_scenes`
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Added `ToolCameraController` (RMB orbit, MMB/Shift+RMB pan, wheel/pinch zoom, `F` frame with UI hit-testing) and migrated Building Fabrication to use it, with a small pure-logic framing test in `tests/core.test.js`.
