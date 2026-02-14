#Problem (DONE)

The BF2 bay width configuration UI needs to be more compact. The `Fixed` / `Range` mode buttons currently take too much space due to labels and layout, which prevents placing width inputs (min/max) and the “infinite max” control inline.

# Request

Update the BF2 bay width configuration UI to use a compact button-group style for mode selection and a compact inline layout for min/max/infinite controls.

Tasks:
- Width mode buttons (Fixed / Range):
  - Remove text labels from the `Fixed` and `Range` mode buttons (icon-only).
  - Render them as a single **button group** (both buttons inside the same rectangular group container).
  - Use a smaller font / compact sizing so the control is visually small and does not dominate the row.
- Inline width inputs:
  - Place the width inputs inline on the same row as the mode selector:
    - Fixed mode: show one width input.
    - Range mode: show `Min` and `Max` inputs.
- Infinite max control:
  - In Range mode, replace the “infinite” checkbox with a **selectable button**:
    - Icon-only (no label).
    - No outer/group border around it (only the button’s own border).
    - Compact sizing matching the mode buttons.
  - The infinite button should sit inline with the `Min`/`Max` inputs (ideally adjacent to the `Max` input).
- Behavior/validation (no functional changes beyond UI affordance):
  - Keep existing semantics and validation rules (minimum acceptable width, default values, etc.) from the current bay width spec/prompt.

## Quick verification
- In BF2 bay width UI, Fixed/Range appear as compact icon-only buttons inside one group rectangle.
- Range mode shows Min/Max inputs inline plus an icon-only infinite toggle button (no checkbox; no group border).
- Layout is compact enough to fit all controls on one row without crowding.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_279_BUILDINGS_building_fabrication2_bay_width_mode_buttons_compact_button_group_ui_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- UI: Reworked BF2 bay width row into a compact inline layout (icon-only Fixed/Range button group + inline width inputs).
- UI: Replaced the Range “infinite max” checkbox with an icon-only toggle button positioned inline next to the Max input.
- CSS: Added compact button-group and width-row styling to keep the bay width controls visually small.
