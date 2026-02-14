#Problem (DONE)

In Building Fabrication 2, editing bays via per-bay panel sections does not scale well and can cause a convoluted UI and unstable panel sizes. We need a clearer interaction model: select a bay from a list of bay buttons, then edit it in a single, consistent bay configuration panel.

# Request

Change the BF2 bays UI so bays are edited via:
- a bay selector (buttons) inside the Bays section, and
- a single bay configuration panel that updates based on the selected bay.

Tasks:
- Bay selector buttons:
  - In the Bays section, render a row/grid of bay buttons (similar interaction to face buttons).
  - Each bay button must show:
    - a preview of the bay’s material (thumbnail),
    - a number underneath (bay index/order).
  - Include an `+ Bay` button in the same selector area to add a new bay.
  - Selecting a bay button updates the bay configuration panel to edit that bay.
- Single bay configuration panel:
  - Remove the “one panel section per bay” approach.
  - Render one bay configuration panel that always occupies the same area and edits the currently selected bay.
  - If there are no bays yet, the bay configuration panel area should remain reserved and show a simple guidance overlay (e.g., “Add a bay to start configuring”).
- Face linking rules (no copies):
  - Bays are authored per face (within a floor layer).
  - If the selected face is a slave, the UI must not allow editing bay configurations; it must follow the existing locked/inherited behavior (no duplicated/copy configs).
  - Keep layout stability: when editing is not allowed (slave or no face selected), reserve the bay panel space and hide the configuration content using `visibility:hidden`-style behavior (not display none), consistent with BF2 dynamic panel rules.

## Quick verification
- In BF2, the Bays section shows bay selector buttons with material previews and numeric labels, plus an `+ Bay` button.
- Selecting a bay swaps the content in a single bay configuration panel (no per-bay stacked panels).
- Slave faces do not expose editable bay configuration, but the overall panel height/layout remains stable.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_274_BUILDINGS_building_fabrication2_bays_single_editor_panel_and_bay_selector_buttons_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary (DONE)
- Replaced per-bay stacked bay cards with a bay selector (material preview + bay index buttons) and a single bay editor panel.
- Kept bay panel layout stable by reserving the editor area and using an overlay when no bays exist.
- Updated the Building v2 UI spec to document the bay selector + single editor workflow.
