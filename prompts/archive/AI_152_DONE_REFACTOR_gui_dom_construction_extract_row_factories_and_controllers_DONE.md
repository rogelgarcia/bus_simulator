# DONE

#Problem

Several GUI screens (notably Building Fabrication) build UI by manually repeating low-level DOM construction patterns: `document.createElement`, `className`, `textContent`, and repetitive tree assembly for common “row” patterns (label + control, picker rows, range+number rows, toggle rows, etc.). This causes:
- Large files with lots of boilerplate
- High risk of inconsistencies (classes/structure drift, missing status elements)
- Harder maintenance and feature iteration

# Request

Refactor GUI DOM construction to use reusable “row factories” / “mini controllers” so UI code is declarative and avoids repeated DOM plumbing.

Tasks:
- Introduce reusable factories/controllers for common row patterns used by Building Fabrication (and applicable to other screens):
  - `createMaterialPickerRow(...)` or `MaterialPickerRowController` that builds:
    - row wrapper
    - label
    - picker container
    - button + thumb + text
    - optional status element
    - optional tooltip/reset metadata hooks (if used elsewhere)
  - Extend/standardize existing range+number and toggle controllers so callers provide all parameters in one line (label, min/max/step, parse/format, clamp, enabled/disabled logic, callbacks).
- Convert representative repeated blocks in `BuildingFabricationUI.js` (belt color, roof color/material picker, top belt color, style picker, etc.) to the new factory/controller.
- Ensure each controller has:
  - a predictable returned shape (`{ row, ...refs }` or `controller.root`)
  - `setEnabled(...)` / `sync(...)` methods where appropriate
  - `destroy()` to remove event listeners / popups
- Keep visuals/DOM structure consistent with existing CSS classes; do not introduce ad-hoc inline styling.
- Add minimal browser-run tests for any new pure helpers (e.g., option normalization, clamp/format behavior), if applicable.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_152_DONE_REFACTOR_gui_dom_construction_extract_row_factories_and_controllers_DONE`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

Summary:
- Added `MaterialPickerRowController` and standardized controller APIs (`setEnabled`/`sync`/`destroy`) for building-fabrication mini controllers.
- Refactored `BuildingFabricationUI.js` material picker rows (style, belt/roof colors, window pickers, window param color pickers) to use the controller and removed repeated DOM boilerplate.
- Added browser-run tests covering `MaterialPickerRowController` DOM shape and click/disable/destroy behavior.
