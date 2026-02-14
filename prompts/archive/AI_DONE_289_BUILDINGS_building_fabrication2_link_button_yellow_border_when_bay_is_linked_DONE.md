#Problem (DONE)

In Building Fabrication 2, it’s not visually obvious from the bay editor header whether the currently selected bay is linked (slave) to another bay. The `Link` button should provide a clear, consistent visual cue for this state.

# Request

Update the BF2 bay editor `Link` button decoration so when the currently selected bay is linked to another bay, the button’s border turns yellow.

Tasks:
- Linked-state decoration:
  - When the current bay is a slave (linked to a master bay), render the `Link` button with a yellow border.
  - When the current bay is not linked, render the `Link` button with its normal border.
- Scope:
  - Apply only to the bay editor header `Link` button (do not change other buttons unless explicitly needed for consistency).
- Behavior (no change):
  - No change to link logic; this is a visual indicator only.

## Quick verification
- Select a bay that is linked: `Link` button border is yellow.
- Select a bay that is not linked: `Link` button border returns to normal.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_289_BUILDINGS_building_fabrication2_link_button_yellow_border_when_bay_is_linked_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added a linked-state style for the bay editor `Link` button (yellow border) and toggled it when the selected bay is linked.
- Updated BF2 UI spec and extended the headless e2e to assert the linked/unlinked border behavior.
