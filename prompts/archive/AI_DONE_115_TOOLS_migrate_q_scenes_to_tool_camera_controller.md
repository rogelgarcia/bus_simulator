# DONE

# Problem

Tool scenes reachable via `Q` (Welcome → Setup) still use inconsistent camera control implementations (OrbitControls vs custom/top-down controls), causing uneven UX and duplicated input logic. `ToolCameraController` exists and is already used in Building Fabrication, but the rest of the `Q` tool scenes have not been migrated yet.

# Request

Migrate all tool scenes reachable from the Welcome → `Q` Setup menu (see `src/states/SceneShortcutRegistry.js`) to use the shared `ToolCameraController` so camera interactions are consistent across tools while preserving each scene’s authoring/selection workflows.

Tasks:
- Identify all scenes reachable from the Welcome → `Q` Setup menu (SceneShortcutRegistry) and migrate each to use the shared tool camera controller.
- Standardize default camera controls across these scenes:
  - LMB = author/select (camera controls must not consume LMB by default)
  - RMB drag = orbit/rotate
  - MMB and/or Shift+RMB drag = pan
  - Wheel/pinch = zoom
  - `F` = frame/focus the active content/selection
- Preserve existing tool interactions and shortcuts in each scene (selection, hover, drag authoring, scene-specific keybinds) and avoid regressions.
- Ensure camera interactions do not activate when the pointer is over UI panels/HUD (UI hit-testing for tool UIs).
- Ensure each scene provides an appropriate focus target for `F` (selection when available, otherwise the scene’s main content bounds).
- Keep changes scoped to camera unification for `Q` tool scenes; avoid unrelated refactors.

Verification:
- Confirm each `Q` tool scene loads without console errors.
- Confirm LMB authoring/selection still works and is not captured by camera controls.
- Confirm RMB orbit, pan, zoom, and `F` framing behave consistently across the migrated scenes.
- Run/keep browser tests passing (`tests/core.test.js`) and add a minimal pure-logic test if needed to cover any new shared behavior.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_115_TOOLS_migrate_q_scenes_to_tool_camera_controller`
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Migrated all `Q` tool scenes to `ToolCameraController` (including Road Debugger), fixed browser context-menu suppression edge cases, added `R` reset + improved zoom limits, and ensured UI hit-testing works per-tool via proper UI roots.
