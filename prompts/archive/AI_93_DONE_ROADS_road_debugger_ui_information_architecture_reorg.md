# DONE

#Problem

The Road Debugger UI has grown complex and difficult to navigate. Controls and telemetry are spread across panels/tables, and related settings are not grouped, making it hard to understand the current state (drafting vs editing vs junctioning), what is selected, and which toggles affect which overlays.

# Request

Reorganize the Road Debugger UI information architecture so controls and data are grouped into clear sections, with consistent placement, predictable navigation, and reduced cognitive load.

This prompt is the umbrella “information architecture” target. Implement the deliverables via the companion prompts listed below (each one focuses on a coherent problem-space slice of the UI/UX and bugs):
- `AI_94_ROADS_road_debugger_entry_and_scene_access`
- `AI_95_ROADS_road_debugger_editor_panel_tabs_and_action_buttons`
- `AI_96_ROADS_road_debugger_hover_selection_priority_and_output_panels`
- `AI_97_ROADS_road_debugger_visualization_tabs_settings_and_defaults`
- `AI_98_ROADS_road_debugger_orbit_widget_and_controls_fixes`
- `AI_99_ROADS_road_debugger_drafting_hover_circle_persistence_and_center_snap`
- `AI_100_ROADS_road_debugger_trim_range_edges_thickness_and_point_gizmos`
- `AI_101_ROADS_road_debugger_validation_warnings_and_quick_fixes`
- `AI_102_ROADS_road_debugger_unified_picking_service`

## Shared UI vocabulary (use these terms consistently)

- **Left panel [control/visualization]**: visualization toggles + road list + junction list (high-level only).
- **Center bottom [edit]**: editor for selected elements on the map, and creation flows for new elements.
- **Orbit**: orbit widget/control (separate from output panels; must not inherit their sizing).
- **Right bottom [hover]**: shows concise info about what is being hovered.
- **Right top [detail]**: shows the tree/details of the selected component (road tree or junction tree).

## Shared precedence rules (apply across the Road Debugger)

- Highlighting: **hover takes precedence over selected** for rendering.
- Picking: **point > segment > road** priority (a hovered point suppresses segment/road hover).
- Hover visualization override: hovering in the left lists or right detail tree temporarily visualizes the hovered entity on the map even if its visualization category is disabled in the left panel.

## Shared action button pattern (industry-standard)

Selected pattern:
- **Creation** uses: `New …` → `Cancel` (left) + `Done` (right)
- **Ordering**: `Cancel` on the left, primary action (`Done`) on the right.
- **Display**: replace the `New …` button in-place with `Cancel/Done` during an active draft, then restore `New …` after completion/cancel (avoid leaving extra disabled buttons around).

Tasks:
- Define a sectioned layout for Road Debugger UI:
  - Group related controls into named sections (collapsible where appropriate).
  - Ensure the primary workflows (Road drafting, Junction creation, Selection/Editing, Export/Import, Debug overlays) each have a clear “home”.
- Establish a consistent “source of truth” for what the user is doing:
  - Always show the current mode (e.g., Idle / Draft Road / Draft Junction / Drag Point).
  - Always show the current selection context (Road / Segment / Point / Junction / Connector).
- Panel organization goals:
  - Left panel: structured navigation + lists (roads, segments, junctions) with search/filter if helpful.
  - Center-bottom panel: creation workflows (Roads tab, Junctions tab, etc.) with New/Done patterns.
  - Right-bottom panel: contextual telemetry/details for hovered/selected entity (grouped into readable subsections).
  - Optional right-top: legend/help (only if it materially reduces confusion).
- Reduce clutter by grouping toggles:
  - Rendering toggles grouped by overlay type (asphalt, centerlines, direction centerlines, edges, arrows, markers, debug intermediates).
  - Pipeline debug toggles grouped by pipeline step (raw inputs, derived edges, trimming intervals, dropped pieces, junction stitching order, etc.).
- Define consistent naming and labels:
  - Avoid ambiguous labels like “roads” in multiple levels; use “approach”, “connector/movement”, “segment”, etc.
  - Ensure each section has short helper text/tooltips explaining what it controls.
- Interaction consistency:
  - Hover/selection synchronization remains consistent across table + viewport.
  - Selection highlight vs hover highlight remains distinct.
  - Keyboard shortcuts are listed in one place (legend/help) and do not conflict with text inputs.
- Performance/implementation constraints:
  - Reuse existing UI components/panels where possible; refactor minimally.
  - Do not change Road Debugger engine logic unless necessary for UI clarity; prefer adapting UI to consume existing outputs.

## Concrete issues to cover (grouped)

- Entry & access
  - Fix “typing 9 does not enter Road Debugger from Welcome”.

- Editor panel & action flows
  - The center editor panel is used for all editing (not only creation).
  - Tabs use the upper part of the widget (“folder tab” layout).
  - Road/Junction creation uses consistent `New …` → `Done/Cancel` flows with a standard button pattern.
  - Road properties and junction properties are edited in the editor panel (not in the left table).
  - Left table shows only high-level entities (no segment rows); show detailed trees elsewhere.

- Hover/selection & outputs
  - Hover shows summary in output above “Selected”, without expanding panel height excessively.
  - Hovering a segment takes precedence over road selection (selected road stays selected; hovered segment is highlighted differently).
  - Hovering temporarily visualizes the hovered item even if that visualization type is disabled.
  - Focus handling: interacting with UI widgets must not “break” map hover/drag; moving the mouse over the map resumes map interaction immediately.

- Visualization tabs, settings, and defaults
  - Reorganize visualization options into grouped sections and icon-only vertical tab selector.
  - Grid is global; snapping is not a view toggle; trim belongs with snapping/settings.
  - Add a dedicated tab for segment visualization configuration.
  - Junction properties should be configurable independently of global “junctions enabled” visibility.
  - Default visualization on entry: asphalt + markings enabled; centerlines/edges/tangents disabled.
  - Fix “points visualization toggle doesn’t show points”.

- Orbit widget
  - Orbit control should be smooth (no snapping/reset during normal orbit); reset only when reset is clicked.
  - Orbit widget layout must not inherit/track the output panel height.

- Drafting UX
  - Draft hover circle should persist throughout drafting until finished (not disappear after first segment).
  - Draft point placement should snap to tile centers initially.
  - Road draft should include lanesF/lanesB selection at start.

- Trim and edge/marker visuals
  - Global trim slider range should allow up to 5 (not capped at 0.5).
  - Asphalt edge line remains too thick from distance; keep it thin and readable.
  - Increase gizmo size from distance; show connection-point gizmos when hovering segments.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Also rename the AI file to `AI_93_DONE_ROADS_road_debugger_ui_information_architecture_reorg`
- Provide a summary of the changes made in the AI document (very high level, one liner)

Summary: Reorganized Road Debugger UI into clear panels and workflows via companion prompts 94–103 (entry, editor tabs, hover/selection, visualization defaults, orbit, drafting UX, trim/gizmos, warnings, picking, UV offsets).
