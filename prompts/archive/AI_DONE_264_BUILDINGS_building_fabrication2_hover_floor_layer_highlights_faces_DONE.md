#Problem (DONE)

Building Fabrication 2 uses floor layers as the core authoring unit. It’s currently hard to visually confirm which geometry/faces correspond to a given floor layer while navigating the layers list in the building properties panel.

# Request

Add a hover interaction: when the user hovers a **floor layer title bar** in the building properties panel (right panel), highlight that floor layer’s faces in the 3D viewport.

Tasks:
- Hover detection:
  - Detect pointer hover over a floor layer’s title bar row (the collapsible header).
- Viewport highlight behavior:
  - While hovered, highlight the faces belonging to that floor layer in the viewport.
  - The hover highlight must be visually distinct from “selected face” highlight (subtle tint/outline is fine).
  - When hover ends, remove the hover highlight immediately.
- Priority/interaction rules:
  - If a face is selected (or another highlight mode is active), define clear priority so highlights don’t flicker:
    - Selected face highlight stays strongest.
    - Hovered layer highlight is secondary.
- Performance:
  - Hovering should not trigger expensive rebuilds; use lightweight state/overlay updates.

## Quick verification
- Moving the mouse across floor layer title bars highlights the corresponding floor layer faces in the viewport.
- Selected face highlight remains visible and stronger when hovering layers.
- Hover highlight clears when the cursor leaves the title bar.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_264_BUILDINGS_building_fabrication2_hover_floor_layer_highlights_faces_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Added hover detection on BF2 floor layer title bars to drive a lightweight viewport highlight.
- Implemented a secondary (subtle) hovered-layer outline highlight in the BF2 3D scene while keeping selected face highlight priority.
