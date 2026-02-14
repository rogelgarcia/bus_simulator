#Problem (DONE)

Building Fabrication 2 currently exposes base wall material selection via a material picker **and** a separate `Configure Material` button/flow, which is redundant and adds UI complexity.

# Request

Simplify BF2 material selection so the **material picker is the single entry point** and opens the Material Configuration side panel, while keeping the picker’s existing visual style (thumbnail + material name).

Tasks:
- Material picker behavior (BF2 / building properties panel / per-face configuration):
  - Keep the base wall material picker UI (rectangular group with thumbnail preview and material name; no label).
  - Remove/avoid the separate `Configure Material` button.
  - Clicking the material picker opens the Material Configuration side panel (same behavior/rules as the previous `Configure Material` flow).
- Material Configuration side panel:
  - Keep the existing side-by-side panel behavior:
    - Material Configuration panel opens to the **left** of the building properties panel.
    - Building properties panel collapses into a thin expandable column while the Material Configuration panel is open (expand arrow at the top).
    - This remains the general rule for any panel that opens alongside building properties.
  - In the Material Configuration panel, the user can still change texture/color and tweak settings (reuse the existing material popup selector and legacy material controls).
- Face linking rules:
  - Material configuration is per face (within a floor layer).
  - If the currently selected face is a slave, it must not duplicate/copy material config; it only declares that it inherits from its master face.
  - The UI must respect the existing “locked/inherited” behavior for slave faces (no editable material config on slaves).
- Specs update:
  - Update relevant building v2 specs under `specs/buildings/` to reflect that the material picker opens the Material Configuration panel (and that there is no separate `Configure Material` button).

Constraints:
- Keep the material picker visual style consistent with BF2 and legacy (thumbnail + name; no extra label).
- Reuse shared UI builder components/framework patterns (avoid duplicating material UI code).

## Quick verification
- In BF2, the base wall material picker shows thumbnail + name and no separate `Configure Material` button exists.
- Clicking the material picker opens the Material Configuration side panel and collapses building properties into the thin column, per the established panel rule.
- Material configuration remains editable only on master (non-slave) faces; slaves inherit from their master.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_269_BUILDINGS_building_fabrication2_material_picker_opens_material_configuration_panel_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Removed the separate `Configure Material` button from BF2 floor-layer face material controls.
- Made the wall material picker open the Material Configuration side panel (picker remains the single entry point).
- Updated `specs/buildings/BUILDING_2_SPEC_ui.md` to match the new flow.
