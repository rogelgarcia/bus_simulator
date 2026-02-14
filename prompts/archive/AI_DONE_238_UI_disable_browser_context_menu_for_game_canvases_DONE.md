#Problem (DONE)

Right-click dragging for camera controls can trigger the browser context menu, interrupting interaction. This is especially noticeable when moving from one UI region to another (e.g., building/debugger viewports). We want to disable the context menu for the entire game experience so right-click interactions remain smooth.

# Request

Disable the browser context menu for the game’s interactive viewports (and any debug-tool canvases) across the entire app.

Tasks:
- Prevent the browser context menu from appearing during right-click interactions used for camera/viewport controls.
- Apply consistently across:
  - Main gameplay canvas
  - Debug tool canvases (standalone debug pages)
  - Any other interactive viewports that use right-click drag
- Ensure this does not break accessibility or normal UI behavior outside the viewport (e.g., text inputs should still behave normally where appropriate).

Nice to have:
- Add a small centralized helper so all viewports register consistent pointer/context-menu behavior.

## Quick verification
- Right-click drag in gameplay and in at least one debug tool:
  - No browser context menu appears.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_238_UI_disable_browser_context_menu_for_game_canvases_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Added a shared `installViewportContextMenuBlocker(...)` helper to suppress the browser context menu for viewports while keeping editable inputs working.
- Wired the helper into the main app (`src/main.js`) and all standalone debug tools entry points for consistent behavior.
