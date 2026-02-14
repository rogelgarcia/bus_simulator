#Problem (DONE)

Building Fabrication 2 currently supports floor layers (number of floors, floor height, and face selection/linking) but does not yet define the **base wall material** for the building. We need a v2 UI flow for selecting the base wall material and configuring related material properties, while reusing the existing material picker UX patterns from the legacy Building Fabrication screen.

# Request

Add base wall material selection and a Material Configuration side panel to Building Fabrication 2. The building properties panel (right side panel where floors/layers are edited) must support opening an adjacent panel and collapsing itself into a thin expandable column while the adjacent panel is open.

Tasks:
- Base wall material picker (building properties / right panel):
  - Add a base wall material picker in the building properties panel.
  - The picker must match the legacy material picker UX:
    - No text label.
    - Show a rectangular material thumbnail/group.
    - Clicking it opens the material popup selector to choose texture and color.
  - This base wall material becomes the default wall material used by the building unless overridden by future per-face/per-bay rules.
- Face scope note:
  - Material configuration is **per face** (per floor layer face).
  - If a face is linked as a slave, it must not duplicate/copy material configuration; it only declares that it inherits from its master face (e.g., “inherits from face X”), and uses the master’s material configuration.
- “Configure Material” button:
  - Add a button below the base wall material picker that reads: `Configure Material`.
  - Clicking it opens a Material Configuration panel.
- Material Configuration panel (side-by-side panel behavior):
  - When `Configure Material` is clicked:
    - Show a new panel immediately to the **left** of the building properties (right) panel.
    - The Material Configuration panel uses the **full height** of the screen and the **same width** as the building properties panel.
    - The building properties panel collapses while the Material Configuration panel is open:
      - Leave a thin column in place of the building properties panel.
      - At the top of that thin column, show a **left arrow** (expand button).
      - Clicking the expand button makes the building properties panel visible again, but keep the thin column affordance available while the Material Configuration panel remains open.
  - Define this as a general UI rule:
    - Any panel that opens alongside the building properties panel uses this same “collapse into thin expandable column” behavior.
- Material Configuration panel contents:
  - The Material Configuration panel contains three collapsible sections (flat; do not wrap them inside an extra outer rectangular group):
    1) `Base material`
    2) `Texture tiling`
    3) `Material variation`
  - Copy the available controls/properties from the legacy Building Fabrication material controls (same set of properties and intent).
- Specs update:
  - Update the relevant building v2 specs under `specs/buildings/` to reflect:
    - base wall material as part of the authored model (scope: building-level default),
    - the building properties ↔ side-panel collapse/expand behavior,
    - the three material configuration sections and their purpose.

Constraints:
- Do not add other new fabrication features beyond base wall material + the Material Configuration panel and the panel-collapsing rule.
- Reuse existing UI builder patterns/components for material picking and collapsible sections (avoid duplicated UI code).

## Quick verification
- In Building Fabrication 2, the building properties panel shows a base wall material thumbnail picker (no label) and `Configure Material`.
- Clicking the material thumbnail opens the material selector popup and updates the chosen base wall material.
- Clicking `Configure Material` opens the Material Configuration panel to the left and collapses the building properties panel into a thin column with an expand arrow.
- Material Configuration panel shows the three collapsible sections and exposes the same material properties as legacy Building Fabrication.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_262_BUILDINGS_building_fabrication2_base_wall_material_and_material_config_panel_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Added a base wall material thumbnail picker (no label) to the BF2 building properties panel, using the shared material picker popup.
- Added a Material Configuration side panel that opens to the left and collapses the building properties panel into a thin expandable column.
- Implemented the three Material Configuration sections (`Base material`, `Texture tiling`, `Material variation`) by reusing legacy Building Fabrication UI controls.
- Updated building v2 specs to document base wall material, side-panel collapse/expand behavior, and the Material Configuration sections.
