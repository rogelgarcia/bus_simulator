# DONE
#Problem

The Road Debugger UI needs additional refinement to reduce confusion and align panel sizing and workflows:
- Editor panel tabs and layout are not yet matching the desired “tab silhouette” layout.
- Editor and hover panels are too tall compared to the orbit panel, creating an unbalanced UI.
- Lane configuration UX is indirect (+/-) and should be direct selection (0–5) with grouped buttons.
- Lane configuration visibility rules are unclear and should only appear in specific contexts.
- Hover panel currently mixes hovered and selected information; it should show hover only.
- During construction (drafting roads/junctions), intermediate results should be surfaced in the Detail panel, not in the editor panel.
- Selected road/junction information should be compact and actionable (show ID + delete action).
- Automatic junction creation behavior exists and should be removed (junctions should be created explicitly by the user).

# Request

Update Road Debugger UI and behavior to implement the requested editor/hover/detail panel structure, direct lane selection controls, and remove automatic junction creation.

Use the shared Road Debugger UI vocabulary and precedence rules defined in `AI_93_ROADS_road_debugger_ui_information_architecture_reorg` (Left panel, Center bottom [edit], Orbit, Right bottom [hover], Right top [detail]).

Tasks:
- Editor pane tabs and layout:
  - The Center bottom [edit] pane must have only two tabs: `Roads` and `Junctions`.
  - Implement a “folder tab silhouette” layout where the tab row contours the silhouette of the selected tab buttons (the row visually forms the tab panel shape).
  - Keep this structure extensible for a future `Points` tab, but do not add it now.
- Panel sizing:
  - Make the Center bottom [edit] panel height match the Orbit panel height.
  - Make the Right bottom [hover] panel height match the Orbit panel height.
- Lane configuration UX:
  - Replace +/- lane controls with direct selection buttons: `0,1,2,3,4,5`.
  - `lanesF` minimum is `0`.
  - Each lane selector must be a “button group” control: a rounded rectangle segmented into selectable subdivisions (one-click selection); no spacing between buttons; left and right button follow the silhouette of the rectangle, middle buttons are squared.
  - Provide one group for `lanesF` and one group for `lanesB`.
- Lane configuration visibility and mode rules:
  - Show lane configuration controls only when:
    - The user clicks `New Road` (draft road mode), or
    - A road is selected in the viewport (edit mode for that road).
  - If the tab is showing `Junctions`, but the user selects a road in the viewport, it should switch back to the `Roads` tab. And vice versa.
- Hover panel behavior:
  - The Right bottom [hover] panel must show hovered text only (no selected section).
  - Keep hovered output concise and stable (avoid vertical growth).
- Draft intermediate results:
  - When constructing a road or junction, show intermediate/draft results in the Right top [detail] panel.
  - Do not show the intermediate junction result in the editor panel (editor panel should remain focused on controls).
- Selection summary and delete action:
  - When a road or junction is selected, show a one-line summary in the editor panel with the selected element ID (replace “Click new …” instructional text).
  - Add a `Delete` button in the left bottom corner of the editor panel, visible only when exactly one road or one junction is selected.
  - Ensure delete integrates with undo/redo and updates lists/viewport immediately.
- Junction creation policy:
  - Remove any automatic junction creation feature. Junctions should only be created via explicit user action in the Junctions workflow. (this behavior will be handled in a future task).
  - Ensure removal does not break existing manual junction creation or junction rendering.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_112_DONE_ROADS_road_debugger_editor_tabs_layout_lane_buttons_panel_heights_and_manual_junctions`
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Road Debugger now uses a two-tab editor (Roads/Junctions) with segmented lane buttons, hover-only panel, matched bottom panel heights, explicit-only manual junctions, and a contextual Delete action.
