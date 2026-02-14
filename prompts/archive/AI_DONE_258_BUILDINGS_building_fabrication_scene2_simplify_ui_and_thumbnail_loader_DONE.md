#Problem (DONE)

The current Building Fabrication screen has become too convoluted and is no longer a good foundation for further facade/building work. We need a clean restart that preserves only the useful scaffolding (map + panel layout) while simplifying the UX and configuration loading workflow.

# Request

Create a new “Building Fabrication 2” screen/scene (a fresh implementation) by copying only the basic structure of the existing Building Fabrication scene. Keep the map and panel areas, but remove roads entirely. Redesign the top-left workflow and implement a thumbnail-based “Load” UI.

Tasks:
- New screen/scene entry:
  - Add a new Building Fabrication 2 scene/screen that can be opened from menus and hotkeys (similar discoverability to the current Building Fabrication screen).
  - Copy only the basic structure/scaffolding from the existing Building Fabrication scene (map setup + panel areas), but treat this as a new clean implementation.
  - Remove any road creation/editing/rendering/UI; the scene should not involve roads at all.
- Temporary render settings:
  - Sun bloom must be turned **off** when entering Building Fabrication 2.
  - When leaving the screen, restore sun bloom to the prior value (do not persist this change).
- Empty start state:
  - When Building Fabrication 2 opens, it starts with **no building configured**.
  - The UI should clearly represent the empty state and disable actions that require a building (e.g., exporting) until a building is loaded/created.
- Top-left panel restructure:
  - Move building metadata controls to a new panel at the **top-left**:
    - Building name
    - Building type
    - `Load` button
    - `Export` button
  - Move the “view panel” to be directly **below** the new top-left panel.
- Load/Export redesign:
  - Remove the existing “load config combo / export / etc.” flow from this new screen. Use the new load export flow described bellow.
  - Implement a simplified flow with only **two buttons**: `Load` and `Export`.
  - `Load` button behavior:
    - Open a thumbnail browser UI for all available building configs.
    - The engine must render each building config to an offscreen/side buffer and generate a thumbnail image for it.
    - Display thumbnails in a **2 rows × 3 columns** grid per page.
    - Provide paging controls (arrows on the sides) to navigate through pages.
    - Selecting a thumbnail loads that building config into Building Fabrication 2.
  - `Export` button behavior:
    - Export the currently loaded/authored building config (same export usability/format expectations as current Building Fabrication).
- Properties cleanup:
  - Remove “title” properties from the properties UI in this new screen.
  - For now, keep the **right panel empty** (no properties; an empty state/placeholder is acceptable).

## Quick verification
- Opening Building Fabrication 2 shows the map + panel layout, and there is no roads UI or road content.
- Sun bloom is disabled only while in Building Fabrication 2, and returns to its prior value on exit.
- The top-left contains name/type + `Load`/`Export`, and the view panel appears below it.
- Clicking `Load` shows a paged 2×3 thumbnail grid, and selecting a thumbnail loads that building config.
- `Export` is disabled until a building is loaded/created, and exports once a building exists.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_258_BUILDINGS_building_fabrication_scene2_simplify_ui_and_thumbnail_loader_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Added a new `Building Fabrication 2` scene/state with menu + numeric hotkey discoverability (no roads).
- Implemented a simplified HUD layout: top-left building panel (name/type + `Load`/`Export`) and view panel below, with an empty right panel.
- Added an offscreen thumbnail renderer and paged 2×3 thumbnail browser for loading building configs.
- Disabled sun bloom while in Building Fabrication 2 and restored prior settings on exit.
