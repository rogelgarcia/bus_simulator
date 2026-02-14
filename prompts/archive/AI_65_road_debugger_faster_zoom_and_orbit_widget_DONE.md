# Problem [DONE]

Road Debugger camera controls feel slow when zooming with the mouse wheel, and
there is no convenient way to orbit/rotate the camera using an on-screen
control.

# Request

Improve Road Debugger camera controls:
- Make mouse wheel zoom movement faster.
- Add an on-screen orbit controller widget in the bottom-right corner (to the
  left of the output panel) to rotate/orbit the camera.

Tasks:
- Increase mouse wheel zoom responsiveness in Road Debugger:
  - Adjust zoom speed/scale used by wheel events.
  - Keep zoom clamped to existing min/max constraints.
  - Ensure zoom does not trigger while interacting with UI elements.
- Add a bottom-right orbit controller widget:
  - Place it to the left of the existing bottom-right output panel.
  - Widget provides camera orbit/rotation around the current scene center
    (or a configurable target).
  - Support click-and-drag within the widget to rotate yaw/pitch (bounded pitch
    to avoid flipping).
  - Optionally include a reset button to restore default camera orientation.
- Integrate orbit behavior with existing camera controls:
  - Orbit widget updates camera rotation/orbit without breaking pan/zoom.
  - Ensure orbit widget disables conflicting pointer handlers while dragging it.
  - Keep camera state consistent across rebuilds and on state exit.
- Add/update browser-run tests validating:
  - Wheel zoom speed change takes effect (at least by checking the configured
    multiplier/constant).
  - Orbit widget is created and emits camera updates when interacted with
    (basic event wiring test).

Constraints:
- Keep changes scoped to Road Debugger modules.
- Do not change other scenes.
- Follow the comment policy in `PROJECT_RULES.md`.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Increased mouse wheel zoom responsiveness and added a bottom-right orbit widget (drag yaw/pitch + reset) with browser tests.
