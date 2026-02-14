# Problem [DONE]

In the city/map debugger view, camera controls are keyboard-centric and do not
support mouse drag-to-pan or mouse wheel zoom. There is also no quick camera
reset shortcut, and the camera tour behavior available in the curb/connector
view is not accessible here.

# Request

Improve camera controls in the city/map debugger state when the editor is not
active: add mouse drag movement, mouse wheel zoom, a reset shortcut, and a
camera tour shortcut (matching the curb/connector debugger tour behavior).

Tasks:
- When not editing (road/building editor modes disabled), allow camera movement
  by holding the mouse button and dragging (pan across the map plane).
- When not editing, allow camera zoom using the mouse wheel (clamped to the
  existing zoom min/max behavior).
- Add a shortcut `R` to reset the camera back to its initial/default position
  and zoom for the current city/spec.
- Add a shortcut `T` to start the camera tour function used in the curb view
  (connector debugger) so the map debugger can auto-orbit/inspect the scene.
- Ensure mouse/keyboard controls do not interfere with editing interactions
  (road placement, building placement) and do not trigger when interacting with
  UI panels.
- Ensure the camera tour disables manual camera input while active and can be
  stopped/cleaned up consistently when leaving the state.
- Add/update browser-run tests validating:
  - The map debugger exposes the new shortcuts (`R`, `T`) without breaking
    existing shortcuts.
  - Camera drag/zoom handlers are gated behind "not editing" state.

Constraints:
- Keep gameplay/state logic in `src/states/` and UI code in `src/graphics/`.
- Follow the comment policy in `PROJECT_RULES.md`.
- Keep the app compatible with the current static-web setup (no bundler).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added map debugger mouse pan + wheel zoom (when not editing), plus `R` reset and `T` camera tour shortcuts with UI + tests.
