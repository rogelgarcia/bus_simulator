#Problem (DONE)

In Building Fabrication 2, once bay groups are created it’s not visually obvious (from the bay selector cards) which bays are grouped together. We need a lightweight visual indicator directly under the bay cards.

# Request

Add thin connector lines under the bay selector cards to visually indicate bay groups, with reserved layout space so the bay selector height stays stable even before any groups exist.

Tasks:
- Reserved connector-line row:
  - Below the bay cards area, reserve a dedicated row/strip of vertical space for group connector lines.
  - This space must exist from the beginning (even when there are no groups) to prevent layout jumping when groups are created later.
- Connector line rendering:
  - When groups exist, draw thin line connectors under the bays that belong to each group (similar to `|-----|------|` but using proper UI line rendering).
  - The line should visually “bracket/connect” the contiguous range of bay cards in the group.
  - If bay cards wrap to a second row, it is acceptable for the connector line to be interrupted at the wrap (no need for complex multi-row bridging).
- Multiple groups:
  - If multiple groups exist, render their connector lines in the reserved strip in a readable way (avoid thick clutter; keep lines thin).
  - Ensure determinism/consistency in how lines are stacked/positioned when groups overlap or are adjacent.
- Empty state:
  - If no groups exist, keep the reserved strip present but render nothing (or an extremely subtle placeholder if needed).

Constraints:
- This is a visualization-only feature; do not change group solving behavior or bay/group data.
- Keep the implementation simple and robust; wrapping can interrupt lines.

## Quick verification
- With no groups, the bay selector shows a reserved thin strip below bay cards (no connector lines) and layout height remains stable.
- After creating a group, connector lines appear below the grouped bays, clearly indicating the grouped range.
- When bays wrap to a second row, connector lines may break at the wrap but still indicate grouping where possible.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_DONE_286_BUILDINGS_building_fabrication2_bay_selector_group_connector_lines_DONE.md`
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)

## Summary
- Added a reserved connector strip under each bay card in the bay selector to keep layout stable.
- Rendered thin bracket connector lines for bay repeat groups (with deterministic stacking for overlaps).
- Updated UI spec and added a headless e2e test covering the connector strip + group bracket rendering.
