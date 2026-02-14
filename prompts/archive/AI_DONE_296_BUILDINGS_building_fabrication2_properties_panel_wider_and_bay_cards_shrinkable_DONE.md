#Problem (DONE)

In Building Fabrication 2 (BF2), the bay cards list can take a lot of vertical space when there are many bays. This increases vertical scrolling and makes it harder to see a dense layout (e.g., 4 bays in a row) within the Properties panel.

Two factors contribute:
- The Properties panel width is currently too narrow, limiting the effective horizontal space available to the bay cards grid and increasing wrapping/scrolling.
- Bay cards have a minimum width that prevents them from shrinking enough to fit more cards per row.

# Request

Improve BF2 bay cards density and reduce vertical scrolling by widening the Properties panel and allowing bay cards to shrink more.

Tasks:
- Properties panel width:
  - Increase the width of the BF2 Properties panel.
  - Ensure the internal panels/components inside the Properties panel also expand appropriately (so the extra width is usable by bay cards and related UI).
  - Preserve overall UI usability (no overlapping, clipping, or broken layout).
- Bay card minimum width:
  - Allow bay cards to shrink in width down to approximately half their current minimum size (so more bays can fit per row).
  - Ensure the bay cards remain readable and usable at the smaller width (labels, buttons, thumbnails, etc. should not become unusable).
  - Keep spacing/gutters consistent and visually clean when cards are smaller.
- Scrolling behavior:
  - The new layout should reduce vertical scrolling pressure and increase the likelihood of seeing 4 bay cards in a row when the viewport/window size permits.
  - Ensure the bay cards grid behaves well across common window sizes and aspect ratios.
- Scope:
  - BF2 only.
  - Do not change bay data/model logic; layout/UI only.

## Quick verification
- In BF2, the Properties panel is wider and its inner sections use the additional width.
- Bay cards can shrink to about half their previous minimum width and more cards fit per row.
- With multiple bays, the list requires less vertical scrolling and can show 4 bays per row in common viewport sizes.
- No broken layout, clipping, or unusable controls at the smaller card width.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_296_BUILDINGS_building_fabrication2_properties_panel_wider_and_bay_cards_shrinkable_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Widened the BF2 Properties panel so its inner content (including bays) has more horizontal room.
- Made BF2 bay selector cards shrinkable with a smaller minimum width, while keeping labels/icons usable.
- Updated BF2 headless e2e coverage to assert the wider panel and denser bay card row layout.
