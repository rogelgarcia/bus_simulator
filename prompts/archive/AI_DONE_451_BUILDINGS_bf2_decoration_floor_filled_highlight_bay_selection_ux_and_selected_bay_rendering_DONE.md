# DONE

## Problem

Building Fabrication 2 Decoration mode has floor/bay selection UX and rendering behavior that is currently hard to understand and inconsistent, especially for floor hover feedback, linked bay selection, and where decorations are rendered.

# Request

Improve BF2 Decoration mode selection UX and rendering feedback for floors and bays.

Tasks:
- Floor selection popup behavior:
  - When hovering a floor entry in the selector popup, highlight floor facades as filled surfaces (not edges only).
  - Use a blue shaded overlay across facade surfaces for the hovered floor layer (across all building faces).
  - Align floor-interval preset buttons to the right.
- Bay selector:
  - Add an `All bays` button at the corner of the bay selector.
  - Pressing it selects all bays.
  - Add a horizontal separator (`HR`) after the bay selection section.
- Bay selection interaction model:
  - Initial state should be non-selected.
  - Clicking a bay toggles it selected.
  - If a bay belongs to a linked group, clicking any linked bay must select/deselect the whole linked set together.
- Linked bay non-selected color:
  - Adjust linked-bay non-selected color saturation per requested tuning (more saturated) and make it consistent between Building mode and Decoration mode (same color treatment in both modes).
- Decoration rendering scope:
  - Render decorations only on selected bays.
- Decoration-mode face indicator behavior:
  - In Decoration mode, do not render the Building-mode selected-face mark.
  - Instead, when hovering a bay, highlight only that bay's floor span.
- Decoration bay selector layout:
  - Show each face on a single line.
  - Remove `Face X` label text from the bay selector presentation.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_451_BUILDINGS_bf2_decoration_floor_filled_highlight_bay_selection_ux_and_selected_bay_rendering_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_451_BUILDINGS_bf2_decoration_floor_filled_highlight_bay_selection_ux_and_selected_bay_rendering_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Completed Summary
- Switched floor-layer hover from edge outlines to filled blue facade-surface overlays in BF2 scene rendering.
- Right-aligned floor-interval preset buttons and added a dedicated layout class for that preset row.
- Reworked decoration bay UI to include a corner `All bays` button and a visual separator after bay selection.
- Updated bay selection model so new sets start non-selected and decoration targeting resolves only selected bays unless `All bays` is enabled.
- Implemented linked-bay group toggling so clicking any linked bay selects/deselects the full linked set together.
- Increased linked bay non-selected saturation and unified linked color treatment between decoration/bay buttons and bay-link popup buttons.
- Removed `Face X` text from decoration bay buttons and rendered bay rows one face per horizontal line.
- Suppressed selected-face mark in Decoration mode while keeping bay hover overlay focused to the hovered bay floor span.
- Added/updated BF2 tests for new selection semantics, linked-bay toggling, decoration-mode face-mark suppression, and filled floor hover overlays.
