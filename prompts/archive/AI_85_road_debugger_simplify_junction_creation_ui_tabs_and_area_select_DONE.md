# Problem [DONE]

In the Road Debugger, the current junction creation workflow is confusing and hard to use:
- Junction creation controls are scattered and don’t match the “road creation” UX pattern.
- Selectable junction points are hard to see, and clicking points is too difficult from a distance (hit area too small).
- There is no fast way to select multiple junction points at once.
- Switching between control areas can leave “in progress” work in an unclear state.
- The collapse/expand button in the junction table is not working.

# Request

Redesign the Road Debugger junction creation UX to match the existing road creation pattern and make junction authoring straightforward, visible, and efficient.

Tasks:
- Unify creation controls:
  - Move junction creation controls into the same bottom-center panel used for road creation.
  - Use tabs (or equivalent) within that center panel for different workflows (e.g., `Roads`, `Junctions`).
  - If the user switches tabs while something is being built (draft road or draft junction), automatically finalize the current in-progress draft (same behavior as pressing `Done` for that workflow).
- Junction creation pattern:
  - Follow the same pattern as road creation: `New Junction` starts selection mode, `Done` finalizes creation.
  - While creating a junction, highlight all selectable junction points with a small circle marker so it’s clear what can be selected.
- Multi-select via area selection:
  - When in junction creation mode, allow selecting multiple points by click-and-dragging a red selection rectangle on the map/viewport.
  - All selectable points inside the rectangle become selected (and are shown as selected immediately).
  - Ensure area selection works at any zoom level and does not require precise clicking on each point.
- Improve point hit-testing usability:
  - Increase the clickable/hoverable area for junction points so selection works reliably from a distance.
  - The hit radius should scale in screen space (or otherwise be distance-aware) so it stays easy to select at different camera zoom levels.
- Table fixes:
  - Fix the junction table collapse/expand button so it works reliably.
  - Ensure expand state persists across re-renders (editing, undo/redo, toggles) as long as the junction still exists.
- Feedback + consistency:
  - Integrate hover/selection sync between table and viewport for junction points and junctions.
  - Ensure the bottom-right info panel (or equivalent) shows what’s selected/hovered during junction creation (counts, IDs, distances, etc.).

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to AI_85_road_debugger_simplify_junction_creation_ui_tabs_and_area_select_DONE
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Unified road/junction creation into a tabbed bottom-center workflow panel, added screen-space junction candidate hit-testing + drag-rectangle multi-select, and fixed junction table expand/collapse persistence.
