# DONE

#Problem

`src/graphics/gui/building_fabrication/BuildingFabricationUI.js` contains a large amount of Material Variation UI code (sections, nested details groups, toggle/range rows, anti-tiling controls, seed controls, tooltips, and state syncing). This code is tightly interleaved with the rest of Building Fabrication UI, making the file very large, hard to navigate, and risky to modify.

# Request

Extract all Material Variation UI code from `BuildingFabricationUI.js` into a dedicated module so the main UI file is focused on composition and high-level wiring.

Tasks:
- Create a new module under `src/graphics/gui/building_fabrication/` (or `mini_controllers/`) that owns Material Variation UI creation and behavior, for example:
  - `MaterialVariationUIController.js` (preferred) or `MaterialVariationPanel.js`.
- Move all Material Variation UI DOM construction and event wiring out of `BuildingFabricationUI.js`, including:
  - “Material variation seed” section (override toggle + numeric input + hint text + sync logic).
  - Per-layer “Material variation” groups and all nested sections (macro/mid/micro, brick, wear, cracks, anti-tiling, etc.).
  - Any Material Variation related tooltips, reset buttons, and disabled-state synchronization.
- Ensure the extracted controller exposes a clean interface to `BuildingFabricationUI`, e.g.:
  - `mount(parent)` / `unmount()` or returns a `root` element that BuildingFabricationUI appends.
  - `setEnabled(allow)` / `syncFromSelection(building, template)` / `getConfig()` callbacks depending on current patterns.
  - `destroy()` to remove event listeners and release popups.
- Keep UI appearance/UX the same (CSS classes, layout, labels, Material Symbols usage, etc.).
- Keep public behavior stable:
  - Material variation enable/disable works the same.
  - Presets and per-parameter controls behave the same.
  - Any defaults and normalization remain unchanged.
- Prefer using existing mini controllers (`RangeNumberRowController`, `ToggleRowController`, `MaterialPickerRowController`, anti-tiling controller, etc.) to reduce boilerplate in the extracted module.
- Add minimal browser-run tests for any new pure helpers introduced by the extraction (avoid adding tests for DOM-heavy parts unless there’s a clear pattern already used in the test suite).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_153_DONE_REFACTOR_extract_material_variation_ui_from_building_fabrication_ui_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Extracted Material Variation UI (seed/debug + per-layer panels) into `src/graphics/gui/building_fabrication/MaterialVariationUIController.js`.
- Refactored `src/graphics/gui/building_fabrication/BuildingFabricationUI.js` to delegate Material Variation UI build/bind/sync to the controller.
- Added browser-run tests covering the new controller’s seed/debug wiring in `tests/core.test.js`.
