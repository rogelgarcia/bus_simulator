# DONE

#Problem

`src/graphics/gui/building_fabrication/BuildingFabricationUI.js` contains a large amount of window-related UI code (window type/style picker, window dimension controls, frame/glass color controls, spacer controls, and duplicated “street windows” equivalents). This code is interleaved with the rest of the Building Fabrication UI, making the file very large and difficult to maintain.

# Request

Extract all window UI code from `BuildingFabricationUI.js` into a dedicated module/controller so the main file becomes smaller and more readable, while preserving existing behavior and visuals.

Tasks:
- Create a new module under `src/graphics/gui/building_fabrication/` (or `mini_controllers/`) that owns window UI creation and behavior, e.g.:
  - `WindowUIController.js` (preferred) or `BuildingWindowsPanel.js`.
- Move all window-related DOM construction and event wiring out of `BuildingFabricationUI.js`, including:
  - Window type/style picker (including preview/thumb rendering and picker popups).
  - Window size/spacing controls (width, height, gap/spacing, sill height/y, frame width).
  - Frame/glass color pickers (top/bottom glass, frame color) and any related thumb/text/status UI.
  - Window spacer UI (enabled toggle, every N windows, spacer width, extrude toggle + distance).
  - Street-window equivalents (street style picker, street width/height/gap/y/frame/glass/spacer controls).
  - Any window-specific tooltips, reset buttons, disabled-state synchronization, and “sync from selection/template” logic.
- Ensure the extracted controller exposes a clean interface to `BuildingFabricationUI`, for example:
  - `root` element(s) to mount into the appropriate section(s) of the UI.
  - `setEnabled(allow)` and `sync(...)` methods to refresh UI state from the current selection/template.
  - `getState()` or callbacks so BuildingFabricationUI can apply window changes to the underlying building/template data.
  - `destroy()` to remove event listeners and dispose any popups.
- Prefer using existing mini controllers/utilities where possible:
  - `RangeNumberRowController` / range+number utilities for numeric controls.
  - `MaterialPickerRowController` for picker-style rows.
  - Shared tooltip/reset helpers already used in Building Fabrication.
- Keep UI appearance and UX identical (same CSS classes, same labels, same Material Symbols usage).
- Keep public behavior stable:
  - Current defaults and normalization for window params remain unchanged.
  - Backward compatibility for any legacy window style/type mapping remains intact.
- Add minimal browser-run tests for any new pure helper utilities added as part of this extraction (avoid DOM-heavy testing unless already patterned in the test suite).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_154_DONE_REFACTOR_extract_window_ui_from_building_fabrication_ui_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Extracted all window-related UI (global + per-layer windows/space-columns) into `src/graphics/gui/building_fabrication/WindowUIController.js`.
- Refactored `src/graphics/gui/building_fabrication/BuildingFabricationUI.js` to delegate window UI construction/bind/sync to the controller and removed leftover window UI methods.
- Added a browser-run smoke test for window width wiring in `tests/core.test.js`.
