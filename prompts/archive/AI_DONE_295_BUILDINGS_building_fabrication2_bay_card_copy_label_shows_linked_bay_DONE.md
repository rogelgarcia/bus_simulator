#Problem (DONE)

In Building Fabrication 2 (BF2), it’s hard to tell at a glance when a bay is a copy/linked bay versus an independent bay. The current bay card label only shows the bay’s own index, which makes it easy to miss that the bay is actually linked to another bay.

# Request

Add a clear visual indicator in BF2 bay cards for bays that are copies/linked to another bay, by changing the bay label to show which bay it is linked to.

Tasks:
- Bay card label behavior:
  - For normal (non-copied / non-linked) bays, keep the existing label behavior (shows the bay’s own index).
  - For bays that are a copy/linked:
    - Replace the label text that normally shows the bay’s own index with the index/label of the bay it is linked to (the source/master bay).
    - Use a gray font color for this label to visually indicate it’s a copy/linked bay.
- Clarity / UX:
  - The label change should make it immediately obvious which bay is the source without needing to open additional panels.
  - Ensure the label remains readable on the bay card background in all themes/styles used by BF2.
- Scope:
  - BF2 bay cards only.
  - Do not change bay numbering logic, linking behavior, or other UI outside the bay card label/appearance.

## Quick verification
- In BF2, a normal bay card continues to display its own index label as before.
- In BF2, a copied/linked bay card displays the linked/source bay index/label instead of its own.
- The copied/linked bay label text uses a gray font color and is clearly distinguishable from normal bays.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_295_BUILDINGS_building_fabrication2_bay_card_copy_label_shows_linked_bay_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- BF2 bay selector cards show the source/master bay index for linked bays (muted gray label).
- Added a headless BF2 e2e assertion to verify linked bay card labels and styling.
