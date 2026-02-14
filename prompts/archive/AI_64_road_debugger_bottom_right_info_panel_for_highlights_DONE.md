# Problem [DONE]

Road Debugger currently lacks a dedicated, consistent place to display
contextual output information about what the user is inspecting. Debug details
are harder to find when highlighting roads/segments/points.

# Request

Add a separate output/info panel in the bottom-right corner of the Road
Debugger. When something is highlighted (hovered or selected), show the relevant
information in that panel.

Tasks:
- Add a bottom-right info panel UI component for Road Debugger:
  - Fixed position in the bottom-right corner.
  - Scrollable if content exceeds space.
  - Visually distinct from the left roads table and bottom-center creation UI.
- Define what "highlighted" means:
  - Prefer showing selected item information if something is selected.
  - Otherwise show hovered item information.
  - If nothing is hovered/selected, show a placeholder (“—”).
- Populate the panel with useful derived data for the highlighted item:
  - For a road: id/name, lanesF/lanesB, point count, segment count, visibility.
  - For a segment: segment id, endpoints, direction, lane/asphalt widths, any
    trimming/splitting metadata (kept/dropped) if available.
  - For a point: tile coords, offsets, tangentFactor, derived world position.
  - Include any pipeline debug info when enabled (e.g. overlap intervals).
- Ensure the panel updates live as:
  - Hover/selection changes (table or viewport).
  - Road parameters change (lanes, snapping, threshold).
  - Pipeline rebuild produces new derived data.
- Add/update browser-run tests validating:
  - Panel exists and updates when hover/selection changes.
  - Selected info overrides hovered info.
- Remove the road details section from the left roads table to avoid redundancy.

Constraints:
- Keep changes scoped to Road Debugger modules.
- Do not change other scenes.
- Follow the comment policy in `PROJECT_RULES.md`.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Added a bottom-right highlight info panel (selected-over-hovered), removed left-panel selection details, and added tests validating live updates.
