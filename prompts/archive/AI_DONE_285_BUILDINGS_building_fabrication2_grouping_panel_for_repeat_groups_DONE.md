#Problem (DONE)

BF2 needs a UI workflow to define repeatable **groups of adjacent bays** so the solver can repeat multi-bay patterns (e.g., “windows, windows, windows, column”). We also need a simple, self-contained grouping manager panel that can create and remove groups without cluttering the main bay editor panel.

# Request

Add a `Grouping` card/action near the `+Bay` action that opens a grouping manager panel to create/remove groups from adjacent bays.

Tasks:
- Entry point:
  - On the same row as the `+Bay` card (the action row), add a `Grouping` card.
  - Clicking `Grouping` opens a grouping manager panel.
- Grouping manager panel:
  - The panel shows:
    - a list/preview of all bays (in order) at the top,
    - a list of existing groups below it.
  - Provide a `Create group` button:
    - When creating a group, allow selecting **adjacent** bays only (contiguous selection).
    - Clicking `Done` finalizes and creates the group.
  - Groups can be removed.
  - The panel has a global `Done` button that closes the grouping panel.
- Model/spec intent:
  - Created groups must be represented in the building v2 model as repeatable group structures that the facade solver can consume.
  - Do not duplicate bay definitions unnecessarily; keep group membership and bay identity stable.
  - Update relevant specs under `specs/buildings/` if the grouping UI introduces new model fields or clarifies group authoring rules.

Constraints:
- Keep the grouping panel focused: create/remove groups only (group repeat parameters UI can be added later).
- Reuse shared panel/popup UI builders and the established BF2 panel behavior patterns.

## Quick verification
- `Grouping` card appears next to `+Bay` in the action row.
- Clicking it opens a grouping panel with bays (top) and groups (bottom).
- Creating a group only allows contiguous bay selections; `Done` creates it.
- Groups can be removed; global `Done` closes the panel.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_285_BUILDINGS_building_fabrication2_grouping_panel_for_repeat_groups_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added a `Grouping` card next to `+ Bay` to open a grouping manager overlay.
- Implemented create/remove repeat groups (contiguous bay ranges, no overlap) stored in the BF2 v2 facade model.
- Updated the facade bay solver + generator wiring to repeat grouped bay patterns.
- Updated specs and added a headless e2e test for the grouping workflow.
