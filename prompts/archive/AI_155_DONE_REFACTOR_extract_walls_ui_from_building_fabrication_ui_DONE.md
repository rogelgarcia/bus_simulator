# DONE

#Problem

`src/graphics/gui/building_fabrication/BuildingFabricationUI.js` contains a large amount of wall-related UI code (wall material selection, wall inset, wall texture tiling controls, and any wall-specific parameter rows). This wall UI code is interleaved with other concerns (floors, street, roof, windows, material variation, etc.), contributing to the file’s large size and making maintenance harder.

# Request

Extract all WALLS UI code from `BuildingFabricationUI.js` into a dedicated module/controller so the main UI file becomes smaller and easier to maintain, while preserving behavior and visuals.

Tasks:
- Create a new module under `src/graphics/gui/building_fabrication/` (or `mini_controllers/`) that owns walls UI creation and behavior, e.g.:
  - `WallsUIController.js` (preferred) or `BuildingWallsPanel.js`.
- Move all wall-related DOM construction and event wiring out of `BuildingFabricationUI.js`, including:
  - Wall material picker(s) (PBR texture selection and/or color-based walls) including thumbs/text/status and picker popup logic.
  - Wall inset controls (if part of the walls section).
  - Wall texture tiling controls (tile meters override, UV enable, offsets, rotation, disabled-state syncing).
  - Any wall-specific tooltips, reset buttons, and “sync from selection/template” logic.
  - Any wall-only dependencies (options catalogs, normalization helpers) that are currently imported solely for wall UI.
- Ensure the extracted controller exposes a clean interface to `BuildingFabricationUI`, for example:
  - `root` element(s) to mount into the appropriate section(s) of the UI.
  - `setEnabled(allow)` and `sync(...)` methods to refresh UI state based on current selection/template.
  - Callbacks/events to apply wall changes to the underlying building/template state (without leaking internal DOM details).
  - `destroy()` to remove event listeners and dispose any popups.
- Prefer using existing mini controllers/utilities:
  - `MaterialPickerRowController` for picker-style rows.
  - `RangeNumberRowController` / range+number utilities for numeric wall controls.
  - `TextureTilingMiniController` for tiling UI (or any newer extracted controller).
- Keep UI appearance/UX identical (same CSS classes/labels/layout, same Material Symbols usage).
- Keep public behavior stable and backward compatible:
  - Existing defaults and normalization for walls remain unchanged.
  - Existing saved building templates still load and render correctly.
- Add minimal browser-run tests for any new pure helpers introduced by the extraction (avoid DOM-heavy tests unless a clear pattern already exists in `tests/core.test.js`).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_155_DONE_REFACTOR_extract_walls_ui_from_building_fabrication_ui_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Extracted global wall inset + per-layer wall material/tiling wiring into `src/graphics/gui/building_fabrication/WallsUIController.js`.
- Refactored `src/graphics/gui/building_fabrication/BuildingFabricationUI.js` to delegate wall UI mount/bind/sync and layer-walls panel construction to the controller.
- Added a browser-run regression test for wall inset binding/unbind behavior in `tests/core.test.js`.
