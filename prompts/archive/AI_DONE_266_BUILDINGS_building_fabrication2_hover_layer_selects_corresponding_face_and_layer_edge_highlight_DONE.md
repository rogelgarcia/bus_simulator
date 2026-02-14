#Problem (DONE)

In Building Fabrication 2, faces are edited per floor layer. When moving between floor layers in the building properties panel, it’s easy to lose track of which face is being edited and where that face lies on the currently hovered layer in the 3D viewport.

# Request

Improve layer-hover behavior so that hovering a floor layer panel automatically selects (and highlights) the corresponding face on that layer, based on the currently selected face in the active layer. Also adjust the viewport face highlight line so it renders on the **bottom edge of the hovered/selected layer**, not the bottom of the full building.

Tasks:
- Hover-to-select face across layers:
  - When hovering a floor layer panel in the building properties UI:
    - If there is a currently selected face id (e.g., `A`), automatically select the **same face id** on the hovered layer (face `A` on that layer).
    - If no face has been selected anywhere yet, default the global selected face id to `A`.
  - Face selection is **global**:
    - There is one “currently selected face id” (e.g., `A`) shared across the whole screen.
    - Each floor layer resolves that global face id to its local face instance for highlighting/authoring.
  - The “currently selected face id” acts as the global face-selection intent while navigating layers:
    - Example: editing Layer 1 with face `A` selected → hover Layer 2 → face `A` becomes selected for Layer 2.
  - When the cursor leaves the layer panel area, do **not** auto-unselect (selection can remain as-is).
- Viewport highlight placement:
  - The line/outline used to show the selected face must be rendered on the **bottom edge of the active floor layer** (the layer’s base elevation), not at the bottom of the entire building.
  - The “active floor layer” for highlight placement is the **last-hovered layer** (and remains in effect when the cursor leaves the layer panel area).
  - Ensure this works when switching/hovering between layers with different plan offsets/heights.
- Priority rules:
  - Keep selection behavior deterministic and avoid flicker between hover selection and explicit user clicks.
  - If there is an explicit face selection click on a layer, hovering other layers should still follow the “same face id” rule.
- View panel toggle (hide face mark):
  - In the `View` panel, add a toggle: `Hide face mark`.
  - When enabled, and the mouse cursor is inside the 3D viewport area (not in configuration panels), do **not** draw the face selection line/outline.
  - This is a visual-only suppression:
    - all internal selection/hover state remains unchanged,
    - the face selection line/outline is hidden only while the cursor is in the viewport area,
    - when the cursor leaves the viewport area, the face selection line/outline draws again.
    - Put the toggle below the existing buttons in a separate row. 

## Quick verification
- Select face `A` on Layer 1, hover Layer 2: face `A` is selected and highlighted for Layer 2.
- Moving the cursor out of the layer panel does not clear selection.
- The face highlight line appears at the base of the currently selected/hovered layer, not at the building base.
- With `Hide face mark in view` enabled:
  - moving the mouse into the viewport hides the face selection line/outline,
  - moving the mouse back into the UI panels shows the face selection line/outline again.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_266_BUILDINGS_building_fabrication2_hover_layer_selects_corresponding_face_and_layer_edge_highlight_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Made BF2 layer hover auto-select the same global face id on the hovered layer (no auto-select when no face is selected).
- Moved the viewport face highlight line to the base elevation of the active (last-hovered) floor layer, and added a View-panel toggle to hide the face mark while the cursor is over the 3D viewport.
- Expanded layer hover hit-area so hovering anywhere in a floor layer panel (not just the header) triggers the behavior.
- Limited the hovered-layer outline highlight to only trigger when hovering the layer title bar.
