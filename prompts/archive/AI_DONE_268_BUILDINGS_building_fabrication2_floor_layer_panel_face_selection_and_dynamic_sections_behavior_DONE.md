#Problem (DONE)

Building Fabrication 2 uses floor layers as the core authoring unit, and faces can be linked (master/slave). The current UI behavior for face selection and per-layer panels needs to be stabilized so the layout is consistent, predictable, and does not “jump” when selecting a master vs a slave face.

# Request

Define and implement the floor layer panel UI behavior for face selection and dynamic configuration sections in Building Fabrication 2.

Tasks:
- Floor layer panel structure (fixed vs dynamic):
  - Each floor layer panel has **two fixed sections** that are always visible:
    1) Floor config (number of floors + floor height)
    2) Faces (face buttons and linking UI)
  - Below the Faces section, the panel has a **dynamic area** that can contain multiple configuration sections (e.g., Materials, Bays, Windows, etc.).
  - Dynamic area height:
    - Do not force a fixed height; let it flow naturally.
    - The dynamic area should remain stable in practice because it always contains the same sections; switching face selection states must not change its layout height.
- Master vs slave face selection behavior:
  - When a **master** face is selected:
    - Show the dynamic area and its sections for configuration.
  - When **no face is selected**:
    - Hide the dynamic area content but keep its layout space.
    - Show a label at the top of the dynamic area: `Select a face to start configuring`.
  - When a **slave** face is selected:
    - Hide the dynamic area content, but the dynamic area must still occupy the same space/height in the panel.
      - Implement as “visible = false” meaning it keeps layout space (e.g., `visibility:hidden` / equivalent), not `display:none`.
    - At the top of the dynamic area, show a label: `Locked to X` where `X` is the master face id.
    - Label rendering rule:
      - `Locked to X` (and `Select a face to start configuring`) must be **overlays** inside the same reserved dynamic-area container (do not affect layout height).
      - When in slave mode, the dynamic configuration content must remain hidden (`visible=false`), so only the overlay label is readable.
- Layout stability requirements:
  - Selecting different faces (including master↔slave transitions) must not cause the floor layer panel to resize/jump vertically.
  - Only the dynamic area’s content visibility changes; panel structure and reserved space stay stable.

## Quick verification
- Floor config and Faces sections always remain visible for every floor layer panel.
- Selecting a master face shows dynamic configuration sections.
- Selecting a slave face shows `Locked to X` as an overlay and hides dynamic sections (keeps layout space) without changing panel height.
- With no face selected, the dynamic area keeps its space and shows `Select a face to start configuring`.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_268_BUILDINGS_building_fabrication2_floor_layer_panel_face_selection_and_dynamic_sections_behavior_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Implemented a reserved “dynamic configuration area” in each BF2 floor layer panel that stays the same height across face selection states.
- Added overlay labels for “Select a face to start configuring” and “Locked to X”, while hiding dynamic sections via `visibility:hidden` to avoid panel jumpiness.
