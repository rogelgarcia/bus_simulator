# DONE

#Problem

Road Debugger’s editing/creation UI is inconsistent and confusing:
- The center panel is treated as “creation-only”, but it needs to be the primary editor for everything.
- Tabs do not use a clear “folder tab” layout.
- The Road and Junction creation flows are inconsistent and hard to understand.
- Some controls are currently placed in tables where they should be edited in a dedicated editor panel.

# Request

Make the center editor panel the primary editing surface for Road Debugger and redesign Road/Junction action flows using standard UI patterns.

Use the shared Road Debugger UI vocabulary, precedence rules, and action button pattern defined in `AI_93_ROADS_road_debugger_ui_information_architecture_reorg`.
For any hover/selection/drag interactions introduced or modified by this work, rely on the unified picking service from `AI_102_ROADS_road_debugger_unified_picking_service` (avoid ad-hoc hit-testing).

Tasks:
- Center editor panel:
  - Use the center panel as the primary editor for all selected entities (Road, Junction, Segment, Connector, Point).
  - Remove lane/property editing from the left table; clicking a road/junction opens its editable properties in the center panel.
- Tabs layout:
  - Implement a “folder tab” style UI for the center panel (tabs at the top edge of the widget).
  - Tabs should cover: `Edit` (contextual), `Roads` (creation), `Junctions` (creation), and any other existing workflows as needed.
  - If a draft is in progress and the user switches tabs, finalize the current draft first (equivalent to `Done`).
- Action buttons (industry-standard flow):
  - Road creation:
    - Show `New Road` in a consistent corner position of the center panel.
    - When `New Road` is clicked, replace it in-place with `Cancel` and `Done` actions (same footprint/location), then restore `New Road` after completion/cancel.
  - Junction creation:
    - Use the same pattern as road creation (`New Junction` → `Cancel`/`Done`).
  - Button semantics and order:
    - Use `Cancel` + `Done` (not `Save`) for finishing drafts.
    - Keep primary action on the right (Done), cancel on the left (Cancel).
    - Ensure keyboard shortcuts match: `Enter` = Done, `Esc` = Cancel/Done depending on draft state (consistent with existing behavior).
- Fixed widget sizing:
  - Keep the center editor panel width/height stable regardless of the tab contents.
  - Tabs with larger content should scroll inside the panel rather than resizing the panel.
- Lane selection UX for drafting:
  - At the start of road creation, allow selecting `lanesF` and `lanesB` with “pressable” controls that share a single rectangular control group (not separate uneven buttons).
  - Ensure these controls are visible before placing points and remain editable while drafting.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_95_DONE_ROADS_road_debugger_editor_panel_tabs_and_action_buttons`
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Implemented a stable center editor panel with Edit/Roads/Junctions tabs, standardized New/Cancel/Done flows, and added lane steppers for drafting.
