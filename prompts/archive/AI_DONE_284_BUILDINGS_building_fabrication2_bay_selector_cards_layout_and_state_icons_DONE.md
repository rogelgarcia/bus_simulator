#Problem (DONE)

The BF2 bay selector UI needs clearer affordances and more predictable layout:
- Each bay card should communicate key bay properties (width mode, repeat/repeat-preference) via icons.
- The bay cards area should reserve space and avoid awkward empty states.
- The `+Bay` action should be separated visually from the bay list.

# Request

Update the BF2 bay selector cards to add state icons and stabilize the layout across empty/overflow cases.

Tasks:
- Bay card icon row (below the number):
  - Under each bay’s numeric label, show:
    - a width-mode icon:
      - `Fixed` → fixed-width icon (e.g., circle)
      - `Range` → outward-arrows icon
    - a “repeatable” icon (copy-like icon) when the bay’s expand preference indicates it participates in repetition (e.g., `Prefer Repeat`).
  - Icons must be compact and consistent in style.
- Bay cards layout rules:
  - The first row is reserved for bay cards.
  - If bays overflow, allow a second row for bay cards.
  - Empty state:
    - If there are no bays, render a single placeholder bay card:
      - not selectable
      - dashed border
      - number label is `-`
  - The `+Bay` card must be placed on a separate line from the bay cards (not in the first bay row).
- Material preview consistency:
  - Bay selector cards should continue to show the resolved material preview for each bay (even if the bay editor material picker is showing `Inherited`).

## Quick verification
- Bay cards show width-mode + repeat/repeat-preference icons under the bay number.
- With no bays, a dashed placeholder card with `-` appears and is not selectable.
- `+Bay` appears on its own separate row.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_284_BUILDINGS_building_fabrication2_bay_selector_cards_layout_and_state_icons_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- UI: Bay selector cards now include a compact state icon row (width mode + repeat preference) under the bay number.
- UI: Empty state shows a dashed, non-selectable placeholder card (`-`), and the `+ Bay` card is rendered on its own separate row.
- Tests/specs: Updated BF2 UI spec and added a headless e2e test covering placeholder/layout/icons.
