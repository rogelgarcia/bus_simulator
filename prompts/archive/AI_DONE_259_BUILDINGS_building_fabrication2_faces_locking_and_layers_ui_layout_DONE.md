#Problem (DONE)

We need a clean, minimal UI foundation for the new Building Fabrication workflow. The immediate goal is to establish the panel layout and core interactions (create building, face selection, face locking, and layer group UI) without bringing in any additional legacy complexity or unrelated features.

# Request

Implement the initial UI layout and interactions for the new Building Fabrication screen (Building Fabrication 2). Focus only on the features listed below.

Tasks:
- Left panel (Fabrication):
  - Add a Fabrication panel on the left with a `Create Building` button.
  - Clicking `Create Building` initializes a building at the map center with:
    - Footprint: **2×1 tiles**
    - Floors: **4 floors** (initial configuration should reflect this)
    - Default face locking:
      - Face `A` is the master of face `C`
      - Face `B` is the master of face `D`
  - Before a building is created, the screen should show an “empty state” (no building configured).
- Right panel (Building → Faces):
  - The right panel should be structured so the **building floor configuration is above the face configuration**:
    1) Building (floors/height + layers)
    2) Faces (ABCD selection + locking)
- Building configuration (global; not per-face):
  - Add a building configuration section at the top of the right panel.
  - Layer group UI (layout only; no extra features):
    - Show `+ Floor` and `+ Roof` buttons only when a **master face** is selected.
    - Clicking `+ Floor` / `+ Roof` adds a new group:
      - Group type: `Floor layer` or `Roof layer`
      - Each group supports:
        - Move up/down (arrow buttons)
        - Delete (garbage button)
        - Expand/collapse
    - Enforce required minimums:
      - The building must always have **at least 1 floor layer** and **at least 1 roof layer**.
      - If there is only one floor layer (or only one roof layer), the delete button for that remaining layer type is disabled.
  - Floor layer contents (minimal):
    - Inside each `Floor layer` group, include a `Floor` subgroup with controls matching the legacy Building Fabrication screen for:
      - Number of floors
      - Floor height
    - When `Create Building` is used, initialize these controls to match the created building (including the initial 4-floor setup).
- Faces configuration (per-face):
  - Add a `FACES` section below the building configuration with buttons for faces: `A`, `B`, `C`, `D`. (inline "Faces ABCD")
  - Face selection behavior:
    - Clicking a face selects it and highlights it on the map/viewport.
    - Support “unselecting a face” (i.e., return to no face selected).
  - Face locking UI/behavior:
    - When a face is selected and it is a **master** (not locked to another face):
      - Show a `Locking` section listing all faces (`A–D`) with the current face disabled.
      - Allow selecting one or more other faces to “lock” to the current face’s design.
      - Allow unlinking slaves from the master (i.e., remove the lock) via this master UI.
      - Treat the current face as the **master** and the locked faces as **slaves** (logical relationship only).
      - In the face selector UI: when selecting a master or a slave, subtly highlight its related locked faces (distinct from the “selected face” highlight).
    - When a face is selected and it is a **slave**:
      - Do not show the list of faces to lock.
      - Instead show text: `locked to X` where `X` is the master face id.
    - When a face is selected and is slave, do not show any other **face-level** controls.

Constraints:
- Implement only what is listed above; do not add additional building fabrication features yet (no roads, no bay editing, no belts/roof params beyond the layer groups, etc.).
- This prompt is specifically to establish the UI layout and the listed interactions.

## Quick verification
- Opening Building Fabrication 2 shows an empty state with a left `Create Building` button.
- Clicking `Create Building` spawns a centered 2×1 building configured with 4 floors.
- After building creation, face locks default to `A→C` and `B→D`.
- The right panel shows building floor configuration (floors/height + layers) above the `FACES` section.
- Face buttons `A–D` select/unselect and highlight the selected face in the viewport.
- Locking a face establishes master/slave behavior and related-face subtle highlighting.
- `+ Floor` / `+ Roof` is visible only on master faces and adds layer groups at the building level; groups can move, collapse, and delete with minimum 1 floor layer + 1 roof layer enforced.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_259_BUILDINGS_building_fabrication2_faces_locking_and_layers_ui_layout_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Added a left “Fabrication” panel with `Create Building` that spawns a centered 2×1 building initialized to 4 floors and default face locks (A→C, B→D).
- Implemented the right panel layout with `Building` (layer groups + floor controls) above `FACES` (select/unselect + locking UI).
- Added master/slave face locking behavior with related-face highlighting and viewport face highlight.
- Added minimal layer group UI with add/move/collapse/delete (with minimum 1 floor layer + 1 roof layer enforced).
