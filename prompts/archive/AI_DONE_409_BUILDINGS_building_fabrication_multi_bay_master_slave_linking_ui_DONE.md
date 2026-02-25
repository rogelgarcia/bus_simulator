# Problem (DONE)

Building fabrication bay linking behavior is too limited and the UI model is incorrect for the desired workflow. It currently supports only one linked bay and shows link labels in ways that conflict with a master/slave linking model.

# Request

Redesign bay linking in building fabrication to support one master bay controlling multiple slave bays, with updated selector-card presentation and slave editing behavior.

Tasks:
- Support linking multiple bays to a single master bay (one master, many slaves).
- Define linking ownership so the bay where linking is initiated is the master, and selected linked bays become slaves.
- Remove master-side linked-bay text indicators from the bay selector/panel (for example, do not show labels like `link 3` on the master bay card).
- In the bay selector panel, render slave bays as thin-width preview cards that only have enough space for a link icon (and show only that icon).
- For slave bay selector cards, do not show `default` text when material is default; show only material preview/info.
- Add linked-group color coding using 7 master hues: master uses the base hue and slaves use a lighter variant of that same hue.
- Ensure all master changes propagate to every slave in the linked group.
- Keep slave bays non-editable in the full editor: no slave edit panel controls; show a `Linked to ...` message as the slave state.
- Ensure unlink/relink transitions preserve consistent master/slave assignment, selector visuals, and propagated material state.
- Update relevant specs under `specs/buildings/` to reflect the new multi-bay master/slave linking behavior and UI rules.

## On completion
- Mark the AI document as DONE in the first line
- Rename in `prompts/` to:
  - `prompts/AI_DONE_409_BUILDINGS_building_fabrication_multi_bay_master_slave_linking_ui_DONE.md` on `main`
  - `prompts/AI_DONE_<branch>_409_BUILDINGS_building_fabrication_multi_bay_master_slave_linking_ui_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically
- Move to `prompts/archive/` only when explicitly requested
- Add a high-level one-line summary per completed change

## Summary (DONE)
- Reworked bay linking to be authored from a selected master bay with popup-based toggling of multiple slave bays.
- Preserved deterministic root-master normalization and slave redirection behavior during unlink/relink transitions.
- Updated bay selector visuals so linked slave bays render as thin icon-only cards while masters keep full cards.
- Added linked-group color coding with a 7-hue rotation (master base hue, slave lighter variant) in selector and link popup visuals.
- Kept linked slave bays non-editable in bay editor/material workflows, including `Linked to Bay X` overlays and unlink actions.
- Updated building specs to document the one-master/many-slaves bay-linking model and new UI presentation rules.
- Added/updated BF2 headless e2e coverage for master-driven bay-link interaction and selector-card behavior.
