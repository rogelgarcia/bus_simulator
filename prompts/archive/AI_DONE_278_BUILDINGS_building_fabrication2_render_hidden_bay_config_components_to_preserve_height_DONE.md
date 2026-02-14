#Problem (DONE)

In Building Fabrication 2, the bay configuration panel is intended to keep a stable height even when the bay configuration content is hidden (e.g., no bay selected / no bays exist / bay configuration not available). However, when the configuration becomes visible, it consumes slightly more vertical space, causing a layout “jump”.

This happens because the UI conditionally does not render some bay configuration components when there is no bay, so the panel’s layout/measurement differs between the hidden and visible states.

# Request

Fix the BF2 bay configuration panel so its layout height is stable by ensuring the bay configuration component tree is rendered even when there is no bay to edit.

Tasks:
- Always render bay config components:
  - Do not conditionally omit/unmount the bay configuration UI components based on “no bay selected / no bays exist”.
  - Render the full bay configuration component tree at all times so layout measurements match the “enabled” state.
- Hide without changing layout:
  - When bay configuration should not be shown (no bay / no selection / not editable), hide the configuration content using `visibility:hidden`-style behavior (keeps layout space), not `display:none` (removes layout space).
  - Use the existing BF2 pattern of showing a guidance overlay label inside the reserved area (e.g., “Select a bay to start configuring” / “Add a bay to start configuring”).
- Stable height acceptance:
  - After the change, enabling/selecting a bay must not change the panel height (no vertical shift), because the same components are already present and only change visibility/state.
- Scope:
  - Apply specifically to the bay configuration panel/area (including any sub-sections like material, width, window, etc. if present).
  - Keep behavior consistent with the broader BF2 “stable layout” rules for dynamic sections.

## Quick verification
- In BF2, when there is no bay selected (or no bays exist), the bay configuration area is reserved and shows the guidance overlay.
- Selecting/enabling a bay reveals the same bay configuration UI without increasing panel height (no jump).
- Switching between “no bay” and “bay selected” does not change overall floor layer panel heights.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_278_BUILDINGS_building_fabrication2_render_hidden_bay_config_components_to_preserve_height_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- UI: Always render the BF2 bay editor component tree and hide it via `visibility:hidden` when no bay is selected, preserving panel height.
- UI: Gate bay editor controls/events behind a valid bay selection to avoid invalid IDs and runtime errors.
- Tests: Added a headless e2e regression test to ensure the bay editor height stays stable when adding the first bay.
