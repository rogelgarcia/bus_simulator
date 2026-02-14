#Problem (DONE)

Building Fabrication 2 needs to reflect the correct relationship between **floor layers** and **faces**: faces (and face linking/master-slave) are configured **per floor layer**, and the floor count/height are properties of a floor layer (not a face).

# Request

Update the Building Fabrication 2 UI so floor layers and roof layers are managed at the top of the right panel, and each floor layer contains its own layout (floors/height) and faces/linking controls.

Tasks:
- Right panel layout:
  - Place `+ Floor` and `+ Roof` buttons at the **top** of the right panel.
  - Below the buttons, render the layers list/sections (no “Layers” title header needed).
- Layer groups:
  - Display floor layers and roof layers as collapsible groups.
  - Each layer group supports:
    - Move up/down (arrow buttons)
    - Delete (garbage button)
    - Expand/collapse
  - Enforce required minimums:
    - The building must always have **at least 1 floor layer** and **at least 1 roof layer**.
    - If there is only one remaining layer of a type, disable its delete button.
- Floor layer contents (per floor layer):
  - Inside each `Floor layer` group, show:
    - `Number of floors` control (slider + numeric input)
    - `Floor height` control (slider + numeric input)
    - `Faces` controls for that floor layer:
      - Face buttons: `A`, `B`, `C`, `D` (select/unselect per floor layer)
      - Selected face highlights in the viewport; allow unselecting back to none
      - A `link` button that opens a popup to select faces to link for this floor layer:
        - Selected face is the master; chosen faces become slaves
        - Slaves show `locked to X`
        - Unlinking slaves is done from the master via the same UI
- Behavior consistency:
  - Face linking must be stored/represented **per floor layer** (no cross-layer linking).
  - The UI must follow the authoritative specs:
    - `specs/buildings/BUILDING_2_SPEC_ui.md`
    - `specs/buildings/BUILDING_2_SPEC_model.md`
    - `specs/buildings/BUILDING_2_FACADE_LAYOUT_SPEC.md`

Constraints:
- Implement only the UI relationship/layout changes described here; do not add other building fabrication features.
- Keep UI code reusable and avoid duplicating UI logic (use shared UI builders/components).

## Quick verification
- Right panel shows `+ Floor` / `+ Roof` at the top, followed by the layer groups list (no “Layers” title).
- Each floor layer shows floors/height + face selection + link popup, scoped to that floor layer.
- Deleting layers respects “at least 1 floor + 1 roof” constraints.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_261_BUILDINGS_building_fabrication2_floor_layers_faces_ui_relationship_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Restructured the BF2 right panel so `+ Floor` / `+ Roof` live at the top and layers render directly below (no “Layers” header).
- Implemented per-floor-layer `Layout` controls (floors + floor height) using slider + numeric input.
- Implemented per-floor-layer face selection plus a `Link` popup to manage master/slave face linking scoped to that floor layer.
