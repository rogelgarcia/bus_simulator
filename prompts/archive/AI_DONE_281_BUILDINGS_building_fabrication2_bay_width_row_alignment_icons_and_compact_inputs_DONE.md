#Problem (DONE)

In Building Fabrication 2, the Bay `Width` configuration row is visually unstable:
- The controls drift horizontally when switching between `Fixed` and `Range`.
- The `Range` mode icon can be improved (prefer outward arrows).
- The width inputs are too wide, causing the `∞` (infinite max) control to overflow outside the panel/screen.

# Request

Stabilize and compact the BF2 Bay `Width` row UI so it is consistent, aligned, and fits within the panel in both `Fixed` and `Range` modes.

Tasks:
- Left alignment / no drift:
  - Ensure all Width-row components share the same left edge alignment within the bay editor column.
  - Switching between `Fixed` and `Range` must not shift controls left/right (no “drifting”).
  - Prefer reserving consistent space for controls so the row stays visually stable between modes.
- Mode icons:
  - Use an outward-arrows icon for `Range` mode (if available).
  - Keep `Fixed` as an icon-only button (consistent with the compact mode selector spec).
- Compact inputs + infinity button:
  - Reduce the visual width of the numeric inputs so the whole control set fits within the panel.
  - Ensure the `∞` (infinite max) button never overflows outside the panel/screen.
  - Keep `∞` as a selectable button (icon-only), not a checkbox.

Constraints:
- Keep this change limited to layout/UX (no changes to solver behavior).
- Reuse shared UI builders/components; avoid duplicating bespoke layout code.

## Quick verification
- In BF2 bay editor, switching Width between `Fixed` and `Range` keeps all controls aligned (no drift).
- `Range` uses an outward-arrows icon.
- Min/Max inputs are compact and the `∞` button stays fully visible inside the panel.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_281_BUILDINGS_building_fabrication2_bay_width_row_alignment_icons_and_compact_inputs_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- UI: Left-aligned the bay Width row controls to prevent horizontal drifting between Fixed/Range modes.
- UI: Swapped the Range mode icon to an outward-arrows symbol and tightened padding for a more compact mode selector.
- CSS: Reduced numeric input widths and button padding so the ∞ toggle stays fully visible within the panel.
