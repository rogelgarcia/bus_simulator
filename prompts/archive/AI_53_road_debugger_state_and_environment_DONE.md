# Problem [DONE]

There is no standalone Road Debugger scene to iterate on the new road engine in
isolation. We need a clean scene that starts with an empty sky + grass world
and a basic UI shell.

# Request

Add a new `Road Debugger` state/scene that is disconnected from the city and
gameplay systems and provides a stable foundation for the new road engine UI.

Tasks:
- Add a new state entry `road_debugger` and register it in `src/main.js`.
- Add a new option in `src/states/SetupState.js` for `Road Debugger`.
- Create a new state file under `src/states/` to wire the view, similar to
  other debugger states.
- Create a new view/scene module under `src/graphics/gui/road_debugger/`:
  - Render an empty grass ground and a sky dome (like other debug scenes).
  - Use the same world scale and tile size as the city debugger/city map.
  - Provide camera controls suitable for tile-based editing (pan/zoom).
  - Add a grid overlay (initially always on or with a simple toggle).
- Create a basic UI layout (no road logic yet):
  - Left panel placeholder for the roads table.
  - Bottom-center popup placeholder for road creation actions.
  - Ensure UI does not block camera input unless hovered.
- Ensure entering/exiting the state cleans up all objects and event listeners.
- Add/update browser-run tests validating the state can be entered and exited
  without errors.

Constraints:
- Do not modify existing scenes (including Debug Corners 2).
- Keep UI/rendering in `src/graphics/` and state wiring in `src/states/`.
- Follow the comment policy in `PROJECT_RULES.md`.
- Keep the app compatible with the current static-web setup (no bundler).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added a standalone Road Debugger state with grass/sky scene, tile grid + pan/zoom camera controls, placeholder UI shell, and enter/exit browser test.
