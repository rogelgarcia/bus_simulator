#Problem (DONE)

In Building Fabrication 2, when a bay overrides the inherited texture/material, the UI uses a “clear override” button placed below the texture thumbnail selector. This uses extra vertical space and makes the bay material section taller than needed.

# Request

Move the bay texture/material “clear override” action so it appears beside the thumbnail selector, not below it, when an override is active.

Tasks:
- Override clear button placement:
  - When a bay has an active texture/material override, render the “clear override” action as a small icon/button on the side of the thumbnail selector (same row).
  - Do not place the clear override action below the thumbnail selector.
- Visibility rules:
  - Only show the clear override action when an override is present.
  - When the bay is inherited (no override), do not show the clear override action.
- Layout stability:
  - Keep the material picker layout compact and consistent with the wall material picker behavior (thumbnail + name; opens the material configuration panel).
  - Avoid adding vertical height to the bay editor section when toggling override state.

## Quick verification
- Bay with inherited texture/material: no clear override action is shown.
- Bay with an override: clear override action appears next to the thumbnail selector (same row) and does not add extra vertical space.
- Clearing override returns the picker to inherited state.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_290_BUILDINGS_building_fabrication2_bay_texture_override_clear_button_next_to_thumbnail_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Moved the bay material override clear action into the same row as the bay editor material picker (icon button next to the thumbnail/name).
- Added BF2 CSS for the inline picker row, updated the UI spec, and extended the headless e2e to assert the new control is present only when overridden.
